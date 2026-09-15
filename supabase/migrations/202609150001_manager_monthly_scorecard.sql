begin;

create or replace function public.get_manager_monthly_scorecard_dataset(
  p_manager_pin text,
  p_employee_id bigint,
  p_location_id bigint,
  p_school_year text,
  p_reporting_month date
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_verified boolean := false;
  v_month date := date_trunc('month',p_reporting_month)::date;
  v_next date := (date_trunc('month',p_reporting_month)+interval '1 month')::date;
  v_previous date := (date_trunc('month',p_reporting_month)-interval '1 month')::date;
  v_source_site_id text;
begin
  if p_employee_id is null then
    execute 'select public.verify_covering_pin($1)' into v_verified using p_manager_pin;
  elsif to_regprocedure('public.verify_manager_pin(bigint,text)') is not null then
    execute 'select public.verify_manager_pin($1,$2)' into v_verified using p_employee_id,p_manager_pin;
  else
    execute 'select public.verify_manager_pin($1,$2)' into v_verified using p_employee_id::text,p_manager_pin;
  end if;

  if v_verified is not true then raise exception 'Manager authorization failed'; end if;
  if p_employee_id is not null and not exists (
    select 1 from public.employees e
    where e.id=p_employee_id and e.location_id=p_location_id and e.active=true
  ) then raise exception 'Manager location authorization failed'; end if;

  select m.source_site_id into v_source_site_id
  from public.locations l
  join public.location_information d on d.location_code=l.location_code and d.active=true
  join public.monthly_site_mappings m on m.main_location_id=d.id and m.active=true and m.program_type='main'
  where l.id=p_location_id and l.active=true
  order by m.source_site_id limit 1;
  if v_source_site_id is null then raise exception 'This location is not mapped to Monthly Scorecards'; end if;

  return jsonb_build_object(
    'schools',coalesce((select jsonb_agg(to_jsonb(s)) from (
      select d.id directory_id,l.id location_id,d.location_code,d.school_name,d.site_type,
        l.enrollment,l.labor_type,l.budget_labor_hours,v_source_site_id source_site_id
      from public.locations l
      join public.location_information d on d.location_code=l.location_code and d.active=true
      where l.id=p_location_id and l.active=true
    ) s),'[]'::jsonb),
    'meal_counts',coalesce((select jsonb_agg(to_jsonb(m)) from public.meal_counts m
      where m.location_id=p_location_id and m.service_date>=v_previous and m.service_date<v_next),'[]'::jsonb),
    'labor_hours',coalesce((select jsonb_agg(to_jsonb(h)) from public.labor_hours h
      where h.location_id=p_location_id and h.service_date>=v_previous and h.service_date<v_next),'[]'::jsonb),
    'production_rows',coalesce((select jsonb_agg(to_jsonb(p)) from public.monthly_production_rows p
      join public.monthly_import_batches b on b.id=p.batch_id
      where b.school_year=p_school_year and p.source_site_id=v_source_site_id
        and p.production_date>=v_previous and p.production_date<v_next),'[]'::jsonb),
    'cost_rows',coalesce((select jsonb_agg(to_jsonb(c)) from public.monthly_production_cost_rows c
      join public.monthly_import_batches b on b.id=c.batch_id
      where b.school_year=p_school_year and c.source_site_id=v_source_site_id
        and c.production_date>=v_previous and c.production_date<v_next),'[]'::jsonb),
    'rates',coalesce((select jsonb_agg(to_jsonb(r)) from public.monthly_reimbursement_rates r
      where r.school_year=p_school_year),'[]'::jsonb),
    'labor_rates',coalesce((select jsonb_agg(to_jsonb(r)) from public.monthly_labor_rates r
      where r.school_year=p_school_year),'[]'::jsonb),
    'staffing',coalesce((select jsonb_agg(to_jsonb(a)) from public.monthly_staffing_allocations a
      where a.school_year=p_school_year and a.source_site_id=v_source_site_id),'[]'::jsonb),
    'batches','[]'::jsonb,
    'available_months',coalesce((select jsonb_agg(x.available_month order by x.available_month desc) from (
      select distinct date_trunc('month',z.activity_date)::date as available_month from (
        select m.service_date activity_date from public.meal_counts m where m.location_id=p_location_id
        union all
        select p.production_date from public.monthly_production_rows p where p.source_site_id=v_source_site_id
        union all
        select c.production_date from public.monthly_production_cost_rows c where c.source_site_id=v_source_site_id
      ) z
    ) x),'[]'::jsonb)
  );
end $$;

revoke all on function public.get_manager_monthly_scorecard_dataset(text,bigint,bigint,text,date) from public;
grant execute on function public.get_manager_monthly_scorecard_dataset(text,bigint,bigint,text,date) to anon,authenticated;

commit;
