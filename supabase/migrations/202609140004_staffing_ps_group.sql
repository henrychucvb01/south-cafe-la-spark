begin;

alter table public.staffing_positions
  add column if not exists ps_group text;

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
    'positions',coalesce((select jsonb_agg(to_jsonb(p) order by
      case
        when lower(p.classification_title) like '%manager%' then 0
        when lower(p.classification_title) like '%senior%' then 1
        else 2
      end,p.employee_name,p.pwi_position_id) from (
      select id,school_year,source_site_id,location_id,pwi_position_id,employee_name,
        employee_number,classification_title,assigned_daily_hours,ps_group,updated_at
      from public.staffing_positions where active=true
    ) p),'[]'::jsonb)
  );
end $$;

revoke all on function public.get_staff_management_dataset(text) from public;
grant execute on function public.get_staff_management_dataset(text) to anon,authenticated;

notify pgrst,'reload schema';
commit;
