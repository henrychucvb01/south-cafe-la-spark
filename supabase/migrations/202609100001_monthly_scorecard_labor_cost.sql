begin;

create table if not exists public.monthly_labor_rates (
  school_year text not null,
  classification_key text not null,
  classification_name text not null,
  hourly_rate numeric(10,5) not null check (hourly_rate >= 0),
  calculation_basis text not null,
  effective_date date not null,
  primary key (school_year,classification_key)
);

create table if not exists public.monthly_staffing_allocations (
  school_year text not null,
  source_site_id text not null,
  classification_key text not null,
  position_count integer not null check (position_count >= 0),
  filled_count integer not null check (filled_count >= 0),
  vacant_count integer not null check (vacant_count >= 0),
  filled_daily_hours numeric(8,2) not null check (filled_daily_hours >= 0),
  source_as_of date not null,
  primary key (school_year,source_site_id,classification_key),
  foreign key (school_year,classification_key)
    references public.monthly_labor_rates(school_year,classification_key)
);

alter table public.monthly_labor_rates enable row level security;
alter table public.monthly_staffing_allocations enable row level security;
revoke all on public.monthly_labor_rates,public.monthly_staffing_allocations from anon,authenticated;

insert into public.monthly_labor_rates
  (school_year,classification_key,classification_name,hourly_rate,calculation_basis,effective_date)
values
  ('2026-27','worker','Food Services Worker',26.87265,'$22.52612 compounded by 3%, 4%, 2.5%, 2.5%, and 6% through July 2026','2026-07-01'),
  ('2026-27','senior_worker','Senior Food Service Worker',29.83181,'Owner-selected third step $25.00665 compounded by 3%, 4%, 2.5%, 2.5%, and 6% through July 2026','2026-07-01'),
  ('2026-27','manager_i','Food Service Manager I',26.31429,'Average of five supplied steps compounded by 6%, 4%, and 3%','2026-07-01'),
  ('2026-27','manager_ii','Food Service Manager II',27.73827,'Average of five supplied steps compounded by 6%, 4%, and 3%','2026-07-01'),
  ('2026-27','manager_iii','Food Service Manager III',29.23751,'Average of five supplied steps compounded by 6%, 4%, and 3%','2026-07-01'),
  ('2026-27','manager_iv','Food Service Manager IV',30.82139,'Average of five supplied steps compounded by 6%, 4%, and 3%','2026-07-01'),
  ('2026-27','manager_v','Food Service Manager V',32.49180,'Average of five supplied steps compounded by 6%, 4%, and 3%','2026-07-01'),
  ('2026-27','manager_vi','Food Service Manager VI',34.24875,'Average of five supplied steps compounded by 6%, 4%, and 3%','2026-07-01'),
  ('2026-27','manager_vii','Food Service Manager VII',36.10727,'Average of five supplied steps compounded by 6%, 4%, and 3%','2026-07-01')
on conflict (school_year,classification_key) do update set
  classification_name=excluded.classification_name,hourly_rate=excluded.hourly_rate,
  calculation_basis=excluded.calculation_basis,effective_date=excluded.effective_date;

insert into public.monthly_staffing_allocations
  (school_year,source_site_id,classification_key,position_count,filled_count,vacant_count,filled_daily_hours,source_as_of)
values
  ('2026-27','1195701','manager_i',1,1,0,8,'2026-09-01'),
  ('2026-27','1195701','senior_worker',1,1,0,6.5,'2026-09-01'),
  ('2026-27','1208901','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1208901','worker',2,2,0,13,'2026-09-01'),
  ('2026-27','1214601','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1214601','worker',1,1,0,6,'2026-09-01'),
  ('2026-27','1230101','manager_ii',1,1,0,8,'2026-09-01'),('2026-27','1230101','senior_worker',1,1,0,6.5,'2026-09-01'),('2026-27','1230101','worker',4,4,0,24.5,'2026-09-01'),
  ('2026-27','1247301','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1247301','worker',2,1,1,6,'2026-09-01'),
  ('2026-27','1252701','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1252701','worker',3,2,1,12.5,'2026-09-01'),
  ('2026-27','1253001','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1253001','worker',1,1,0,6.5,'2026-09-01'),
  ('2026-27','1281501','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1281501','senior_worker',1,1,0,6.5,'2026-09-01'),('2026-27','1281501','worker',3,3,0,19.5,'2026-09-01'),
  ('2026-27','1283601','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1283601','worker',3,3,0,19.5,'2026-09-01'),
  ('2026-27','1289001','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1289001','worker',3,3,0,19.5,'2026-09-01'),
  ('2026-27','1338401','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1338401','worker',1,1,0,6.5,'2026-09-01'),
  ('2026-27','1345201','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1345201','worker',3,3,0,19,'2026-09-01'),
  ('2026-27','1346601','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1346601','worker',3,3,0,19,'2026-09-01'),
  ('2026-27','1401401','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1401401','worker',3,3,0,19.5,'2026-09-01'),
  ('2026-27','1404101','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1404101','worker',3,3,0,19,'2026-09-01'),
  ('2026-27','1482901','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1482901','worker',2,2,0,12,'2026-09-01'),
  ('2026-27','1575301','manager_ii',1,1,0,8,'2026-09-01'),('2026-27','1575301','senior_worker',1,1,0,6.5,'2026-09-01'),('2026-27','1575301','worker',3,3,0,19,'2026-09-01'),
  ('2026-27','1686701','manager_v',1,1,0,8,'2026-09-01'),('2026-27','1686701','senior_worker',1,1,0,6.5,'2026-09-01'),('2026-27','1686701','worker',5,5,0,32.5,'2026-09-01'),
  ('2026-27','1720501','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1720501','worker',2,2,0,13,'2026-09-01'),
  ('2026-27','1732901','manager_i',1,1,0,8,'2026-09-01'),('2026-27','1732901','worker',3,2,1,13,'2026-09-01'),
  ('2026-27','1741901','manager_i',1,0,1,0,'2026-09-01'),('2026-27','1741901','worker',2,2,0,13,'2026-09-01'),
  ('2026-27','1778101','manager_ii',1,1,0,8,'2026-09-01'),('2026-27','1778101','senior_worker',1,1,0,6.5,'2026-09-01'),('2026-27','1778101','worker',6,5,1,32,'2026-09-01'),
  ('2026-27','1809001','manager_v',1,1,0,8,'2026-09-01'),('2026-27','1809001','senior_worker',1,1,0,6.5,'2026-09-01'),('2026-27','1809001','worker',5,5,0,32,'2026-09-01'),
  ('2026-27','1810301','manager_iv',1,1,0,8,'2026-09-01'),('2026-27','1810301','senior_worker',1,1,0,6.5,'2026-09-01'),('2026-27','1810301','worker',4,4,0,25,'2026-09-01'),
  ('2026-27','1848701','manager_v',1,1,0,8,'2026-09-01'),('2026-27','1848701','senior_worker',1,1,0,6.5,'2026-09-01'),('2026-27','1848701','worker',6,5,1,31,'2026-09-01'),
  ('2026-27','1852901','manager_vi',1,1,0,8,'2026-09-01'),('2026-27','1852901','senior_worker',1,1,0,6.5,'2026-09-01'),('2026-27','1852901','worker',10,10,0,64,'2026-09-01'),
  ('2026-27','1857501','manager_iv',1,1,0,8,'2026-09-01'),('2026-27','1857501','senior_worker',1,1,0,6.5,'2026-09-01'),('2026-27','1857501','worker',6,5,1,30.5,'2026-09-01'),
  ('2026-27','1886801','manager_iv',1,1,0,8,'2026-09-01'),('2026-27','1886801','senior_worker',1,0,1,0,'2026-09-01'),('2026-27','1886801','worker',3,3,0,19,'2026-09-01')
