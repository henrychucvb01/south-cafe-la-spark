begin;
-- Only the assigned Manager may remove an unfinished, unlocked monitoring.
-- Row locking and revision checks prevent deletion racing with submission.
create or replace function public.delete_monitoring_draft(p_token text,p_id uuid,p_revision integer)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions; m public.monitoring_records;
begin
 s:=public.require_supper_monitoring_session(p_token);
 select * into m from public.monitoring_records where id=p_id and location_id=s.location_id for update;
 if m.id is null then raise exception 'Monitoring not found for this school.'; end if;
 if s.actor_role<>'manager' or m.monitor_role<>'manager' or m.status<>'draft' or m.locked then
  raise exception 'Only your unlocked Manager draft can be deleted.';
 end if;
 perform public.supper_assert_editor(s,m);
 if m.revision is distinct from p_revision then raise exception 'Monitoring revision changed. Refresh before deleting.'; end if;
 delete from public.monitoring_records where id=m.id;
end $$;
revoke all on function public.delete_monitoring_draft(text,uuid,integer) from public;
grant execute on function public.delete_monitoring_draft(text,uuid,integer) to anon,authenticated,service_role;
commit;
