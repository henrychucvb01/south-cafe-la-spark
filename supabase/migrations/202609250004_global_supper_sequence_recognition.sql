begin;
lock table public.supper_schedules in access exclusive mode;
-- Consolidate identical published site schedules. Never guess between conflicting windows.
do $$
declare conflicts text;
begin
 select string_agg(school_year||' / '||monitoring_slot, ', ') into conflicts
 from (select school_year,monitoring_slot from public.supper_schedules group by school_year,monitoring_slot
 having count(distinct (available_start,available_end,due_date))>1) c;
 if conflicts is not null then raise exception 'Conflicting site schedules for %. Make their windows/due dates agree before retrying this migration.',conflicts; end if;
end $$;
drop function public.save_supper_schedule(text,uuid,text,text,date,date,date,integer);
delete from public.supper_schedules a using public.supper_schedules b
 where a.school_year=b.school_year and a.monitoring_slot=b.monitoring_slot and a.monitoring_site_id>b.monitoring_site_id;
alter table public.supper_schedules drop column monitoring_site_id, drop column location_id;
alter table public.supper_schedules add primary key(school_year,monitoring_slot);

-- Existing records are unknown unless a correction is currently visible.
-- New records start known-clean. No audit log or PDF versions are created.
alter table public.monitoring_records add column had_correction_requested boolean;
update public.monitoring_records set had_correction_requested=true where status='corrections_requested';
alter table public.monitoring_records alter column had_correction_requested set default false;
create function public.monitoring_correction_state_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if TG_OP='INSERT' then NEW.had_correction_requested:=(NEW.status='corrections_requested');
 else NEW.had_correction_requested:=case when NEW.status='corrections_requested' then true else OLD.had_correction_requested end;
 end if;
 return NEW;
end $$;
create trigger monitoring_correction_state before insert or update on public.monitoring_records for each row execute function public.monitoring_correction_state_guard();
revoke all on function public.monitoring_correction_state_guard() from public;

create function public.supper_sequence_message(p_site_id uuid,p_year text,p_slot text) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select case
 when p_slot='manager_1' then null
 when p_slot='supervisor' and not exists(select 1 from public.monitoring_records where monitoring_site_id=p_site_id and school_year=p_year and monitoring_type='supper' and monitoring_slot='manager_1' and status in ('accepted','completed') and locked) then 'Waiting for Supper 1 to be accepted.'
 when p_slot='manager_2' and (select count(distinct monitoring_slot) from public.monitoring_records where monitoring_site_id=p_site_id and school_year=p_year and monitoring_type='supper' and monitoring_slot in ('manager_1','supervisor') and status in ('accepted','completed') and locked)<2 then 'Complete Supper 1 and Supper 2 first.'
 else null end;
$$;
revoke all on function public.supper_sequence_message(uuid,text,text) from public,anon,authenticated;
create function public.supper_progression_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare reason text; must_check boolean;
begin
 if NEW.monitoring_type<>'supper' then return NEW; end if;
 if TG_OP='INSERT' then must_check:=true;
 else must_check:=NEW.status<>'corrections_requested' and (
 NEW.school_year is distinct from OLD.school_year or NEW.monitoring_slot is distinct from OLD.monitoring_slot or
 NEW.payload is distinct from OLD.payload or NEW.monitoring_date is distinct from OLD.monitoring_date or
 NEW.document_version is distinct from OLD.document_version or
 (NEW.status in ('submitted','accepted','completed') and NEW.status is distinct from OLD.status)); end if;
 if must_check then
  -- Keep prerequisites stable until this write commits, including concurrent unlock/delete.
  perform 1 from public.monitoring_records where monitoring_site_id=NEW.monitoring_site_id and school_year=NEW.school_year
   and monitoring_type='supper' and monitoring_number<NEW.monitoring_number for share;
  reason:=public.supper_sequence_message(NEW.monitoring_site_id,NEW.school_year,NEW.monitoring_slot);
  if reason is not null then raise exception '%',reason; end if;
 end if;
 return NEW;
end $$;
create trigger supper_progression_guard before insert or update on public.monitoring_records for each row execute function public.supper_progression_guard();
revoke all on function public.supper_progression_guard() from public;

create function public.save_global_supper_schedule(p_pin text,p_year text,p_slot text,p_start date,p_end date,p_due date,p_revision integer default null)
returns public.supper_schedules language plpgsql security definer set search_path=public,pg_temp as $$
declare setting public.supper_schedules;
begin
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization required to publish scheduling dates.'; end if;
 if p_year is null or p_year !~ '^[0-9]{4}-[0-9]{2}$' or p_slot is null or p_slot not in ('manager_1','supervisor','manager_2') or p_start is null or p_end is null or p_due is null or p_start>p_end then raise exception 'Enter a valid school year, Supper number, scheduling window and due date.'; end if;
 if p_start<make_date(left(p_year,4)::int,7,1) or p_end>=make_date(left(p_year,4)::int+1,7,1) or p_due<make_date(left(p_year,4)::int,7,1) or p_due>=make_date(left(p_year,4)::int+1,7,1) or right(p_year,2)<>right((left(p_year,4)::int+1)::text,2) then raise exception 'All scheduling dates must belong to the selected school year (July through June).'; end if;
 -- Serialize publications for the same year/slot; protect concurrent editors.
 perform pg_advisory_xact_lock(hashtextextended(p_year||p_slot,0));
 select * into setting from public.supper_schedules where school_year=p_year and monitoring_slot=p_slot for update;
 if setting.school_year is not null and setting.revision is distinct from p_revision then raise exception 'Schedule changed. Refresh before publishing.'; end if;
 if setting.school_year is null and p_revision is not null then raise exception 'Schedule changed. Refresh before publishing.'; end if;
 insert into public.supper_schedules(school_year,monitoring_slot,available_start,available_end,due_date)
 values(p_year,p_slot,p_start,p_end,p_due)
 on conflict(school_year,monitoring_slot) do update set available_start=excluded.available_start,available_end=excluded.available_end,due_date=excluded.due_date,revision=supper_schedules.revision+1 returning * into setting;
 return setting;
