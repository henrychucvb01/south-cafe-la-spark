begin;
select pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
-- User confirmed the previous pool and wins were test prizes to remove.
-- Keep school token balances and previously posted ledger entries unchanged.
alter table public.mystery_prizes add column reward_type text, add column retired boolean not null default false;
alter table public.mystery_wins add column reward_type text;
delete from public.mystery_wins;
delete from public.mystery_prizes;
insert into public.mystery_prizes(name,description,icon,kind,reward_type,points_amount,bonus_tokens) values
 ('+5 SPARK Points + Extra Pull','5 SPARK points for your school and 1 extra Pull token, added immediately.','⭐','spark_points','points_pull',5,1),
 ('Make-Up Late Checklist','Redeem for one late checklist so it counts as on time.','📋','manual','late_checklist',0,0),
 ('Change a Bingo Square','Redeem to replace one incomplete Bingo task without using your monthly repick.','🔄','manual','bingo_change',0,0),
 ('Bingo Free Space','Redeem to complete one incomplete Bingo square automatically.','✨','manual','bingo_free',0,0),
 ('Double Daily Bites for 1 Month','Starts immediately when won: double Daily Bites points for one calendar month.','🍎','manual','double_bites',0,0),
 ('Streak Shield','Redeem to protect your Finish Line streak from one missed qualifying day.','🛡️','manual','streak_shield',0,0),
 ('Candy Bar','Saved in your inventory until your supervisor gives you the candy bar.','🍫','manual','candy_bar',0,0);

create table public.mystery_redemptions(
 win_id bigint primary key references public.mystery_wins(id),
 location_id bigint not null references public.locations(id),
 reward_type text not null, details jsonb not null, redeemed_at timestamptz not null default now(),
 starts_at timestamptz, ends_at timestamptz, service_date date,
 check((reward_type='double_bites')=(starts_at is not null and ends_at is not null))
);
create unique index mystery_one_day_reward on public.mystery_redemptions(location_id,reward_type,service_date) where service_date is not null;
alter table public.mystery_redemptions enable row level security;
revoke all on public.mystery_redemptions from public,anon,authenticated;

create function public.mystery_snapshot_reward() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 select reward_type into new.reward_type from public.mystery_prizes where id=new.prize_id;
 return new;
end$$;
create trigger mystery_snapshot_reward before insert on public.mystery_wins for each row execute function public.mystery_snapshot_reward();

create function public.mystery_activate_double_bites() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.reward_type='double_bites' then
  insert into public.mystery_redemptions(win_id,location_id,reward_type,details,starts_at,ends_at)
   values(new.id,new.location_id,new.reward_type,'{}',new.won_at,((new.won_at at time zone 'America/Los_Angeles')+interval '1 month') at time zone 'America/Los_Angeles');
  update public.mystery_wins set status='received',fulfilled_at=new.won_at where id=new.id;
 end if;
 return new;
end$$;
create trigger mystery_activate_double_bites after insert on public.mystery_wins for each row execute function public.mystery_activate_double_bites();
revoke all on function public.mystery_activate_double_bites() from public,anon,authenticated;

create function public.mystery_double_bites_points() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare paid integer;
begin
 if new.point_type in ('finish_line','finish_line_late','mystery_checklist_makeup') then
  perform pg_advisory_xact_lock(hashtextextended('mystery-checklist-'||new.location_id||'-'||new.service_date,0));
  if exists(select 1 from public.mystery_redemptions where location_id=new.location_id and service_date=new.service_date and reward_type='late_checklist') then
   select coalesce(sum(points),0) into paid from public.spark_points where location_id=new.location_id and service_date=new.service_date and point_type in ('finish_line','finish_line_late','mystery_checklist_makeup');
   if paid>=5 then return null;end if;
   new.points:=least(new.points,5-paid);
  end if;
 end if;
 if new.points>0 and new.point_type in ('daily_bites_visit','daily_bites_word_game','daily_bites_spark_sort','ar_training')
 and exists(select 1 from public.mystery_redemptions r where r.location_id=new.location_id and r.reward_type='double_bites'
  and now()>=r.starts_at and now()<r.ends_at
  and new.service_date=(now() at time zone 'America/Los_Angeles')::date) then
  new.points:=new.points*2;new.description:=coalesce(new.description,'Daily Bites')||' · Digital Pull double points';
 end if;
 return new;
