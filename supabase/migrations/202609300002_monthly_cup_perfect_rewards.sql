begin;

-- Link the old one-off Perfect credits to their unambiguous current records.
-- Preserve their dates and points; never double-pay them during the backfill.
do $$ declare p record; ids uuid[]; begin
 for p in select * from public.spark_points where source='supervisor_monitoring'
   and point_type like 'monitoring_%' and description ~* '^perfect\y' and points=20 loop
  select array_agg(m.id) into ids from public.monitoring_records m
   where m.location_id=p.location_id and 'monitoring_'||m.monitoring_type=p.point_type
   and m.status='accepted' and m.locked and m.monitor_role='manager'
   and coalesce(m.perfect_monitoring_override,m.had_correction_requested is false)
   and m.school_year=case when extract(month from p.service_date)>=7 then
     extract(year from p.service_date)::int::text||'-'||right((extract(year from p.service_date)::int+1)::text,2)
     else (extract(year from p.service_date)::int-1)::text||'-'||right(extract(year from p.service_date)::int::text,2) end;
  if coalesce(cardinality(ids),0)<>1 then raise exception 'Review legacy Perfect credit % before migrating: monitoring match is ambiguous.',p.id; end if;
  update public.spark_points set unique_key='monitoring-perfect-'||ids[1]::text,source='automatic_monitoring' where id=p.id;
 end loop;
end $$;

create function public.spark_sync_perfect_monitoring(p_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.monitoring_records; begin
 select * into m from public.monitoring_records where id=p_id for update;
 if m.id is not null and m.status='accepted' and m.locked and m.monitor_role='manager'
   and coalesce(m.perfect_monitoring_override,m.had_correction_requested is false) then
  insert into public.spark_points(location_id,points,point_type,description,service_date,source,unique_key)
   values(m.location_id,20,'monitoring_'||m.monitoring_type,
    'Perfect '||initcap(m.monitoring_type)||coalesce(' '||m.monitoring_number::text,'')||' Monitoring',
    m.monitoring_date,'automatic_monitoring','monitoring-perfect-'||m.id::text)
   on conflict(unique_key) do update set location_id=excluded.location_id,points=20,
     point_type=excluded.point_type,description=excluded.description,source=excluded.source;
 else
  delete from public.spark_points where unique_key='monitoring-perfect-'||p_id::text and source='automatic_monitoring';
 end if;
end $$;
create function public.spark_perfect_monitoring_changed() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.spark_sync_perfect_monitoring(case when TG_OP='DELETE' then OLD.id else NEW.id end);
 return null;
end $$;
create trigger spark_perfect_monitoring_points after insert or update or delete on public.monitoring_records
 for each row execute function public.spark_perfect_monitoring_changed();
revoke all on function public.spark_sync_perfect_monitoring(uuid),public.spark_perfect_monitoring_changed() from public,anon,authenticated;

-- Old browser tabs must not issue Pass or duplicate Perfect awards manually.
-- This guard is intentionally invoker-rights; the automatic definer owns its writes.
create function public.spark_monitoring_points_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if (NEW.point_type like 'monitoring_%' or (TG_OP='UPDATE' and OLD.point_type like 'monitoring_%'))
   and current_user in ('anon','authenticated') then
  raise exception 'Monitoring points are automatic. Manage the Perfect star in Monitorings.';
 end if;
 return NEW;
end $$;
revoke all on function public.spark_monitoring_points_guard() from public,anon,authenticated;
create trigger spark_monitoring_points_guard before insert or update on public.spark_points
 for each row execute function public.spark_monitoring_points_guard();
do $$ declare m record; begin
 for m in select id from public.monitoring_records order by id loop perform public.spark_sync_perfect_monitoring(m.id); end loop;
end $$;

-- One frozen standings snapshot per closed month. Token amounts are private.
create table public.spark_monthly_cup_months(month date primary key,closed_at timestamptz not null default now());
create table public.spark_monthly_cup_results(
 month date not null references public.spark_monthly_cup_months(month),
 location_id bigint not null references public.locations(id),school_name text not null,location_code text,
 points bigint not null,rank integer not null,tokens integer not null check(tokens between 0 and 2),
 primary key(month,location_id)
);
alter table public.spark_monthly_cup_months enable row level security;
alter table public.spark_monthly_cup_results enable row level security;
revoke all on public.spark_monthly_cup_months,public.spark_monthly_cup_results from public,anon,authenticated;

create function public.spark_close_monthly_cups(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_month date; v_end date; r record; v_count integer:=0; begin
 -- Same lock order as Pulls and manual token adjustments, across all schools.
 perform pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
 for v_month in select d::date from generate_series(date '2026-09-01',
   date_trunc('month',p_now at time zone 'America/Los_Angeles')-interval '1 month',interval '1 month') d loop
  -- Match the existing competition: August through June 7, no July Cup.
  if extract(month from v_month)=7 then continue; end if;
  if exists(select 1 from public.spark_monthly_cup_months where month=v_month) then continue; end if;
  v_end:=case when extract(month from v_month)=6 then v_month+6 else (v_month+interval '1 month')::date-1 end;
  insert into public.spark_monthly_cup_months(month,closed_at) values(v_month,p_now);
  insert into public.spark_monthly_cup_results(month,location_id,school_name,location_code,points,rank,tokens)
   select v_month,id,school_name,location_code,score,place,
     case when score<=0 then 0 when place<=5 then 2 when place<=17 then 1 else 0 end
   from (
    select totals.*,rank() over(order by score desc)::integer as place from (
     select l.id,l.school_name,l.location_code::text,coalesce(sum(p.points),0)::bigint as score
     from public.locations l left join public.spark_points p on p.location_id=l.id and p.service_date between v_month and v_end
     where l.active=true and lower(trim(l.school_name))<>'test high school'
     group by l.id,l.school_name,l.location_code
    ) totals
   ) standings;
  for r in select * from public.spark_monthly_cup_results where month=v_month and tokens>0 order by location_id loop
   insert into public.mystery_balances(location_id,tokens) values(r.location_id,r.tokens)
    on conflict(location_id) do update set tokens=public.mystery_balances.tokens+excluded.tokens,revision=public.mystery_balances.revision+1;
   v_count:=v_count+1;
  end loop;
 end loop;
 return v_count;
end $$;
revoke all on function public.spark_close_monthly_cups(timestamptz) from public,anon,authenticated;

-- Public display contains standings only, never Pull amounts or award rules.
create function public.spark_monthly_cup_standings(p_start date,p_end date) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('month',r.month,'location_id',r.location_id,
   'school_name',r.school_name,'location_code',r.location_code,'points',r.points,'rank',r.rank)
   order by r.month,r.rank,r.school_name),'[]'::jsonb)
 from public.spark_monthly_cup_results r where r.month between p_start and p_end;
$$;
revoke all on function public.spark_monthly_cup_standings(date,date) from public;
grant execute on function public.spark_monthly_cup_standings(date,date) to anon,authenticated;

-- CRON-BEGIN (omitted only in isolated tests)
create extension if not exists pg_cron with schema pg_catalog;
-- First run after local month-end is 00:35 Los Angeles, after the :05 bonus job.
-- Hourly retries also recover missed runs without ever paying a month twice.
select cron.schedule('spark-monthly-cup-rewards','35 * * * *','select public.spark_close_monthly_cups();');
-- CRON-END
select public.spark_close_monthly_cups();
commit;
