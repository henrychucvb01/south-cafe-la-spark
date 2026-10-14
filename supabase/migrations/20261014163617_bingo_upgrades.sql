begin;
set local lock_timeout='5s';

create table public.spark_bingo_repairs (
 card_id uuid not null references public.spark_bingo_cards(id),
 square_index integer not null check(square_index between 0 and 24 and square_index<>12),
 old_goal text not null, new_goal text not null,
 repaired_at timestamptz not null, ended_at timestamptz,
 primary key(card_id,square_index)
);
create table public.spark_bingo_purchases (
 request_id uuid primary key, card_id uuid not null references public.spark_bingo_cards(id),
 location_id bigint not null references public.locations(id),
 ordinal bigint not null check(ordinal>0), square_index integer not null check(square_index between 0 and 24 and square_index<>12),
 old_goal text not null, new_goal text not null, price numeric not null check(price>0),
 purchased_at timestamptz not null default now(), unique(card_id,ordinal)
);
create table public.spark_bingo_scorecard_views (
 location_id bigint not null references public.locations(id),
 viewed_at timestamptz not null default now(), primary key(location_id,viewed_at)
);
alter table public.spark_bingo_repairs enable row level security;
alter table public.spark_bingo_purchases enable row level security;
alter table public.spark_bingo_scorecard_views enable row level security;
revoke all on public.spark_bingo_repairs,public.spark_bingo_purchases,public.spark_bingo_scorecard_views from public,anon,authenticated;

update public.spark_bingo_goals set definition=jsonb_set(definition,'{draw_enabled}','false')
 where definition->>'evidence' in ('monitoring','perfect_monitoring','training');
insert into public.spark_bingo_goals(id,definition)
select value->>'id',value from jsonb_array_elements($goals$[
 {"id":"game-word-10","label":"Wordle Master","detail":"Win on 10 separate days","icon":"W","evidence":"game","item_key":"word","threshold":10,"draw_enabled":true},
 {"id":"game-word-streak-5","label":"Wordle Streak","detail":"Win 5 consecutive qualifying game days","icon":"W","evidence":"game_streak","item_key":"word","threshold":5,"draw_enabled":true},
 {"id":"game-spark_sort-10","label":"Connections Master","detail":"Win on 10 separate days","icon":"C","evidence":"game","item_key":"spark_sort","threshold":10,"draw_enabled":true},
 {"id":"game-spark_sort-streak-5","label":"Connections Streak","detail":"Win 5 consecutive qualifying game days","icon":"C","evidence":"game_streak","item_key":"spark_sort","threshold":5,"draw_enabled":true},
 {"id":"mplh-achiever","label":"MPLH Achiever","detail":"Meet your target on 5 qualifying days","icon":"M","evidence":"mplh_valid","threshold":5,"draw_enabled":true,"requiresMplh":true},
 {"id":"scorecard-check-in","label":"Scorecard Check-In","detail":"Open your Monthly Scorecard","icon":"S","evidence":"scorecard","threshold":1,"draw_enabled":true},
 {"id":"side-quest-adventurer","label":"Side Quest Adventurer","detail":"Win 1 Side Quest","icon":"Q","evidence":"sidequest","threshold":1,"draw_enabled":true},
 {"id":"mystery-photo-detective","label":"Mystery Photo Detective","detail":"Submit 1 Mystery Photo guess","icon":"?","evidence":"guess","threshold":1,"draw_enabled":true},
 {"id":"spark-supporter","label":"SPARK Supporter","detail":"React to a published Spotlight","icon":"+","evidence":"reaction","threshold":1,"draw_enabled":true}
]$goals$::jsonb);

create function public.spark_bingo_family(p_goal text) returns text
language sql stable security definer set search_path=public,pg_temp as $$
 select case definition->>'evidence'
 when 'item' then 'item:'||(definition->>'item_key')
 when 'game' then 'wins:'||(definition->>'item_key')
 when 'game_streak' then 'game_streak:'||(definition->>'item_key')
 when 'mplh_valid' then 'mplh' else definition->>'evidence' end
 from public.spark_bingo_goals where id=p_goal;