end$$;
create trigger mystery_double_bites_points before insert on public.spark_points for each row execute function public.mystery_double_bites_points();

create function public.mystery_school_benefits(p_location_id bigint) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
 'makeup_dates',coalesce(jsonb_agg(service_date) filter(where reward_type='late_checklist'),'[]'::jsonb),
 'shield_dates',coalesce(jsonb_agg(service_date) filter(where reward_type='streak_shield'),'[]'::jsonb),
 'double_until',max(ends_at) filter(where reward_type='double_bites' and now()>=starts_at and now()<ends_at))
 from public.mystery_redemptions where location_id=p_location_id;
$$;

create or replace function public.spark_bonus_eligible(p_location bigint,p_start date,p_end date)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select count(*)>0 and bool_and(d::date<date '2026-09-03'
  or exists(select 1 from public.mystery_redemptions r where r.location_id=p_location and r.service_date=d::date and r.reward_type='streak_shield')
  or exists(select 1 from public.finish_line_checks c where c.location_id=p_location and c.service_date=d::date and c.status='complete'
   and ((c.submitted_at at time zone 'America/Los_Angeles')::date=c.service_date or exists(select 1 from public.mystery_redemptions r where r.location_id=p_location and r.service_date=c.service_date and r.reward_type='late_checklist'))))
 from generate_series(greatest(p_start,date '2026-08-12')::timestamp,least(p_end,date '2027-06-04')::timestamp,interval '1 day') d
 where extract(isodow from d)<=5 and not exists(select 1 from public.spark_excluded_days e where e.location_id=p_location and e.service_date=d::date);
$$;

create function public.mystery_redemption_options(p_token text,p_win bigint) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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
   and c.service_date<=(now() at time zone 'America/Los_Angeles')::date and c.submitted_at is not null
   and (c.submitted_at at time zone 'America/Los_Angeles')::date>c.service_date
   and not exists(select 1 from public.mystery_redemptions r where r.location_id=s.location_id and r.reward_type='late_checklist' and r.service_date=c.service_date))
 else '[]'::jsonb end,'redemption',(select to_jsonb(r) from public.mystery_redemptions r where win_id=w.id));
end$$;

