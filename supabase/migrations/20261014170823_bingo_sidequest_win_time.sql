-- Use the original first-win award time, not a mutable approval timestamp.
create or replace function public.spark_bingo_goal_met(p_card public.spark_bingo_cards,p_goal text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare g jsonb; c public.spark_bingo_cards:=p_card; after_at timestamptz; n integer; v_count integer; longest integer; repaired boolean:=false;
begin
 select repaired_at into after_at from public.spark_bingo_repairs
 where card_id=c.id and new_goal=p_goal and ended_at is null and c.goal_ids[square_index+1]=p_goal;
 if found then
  repaired:=true;
  c.started_at:=greatest(c.started_at,after_at+interval '1 microsecond');
  c.started_on:=greatest(c.started_on,(after_at at time zone 'America/Los_Angeles')::date);
 end if;
 select definition into g from public.spark_bingo_goals where id=p_goal;
 n:=(g->>'threshold')::integer;
 if g->>'evidence'='game_streak' then
  with days as (
   select d::date service_date,row_number() over(order by d) ord
   from generate_series(c.started_on::timestamp,public.spark_bingo_today()::timestamp,interval '1 day') d
   where extract(isodow from d)<=5 and not exists(select 1 from public.spark_excluded_days e where e.location_id=c.location_id and e.service_date=d::date)
  ), wins as (
   select distinct d.ord from days d join public.daily_bites_game_progress p on p.service_date=d.service_date
   where p.location_id=c.location_id and p.game_type=g->>'item_key' and p.status='won' and p.completed_at>=c.started_at
  ), runs as (select ord-row_number() over(order by ord) grp from wins)
  select coalesce(max(total),0) into longest from (select count(*) total from runs group by grp) totals;
  return longest>=n;
 elsif g->>'evidence'='mplh_valid' then
  select count(distinct m.service_date) into v_count
  from public.meal_counts m join public.locations l on l.id=m.location_id
  left join public.labor_hours h on h.location_id=m.location_id and h.service_date=m.service_date
  where m.location_id=c.location_id and m.service_date between c.started_on and public.spark_bingo_today() and m.created_at>=c.started_at
   and extract(isodow from m.service_date)<=5
   and not exists(select 1 from public.spark_excluded_days e where e.location_id=c.location_id and e.service_date=m.service_date)
   and m.breakfast_count is not null and m.breakfast_count>=0 and m.lunch_count is not null and m.lunch_count>=0
   and (m.supper_status='pending' or m.supper_count is null or m.supper_count>=0)
   and coalesce(h.additional_worker_hours,0)>=0 and coalesce(h.manager_overtime_hours,0)>=0 and coalesce(l.budget_labor_hours,0)>0
   and (m.breakfast_count*.66+m.lunch_count+case when m.supper_status='pending' then 0 else coalesce(m.supper_count,0) end)
    /nullif(l.budget_labor_hours+coalesce(h.additional_worker_hours,0)+coalesce(h.manager_overtime_hours,0),0)>=public.spark_bingo_mplh_target(c.location_id);
  return v_count>=n;
 elsif g->>'evidence'='scorecard' then
  return exists(select 1 from public.spark_bingo_scorecard_views where location_id=c.location_id and viewed_at>=c.started_at);
 elsif g->>'evidence'='sidequest' then
  return exists(select 1 from october_live.quest_claims w join october_live.entries e on e.id=w.entry
   where w.location_id=c.location_id and e.location_id=c.location_id and e.state='approved'
    and exists(select 1 from public.spark_points p where p.location_id=w.location_id
     and p.unique_key='october-live:quest:first:'||w.quest and p.created_at>=c.started_at));
 elsif g->>'evidence'='guess' then
  return exists(select 1 from october_live.guess_history() h where h.location_id=c.location_id and h.submitted_at>=c.started_at);
 elsif g->>'evidence'='reaction' then
  return exists(select 1 from public.spark_spotlight_reactions r join public.spark_spotlights p on p.id=r.post_id
   where r.location_id=c.location_id and p.published and r.reacted_at>=c.started_at);
 end if;
 -- Only approved repairs receive a different activity window. Legacy rules remain intact.
 return public.spark_bingo_goal_met_legacy(c,p_goal);
end;
$$;


revoke all on function public.spark_bingo_goal_met(public.spark_bingo_cards,text) from public,anon,authenticated;
notify pgrst, 'reload schema';
