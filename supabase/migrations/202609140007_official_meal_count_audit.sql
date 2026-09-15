begin;

-- Preserve uploaded official counts separately from manager-entered meal_counts.
-- The original historical rows remain unchanged for data safety.
create table if not exists public.official_meal_counts (
  id bigint generated always as identity primary key,
  location_id bigint not null references public.locations(id),
  service_date date not null,
  breakfast_count integer,
  lunch_count integer,
  supper_count integer,
  source_label text not null default 'Official Meal Count Upload',
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, service_date)
);

create index if not exists official_meal_counts_date_location_idx
  on public.official_meal_counts(service_date, location_id);

-- Existing official workbook data was previously loaded into meal_counts and
-- identified by entered_by. Copy it into the authoritative audit table without
-- deleting or modifying the historical source rows.
insert into public.official_meal_counts(
  location_id, service_date, breakfast_count, lunch_count, supper_count,
  source_label, imported_at, updated_at
)
select
  location_id, service_date, breakfast_count, lunch_count, supper_count,
  'Historical workbook import', coalesce(created_at, now()), coalesce(updated_at, now())
from public.meal_counts
where lower(coalesce(entered_by, '')) = 'historical workbook import'
on conflict (location_id, service_date) do update set
  breakfast_count = excluded.breakfast_count,
  lunch_count = excluded.lunch_count,
  supper_count = excluded.supper_count,
  source_label = excluded.source_label,
  imported_at = excluded.imported_at,
  updated_at = excluded.updated_at;

alter table public.official_meal_counts enable row level security;
revoke all on public.official_meal_counts from anon, authenticated;

create or replace function public.get_official_meal_counts(
  p_supervisor_pin text,
  p_start_date date,
  p_end_date date
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then
    raise exception 'Supervisor authorization failed';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Invalid official meal-count date range';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(o) order by o.service_date, o.location_id)
    from public.official_meal_counts o
    join public.locations l on l.id = o.location_id
    where l.active = true
      and lower(trim(l.school_name)) <> 'test high school'
      and o.service_date between p_start_date and p_end_date
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_official_meal_counts(text,date,date) from public;
grant execute on function public.get_official_meal_counts(text,date,date) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