create function public.mystery_redeem(p_token text,p_win bigint,p_details jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
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

revoke all on function public.mystery_snapshot_reward(),public.mystery_double_bites_points(),public.mystery_school_benefits(bigint),public.mystery_redemption_options(text,bigint),public.mystery_redeem(text,bigint,jsonb) from public;
grant execute on function public.mystery_school_benefits(bigint),public.mystery_redemption_options(text,bigint),public.mystery_redeem(text,bigint,jsonb) to anon,authenticated,service_role;

alter function public.mystery_context(text) rename to mystery_context_before_rewards;
revoke all on function public.mystery_context_before_rewards(text) from public,anon,authenticated;
create function public.mystery_context(p_token text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 result:=public.mystery_context_before_rewards(p_token);
 if result->>'role'='supervisor' then
  result:=jsonb_set(result,'{prizes}',coalesce((select jsonb_agg(p) from jsonb_array_elements(result->'prizes') p where not (p->>'retired')::boolean),'[]'::jsonb));
 elsif result->>'role'='manager' then
  result:=result||jsonb_build_object('prizes_available',exists(select 1 from public.mystery_prizes where active and not retired and (reward_type<>'candy_bar' or inventory>0)),'benefits',public.mystery_school_benefits((result->'school'->>'id')::bigint));
 end if;
 return result;
end$$;
alter function public.mystery_admin(text,uuid,jsonb) rename to mystery_admin_before_rewards;
revoke all on function public.mystery_admin_before_rewards(text,uuid,jsonb) from public,anon,authenticated;
create function public.mystery_admin(p_token text,p_request uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;p public.mystery_prizes;w public.mystery_wins;
begin
 s:=public.mystery_require(p_token);if s.role<>'supervisor' then raise exception 'Supervisor access is required.';end if;
 if p_payload->>'action' in ('prize','stock') then
  select * into p from public.mystery_prizes where id=(p_payload->>'id')::uuid;
  if p.id is null or p.retired then raise exception 'Choose one of the seven current prizes.';end if;
  if p_payload->>'action'='prize' and (p_payload->>'name' is distinct from p.name or p_payload->>'kind' is distinct from p.kind
   or (p_payload->>'points_amount')::integer is distinct from p.points_amount or (p_payload->>'bonus_tokens')::integer is distinct from p.bonus_tokens)
   then raise exception 'Prize names and effects are fixed. You can edit the description, icon, availability and stock.';end if;
 elsif p_payload->>'action'='fulfill' then
  select * into w from public.mystery_wins where id=(p_payload->>'id')::bigint;
  if w.reward_type in ('late_checklist','bingo_change','bingo_free','double_bites','streak_shield') then raise exception 'The manager redeems this digital prize from My Prizes.';end if;
 end if;
 return public.mystery_admin_before_rewards(p_token,p_request,p_payload);
end$$;
revoke all on function public.mystery_context(text),public.mystery_admin(text,uuid,jsonb) from public;
grant execute on function public.mystery_context(text),public.mystery_admin(text,uuid,jsonb) to anon,authenticated,service_role;
create or replace function public.mystery_pull(p_token text,p_request uuid,p_revision integer) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.mystery_sessions;b public.mystery_balances;p public.mystery_prizes;w public.mystery_wins;
begin
 s:=public.mystery_require(p_token);if s.role<>'manager' then raise exception 'Choose a school to pull.';end if;
 if p_request is null then raise exception 'A pull request is required.';end if;
 -- One lock order for draws and supervisor changes, including different schools competing for the last prize.
 perform pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
 select * into b from public.mystery_balances where location_id=s.location_id for update;
 select * into w from public.mystery_wins where request_id=p_request;
 if w.id is not null then
  if w.location_id<>s.location_id then raise exception 'This pull belongs to another school.';end if;
  return jsonb_build_object('win',to_jsonb(w),'tokens',b.tokens,'revision',b.revision);
 end if;
 if b.location_id is null or b.tokens<1 then raise exception 'No Mystery Pulls are currently available for your school.';end if;
 if b.revision is distinct from p_revision then raise exception 'Your school balance changed. Refresh before starting another pull.';end if;
 -- Uniform random choice among in-stock active prize TYPES; animation never chooses the result.
 select * into p from public.mystery_prizes where active and not retired and (reward_type<>'candy_bar' or inventory>0) order by random() limit 1 for update;
 if p.id is null then raise exception 'Prizes are being restocked. Your token has not been used.';end if;
 update public.mystery_balances set tokens=tokens-1+case when p.kind='extra_pull' then 1 else p.bonus_tokens end,revision=revision+1 where location_id=s.location_id returning * into b;
 update public.mystery_prizes set inventory=case when reward_type='candy_bar' then inventory-1 else inventory end,revision=revision+1 where id=p.id;
 insert into public.mystery_wins(request_id,location_id,prize_id,prize_name,prize_description,prize_icon,prize_kind,status,fulfilled_at,bonus_tokens,points_awarded)
 values(p_request,s.location_id,p.id,p.name,p.description,p.icon,p.kind,case when p.kind in ('extra_pull','spark_points') then 'received' else 'waiting' end,case when p.kind in ('extra_pull','spark_points') then now() else null end,case when p.kind='extra_pull' then 1 else p.bonus_tokens end,p.points_amount) returning * into w;
 -- The ledger credit and prize/token changes commit together. A retry returns the
 -- existing win above, so it cannot insert a second points award.
 if p.kind='spark_points' then
  insert into public.spark_points(location_id,points,point_type,description,service_date,source,unique_key)
  values(s.location_id,p.points_amount,'mystery_pull_prize','Mystery Pull: '||p.name,(now() at time zone 'America/Los_Angeles')::date,'automatic','mystery-pull-'||p_request::text);
 end if;
 select * into w from public.mystery_wins where id=w.id;
 return jsonb_build_object('win',to_jsonb(w),'tokens',b.tokens,'revision',b.revision);
end $$;

commit;
