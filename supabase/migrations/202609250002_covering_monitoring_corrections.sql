begin;
-- A covering Manager can resolve returned uploaded PDFs at their authenticated
-- school. This does not grant access to other schools, guided drafts or locks.
create or replace function public.supper_assert_editor(s public.supper_monitoring_sessions,m public.monitoring_records) returns void language plpgsql set search_path=public,pg_temp as $$
begin
 if s.location_id is distinct from m.location_id then raise exception 'Monitoring not found for this school.'; end if;
 if s.actor_role='supervisor' then return; end if;
 if s.actor_role='manager' and s.covering and m.monitoring_type='supper' and m.monitor_role='manager' and m.source='uploaded' and m.status='corrections_requested' and not m.locked then return; end if;
 if m.monitor_role='manager' and m.uploaded_on_behalf and (m.manager_employee_id is null or m.manager_employee_id=s.employee_id) then return; end if;
 if m.monitor_role<>'manager' or m.uploaded_on_behalf or (not s.covering and m.created_by_employee_id is distinct from s.employee_id) or (s.covering and (m.created_by_employee_id is not null or m.created_by_name<>s.monitor_name)) then raise exception 'Only the creator, assigned Manager or Supervisor can edit this monitoring.'; end if;
end $$;

create or replace function public.supper_context(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin s:=public.require_supper_monitoring_session(p_token);
 return jsonb_build_object('actor_role',s.actor_role,'employee_id',s.employee_id,'monitor_name',s.monitor_name,'covering',s.covering,'allow_manager_uploads',(select allow_manager_uploads from public.monitoring_settings where singleton),'monitoring_sites',public.monitoring_sites_for_school(p_token));
end $$;
commit;
