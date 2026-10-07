begin;
-- Defaults remain OFF, including new locations without a saved rollout row.
create table public.breakfast_rollout (
 location_id bigint primary key references public.locations(id),
 enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into public.breakfast_rollout(location_id) select id from public.locations;
alter table public.breakfast_rollout enable row level security;
revoke all on public.breakfast_rollout from public,anon,authenticated;

create function public.breakfast_rollout_settings(p_pin text,p_changes jsonb default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb;current_enabled boolean;
begin
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization required.';end if;
 -- Same supervisor scope as Command Center: all active locations.
 if p_changes is not null then
  if jsonb_typeof(p_changes)<>'array' then raise exception 'Invalid school selection.';end if;
  if exists(select 1 from jsonb_array_elements(p_changes) x group by x->>'id' having count(*)>1) then raise exception 'Duplicate school selection.';end if;
  for item in select value from jsonb_array_elements(p_changes) order by (value->>'id')::bigint loop
   if jsonb_typeof(item->'enabled') is distinct from 'boolean' or jsonb_typeof(item->'previous') is distinct from 'boolean'
    or not exists(select 1 from locations where id=(item->>'id')::bigint and active) then raise exception 'Invalid school selection.';end if;
   insert into breakfast_rollout(location_id) values((item->>'id')::bigint) on conflict do nothing;
   select enabled into current_enabled from breakfast_rollout where location_id=(item->>'id')::bigint for update;
   if current_enabled is distinct from (item->>'previous')::boolean then raise exception 'Rollout settings changed in another session. Reload before applying changes.';end if;
   update breakfast_rollout set enabled=(item->>'enabled')::boolean,updated_at=clock_timestamp() where location_id=(item->>'id')::bigint;
  end loop;
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'school_name',l.school_name,'location_code',l.location_code,'enabled',coalesce(r.enabled,false)) order by l.school_name,l.id)
 from locations l left join breakfast_rollout r on r.location_id=l.id where l.active),'[]'::jsonb);
end $$;

create function public.breakfast_require_enabled(p_location bigint) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare allowed boolean;
begin
 -- Hold the permission through the request; a disable waits for in-flight saves.
 select enabled into allowed from breakfast_rollout where location_id=p_location for share;
 if allowed is not true then raise exception 'Breakfast Accountability is not currently available for this school.';end if;
end $$;

create or replace function public.breakfast_require_manager(p_token text) returns public.supper_monitoring_sessions
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'manager' then raise exception 'Manager access required.';end if;
 perform public.breakfast_require_enabled(s.location_id);
 return s;
end $$;

create or replace function public.breakfast_require_qr(p_qr uuid) returns public.breakfast_classrooms
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.breakfast_classrooms;
begin
 select b.* into c from breakfast_classrooms b join locations l on l.id=b.location_id where b.qr_token=p_qr and b.active and l.active for update of b;
 if c.id is null then raise exception 'This classroom link is unavailable. Please contact the cafeteria.';end if;
 perform public.breakfast_require_enabled(c.location_id);
 return c;
end $$;

create function public.breakfast_manager_enabled(p_token text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'manager' then raise exception 'Manager access required.';end if;
 return coalesce((select enabled from breakfast_rollout where location_id=s.location_id),false);
end $$;

create function public.breakfast_qr_enabled(p_qr uuid) returns boolean
language sql security definer set search_path=public,pg_temp as $$
 select exists(select 1 from breakfast_classrooms c join locations l on l.id=c.location_id join breakfast_rollout r on r.location_id=c.location_id where c.qr_token=p_qr and c.active and l.active and r.enabled);
$$;

-- Preserve Finish Line's existing count-copy behavior while gating the full dashboard.
-- Read-only, manager's own school only; no notes, QR tokens, or other Breakfast operations.
create function public.breakfast_finish_line_total(p_token text,p_date date) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;rows jsonb;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'manager' then raise exception 'Manager access required.';end if;
 if p_date is null then raise exception 'Select a service date.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('record',case when d.id is null then null else jsonb_build_object('teacher_submitted_at',d.teacher_submitted_at,'teacher_certified',d.teacher_certified) end)),'[]') into rows
 from breakfast_classrooms c left join breakfast_daily_records d on d.classroom_id=c.id and d.service_date=p_date
 where c.location_id=s.location_id and (d.id is not null or (c.active and (c.created_at at time zone 'America/Los_Angeles')::date<=p_date));
 return jsonb_build_object('rows',rows,'total',coalesce((select sum(teacher_meal_count) from breakfast_daily_records where location_id=s.location_id and service_date=p_date and teacher_certified and teacher_submitted_at is not null),0));
end $$;
revoke all on function public.breakfast_require_enabled(bigint),public.breakfast_require_manager(text),public.breakfast_require_qr(uuid) from public,anon,authenticated;
revoke all on function public.breakfast_rollout_settings(text,jsonb),public.breakfast_manager_enabled(text),public.breakfast_qr_enabled(uuid),public.breakfast_finish_line_total(text,date) from public;
grant execute on function public.breakfast_rollout_settings(text,jsonb),public.breakfast_manager_enabled(text),public.breakfast_qr_enabled(uuid),public.breakfast_finish_line_total(text,date) to anon,authenticated;
notify pgrst,'reload schema';
commit;
