begin;
set local lock_timeout='5s';
lock table spark_rewards.catalog in share mode;
do $$begin perform set_config('spark.rewards_catalog_before',(select md5(string_agg(md5(to_jsonb(c)::text),'' order by id)) from spark_rewards.catalog c),true);end$$;
alter table spark_rewards.settings drop constraint settings_manager_enabled_check;
create table spark_rewards.transactions(
 request_id uuid primary key,reward_id uuid not null references spark_rewards.catalog(id),location_id bigint not null references public.locations(id),
 kind text not null check(kind in('claim','contribute','bid')),amount integer not null check(amount>0),fingerprint jsonb not null,
 service_date date not null default (now() at time zone 'America/Los_Angeles')::date,created_at timestamptz not null default now(),
 refunded boolean not null default false,fulfilled boolean not null default false);
create table spark_rewards.auctions(reward_id uuid primary key references spark_rewards.catalog(id),highest integer not null default 0,
 leader bigint references public.locations(id),request_id uuid references spark_rewards.transactions(request_id),closes_at timestamptz not null,
 extended boolean not null default false,settled boolean not null default false,winner bigint references public.locations(id));
create table spark_rewards.wheel_sessions(reward_id uuid primary key references spark_rewards.catalog(id),segments jsonb not null,wheel_type text not null,
 spin_limit integer not null check(spin_limit between 1 and 100),remaining integer not null default 1,used integer not null default 0,closed boolean not null default false);
create table spark_rewards.wheel_results(request_id uuid primary key,reward_id uuid not null references spark_rewards.wheel_sessions(reward_id),outcome jsonb not null,created_at timestamptz not null default now());
alter table spark_rewards.transactions enable row level security;
alter table spark_rewards.auctions enable row level security;
alter table spark_rewards.wheel_sessions enable row level security;
alter table spark_rewards.wheel_results enable row level security;
revoke all on all tables in schema spark_rewards from public,anon,authenticated;
create function spark_rewards.write_points(p_school bigint,p_points integer,p_key text,p_description text,p_date date) returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into public.spark_points(location_id,points,point_type,description,service_date,source,unique_key)
 values(p_school,p_points,case when p_points<0 then 'rewards_purchase' else 'rewards_refund' end,p_description,p_date,'spark_rewards','spark-rewards:'||p_key)
 on conflict(unique_key) do nothing;
end$$;
create function spark_rewards.refund(p_request uuid) returns void language plpgsql security definer set search_path=pg_catalog as $$
declare t spark_rewards.transactions;
begin
 select * into t from spark_rewards.transactions where request_id=p_request for update;
 if t.request_id is null or t.refunded then return;end if;
 if t.fulfilled then raise exception 'Fulfilled rewards require a separate refund review';end if;
 perform spark_rewards.write_points(t.location_id,t.amount,'refund:'||t.request_id,'SPARK Rewards — returned points',t.service_date);
 update spark_rewards.transactions set refunded=true where request_id=t.request_id;
end$$;
create function spark_rewards.settle_due() returns void language plpgsql security definer set search_path=pg_catalog as $$
declare a spark_rewards.auctions;r spark_rewards.catalog;
begin
 -- Match the existing Mystery/Bingo spending lock order and ledger.
 perform 1 from october_live.settings where id for update;
 perform pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
 perform 1 from spark_rewards.settings where id for update;
 for a in select * from spark_rewards.auctions where not settled and closes_at<=now() order by reward_id for update loop
  select * into r from spark_rewards.catalog where id=a.reward_id for update;
  if a.highest>=coalesce((r.config->>'reserve')::integer,(r.config->>'starting_bid')::integer) and a.leader is not null and r.fulfillment<>'canceled' then
   update spark_rewards.auctions set settled=true,winner=leader where reward_id=r.id;
   update spark_rewards.catalog set fulfillment='in_progress',active=false,revision=revision+1 where id=r.id;
  else
   perform spark_rewards.refund(a.request_id);
   update spark_rewards.auctions set settled=true,winner=null where reward_id=r.id;
   update spark_rewards.catalog set active=false,revision=revision+1 where id=r.id;
  end if;
  insert into spark_rewards.audit(action,record_id,after_data) values('auction_settled',r.id,(select to_jsonb(x) from spark_rewards.auctions x where reward_id=r.id));
 end loop;