on conflict (school_year,source_site_id,classification_key) do update set
  position_count=excluded.position_count,filled_count=excluded.filled_count,
  vacant_count=excluded.vacant_count,filled_daily_hours=excluded.filled_daily_hours,
  source_as_of=excluded.source_as_of;

create or replace function public.get_monthly_scorecard_dataset(
  p_supervisor_pin text,p_school_year text,p_reporting_month date
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_month date := date_trunc('month',p_reporting_month)::date;
  v_next date := (date_trunc('month',p_reporting_month)+interval '1 month')::date;
  v_previous date := (date_trunc('month',p_reporting_month)-interval '1 month')::date;
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then raise exception 'Supervisor authorization failed'; end if;
  return jsonb_build_object(
    'schools',coalesce((select jsonb_agg(to_jsonb(s) order by s.school_name) from (
      select d.id directory_id,o.id location_id,d.location_code,d.school_name,d.site_type,
        o.enrollment,o.labor_type,o.budget_labor_hours,
        (select m.source_site_id from public.monthly_site_mappings m where m.main_location_id=d.id and m.active=true and m.program_type='main' order by m.source_site_id limit 1) source_site_id
      from public.location_information d
      left join public.locations o on o.location_code=d.location_code and o.active=true
      where d.active=true and lower(trim(d.school_name)) not in ('test high school','hawthorne academy')
    ) s),'[]'::jsonb),
    'meal_counts',coalesce((select jsonb_agg(to_jsonb(m)) from public.meal_counts m join public.locations l on l.id=m.location_id where l.active=true and lower(trim(l.school_name))<>'test high school' and m.service_date>=v_previous and m.service_date<v_next),'[]'::jsonb),
    'labor_hours',coalesce((select jsonb_agg(to_jsonb(h)) from public.labor_hours h join public.locations l on l.id=h.location_id where l.active=true and lower(trim(l.school_name))<>'test high school' and h.service_date>=v_previous and h.service_date<v_next),'[]'::jsonb),
    'production_rows',coalesce((select jsonb_agg(to_jsonb(p)) from public.monthly_production_rows p join public.monthly_import_batches b on b.id=p.batch_id where b.school_year=p_school_year and p.production_date>=v_previous and p.production_date<v_next),'[]'::jsonb),
    'cost_rows',coalesce((select jsonb_agg(to_jsonb(c)) from public.monthly_production_cost_rows c join public.monthly_import_batches b on b.id=c.batch_id where b.school_year=p_school_year and c.production_date>=v_previous and c.production_date<v_next),'[]'::jsonb),
    'rates',coalesce((select jsonb_agg(to_jsonb(r)) from public.monthly_reimbursement_rates r where r.school_year=p_school_year),'[]'::jsonb),
    'labor_rates',coalesce((select jsonb_agg(to_jsonb(r)) from public.monthly_labor_rates r where r.school_year=p_school_year),'[]'::jsonb),
    'staffing',coalesce((select jsonb_agg(to_jsonb(a)) from public.monthly_staffing_allocations a where a.school_year=p_school_year),'[]'::jsonb),
    'batches',coalesce((select jsonb_agg(to_jsonb(b)) from public.monthly_import_batches b where b.school_year=p_school_year and b.reporting_month in (v_previous,v_month)),'[]'::jsonb)
  );
end $$;

revoke all on function public.get_monthly_scorecard_dataset(text,text,date) from public;
grant execute on function public.get_monthly_scorecard_dataset(text,text,date) to anon,authenticated;

commit;