$$;
create function public.spark_bingo_mplh_target(p_location bigint) returns numeric
language sql stable security definer set search_path=public,pg_temp as $$
 select case when location_code::text in ('3452','1957') or school_name ilike '%willenberg%' then 20
 when labor_type='secondary' then 18 when labor_type='elementary_prep' then 20
 when labor_type in ('elementary_nnc','special','special_ed') then 24 end from public.locations where id=p_location;
$$;
create or replace function public.spark_bingo_eligible(p_location bigint,p_started date)
returns setof public.spark_bingo_goals language sql stable security definer set search_path=public,pg_temp as $$
 select g.* from public.spark_bingo_goals g join public.locations l on l.id=p_location
 where l.active is not false and (g.definition->>'draw_enabled')::boolean
 and (not coalesce((g.definition->>'requiresMplh')::boolean,false)
      or (coalesce(l.budget_labor_hours,0)>0 and public.spark_bingo_mplh_target(l.id) is not null))
 and (g.definition->>'evidence'<>'scorecard' or exists(
  select 1 from public.location_information d join public.monthly_site_mappings m
  on m.main_location_id=d.id and m.active and m.program_type='main'
  where d.location_code=l.location_code and d.active))
 and (g.definition->>'evidence'<>'sidequest' or exists(
  select 1 from october_live.quests q cross join october_live.settings cfg
  join october_live.schools s on s.location_id=l.id and s.participating
  where cfg.id and cfg.quests_state='active' and q.enabled and (q.eligible is null or l.id=any(q.eligible))
  and not exists(select 1 from october_live.quest_claims w where w.quest=q.id)))
 and (g.definition->>'evidence'<>'guess' or exists(
  select 1 from october_live.settings cfg join october_live.schools s on s.location_id=l.id and s.participating
  where cfg.id and cfg.mystery_state='active' and exists(select 1 from october_live.rounds r where r.solved_at is null and r.photo_path is not null)))
 and (g.definition->>'evidence'<>'reaction' or exists(select 1 from public.spark_spotlights where published));
$$;

alter function public.spark_bingo_goal_met(public.spark_bingo_cards,text) rename to spark_bingo_goal_met_legacy;
create function public.spark_bingo_goal_met(p_card public.spark_bingo_cards,p_goal text)
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
   where w.location_id=c.location_id and e.location_id=c.location_id and e.state='approved' and e.reviewed_at>=c.started_at);
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

