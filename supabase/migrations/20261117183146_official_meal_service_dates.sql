begin;
-- Serialize with uploads; the repair changes derived totals, never source rows.
select pg_advisory_xact_lock(hashtextextended('official-meal-count-import',0));
create table public.official_meal_date_repair_backup (
 location_id bigint not null,service_date date not null,original_row jsonb not null,
 backed_up_at timestamptz not null default now(),primary key(location_id,service_date)
);
alter table public.official_meal_date_repair_backup enable row level security;
revoke all on public.official_meal_date_repair_backup from public,anon,authenticated;
insert into public.official_meal_date_repair_backup
 (location_id,service_date,original_row)
 select o.location_id,o.service_date,to_jsonb(o) from public.official_meal_counts o
 where exists(select 1 from public.official_meal_count_sources s where s.location_id=o.location_id);
create temporary table meal_date_repair_guard on commit drop as
 select md5(coalesce((select string_agg(to_jsonb(s)::text,'|' order by source_site_id,source_date) from public.official_meal_count_sources s),'')) sources,
 md5(coalesce((select string_agg(to_jsonb(m)::text,'|' order by location_id,service_date) from public.meal_counts m),'')) managers;
-- Only remove obsolete moved-date rows that exactly match the old calculation
-- and have no source on that date. Unrelated legacy records are retained.
create temporary table meal_date_obsolete on commit drop as
 select o.location_id,o.service_date from public.official_meal_counts o join (
 select location_id,public.official_meal_target_date(location_id,source_date) service_date,
 sum(breakfast_count)::integer breakfast_count,sum(lunch_count)::integer lunch_count,sum(supper_count)::integer supper_count
 from public.official_meal_count_sources group by location_id,public.official_meal_target_date(location_id,source_date)
 ) old using(location_id,service_date)
 where o.breakfast_count is not distinct from old.breakfast_count and o.lunch_count is not distinct from old.lunch_count
 and o.supper_count is not distinct from old.supper_count and not exists(
 select 1 from public.official_meal_count_sources s where s.location_id=o.location_id and s.source_date=o.service_date);

-- Keep this compatibility helper but never shift a district service date.
create or replace function public.official_meal_target_date(p_location bigint,p_date date)
returns date language sql stable set search_path=public as $$select p_date$$;
revoke all on function public.official_meal_target_date(bigint,date) from public,anon,authenticated;
create or replace function public.import_official_meal_counts(p_supervisor_pin text,p_source_filename text,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row record; v_site record; v_locations bigint[]:='{}'; v_written integer;
begin
 if public.verify_supervisor_pin(p_supervisor_pin) is not true then raise exception 'Supervisor authorization failed'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)=0 then raise exception 'No official meal-count rows were supplied'; end if;
 -- Serialize imports so two overlapping uploads cannot calculate stale totals.
 perform pg_advisory_xact_lock(hashtextextended('official-meal-count-import',0));
 for v_row in select value from jsonb_array_elements(p_rows) loop
  select * into v_site from public.official_meal_import_sites s
   where s.location_id=(v_row.value->>'location_id')::bigint and
   (case when v_row.value->>'source_site_id' is null then s.program_type='main'
     else s.source_site_id=v_row.value->>'source_site_id' end) limit 1;
  if not found then raise exception 'Unknown or mismatched official meal source'; end if;
  insert into public.official_meal_count_sources as old
   (source_site_id,source_date,location_id,breakfast_count,lunch_count,supper_count)
  values(v_site.source_site_id,(v_row.value->>'service_date')::date,v_site.location_id,
   (v_row.value->>'breakfast_count')::integer,(v_row.value->>'lunch_count')::integer,(v_row.value->>'supper_count')::integer)
  on conflict(source_site_id,source_date) do update set
   location_id=excluded.location_id,
   breakfast_count=coalesce(excluded.breakfast_count,old.breakfast_count),
   lunch_count=coalesce(excluded.lunch_count,old.lunch_count),
   supper_count=coalesce(excluded.supper_count,old.supper_count);
  v_locations:=array_append(v_locations,v_site.location_id);
 end loop;
 -- Combine mapped programs only on the exact date supplied by the district.
 insert into public.official_meal_counts as old
  (location_id,service_date,breakfast_count,lunch_count,supper_count,source_label,source_filename,imported_at,updated_at)
 select location_id,source_date,sum(breakfast_count)::integer,
  sum(lunch_count)::integer,sum(supper_count)::integer,'Official Meal Count Upload',left(p_source_filename,255),now(),now()
 from public.official_meal_count_sources where location_id=any(v_locations)
 group by location_id,source_date
 on conflict(location_id,service_date) do update set
  breakfast_count=excluded.breakfast_count,
  lunch_count=excluded.lunch_count,
  supper_count=excluded.supper_count,
  source_label=excluded.source_label,source_filename=excluded.source_filename,imported_at=excluded.imported_at,updated_at=excluded.updated_at;
 get diagnostics v_written=row_count;
 return jsonb_build_object('received',jsonb_array_length(p_rows),'written',v_written);
end $$;
revoke all on function public.import_official_meal_counts(text,text,jsonb) from public;
grant execute on function public.import_official_meal_counts(text,text,jsonb) to anon,authenticated;

insert into public.official_meal_counts as old
 (location_id,service_date,breakfast_count,lunch_count,supper_count,source_label,source_filename,imported_at,updated_at)
select s.location_id,s.source_date,sum(s.breakfast_count)::integer,sum(s.lunch_count)::integer,sum(s.supper_count)::integer,
 'Official Meal Count Upload',
 (select b.original_row->>'source_filename' from public.official_meal_date_repair_backup b where b.location_id=s.location_id order by (b.original_row->>'imported_at') desc nulls last limit 1),
 now(),now()
from public.official_meal_count_sources s group by s.location_id,s.source_date
on conflict(location_id,service_date) do update set breakfast_count=excluded.breakfast_count,
 lunch_count=excluded.lunch_count,supper_count=excluded.supper_count,updated_at=now();
delete from public.official_meal_counts o using meal_date_obsolete b
 where o.location_id=b.location_id and o.service_date=b.service_date;
do $$begin
 if exists(select 1 from meal_date_repair_guard g where
 g.sources<>md5(coalesce((select string_agg(to_jsonb(s)::text,'|' order by source_site_id,source_date) from public.official_meal_count_sources s),'')) or
 g.managers<>md5(coalesce((select string_agg(to_jsonb(m)::text,'|' order by location_id,service_date) from public.meal_counts m),'')))
 then raise exception 'Source or manager records changed during date repair'; end if;
 if exists(select 1 from (select location_id,source_date,sum(breakfast_count)::integer breakfast_count,sum(lunch_count)::integer lunch_count,sum(supper_count)::integer supper_count
 from public.official_meal_count_sources group by location_id,source_date) s
 left join public.official_meal_counts o on o.location_id=s.location_id and o.service_date=s.source_date
 where o.location_id is null or o.breakfast_count is distinct from s.breakfast_count or o.lunch_count is distinct from s.lunch_count or o.supper_count is distinct from s.supper_count)
 then raise exception 'Date repair totals do not match exact-date sources'; end if;
end $$;
notify pgrst,'reload schema';
commit;
