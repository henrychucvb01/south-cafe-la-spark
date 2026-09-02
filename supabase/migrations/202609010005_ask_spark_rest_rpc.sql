create or replace function public.ask_spark_hybrid_search_rest(
  query_text text,
  query_embedding jsonb,
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
set search_path = public
as $$
  select *
  from public.ask_spark_hybrid_search(
    query_text,
    (query_embedding::text)::vector,
    match_count,
    filter_categories
  );
$$;

revoke all on function public.ask_spark_hybrid_search_rest(
  text, jsonb, integer, text[]
) from public, anon, authenticated;

grant execute on function public.ask_spark_hybrid_search_rest(
  text, jsonb, integer, text[]
) to service_role;

notify pgrst, 'reload schema';