end $$;

-- Pure database calculation matching src/monitoring/supperSchedule.js.
-- Week number is floor((day-of-month - 1) / 7) + 1; not a calendar grid row.
create or replace function public.supper_eligible_dates(p_site_id uuid,p_year text,p_slot text)
returns table(eligible_date date) language sql stable security definer set search_path=public,pg_temp as $$
 select day::date from public.supper_schedules s
 cross join lateral generate_series(s.available_start::timestamp,s.available_end::timestamp,interval '1 day') day
 where s.school_year=p_year and s.monitoring_slot=p_slot
 and public.supper_sequence_message(p_site_id,p_year,p_slot) is null
 and extract(isodow from day) between 1 and 5
 and not exists(select 1 from public.monitoring_records m
  where m.monitoring_site_id=p_site_id and m.school_year=p_year and m.monitoring_type='supper'
  and m.status in ('accepted','completed') and m.monitoring_date is not null
  and case m.monitoring_slot when 'manager_1' then 1 when 'supervisor' then 2 when 'manager_2' then 3 end < case p_slot when 'manager_1' then 1 when 'supervisor' then 2 when 'manager_2' then 3 end
  and (extract(isodow from m.monitoring_date)=extract(isodow from day) or (extract(day from m.monitoring_date)::int-1)/7=(extract(day from day)::int-1)/7))
 order by day;
$$;
revoke all on function public.supper_eligible_dates(uuid,text,text) from public,anon,authenticated;

-- Run after the existing identity trigger. Historical uploads remain historical:
-- only new/changed guided dates and guided submission are constrained.
create or replace function public.supper_schedule_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare must_check boolean;
begin
 if NEW.monitoring_type<>'supper' or NEW.source<>'generated' then return NEW; end if;
 if TG_OP='INSERT' then must_check:=NEW.monitoring_date is not null;
 else must_check:=NEW.monitoring_date is distinct from OLD.monitoring_date or NEW.school_year is distinct from OLD.school_year or NEW.monitoring_slot is distinct from OLD.monitoring_slot or (NEW.status in ('submitted','completed') and NEW.status is distinct from OLD.status); end if;
 if must_check and NEW.monitoring_date is not null then
  if not exists(select 1 from public.supper_schedules where school_year=NEW.school_year and monitoring_slot=NEW.monitoring_slot) then raise exception 'Monitoring dates have not been scheduled yet. Contact your Supervisor.'; end if;
  if not exists(select 1 from public.supper_eligible_dates(NEW.monitoring_site_id,NEW.school_year,NEW.monitoring_slot) where eligible_date=NEW.monitoring_date) then raise exception 'This monitoring date is unavailable under the published Supper schedule. Refresh and select an eligible date.'; end if;
 end if;
 return NEW;
end $$;

revoke all on function public.supper_schedule_guard() from public;

create or replace function public.supper_context(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin s:=public.require_supper_monitoring_session(p_token);
 return jsonb_build_object('actor_role',s.actor_role,'employee_id',s.employee_id,'monitor_name',s.monitor_name,'covering',s.covering,'allow_manager_uploads',(select allow_manager_uploads from public.monitoring_settings where singleton),'monitoring_sites',public.monitoring_sites_for_school(p_token),
 'supper_schedules',(select coalesce(jsonb_agg(to_jsonb(w)),'[]') from public.supper_schedules w));
end $$;
create or replace function public.supper_supervisor_overview(p_pin text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization failed.'; end if;
 -- Preserve the existing Command Center authorization scope: active schools.
 return jsonb_build_object('schools',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'school_name',school_name,'location_code',location_code) order by school_name),'[]') from public.locations where active=true),
 'records',(select coalesce(jsonb_agg(to_jsonb(m)-'payload'),'[]') from public.monitoring_records m join public.locations l on l.id=m.location_id where l.active=true),
 'sites',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.monitoring_sites s join public.locations l on l.id=s.location_id where l.active=true),
 'supper_schedules',(select coalesce(jsonb_agg(to_jsonb(w)),'[]') from public.supper_schedules w),
 'allow_manager_uploads',(select allow_manager_uploads from public.monitoring_settings where singleton));
end $$;
revoke all on function public.save_global_supper_schedule(text,text,text,date,date,date,integer) from public;
grant execute on function public.save_global_supper_schedule(text,text,text,date,date,date,integer) to anon,authenticated,service_role;
commit;
