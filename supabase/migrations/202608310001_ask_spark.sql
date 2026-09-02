create extension if not exists vector with schema extensions;

create table if not exists public.ask_spark_documents (
  document_id text primary key,
  source_filename text not null,
  title text not null,
  topic_category text not null,
  document_year text,
  source_type text not null,
  source_sha256 text not null unique,
  approved boolean not null default false,
  corpus_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ask_spark_chunks (
  chunk_id text primary key,
  document_id text not null references public.ask_spark_documents(document_id) on delete cascade,
  topic_category text not null,
  locator_type text not null,
  locator_number integer,
  chunk_sequence_in_locator integer not null default 1,
  citation_label text not null,
  content text not null,
  character_count integer not null,
  embedding extensions.vector(1536),
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(citation_label, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(topic_category, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'C')
  ) stored,
  corpus_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ask_spark_chunks_search_idx
  on public.ask_spark_chunks using gin (search_vector);

create index if not exists ask_spark_chunks_category_idx
  on public.ask_spark_chunks (topic_category);

create index if not exists ask_spark_chunks_embedding_idx
  on public.ask_spark_chunks using hnsw (embedding vector_cosine_ops);

alter table public.ask_spark_documents enable row level security;
alter table public.ask_spark_chunks enable row level security;

revoke all on public.ask_spark_documents from anon, authenticated;
revoke all on public.ask_spark_chunks from anon, authenticated;

create or replace function public.ask_spark_hybrid_search(
  query_text text,
  query_embedding extensions.vector(1536),
  match_count integer default 10,
  filter_categories text[] default null
)
returns table (
  chunk_id text,
  document_id text,
  title text,
  source_filename text,
  topic_category text,
  document_year text,
  source_type text,
  locator_type text,
  locator_number integer,
  citation_label text,
  content text,
  semantic_similarity double precision,
  text_rank real,
  combined_score double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with input as (
    select nullif(websearch_to_tsquery('english', query_text)::text, '')::tsquery as tsq
  ), scored as (
    select
      c.chunk_id,
      c.document_id,
      d.title,
      d.source_filename,
      c.topic_category,
      d.document_year,
      d.source_type,
      c.locator_type,
      c.locator_number,
      c.citation_label,
      c.content,
      case when query_embedding is null or c.embedding is null
        then 0::double precision
        else 1 - (c.embedding <=> query_embedding)
      end as semantic_similarity,
      case when input.tsq is null then 0::real
        else ts_rank_cd(c.search_vector, input.tsq)
      end as text_rank
    from public.ask_spark_chunks c
    join public.ask_spark_documents d on d.document_id = c.document_id
    cross join input
    where d.approved = true
      and (filter_categories is null or c.topic_category = any(filter_categories))
  )
  select
    scored.chunk_id,
    scored.document_id,
    scored.title,
    scored.source_filename,
    scored.topic_category,
    scored.document_year,
    scored.source_type,
    scored.locator_type,
    scored.locator_number,
    scored.citation_label,
    scored.content,
    scored.semantic_similarity,
    scored.text_rank,
    (0.62 * greatest(scored.semantic_similarity, 0) +
      0.38 * least(scored.text_rank * 5, 1)) as combined_score
  from scored
  where scored.semantic_similarity >= 0.30 or scored.text_rank > 0
  order by combined_score desc, scored.text_rank desc
  limit least(greatest(match_count, 1), 20);
$$;

revoke all on function public.ask_spark_hybrid_search(text, extensions.vector, integer, text[]) from public, anon, authenticated;
grant execute on function public.ask_spark_hybrid_search(text, extensions.vector, integer, text[]) to service_role;

comment on table public.ask_spark_documents is
  'Private approved-source metadata for Ask SPARK and future grounded training tools.';
comment on table public.ask_spark_chunks is
  'Private citation-sized corpus chunks. Access is restricted to the backend service role.';
