begin;

drop function if exists public.update_staffing_position(text,bigint,text,text,text,text,numeric,bigint,boolean);
drop function if exists public.get_staff_management_dataset(text);
drop function if exists public.refresh_monthly_staffing_allocations(text,text[]);

delete from public.staffing_positions where position_filled=false;
drop index if exists public.staffing_positions_employee_number_uq;

alter table public.staffing_positions
  drop column if exists assigned_days_per_week,
  drop column if exists pwi_pay_level,
  drop column if exists pwi_job_code,
  drop column if exists classification_key,
  drop column if exists position_filled,
  drop column if exists movable,
  drop column if exists source_as_of;

create unique index if not exists staffing_positions_employee_number_uq
  on public.staffing_positions(school_year,employee_number)
  where employee_number is not null and employee_number <> '00000000';

create or replace function public.staffing_classification_key(p_title text)
returns text language sql immutable strict as $$
  select case
    when lower(p_title) like '%senior food service worker%' then 'senior_worker'
    when lower(p_title) ~ 'food service manager vii' then 'manager_vii'
    when lower(p_title) ~ 'food service manager vi' then 'manager_vi'
    when lower(p_title) ~ 'food service manager v' then 'manager_v'
    when lower(p_title) ~ 'food service manager iv' then 'manager_iv'
    when lower(p_title) ~ 'food service manager iii' then 'manager_iii'
    when lower(p_title) ~ 'food service manager ii' then 'manager_ii'
    when lower(p_title) ~ 'food service manager i' then 'manager_i'
    else 'worker'
  end
$$;

create or replace function public.refresh_monthly_staffing_allocations(
  p_school_year text,p_source_site_ids text[] default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.monthly_staffing_allocations a
  where a.school_year=p_school_year
    and (p_source_site_ids is null or a.source_site_id=any(p_source_site_ids));
  insert into public.monthly_staffing_allocations(
    school_year,source_site_id,classification_key,position_count,filled_count,
    vacant_count,filled_daily_hours,source_as_of
  )
  select school_year,source_site_id,public.staffing_classification_key(classification_title),
    count(*)::integer,count(*)::integer,0,sum(assigned_daily_hours),max(updated_at)::date
  from public.staffing_positions
  where school_year=p_school_year and active
    and (p_source_site_ids is null or source_site_id=any(p_source_site_ids))
  group by school_year,source_site_id,public.staffing_classification_key(classification_title);
end $$;
revoke all on function public.refresh_monthly_staffing_allocations(text,text[]) from public;

create or replace function public.get_staff_management_dataset(p_supervisor_pin text)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then raise exception 'Supervisor authorization failed'; end if;
  return jsonb_build_object(
    'schools',coalesce((select jsonb_agg(to_jsonb(s) order by s.school_name) from (
      select l.id,l.location_code,l.school_name,
        (select m.source_site_id from public.monthly_site_mappings m
         join public.location_information d on d.id=m.main_location_id
         where d.location_code=l.location_code and m.active=true and m.program_type='main'
         order by m.source_site_id limit 1) source_site_id
      from public.locations l where l.active=true
        and lower(trim(l.school_name)) not in ('test high school','hawthorne academy')
    ) s),'[]'::jsonb),
    'positions',coalesce((select jsonb_agg(to_jsonb(p) order by p.employee_name,p.pwi_position_id) from (
      select id,school_year,source_site_id,location_id,pwi_position_id,employee_name,
        employee_number,classification_title,assigned_daily_hours,updated_at
      from public.staffing_positions where active=true
    ) p),'[]'::jsonb)
  );
end $$;
revoke all on function public.get_staff_management_dataset(text) from public;
grant execute on function public.get_staff_management_dataset(text) to anon,authenticated;

create or replace function public.update_staffing_position(
  p_supervisor_pin text,p_position_id bigint,p_employee_name text,p_employee_number text,
  p_classification_title text,p_assigned_daily_hours numeric,p_location_id bigint,
  p_allow_fixed_reassignment boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_old public.staffing_positions%rowtype;v_target_source_site_id text;v_fixed boolean;
begin
  if public.verify_supervisor_pin(p_supervisor_pin) is not true then raise exception 'Supervisor authorization failed'; end if;
  select * into v_old from public.staffing_positions where id=p_position_id and active=true for update;
  if not found then raise exception 'Staffing record was not found'; end if;
  if nullif(trim(p_employee_name),'') is null then raise exception 'Employee name is required'; end if;
  if nullif(trim(p_classification_title),'') is null then raise exception 'Classification is required'; end if;
  if p_assigned_daily_hours is null or p_assigned_daily_hours<0 or p_assigned_daily_hours>24 then raise exception 'Assigned hours must be between 0 and 24'; end if;
  v_fixed:=lower(v_old.classification_title) like '%manager%' or lower(v_old.classification_title) like '%senior%';
  if p_location_id<>v_old.location_id and v_fixed and not coalesce(p_allow_fixed_reassignment,false) then
    raise exception 'This fixed position requires explicit confirmation before reassignment';
  end if;
  select m.source_site_id into v_target_source_site_id from public.locations l
  join public.location_information d on d.location_code=l.location_code and d.active=true
  join public.monthly_site_mappings m on m.main_location_id=d.id and m.active=true and m.program_type='main'
  where l.id=p_location_id and l.active=true
    and lower(trim(l.school_name)) not in ('test high school','hawthorne academy')
  order by m.source_site_id limit 1;
  if v_target_source_site_id is null then raise exception 'The target school does not have an active PWI mapping'; end if;
  update public.staffing_positions set employee_name=trim(p_employee_name),
    employee_number=nullif(trim(p_employee_number),''),classification_title=trim(p_classification_title),
    assigned_daily_hours=p_assigned_daily_hours,location_id=p_location_id,
    source_site_id=v_target_source_site_id,updated_at=now() where id=p_position_id;
  if v_old.linked_employee_id is not null then
    update public.employees set employee_name=trim(p_employee_name),location_id=p_location_id where id=v_old.linked_employee_id;
  end if;
  perform public.refresh_monthly_staffing_allocations(v_old.school_year,
    array(select distinct x from unnest(array[v_old.source_site_id,v_target_source_site_id]) x));
  return (select to_jsonb(sp) from public.staffing_positions sp where sp.id=p_position_id);
end $$;
revoke all on function public.update_staffing_position(text,bigint,text,text,text,numeric,bigint,boolean) from public;
grant execute on function public.update_staffing_position(text,bigint,text,text,text,numeric,bigint,boolean) to anon,authenticated;

notify pgrst,'reload schema';
commit;
