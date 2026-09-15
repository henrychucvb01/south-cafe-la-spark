begin;

alter table public.official_meal_counts
  add column if not exists source_filename text;

create or replace function public.import_official_meal_counts(
  p_supervisor_pin text,
  p_source_filename text,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_received integer := 0;
  v_written integer := 0;
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then
    raise exception 'Supervisor authorization failed';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'No official meal-count rows were supplied';
  end if;

  v_received := jsonb_array_length(p_rows);

  with incoming as (
    select
      (value->>'location_id')::bigint as location_id,
      (value->>'service_date')::date as service_date,
      case when value->>'breakfast_count' is null then null else (value->>'breakfast_count')::integer end as breakfast_count,
      case when value->>'lunch_count' is null then null else (value->>'lunch_count')::integer end as lunch_count,
      case when value->>'supper_count' is null then null else (value->>'supper_count')::integer end as supper_count
    from jsonb_array_elements(p_rows)
  ), valid as (
    select distinct on (i.location_id, i.service_date) i.*
    from incoming i
    join public.locations l on l.id = i.location_id and l.active = true
    where i.service_date is not null
      and coalesce(i.breakfast_count, i.lunch_count, i.supper_count) is not null
      and coalesce(i.breakfast_count, 0) >= 0
      and coalesce(i.lunch_count, 0) >= 0
      and coalesce(i.supper_count, 0) >= 0
    order by i.location_id, i.service_date
  ), written as (
    insert into public.official_meal_counts(
      location_id, service_date, breakfast_count, lunch_count, supper_count,
      source_label, source_filename, imported_at, updated_at
    )
    select
      location_id, service_date, breakfast_count, lunch_count, supper_count,
      'Official Meal Count Upload', left(coalesce(p_source_filename, 'Official Meal Count CSV'), 255), now(), now()
    from valid
    on conflict (location_id, service_date) do update set
      breakfast_count = excluded.breakfast_count,
      lunch_count = excluded.lunch_count,
      supper_count = excluded.supper_count,
      source_label = excluded.source_label,
      source_filename = excluded.source_filename,
      imported_at = excluded.imported_at,
      updated_at = excluded.updated_at
    returning 1
  )
  select count(*) into v_written from written;

  return jsonb_build_object('received', v_received, 'written', v_written);
end;
$$;

revoke all on function public.import_official_meal_counts(text,text,jsonb) from public;
grant execute on function public.import_official_meal_counts(text,text,jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
