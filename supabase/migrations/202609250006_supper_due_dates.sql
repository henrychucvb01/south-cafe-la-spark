begin;
lock table public.supper_schedules in access exclusive mode;
-- Keep published due dates and recognition; ranges are now derived per site.
drop function public.save_global_supper_schedule(text,text,text,date,date,date,integer);
alter table public.supper_schedules drop column available_start, drop column available_end;
create function public.save_supper_due_date(p_pin text,p_year text,p_slot text,p_due date,p_revision integer default null)
returns public.supper_schedules language plpgsql security definer set search_path=public,pg_temp as $$
declare setting public.supper_schedules;
begin
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization required to publish scheduling dates.'; end if;
 if p_year is null or p_year !~ '^[0-9]{4}-[0-9]{2}$' or p_slot is null or p_slot not in ('manager_1','supervisor','manager_2') or p_due is null then raise exception 'Enter a valid school year, Supper number, due date.'; end if;
 if p_due<make_date(left(p_year,4)::int,7,1) or p_due>=make_date(left(p_year,4)::int+1,7,1) or right(p_year,2)<>right((left(p_year,4)::int+1)::text,2) then raise exception 'The due date must belong to the selected school year (July through June).'; end if;
 -- Serialize publications for the same year/slot; protect concurrent editors.
 perform pg_advisory_xact_lock(hashtextextended(p_year||p_slot,0));
 select * into setting from public.supper_schedules where school_year=p_year and monitoring_slot=p_slot for update;
 if setting.school_year is not null and setting.revision is distinct from p_revision then raise exception 'Schedule changed. Refresh before publishing.'; end if;
 if setting.school_year is null and p_revision is not null then raise exception 'Schedule changed. Refresh before publishing.'; end if;
 insert into public.supper_schedules(school_year,monitoring_slot,due_date)
 values(p_year,p_slot,p_due)
 on conflict(school_year,monitoring_slot) do update set due_date=excluded.due_date,revision=supper_schedules.revision+1 returning * into setting;
 return setting;
end $$;

-- Pure database calculation matching src/monitoring/supperSchedule.js.
-- Week number is floor((day-of-month - 1) / 7) + 1; not a calendar grid row.
create or replace function public.supper_eligible_dates(p_site_id uuid,p_year text,p_slot text)
returns table(eligible_date date) language sql stable security definer set search_path=public,pg_temp as $$
 select day::date from public.supper_schedules s
 cross join lateral generate_series((case when p_slot='manager_1' then make_date(left(p_year,4)::int,7,1)
  else (select m.monitoring_date+1 from public.monitoring_records m where m.monitoring_site_id=p_site_id and m.school_year=p_year and m.monitoring_type='supper' and m.monitoring_slot=case p_slot when 'supervisor' then 'manager_1' else 'supervisor' end and m.status in ('accepted','completed') and m.locked) end)::timestamp,s.due_date::timestamp,interval '1 day') day
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

revoke all on function public.save_supper_due_date(text,text,text,date,integer) from public;
grant execute on function public.save_supper_due_date(text,text,text,date,integer) to anon,authenticated,service_role;
commit;