end$$;
create function spark_rewards.context(p_school bigint,p_admin boolean) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare catalog jsonb:='[]';r spark_rewards.catalog;a spark_rewards.auctions;card jsonb;total bigint;claims integer;own boolean;cfg spark_rewards.settings;
begin
 select * into cfg from spark_rewards.settings where id;
 for r in select * from spark_rewards.catalog where p_admin or (active and status='published' and fulfillment<>'canceled') order by created_at,name loop
  select coalesce(sum(amount),0) into total from spark_rewards.transactions where reward_id=r.id and kind='contribute' and not refunded;
  select count(*),(count(*) filter(where location_id=p_school))>=coalesce((r.config->>'max_claims')::int,1) into claims,own from spark_rewards.transactions where reward_id=r.id and kind='claim' and not refunded;
  card:=to_jsonb(r)||jsonb_build_object('contributed',total,'claimed',own,'sold_out',claims>=coalesce((r.config->>'quantity')::int,1),
   'contributions',case when p_admin or coalesce((r.config->>'show_names')::boolean,false) then
    (select coalesce(jsonb_agg(jsonb_build_object('name',l.school_name,'amount',t.amount)),'[]') from
     (select location_id,sum(amount) amount from spark_rewards.transactions where reward_id=r.id and kind='contribute' and not refunded group by location_id)t join public.locations l on l.id=t.location_id) else '[]'::jsonb end);
  if not p_admin then card:=jsonb_set(card,'{config}',r.config-'reserve');end if;
  if r.type='auction' then
   select * into a from spark_rewards.auctions where reward_id=r.id;
   card:=card||jsonb_build_object('auction',jsonb_build_object('highest_bid',coalesce(a.highest,0),'reserve_met',coalesce(a.highest>=(r.config->>'reserve')::integer,false),
    'own_bid',coalesce((select amount from spark_rewards.transactions where reward_id=r.id and location_id=p_school and kind='bid' order by created_at desc limit 1),0),
    'leading',coalesce(a.leader=p_school and not a.settled,false),'won',coalesce(a.winner=p_school,false),'settled',coalesce(a.settled,false),'extended',coalesce(a.extended,false),'closes_at',coalesce(a.closes_at,r.closes_at)));
  end if;
  catalog:=catalog||jsonb_build_array(card);
 end loop;
 return jsonb_build_object('environment','production','supervisor_only',false,'launch_ready',true,'manager_enabled',cfg.manager_enabled,'settings',to_jsonb(cfg),
  'catalog',catalog,'location_id',p_school,'balance',case when p_school is null then '0' else public.spark_bingo_season_balance(p_school)::text end,
  'schools',case when p_admin then (select coalesce(jsonb_agg(jsonb_build_object('id',id,'school_name',school_name) order by school_name),'[]') from public.locations where active) else '[]'::jsonb end,
  'activity',(select coalesce(jsonb_agg(x.data order by x.created_at desc),'[]') from (select t.created_at,to_jsonb(t)-'fingerprint'||jsonb_build_object('reward_name',c.name,'school_name',l.school_name,'auction_won',coalesce(au.winner=t.location_id and au.settled and au.request_id=t.request_id,false)) data from spark_rewards.transactions t join spark_rewards.catalog c on c.id=t.reward_id join public.locations l on l.id=t.location_id left join spark_rewards.auctions au on au.reward_id=t.reward_id where p_admin or t.location_id=p_school order by t.created_at desc limit case when p_admin then 200 else 40 end)x),
  'wheel_sessions',case when p_admin then (select coalesce(jsonb_agg(to_jsonb(w)),'[]') from spark_rewards.wheel_sessions w) else '[]'::jsonb end,
  'wheel_results',case when p_admin then (select coalesce(jsonb_agg(to_jsonb(w) order by created_at desc),'[]') from spark_rewards.wheel_results w) else '[]'::jsonb end,
  'wheel','[]'::jsonb,'spins','[]'::jsonb,'history','[]'::jsonb);
