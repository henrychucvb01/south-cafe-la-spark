begin;

-- Additive reconciliation only. Preserve all existing rollout grants and adjustments.
create or replace function public.spark_bonus_eligible(p_location bigint, p_start date, p_end date)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select count(*) > 0 and bool_and(d::date < date '2026-09-03' or exists (
    select 1 from public.finish_line_checks c
    where c.location_id = p_location and c.service_date = d::date
      and c.status = 'complete'
      and (c.submitted_at at time zone 'America/Los_Angeles')::date = c.service_date
  ))
  from generate_series(greatest(p_start, date '2026-08-12')::timestamp,
                       least(p_end, date '2027-06-04')::timestamp, interval '1 day') d
  where extract(isodow from d) <= 5 and not exists (
    select 1 from public.spark_excluded_days e where e.location_id = p_location and e.service_date = d::date
  );
$$;

-- The period guard also covers old clients with different unique_key formats.
create or replace function public.spark_guard_finish_line_bonus()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_start date; v_end date; v_cap integer; v_paid integer; v_types text[];
begin
  if new.point_type not in ('perfect_week','weekly_streak_bonus','perfect_month','monthly_streak_bonus') then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('spark-bonus-' || new.location_id, 0));
  if new.point_type in ('perfect_week','weekly_streak_bonus') then
    v_start := date_trunc('week', new.service_date)::date; v_end := v_start + 4;
    v_cap := 25; v_types := array['perfect_week','weekly_streak_bonus'];
    if v_start < date '2026-08-12' or v_end > date '2027-06-04' then return null; end if;
  else
    v_start := date_trunc('month', new.service_date)::date;
    v_end := (v_start + interval '1 month - 1 day')::date;
    v_cap := 100; v_types := array['perfect_month','monthly_streak_bonus'];
    if v_end < date '2026-08-12' or v_start > date '2027-06-04' then return null; end if;
  end if;
  if v_end > (now() at time zone 'America/Los_Angeles')::date
     or not public.spark_bonus_eligible(new.location_id, v_start, v_end) then return null; end if;
  select coalesce(sum(points),0) into v_paid from public.spark_points
    where location_id = new.location_id and point_type = any(v_types)
      and service_date between v_start and v_end;
  if v_paid >= v_cap or new.points <= 0 then return null; end if;
  new.points := least(new.points, v_cap - v_paid);
  new.service_date := v_end;
  return new;
end;
$$;

create or replace function public.spark_reconcile_finish_line_school(p_location bigint)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_paid integer; v_added integer := 0; v_count integer;
        v_today date := (now() at time zone 'America/Los_Angeles')::date;
begin
  if not exists (select 1 from public.locations where id = p_location
    and active is not false and lower(trim(school_name)) <> 'test high school') then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('spark-bonus-' || p_location, 0));
  for r in
    select d::date as starts, (d::date + 4) as ends, 25 as points,
      'perfect_week'::text as kind, array['perfect_week','weekly_streak_bonus'] as types
    from generate_series(timestamp '2026-08-17', least(v_today, date '2027-06-04')::timestamp, interval '7 days') d
    where d::date + 4 <= least(v_today, date '2027-06-04')
    union all
    select d::date, (d + interval '1 month - 1 day')::date, 100,
      'perfect_month', array['perfect_month','monthly_streak_bonus']
    from generate_series(timestamp '2026-08-01', timestamp '2027-06-01', interval '1 month') d
    where (d + interval '1 month - 1 day')::date <= v_today
  loop
    if not public.spark_bonus_eligible(p_location, r.starts, r.ends) then continue; end if;
    select coalesce(sum(points),0) into v_paid from public.spark_points
      where location_id = p_location and point_type = any(r.types) and service_date between r.starts and r.ends;
    if v_paid >= r.points then continue; end if;
    insert into public.spark_points(location_id, points, point_type, description, service_date, source, unique_key)
      values(p_location, r.points - v_paid, r.kind,
        case when r.kind = 'perfect_week' then 'Perfect Finish Line Week' else 'Perfect Finish Line Month' end,
        r.ends, 'automatic', 'finish-line-reconcile-' || p_location || '-' || r.kind || '-' || r.starts || '-' || v_paid)
      on conflict (unique_key) do nothing;
    get diagnostics v_count = row_count;
    v_added := v_added + v_count;
  end loop;
  return v_added;
end;
$$;

create or replace function public.spark_reconcile_finish_line_bonuses()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; v_added integer := 0;
begin
  for r in select id from public.locations where active is not false
    and lower(trim(school_name)) <> 'test high school' order by id
  loop v_added := v_added + public.spark_reconcile_finish_line_school(r.id); end loop;
  return v_added;
end;
$$;

create or replace function public.spark_finish_line_bonus_changed()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.spark_reconcile_finish_line_school(new.location_id);
  return new;
end;
$$;

revoke all on function public.spark_bonus_eligible(bigint,date,date) from public, anon, authenticated;
revoke all on function public.spark_guard_finish_line_bonus() from public, anon, authenticated;
revoke all on function public.spark_reconcile_finish_line_school(bigint) from public, anon, authenticated;
revoke all on function public.spark_reconcile_finish_line_bonuses() from public, anon, authenticated;
revoke all on function public.spark_finish_line_bonus_changed() from public, anon, authenticated;

create or replace trigger spark_finish_line_bonus_guard before insert on public.spark_points
  for each row execute function public.spark_guard_finish_line_bonus();
create or replace trigger spark_finish_line_bonus_on_check after insert or update on public.finish_line_checks
  for each row execute function public.spark_finish_line_bonus_changed();
create or replace trigger spark_finish_line_bonus_on_exclusion after insert or update on public.spark_excluded_days
  for each row execute function public.spark_finish_line_bonus_changed();

select public.spark_reconcile_finish_line_bonuses() as corrected_bonus_count;

-- CRON-BEGIN (omitted only by the isolated PGlite test runner)
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('spark-finish-line-bonuses', '5 * * * *',
  'select public.spark_reconcile_finish_line_bonuses();');
-- CRON-END
commit;
