begin;
-- Current Supervisor recognition decision only; no audit or PDF version history.
alter table public.monitoring_records add column perfect_monitoring_override boolean;

create function public.set_monitoring_star(p_token text,p_id uuid,p_revision integer,p_awarded boolean)
returns public.monitoring_records language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions; m public.monitoring_records;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'supervisor' then raise exception 'Supervisor authorization required to change a monitoring star.'; end if;
 select * into m from public.monitoring_records where id=p_id and location_id=s.location_id for update;
 if m.id is null then raise exception 'Monitoring not found for this school.'; end if;
 if m.revision is distinct from p_revision then raise exception 'Monitoring changed. Refresh before changing its star.'; end if;
 if m.monitor_role<>'manager' or m.status<>'accepted' or not m.locked then raise exception 'Stars can only be changed on accepted, locked Manager monitorings.'; end if;
 if p_awarded is null then raise exception 'Choose whether to award or remove the star.'; end if;
 update public.monitoring_records set perfect_monitoring_override=p_awarded,revision=revision+1,updated_at=now() where id=m.id returning * into m;
 return m;
end $$;
revoke all on function public.set_monitoring_star(text,uuid,integer,boolean) from public;
grant execute on function public.set_monitoring_star(text,uuid,integer,boolean) to anon,authenticated,service_role;

-- A new correction invalidates a prior award; a deliberate removal stays removed.
create function public.monitoring_star_correction_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if NEW.status='corrections_requested' and OLD.status is distinct from NEW.status and NEW.perfect_monitoring_override is true then
  NEW.perfect_monitoring_override:=null;
 end if;
 return NEW;
end $$;
create trigger monitoring_star_correction before update on public.monitoring_records for each row execute function public.monitoring_star_correction_guard();
revoke all on function public.monitoring_star_correction_guard() from public;
commit;
