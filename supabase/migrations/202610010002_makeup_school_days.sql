begin;
-- Make-Up Late Checklist excludes weekends and each school's non-operating dates.
create or replace function public.mystery_redemption_options(p_token text,p_win bigint) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;w public.mystery_wins;b jsonb;
begin
 s:=public.mystery_require(p_token);
 select * into w from public.mystery_wins where id=p_win and location_id=s.location_id;
 if s.role<>'manager' or w.id is null then raise exception 'This prize is not available for your school.';end if;
 if w.status<>'waiting' then raise exception 'This prize has already been redeemed.';end if;
 if w.reward_type in ('bingo_change','bingo_free') then b:=public.spark_bingo_refresh_school(s.location_id);end if;
 return jsonb_build_object('bingo',b,'dates',case when w.reward_type='late_checklist' then
  (select coalesce(jsonb_agg(c.service_date order by c.service_date desc),'[]'::jsonb) from public.finish_line_checks c
   where c.location_id=s.location_id and c.status in ('complete','attention') and c.service_date>=date '2026-09-03'
   and c.service_date<=least((now() at time zone 'America/Los_Angeles')::date,date '2027-06-04') and c.submitted_at is not null
   and extract(isodow from c.service_date) between 1 and 5
   and not exists(select 1 from public.spark_excluded_days e where e.location_id=c.location_id and e.service_date=c.service_date)
   and (c.submitted_at at time zone 'America/Los_Angeles')::date>c.service_date
   and not exists(select 1 from public.mystery_redemptions r where r.location_id=s.location_id and r.reward_type='late_checklist' and r.service_date=c.service_date))
 else '[]'::jsonb end,'redemption',(select to_jsonb(r) from public.mystery_redemptions r where win_id=w.id));
end$$;

create or replace function public.mystery_redeem(p_token text,p_win bigint,p_details jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;w public.mystery_wins;r public.mystery_redemptions;
 c public.spark_bingo_cards;b jsonb;d date;today date:=(now() at time zone 'America/Los_Angeles')::date;
 square integer;goal text;paid integer;start_time timestamptz;end_time timestamptz;
begin
 s:=public.mystery_require(p_token);
 if s.role<>'manager' then raise exception 'Use your school inventory to redeem a digital prize.';end if;
 -- Serializes redemption for one school, including two devices using different wins.
 perform pg_advisory_xact_lock(hashtextextended('mystery-redeem-'||s.location_id,0));
 select * into w from public.mystery_wins where id=p_win and location_id=s.location_id for update;
 if w.id is null then raise exception 'Prize not found for this school.';end if;
 select * into r from public.mystery_redemptions where win_id=w.id;
 if r.win_id is not null then
  if r.details is distinct from p_details then raise exception 'This prize was already used with a different selection.';end if;
  return to_jsonb(r);
 end if;
 if w.status<>'waiting' or w.reward_type is null or w.reward_type not in ('late_checklist','bingo_change','bingo_free','double_bites','streak_shield') then raise exception 'This prize cannot be redeemed here.';end if;
 if p_details is null then raise exception 'Choose how to use this prize.';end if;
 if w.reward_type in ('bingo_change','bingo_free') then
  b:=public.spark_bingo_refresh_school(s.location_id);
  select * into c from public.spark_bingo_cards where location_id=s.location_id order by cycle desc limit 1 for update;
  if c.id is distinct from (p_details->>'card')::uuid or c.revision is distinct from (p_details->>'revision')::integer then raise exception 'Your Bingo card changed. Refresh your selection.';end if;
  square:=(p_details->>'square')::integer;
  if c.blackout_at is not null or square is null or square not between 0 and 24 or square=12 or c.goal_ids[square+1]=any(c.completed_ids) then raise exception 'Choose an incomplete Bingo task.';end if;
  if w.reward_type='bingo_change' then
   goal:=p_details->>'goal';
   if not exists(select 1 from jsonb_array_elements(b->'replacement_goals') g where g->>'id'=goal) then raise exception 'Choose an available replacement task.';end if;
   c.goal_ids[square+1]:=goal;
  else c.completed_ids:=array_append(c.completed_ids,c.goal_ids[square+1]);end if;
  update public.spark_bingo_cards set goal_ids=c.goal_ids,completed_ids=c.completed_ids,revision=revision+1 where id=c.id;
 elsif w.reward_type='double_bites' then
  if exists(select 1 from public.mystery_redemptions where location_id=s.location_id and reward_type='double_bites' and ends_at>now()) then raise exception 'Double Daily Bites is already active. Keep this prize until it ends.';end if;
  start_time:=now();end_time:=((start_time at time zone 'America/Los_Angeles')+interval '1 month') at time zone 'America/Los_Angeles';
 else
  d:=(p_details->>'date')::date;
  if d is null or d<date '2026-09-03' or d>least(today,date '2027-06-04') then raise exception 'Choose a past or current school-year date.';end if;
  if exists(select 1 from public.mystery_redemptions where location_id=s.location_id and reward_type=w.reward_type and service_date=d) then raise exception 'A prize already covers this day.';end if;
  if w.reward_type='late_checklist' then
   -- Validate again at redemption: an old screen or direct request must not consume a prize.
   if extract(isodow from d)>5 or exists(select 1 from public.spark_excluded_days e where e.location_id=s.location_id and e.service_date=d) then
    raise exception 'Choose a late checklist from an operating school day. Your prize is still in your inventory.';
   end if;
   perform 1 from public.finish_line_checks where location_id=s.location_id and service_date=d and status in ('complete','attention')
    and (submitted_at at time zone 'America/Los_Angeles')::date>d for update;
   if not found then raise exception 'Choose a submitted late checklist.';end if;
  else
   if d>=today or extract(isodow from d)>5 or exists(select 1 from public.spark_excluded_days where location_id=s.location_id and service_date=d)
    or exists(select 1 from public.finish_line_checks where location_id=s.location_id and service_date=d and status='complete'
     and ((submitted_at at time zone 'America/Los_Angeles')::date=d or exists(select 1 from public.mystery_redemptions where location_id=s.location_id and service_date=d and reward_type='late_checklist')))
   then raise exception 'Choose one missed qualifying day that has ended.';end if;
  end if;
 end if;
 insert into public.mystery_redemptions(win_id,location_id,reward_type,details,starts_at,ends_at,service_date)
  values(w.id,s.location_id,w.reward_type,p_details,start_time,end_time,d) returning * into r;
 if w.reward_type='late_checklist' then
  perform pg_advisory_xact_lock(hashtextextended('mystery-checklist-'||s.location_id||'-'||d,0));
  select coalesce(sum(points),0) into paid from public.spark_points where location_id=s.location_id and service_date=d and point_type in ('finish_line','finish_line_late','mystery_checklist_makeup');
  if paid<5 then insert into public.spark_points(location_id,points,point_type,description,service_date,source,unique_key)
   values(s.location_id,5-paid,'mystery_checklist_makeup','Digital Pull: late checklist counted on time',d,'automatic','mystery-makeup-'||w.id);end if;
 end if;
 if w.reward_type in ('late_checklist','streak_shield') then perform public.spark_reconcile_finish_line_school(s.location_id);end if;
 if w.reward_type in ('bingo_change','bingo_free','streak_shield','late_checklist') then perform public.spark_bingo_refresh_school(s.location_id);end if;
 update public.mystery_wins set status='received',fulfilled_at=now() where id=w.id;
 return to_jsonb(r);
end$$;


commit;