create function public.spark_bingo_scorecard_open(p_token text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'manager' then raise exception 'Manager session required'; end if;
 if not exists(select 1 from public.spark_bingo_eligible(s.location_id,public.spark_bingo_today()) where id='scorecard-check-in')
 then raise exception 'Monthly Scorecard unavailable for this school'; end if;
 insert into public.spark_bingo_scorecard_views(location_id) values(s.location_id) on conflict do nothing;
end;
$$;

create or replace function public.spark_bingo_draw(p_location bigint,p_cycle integer,p_started date,p_previous text[] default '{}')
returns text[] language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result text[];
begin
 if exists(select 1 from public.locations where id=p_location and school_name='Test High School') then
  raise exception 'Test High School retains its existing card but is excluded from future production draws';
 end if;
 with variants as (
  select g.id,public.spark_bingo_family(g.id) family,
  case when g.definition->>'evidence' in ('game_streak','perfect_week') or coalesce((g.definition->>'threshold')::int,1)>=10 then 3
       when coalesce((g.definition->>'threshold')::int,1)>=3 or g.definition->>'evidence' in ('sidequest','mplh_valid') then 2 else 1 end difficulty,
  row_number() over(partition by public.spark_bingo_family(g.id) order by (g.id=any(p_previous)),md5(p_location||'-'||p_cycle||'-'||g.id)) pick
  from public.spark_bingo_eligible(p_location,p_started) g
 ), ranked as (
  select *,row_number() over(partition by difficulty order by md5(p_location||'-'||p_cycle||'-'||family)) rank from variants where pick=1
 ), selected as (
  select *,row_number() over(order by (rank<=case difficulty when 1 then 8 when 2 then 10 else 6 end) desc,rank,md5(p_location||'-'||p_cycle||'-'||family)) selection from ranked
 )
 select array_agg(id order by md5(p_location||'-'||p_cycle||'-slot-'||id)) into result from selected where selection<=24;
 if coalesce(cardinality(result),0)<>24 then raise exception 'School % lacks 24 eligible task families',p_location; end if;
 return result[1:12]||array['free']||result[13:24];
end;
$$;

create function public.spark_bingo_season_balance(p_location bigint) returns numeric
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(sum(points::numeric),0) from public.spark_points where location_id=p_location
 and service_date>=make_date(extract(year from public.spark_bingo_today())::int-case when extract(month from public.spark_bingo_today())<8 then 1 else 0 end,8,1)
 and service_date<=least(public.spark_bingo_today(),make_date(extract(year from public.spark_bingo_today())::int+case when extract(month from public.spark_bingo_today())>=8 then 1 else 0 end,6,7));
$$;
create function public.spark_bingo_price(p_count bigint,p_balance numeric) returns numeric
language plpgsql immutable set search_path=pg_catalog as $$
declare cost numeric:=25; i bigint:=0;
begin
 if p_count<0 then raise exception 'Invalid replacement count'; end if;
 while i<p_count loop
  if cost>greatest(p_balance,0) then return null; end if;
  cost:=cost*2;i:=i+1;
 end loop;
 return cost;
end;
$$;

alter function public.spark_bingo_refresh_school(bigint) rename to spark_bingo_refresh_school_legacy;
create function public.spark_bingo_refresh_school(p_location bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;c public.spark_bingo_cards;choices jsonb;paid bigint;balance numeric;cost numeric;prizes jsonb;
begin
 result:=public.spark_bingo_refresh_school_legacy(p_location);
 select * into c from public.spark_bingo_cards where id=(result#>>'{card,id}')::uuid;
 select coalesce(jsonb_agg(value),'[]') into choices from jsonb_array_elements(result->'replacement_goals') g(value)
 where not exists(select 1 from unnest(c.goal_ids) id where public.spark_bingo_family(id)=public.spark_bingo_family(value->>'id'));
 select count(*) into paid from public.spark_bingo_purchases where card_id=c.id;
 balance:=public.spark_bingo_season_balance(p_location);cost:=public.spark_bingo_price(paid,balance);
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',prize_name)),'[]') into prizes
 from public.mystery_wins where location_id=p_location and reward_type='bingo_change' and status='waiting';
 return result||jsonb_build_object('replacement_goals',choices,'paid_shop',jsonb_build_object('count',paid,'balance',balance::text,'price',cost::text,'price_formula','25 x 2^'||paid,'prizes',prizes),
  'can_renew',coalesce((result->>'can_renew')::boolean,false) and not exists(select 1 from public.locations where id=p_location and school_name='Test High School'),
  'repair_windows',(select coalesce(jsonb_agg(jsonb_build_object('goal',new_goal,'started_at',repaired_at)),'[]') from public.spark_bingo_repairs where card_id=c.id and ended_at is null));
end;
$$;

create function public.spark_bingo_end_repair() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.spark_bingo_repairs set ended_at=now() where card_id=new.id and ended_at is null
 and new.goal_ids[square_index+1] is distinct from new_goal;
 return new;
end;
$$;
create trigger spark_bingo_end_repair after update of goal_ids on public.spark_bingo_cards
for each row execute function public.spark_bingo_end_repair();

create function public.spark_bingo_buy_replacement(p_token text,p_request uuid,p_card uuid,p_revision integer,p_square integer,p_goal text,p_price numeric,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;c public.spark_bingo_cards;prior public.spark_bingo_purchases;ctx jsonb;paid bigint;balance numeric;cost numeric;left_to_debit numeric;chunk integer;part integer:=0;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'manager' then raise exception 'Manager session required'; end if;
 if p_request is null or p_confirmed is not true then raise exception 'Confirm the replacement purchase'; end if;
 -- Identical lock to Mystery Photo purchases. Acquire before any Bingo/card lock.
 perform 1 from october_live.settings where id for update;
 if not found then raise exception 'Point shop unavailable'; end if;
 select * into prior from public.spark_bingo_purchases where request_id=p_request;
 if found then
  if prior.location_id<>s.location_id or prior.card_id<>p_card or prior.square_index is distinct from p_square or prior.new_goal is distinct from p_goal or prior.price is distinct from p_price
  then raise exception 'Purchase request changed'; end if;
  return public.spark_bingo_refresh_school(s.location_id);
 end if;
 if extract(month from public.spark_bingo_today()) in (6,7) and public.spark_bingo_today()>make_date(extract(year from public.spark_bingo_today())::int,6,7)
 then raise exception 'Season purchases reopen August 1'; end if;
 ctx:=public.spark_bingo_refresh_school(s.location_id);
 select * into c from public.spark_bingo_cards where location_id=s.location_id order by cycle desc limit 1 for update;
 if c.id is distinct from p_card or c.revision is distinct from p_revision then raise exception 'This card changed. Refresh before replacing a square.'; end if;
 if c.blackout_at is not null or p_square is null or p_square not between 0 and 24 or p_square=12 or c.goal_ids[p_square+1]=any(c.completed_ids)
 then raise exception 'Choose an incomplete task square'; end if;
 if not exists(select 1 from jsonb_array_elements(ctx->'replacement_goals') g where g->>'id'=p_goal)
 then raise exception 'Choose an eligible, unfinished replacement from a different family'; end if;
 select count(*) into paid from public.spark_bingo_purchases where card_id=c.id;
 balance:=public.spark_bingo_season_balance(s.location_id);cost:=public.spark_bingo_price(paid,balance);
 if cost is null or cost>balance then raise exception 'Insufficient season SPARK Points'; end if;
 if p_price is distinct from cost then raise exception 'Replacement price changed. Confirm the current price.'; end if;
 insert into public.spark_bingo_purchases(request_id,card_id,location_id,ordinal,square_index,old_goal,new_goal,price)
 values(p_request,c.id,s.location_id,paid+1,p_square,c.goal_ids[p_square+1],p_goal,cost);
 -- The existing points ledger is integer-valued; split large debits without overflow.
 left_to_debit:=cost;
 while left_to_debit>0 loop
  chunk:=least(left_to_debit,2147483647)::integer;
  insert into public.spark_points(location_id,points,point_type,description,service_date,source,unique_key)
  values(s.location_id,-chunk,'bingo_replacement_purchase','Paid Bingo replacement '||(paid+1),public.spark_bingo_today(),'automatic','bingo-replacement:'||p_request||':'||part);
  left_to_debit:=left_to_debit-chunk;part:=part+1;
 end loop;
 c.goal_ids[p_square+1]:=p_goal;
 update public.spark_bingo_cards set goal_ids=c.goal_ids,revision=revision+1 where id=c.id;
 return public.spark_bingo_refresh_school(s.location_id);
end;
$$;

create function public.spark_bingo_repair_plan() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c public.spark_bingo_cards;g record;replacement text;used text[];plan jsonb:='[]';
begin
 for c in select b.* from public.spark_bingo_cards b
 where b.cycle=(select max(cycle) from public.spark_bingo_cards where location_id=b.location_id) order by b.location_id loop
  used:=c.goal_ids;
  for g in select u.id,u.ord::integer-1 slot from unnest(c.goal_ids) with ordinality u(id,ord)
   join public.spark_bingo_goals d on d.id=u.id
   where d.definition->>'evidence' in ('monitoring','perfect_monitoring','training') and not u.id=any(c.completed_ids) order by u.ord loop
   select e.id into replacement from public.spark_bingo_eligible(c.location_id,c.started_on) e
   where not e.id=any(used) and not exists(select 1 from unnest(used) id where public.spark_bingo_family(id)=public.spark_bingo_family(e.id))
   -- These tasks have direct operational evidence and remain achievable without a competitive winner.
   and e.definition->>'evidence' not in ('sidequest','guess','reaction')
   order by (e.id not in ('game-word-10','game-spark_sort-10','game-word-streak-5','game-spark_sort-streak-5','scorecard-check-in')),e.id limit 1;
   if replacement is null then raise exception 'School % lacks a safe replacement for square %',c.location_id,g.slot+1; end if;
   plan:=plan||jsonb_build_array(jsonb_build_object('card',c.id,'location',c.location_id,'revision',c.revision,'square',g.slot,'old_goal',g.id,'new_goal',replacement,
    'state_hash',md5(jsonb_build_object('goals',c.goal_ids,'completed',c.completed_ids,'revision',c.revision,'start',c.started_on,'cycle',c.cycle)::text)));
   used[g.slot+1]:=replacement;
  end loop;
 end loop;
 return plan;
end;
$$;

create function public.spark_bingo_apply_repairs(p_expected jsonb) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare plan jsonb;r jsonb;c public.spark_bingo_cards;stamp timestamptz:=clock_timestamp();n integer:=0;
begin
 -- Lock all affected cards before validating the complete plan; no partial repairs can commit.
 perform 1 from public.spark_bingo_cards order by location_id,cycle for update;
 plan:=public.spark_bingo_repair_plan();
 if plan is distinct from p_expected then raise exception 'Repair plan changed. Revalidate before applying repairs'; end if;
 for r in select value from jsonb_array_elements(plan) loop
  select * into c from public.spark_bingo_cards where id=(r->>'card')::uuid;
  if c.goal_ids[(r->>'square')::int+1] is distinct from r->>'old_goal' or (r->>'old_goal')=any(c.completed_ids)
  then raise exception 'A square completed or changed. No repairs applied'; end if;
  insert into public.spark_bingo_repairs(card_id,square_index,old_goal,new_goal,repaired_at)
  values(c.id,(r->>'square')::int,r->>'old_goal',r->>'new_goal',stamp);
  c.goal_ids[(r->>'square')::int+1]:=r->>'new_goal';
  update public.spark_bingo_cards set goal_ids=c.goal_ids,revision=revision+1 where id=c.id;
  if public.spark_bingo_goal_met(c,r->>'new_goal') then raise exception 'Repair would immediately complete. No repairs applied'; end if;
  n:=n+1;
 end loop;
 return n;
end;
$$;

create function public.spark_bingo_redeem_replacement(p_token text,p_win bigint,p_card uuid,p_revision integer,p_square integer,p_goal text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.supper_monitoring_sessions;v_token text:=gen_random_uuid()::text||gen_random_uuid()::text;v_hash text;
begin
 s:=public.require_supper_monitoring_session(p_token);
 if s.actor_role<>'manager' then raise exception 'Manager session required'; end if;
 if not exists(select 1 from public.mystery_wins where id=p_win and location_id=s.location_id and reward_type='bingo_change') then raise exception 'School replacement prize required'; end if;
 -- A short-lived internal session reuses the existing prize redemption transaction.
 v_hash:=encode(sha256(convert_to(v_token,'UTF8')),'hex');
 insert into public.mystery_sessions(token_hash,location_id,role,expires_at) values(v_hash,s.location_id,'manager',now()+interval '1 minute');
 perform public.mystery_redeem(v_token,p_win,jsonb_build_object('card',p_card,'revision',p_revision,'square',p_square,'goal',p_goal));
 delete from public.mystery_sessions where token_hash=v_hash;
 return public.spark_bingo_refresh_school(s.location_id);
end;
$$;

-- All helpers and tracking tables remain private; only scoped manager entry points are exposed.
revoke all on function public.spark_bingo_family(text),public.spark_bingo_mplh_target(bigint),public.spark_bingo_goal_met(public.spark_bingo_cards,text),public.spark_bingo_goal_met_legacy(public.spark_bingo_cards,text),public.spark_bingo_refresh_school(bigint),public.spark_bingo_refresh_school_legacy(bigint),public.spark_bingo_season_balance(bigint),public.spark_bingo_price(bigint,numeric),public.spark_bingo_end_repair(),public.spark_bingo_repair_plan(),public.spark_bingo_apply_repairs(jsonb) from public,anon,authenticated;
revoke all on function public.spark_bingo_scorecard_open(text),public.spark_bingo_buy_replacement(text,uuid,uuid,integer,integer,text,numeric,boolean),public.spark_bingo_redeem_replacement(text,bigint,uuid,integer,integer,text) from public;
grant execute on function public.spark_bingo_scorecard_open(text),public.spark_bingo_buy_replacement(text,uuid,uuid,integer,integer,text,numeric,boolean),public.spark_bingo_redeem_replacement(text,bigint,uuid,integer,integer,text) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
