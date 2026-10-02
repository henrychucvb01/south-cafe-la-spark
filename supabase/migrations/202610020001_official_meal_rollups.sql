begin;
-- Reuse the directory mappings, translating directory IDs to operational school IDs.
create or replace view public.official_meal_import_sites as
select m.source_site_id,l.id location_id,m.program_type
from public.monthly_site_mappings m
join public.location_information d on d.id=m.main_location_id and d.active
join public.locations l on l.active and (l.location_code=d.location_code or
 (d.location_code is null and lower(trim(l.school_name))=lower(trim(d.school_name))))
where m.active
union all
select 'location:'||l.id,l.id,'main' from public.locations l where l.active and not exists (
 select 1 from public.monthly_site_mappings m join public.location_information d on d.id=m.main_location_id
 where m.active and d.active and m.program_type='main' and (d.location_code=l.location_code or
 (d.location_code is null and lower(trim(d.school_name))=lower(trim(l.school_name)))));
revoke all on public.official_meal_import_sites from public,anon,authenticated;

create or replace function public.get_official_meal_count_mappings(p_supervisor_pin text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if public.verify_supervisor_pin(p_supervisor_pin) is not true then raise exception 'Supervisor authorization failed'; end if;
 return coalesce((select jsonb_agg(to_jsonb(s)) from public.official_meal_import_sites s),'[]'::jsonb);
end $$;
revoke all on function public.get_official_meal_count_mappings(text) from public;
grant execute on function public.get_official_meal_count_mappings(text) to anon,authenticated;

-- Current source values, not an upload/version history. Needed for overlapping imports.
create table public.official_meal_count_sources (
 source_site_id text not null, source_date date not null,
 location_id bigint not null references public.locations(id),
 breakfast_count integer check(breakfast_count>=0), lunch_count integer check(lunch_count>=0), supper_count integer check(supper_count>=0),
 primary key(source_site_id,source_date)
);
alter table public.official_meal_count_sources enable row level security;
revoke all on public.official_meal_count_sources from public,anon,authenticated;
create index on public.official_meal_count_sources(location_id);
-- Preserve previously imported school/date data as the school's main-site source.
insert into public.official_meal_count_sources
select s.source_site_id,o.service_date,o.location_id,o.breakfast_count,o.lunch_count,o.supper_count
from public.official_meal_counts o join public.official_meal_import_sites s on s.location_id=o.location_id and s.program_type='main';

create or replace function public.official_meal_target_date(p_location bigint,p_date date)
returns date language sql stable set search_path=public as $$
 select case when extract(isodow from p_date) in (6,7) or exists(
  select 1 from public.spark_excluded_days where location_id=p_location and service_date=p_date)
 then p_date - case when extract(isodow from p_date)=5 then 7 else (extract(isodow from p_date)::integer+2)%7 end
 else p_date end
$$;
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
   breakfast_count=case when coalesce(excluded.breakfast_count,0)=0 and old.breakfast_count>0 then old.breakfast_count else coalesce(excluded.breakfast_count,old.breakfast_count) end,
   lunch_count=case when coalesce(excluded.lunch_count,0)=0 and old.lunch_count>0 then old.lunch_count else coalesce(excluded.lunch_count,old.lunch_count) end,
   supper_count=case when coalesce(excluded.supper_count,0)=0 and old.supper_count>0 then old.supper_count else coalesce(excluded.supper_count,old.supper_count) end;
  v_locations:=array_append(v_locations,v_site.location_id);
 end loop;
 -- Only source values are summed; previously aggregated Friday totals are never added again.
 insert into public.official_meal_counts as old
  (location_id,service_date,breakfast_count,lunch_count,supper_count,source_label,source_filename,imported_at,updated_at)
 select location_id,public.official_meal_target_date(location_id,source_date),sum(breakfast_count)::integer,
  sum(lunch_count)::integer,sum(supper_count)::integer,'Official Meal Count Upload',left(p_source_filename,255),now(),now()
 from public.official_meal_count_sources where location_id=any(v_locations)
 group by location_id,public.official_meal_target_date(location_id,source_date)
 on conflict(location_id,service_date) do update set
  breakfast_count=case when coalesce(excluded.breakfast_count,0)=0 and old.breakfast_count>0 then old.breakfast_count else coalesce(excluded.breakfast_count,old.breakfast_count) end,
  lunch_count=case when coalesce(excluded.lunch_count,0)=0 and old.lunch_count>0 then old.lunch_count else coalesce(excluded.lunch_count,old.lunch_count) end,
  supper_count=case when coalesce(excluded.supper_count,0)=0 and old.supper_count>0 then old.supper_count else coalesce(excluded.supper_count,old.supper_count) end,
  source_label=excluded.source_label,source_filename=excluded.source_filename,imported_at=excluded.imported_at,updated_at=excluded.updated_at;
 get diagnostics v_written=row_count;
 -- Remove obsolete individual non-school dates after their counts have been rolled up.
 delete from public.official_meal_counts o where o.location_id=any(v_locations)
 and public.official_meal_target_date(o.location_id,o.service_date)<>o.service_date
 and not exists(select 1 from public.official_meal_count_sources s where s.location_id=o.location_id
  and public.official_meal_target_date(s.location_id,s.source_date)=o.service_date);
 return jsonb_build_object('received',jsonb_array_length(p_rows),'written',v_written);
end $$;
revoke all on function public.import_official_meal_counts(text,text,jsonb) from public;
grant execute on function public.import_official_meal_counts(text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