end$$;
create function public.spark_rewards_live(p_action text,p_pin text default null,p_token text default null,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
#variable_conflict use_column
declare admin boolean:=false;s public.supper_monitoring_sessions;cfg spark_rewards.settings;r spark_rewards.catalog;t spark_rewards.transactions;a spark_rewards.auctions;w spark_rewards.wheel_sessions;
 school bigint;req uuid;amount integer;cost integer;total bigint;remaining bigint;fingerprint jsonb;prior jsonb;result jsonb;old jsonb;segment jsonb;segments jsonb;idx integer;n integer;extra integer;
begin
 if p_action='capabilities' then return jsonb_build_object('supervisor_available',true,'protocol_version',2,'manager_enabled',(select manager_enabled from spark_rewards.settings where id));end if;
 if p_pin is not null then
  if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization required';end if;admin:=true;school:=(p_payload->>'location_id')::bigint;
 else
  if p_action not in ('manager_context','claim','contribute','bid') then raise exception 'Supervisor authorization required';end if;
  s:=public.require_supper_monitoring_session(p_token);if s.actor_role<>'manager' then raise exception 'Manager session required';end if;school:=s.location_id;
 end if;
 perform 1 from october_live.settings where id for update;
 perform pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
 select * into cfg from spark_rewards.settings where id for update;
 perform spark_rewards.settle_due();
 if p_action in ('claim','contribute','bid') then
  if admin then raise exception 'Use a manager session to spend school points';end if;
  req:=(p_payload->>'request_id')::uuid;
  if req is null or coalesce((p_payload->>'confirmed')::boolean,false) is not true then raise exception 'Confirm the points transaction';end if;
  select * into r from spark_rewards.catalog where id=(p_payload->>'id')::uuid for update;
  if r.id is null then raise exception 'Reward not found';end if;
  amount:=case when p_action='claim' then (r.config->>'price')::integer else (p_payload->>'amount')::integer end;
  if amount is null or amount<=0 then raise exception 'Enter positive whole SPARK Points';end if;
  fingerprint:=jsonb_build_object('action',p_action,'reward',r.id,'school',school,'amount',amount);
  select * into t from spark_rewards.transactions where request_id=req;
  if t.request_id is not null then
   if t.fingerprint is distinct from fingerprint then raise exception 'Request ID was reused with different details';end if;
   return spark_rewards.context(school,false);
  end if;
  if not cfg.manager_enabled then raise exception 'SPARK Rewards is currently paused';end if;
  if not r.active or r.status<>'published' or r.fulfillment in ('canceled','fulfilled') then raise exception 'This reward is not available';end if;
  if r.revision is distinct from (p_payload->>'revision')::integer then raise exception 'Reward changed. Refresh before spending points';end if;
  if extract(month from public.spark_bingo_today()) in (6,7) and public.spark_bingo_today()>make_date(extract(year from public.spark_bingo_today())::int,6,7) then raise exception 'Season purchases reopen August 1';end if;
  cost:=amount;
  if p_action='claim' then
   if r.type<>'fixed' then raise exception 'Choose a fixed redemption reward';end if;
   if coalesce((r.config->>'sold_out')::boolean,false) or (select count(*) from spark_rewards.transactions where reward_id=r.id and kind='claim' and not refunded)>=coalesce((r.config->>'quantity')::int,1) then raise exception 'This reward is already claimed';end if;
   if (select count(*) from spark_rewards.transactions where reward_id=r.id and location_id=school and kind='claim' and not refunded)>=coalesce((r.config->>'max_claims')::int,1) then raise exception 'Your school already claimed this reward';end if;
  elsif p_action='contribute' then
   if r.type not in ('pool','wheel') then raise exception 'Choose a community reward';end if;
   select coalesce(sum(amount),0) into total from spark_rewards.transactions where reward_id=r.id and kind='contribute' and not refunded;
   remaining:=(r.config->>'goal')::bigint-total;
   if amount>remaining or remaining<=0 then raise exception 'Contribution exceeds the remaining community goal';end if;
   if amount<coalesce((r.config->>'minimum')::int,1) or amount>coalesce((r.config->>'maximum')::int,2147483647) then raise exception 'Contribution is outside the configured limits';end if;
  else
   if r.type<>'auction' then raise exception 'Choose an auction';end if;
   insert into spark_rewards.auctions(reward_id,closes_at) values(r.id,r.closes_at) on conflict do nothing;
   select * into a from spark_rewards.auctions where reward_id=r.id for update;
   if a.settled or now()<r.opens_at or now()>=a.closes_at then raise exception 'Auction is not open';end if;
   if amount<(case when a.highest=0 then (r.config->>'starting_bid')::bigint else a.highest::bigint+(r.config->>'increment')::bigint end) then raise exception 'Bid is below the current minimum. Refresh the auction';end if;
   if a.leader=school then cost:=amount-a.highest;end if;
   if a.leader=school and r.config->>'allow_raise'='false' then raise exception 'Raising your own bid is not enabled';end if;
   if (r.config->>'max_bids') is not null and (select count(*) from spark_rewards.transactions where reward_id=r.id and location_id=school and kind='bid')>=(r.config->>'max_bids')::int then raise exception 'School bid limit reached';end if;
  end if;
  if public.spark_bingo_season_balance(school)<cost then raise exception 'Insufficient available season SPARK Points';end if;
  if p_action='bid' and a.request_id is not null then perform spark_rewards.refund(a.request_id);end if;
  insert into spark_rewards.transactions(request_id,reward_id,location_id,kind,amount,fingerprint) values(req,r.id,school,p_action,amount,fingerprint);
  perform spark_rewards.write_points(school,-amount,req::text,'SPARK Rewards — '||r.name,public.spark_bingo_today());
  if p_action='bid' then
   update spark_rewards.auctions set highest=amount,leader=school,request_id=req,
    closes_at=case when r.config->>'anti_sniping' is distinct from 'false' and closes_at-now()<=make_interval(mins=>coalesce((r.config->>'trigger_minutes')::int,2)) then closes_at+make_interval(mins=>coalesce((r.config->>'extension_minutes')::int,2)) else closes_at end,
    extended=extended or (r.config->>'anti_sniping' is distinct from 'false' and closes_at-now()<=make_interval(mins=>coalesce((r.config->>'trigger_minutes')::int,2))) where reward_id=r.id;
  elsif p_action='claim' or (p_action='contribute' and amount=remaining) then update spark_rewards.catalog set fulfillment='in_progress',revision=revision+1 where id=r.id;end if;
  insert into spark_rewards.audit(action,record_id,after_data) values(p_action,r.id,jsonb_build_object('request',req,'school',school,'amount',amount));
 elsif p_action='settings' then
  if (p_payload->>'revision')::integer is distinct from cfg.revision then raise exception 'Settings changed. Refresh first';end if;
  if jsonb_typeof(p_payload->'manager_enabled') is distinct from 'boolean' then raise exception 'Choose Active or Inactive';end if;
  old:=to_jsonb(cfg);update spark_rewards.settings set manager_enabled=(p_payload->>'manager_enabled')::boolean,revision=revision+1 where id;
  insert into spark_rewards.audit(action,before_data,after_data) select 'manager_activation',old,to_jsonb(x) from spark_rewards.settings x;
 elsif p_action in ('save','duplicate') then
  select * into r from spark_rewards.catalog where id=(p_payload->>'id')::uuid for update;
  if p_action='save' and exists(select 1 from spark_rewards.transactions where reward_id=r.id) then
   if p_payload->>'type' is distinct from r.type or p_payload->'config' is distinct from r.config or (p_payload->>'opens_at')::timestamptz is distinct from r.opens_at or (p_payload->>'closes_at')::timestamptz is distinct from r.closes_at then raise exception 'Points are committed. Duplicate this reward to change its type, price, rules or dates';end if;
   if p_payload->>'fulfillment' is distinct from r.fulfillment then raise exception 'Use fulfillment or cancellation controls to preserve committed points';end if;
  end if;
  perform public.spark_rewards_supervisor(p_action,p_pin,p_payload);
 elsif p_action in ('cancel','fulfill','settle','start_session','spin','close_session') then
  select * into r from spark_rewards.catalog where id=(p_payload->>'id')::uuid for update;
  if r.id is null then raise exception 'Reward not found';end if;
  if p_action='settle' then
   if r.type<>'auction' or coalesce((select closes_at from spark_rewards.auctions where reward_id=r.id),r.closes_at)>now() then raise exception 'Wait until the auction closes';end if;
   perform spark_rewards.settle_due();
  elsif p_action='cancel' then
   if coalesce((p_payload->>'confirmed')::boolean,false) is not true then raise exception 'Confirm cancellation and refunds';end if;
   if r.fulfillment='fulfilled' or exists(select 1 from spark_rewards.transactions where reward_id=r.id and fulfilled) or exists(select 1 from spark_rewards.wheel_sessions where reward_id=r.id and used>0) then raise exception 'Fulfilled rewards or used wheel sessions require separate refund review';end if;
   if r.config->>'refund_policy' in ('no_refund','supervisor_review') then raise exception 'This reward requires separate refund review';end if;
   for t in select * from spark_rewards.transactions where reward_id=r.id and not refunded loop perform spark_rewards.refund(t.request_id);end loop;
   update spark_rewards.auctions set settled=true,winner=null where reward_id=r.id;
   update spark_rewards.catalog set active=false,fulfillment='canceled',revision=revision+1 where id=r.id;
  elsif p_action='fulfill' then
   if coalesce((p_payload->>'confirmed')::boolean,false) is not true then raise exception 'Confirm fulfillment';end if;
   if r.fulfillment='canceled' then raise exception 'Canceled reward cannot be fulfilled';end if;
   if r.type='fixed' and not exists(select 1 from spark_rewards.transactions where reward_id=r.id and kind='claim' and not refunded) then raise exception 'Reward has not been claimed';end if;
   if r.type in ('pool','wheel') and coalesce((select sum(amount) from spark_rewards.transactions where reward_id=r.id and kind='contribute' and not refunded),0)<(r.config->>'goal')::integer then raise exception 'Community goal has not been reached';end if;
   if r.type='auction' and not exists(select 1 from spark_rewards.auctions where reward_id=r.id and settled and winner is not null) then raise exception 'Auction has no settled winner';end if;
   if r.type='wheel' and not exists(select 1 from spark_rewards.wheel_sessions where reward_id=r.id and closed) then raise exception 'Close the wheel session first';end if;
   update spark_rewards.transactions set fulfilled=true where reward_id=r.id and not refunded;
   update spark_rewards.catalog set fulfillment='fulfilled',active=false,revision=revision+1 where id=r.id;
  elsif p_action='start_session' then
   if r.type<>'wheel' or not r.active or r.status<>'published' or r.fulfillment in('fulfilled','canceled') then raise exception 'Choose an active wheel';end if;
   if coalesce((select sum(amount) from spark_rewards.transactions where reward_id=r.id and kind='contribute' and not refunded),0)<(r.config->>'goal')::integer then raise exception 'Reach the community goal first';end if;
   perform spark_rewards.validate_reward(r);
   select jsonb_agg(x) into segments from jsonb_array_elements(r.config->'segments')x where (x->>'enabled')::boolean and (r.config->>'wheel_type'<>'punishment' or (x->>'approved')::boolean);
   if jsonb_array_length(segments)<2 then raise exception 'Approve at least two wheel segments';end if;
   insert into spark_rewards.wheel_sessions(reward_id,segments,wheel_type,spin_limit) values(r.id,segments,r.config->>'wheel_type',(r.config->>'session_limit')::int) on conflict do nothing;
  elsif p_action='close_session' then update spark_rewards.wheel_sessions set closed=true,remaining=0 where reward_id=r.id;
  else
   req:=(p_payload->>'request_id')::uuid;if req is null then raise exception 'A spin request ID is required';end if;
   select outcome into segment from spark_rewards.wheel_results where request_id=req and reward_id=r.id;
   if segment is null then
    select * into w from spark_rewards.wheel_sessions where reward_id=r.id for update;
    if w.reward_id is null or w.closed or w.remaining<1 or w.used>=w.spin_limit then raise exception 'No wheel spins remain';end if;
    n:=jsonb_array_length(w.segments);
    loop idx:=get_byte(sha256(convert_to(gen_random_uuid()::text,'UTF8')),0);exit when idx<256-mod(256,n);end loop;
    segment:=w.segments->mod(idx,n);extra:=case when w.wheel_type='pull' and segment->>'outcome'='extra_spins' then (segment->>'value')::int else 0 end;
    update spark_rewards.wheel_sessions set used=used+1,remaining=least(remaining-1+extra,spin_limit-used-1) where reward_id=r.id;
    insert into spark_rewards.wheel_results(request_id,reward_id,outcome) values(req,r.id,segment);
   end if;
  end if;
  insert into spark_rewards.audit(action,record_id,after_data) values(p_action,r.id,jsonb_build_object('outcome',segment));
 elsif p_action not in ('context','manager_context') then raise exception 'Unknown Rewards action';end if;
 result:=spark_rewards.context(school,admin);
 if segment is not null then result:=result||jsonb_build_object('last_spin',segment);end if;
 return result;
end$$;
revoke all on all functions in schema spark_rewards from public,anon,authenticated;
revoke all on function public.spark_rewards_live(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.spark_rewards_live(text,text,text,jsonb) to service_role;
do $$begin if (select md5(string_agg(md5(to_jsonb(c)::text),'' order by id)) from spark_rewards.catalog c) is distinct from current_setting('spark.rewards_catalog_before') then raise exception 'Existing reward configuration changed during migration';end if;end$$;
-- CRON-BEGIN
select cron.schedule('spark-rewards-auctions','* * * * *','select spark_rewards.settle_due();');
-- CRON-END
commit;
