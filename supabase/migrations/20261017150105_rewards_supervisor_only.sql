-- Supervisor configuration and read-only previews only. No manager participation or point writes.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
do $$begin
 if to_regprocedure('public.verify_supervisor_pin(text)') is null or to_regprocedure('public.spark_bingo_season_balance(bigint)') is null then raise exception 'SPARK Supervisor authentication and season balance helpers are required';end if;
end;$$;
create schema spark_rewards;
revoke all on schema spark_rewards from public,anon,authenticated;
create table spark_rewards.settings(id boolean primary key default true check(id),manager_enabled boolean not null default false check(not manager_enabled),meeting_spin_limit integer not null default 1 check(meeting_spin_limit between 1 and 100),revision integer not null default 1);
insert into spark_rewards.settings(id) values(true);
create table spark_rewards.catalog(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 100),description text not null default '',icon text not null default '🎁',image_url text,type text not null check(type in('pool','fixed','auction','wheel')),active boolean not null default false,status text not null default 'draft' check(status in('draft','published')),config jsonb not null default '{}',opens_at timestamptz,closes_at timestamptz,fulfillment text not null default 'not_started' check(fulfillment in('not_started','in_progress','fulfilled','canceled')),revision integer not null default 1,created_at timestamptz not null default now(),check(closes_at is null or opens_at is null or closes_at>opens_at));
create table spark_rewards.audit(id bigint generated always as identity primary key,action text not null,record_id uuid,before_data jsonb,after_data jsonb,created_at timestamptz not null default now());
alter table spark_rewards.settings enable row level security;
alter table spark_rewards.catalog enable row level security;
alter table spark_rewards.audit enable row level security;
revoke all on all tables in schema spark_rewards from public,anon,authenticated;
insert into spark_rewards.catalog(name,type,description) values
 ('Donuts at Managers Meeting','pool','Everyone at the meeting benefits.'),
 ('Pie in the Supervisor''s Face','auction','Winner gets to throw the pie. Safety and meeting arrangements require Supervisor approval.'),
 ('Supervisor Car Wash','auction','Supervisor washes the winner''s car. Arrangements to be confirmed.'),
 ('Breakfast for School Staff','fixed','Breakfast for the winning manager''s cafeteria staff.'),
 ('Supervisor Reads Special Announcement','fixed','Submit a short, appropriate announcement for Supervisor approval.'),
 ('Spin the Supervisor Challenge Wheel','pool','Group unlocks a digital wheel spin. Challenges require Supervisor approval.'),
 ('VIP Chair at Managers Meeting','fixed','Use the special chair during a managers meeting.'),
 ('Dress the Supervisor','auction','Winner proposes three appropriate choices; Supervisor chooses one.'),
 ('Run Part of Managers Meeting','auction','Rules and duration to be determined.'),
 ('10-Minute Ask Me Anything','fixed','A ten-minute question session with the Supervisor.'),
 ('Pizza at Managers Meeting','pool','Optional reward for lunchtime meetings.');

create function spark_rewards.validate_reward(p spark_rewards.catalog) returns void
language plpgsql set search_path=pg_catalog as $$
declare k text;n numeric;s jsonb;active_count integer:=0;ids text[]:=array[]::text[];
begin
 if p.config is null or jsonb_typeof(p.config)<>'object' then raise exception 'Reward configuration must be an object';end if;
 for k in select jsonb_object_keys(p.config) loop
  if not k=any(array['goal','minimum','maximum','show_names','refund_policy','price','quantity','max_claims','approval_required','sold_out','starting_bid','increment','max_bids','allow_raise','wheel_spins','reserve','anti_sniping','trigger_minutes','extension_minutes','wheel_type','segments','session_limit']) then raise exception 'Unsupported reward configuration';end if;
  if k=any(array['goal','minimum','maximum','price','quantity','max_claims','starting_bid','increment','max_bids','wheel_spins','reserve','trigger_minutes','extension_minutes','session_limit']) and p.config->k<>'null'::jsonb then
   if jsonb_typeof(p.config->k)<>'number' then raise exception 'Enter numeric point and limit values';end if;
   n:=(p.config->>k)::numeric;if n<=0 or n<>trunc(n) or n>2147483647 then raise exception 'Points and limits must be positive whole numbers';end if;
  elsif k=any(array['show_names','approval_required','sold_out','allow_raise','anti_sniping']) and jsonb_typeof(p.config->k)<>'boolean' then raise exception 'Invalid reward option';end if;
 end loop;
 if p.config?'refund_policy' and p.config->>'refund_policy' not in('refund','no_refund','supervisor_review') then raise exception 'Invalid refund policy';end if;
 if length(p.description)>2000 or length(p.icon)>16 then raise exception 'Reward text is too long';end if;
 if p.image_url is not null and p.image_url!~'^https://[^[:space:]]+$' then raise exception 'Image URL must use HTTPS';end if;
 if p.type='auction' then
  if (p.config->>'reserve')::numeric<(p.config->>'starting_bid')::numeric then raise exception 'Reserve must be at least the starting bid';end if;
  foreach k in array array['trigger_minutes','extension_minutes'] loop
   if p.config?k and (p.config->>k)::int not in(1,2,3,5,10) then raise exception 'Choose an auction window of 1, 2, 3, 5 or 10 minutes';end if;
  end loop;
 end if;
 if p.type='wheel' then
  if coalesce(p.config->>'wheel_type','') not in('pull','punishment','positive') then raise exception 'Choose a wheel type';end if;
  if coalesce((p.config->>'session_limit')::int,0) not between 1 and 100 then raise exception 'Session limit must be 1 to 100';end if;
  if jsonb_typeof(p.config->'segments') is distinct from 'array' then raise exception 'Add wheel segments';end if;
  if jsonb_array_length(p.config->'segments')>12 then raise exception 'Use at most 12 wheel segments';end if;
  for s in select value from jsonb_array_elements(p.config->'segments') loop
   if jsonb_typeof(s)<>'object' or length(trim(coalesce(s->>'id',''))) not between 1 and 100 or (s->>'id')=any(ids) then raise exception 'Wheel segments need unique IDs';end if;
   ids:=array_append(ids,s->>'id');
   if length(trim(coalesce(s->>'label',''))) not between 1 and 60 or coalesce(s->>'color','')!~'^#[0-9a-fA-F]{6}$' then raise exception 'Set a short label and valid color for every segment';end if;
   if jsonb_typeof(s->'enabled') is distinct from 'boolean' or jsonb_typeof(s->'approved') is distinct from 'boolean' then raise exception 'Invalid segment approval or enabled flag';end if;
   if (p.config->>'wheel_type'='pull' and coalesce(s->>'outcome','') not in('extra_spins','prize','none')) or (p.config->>'wheel_type'='punishment' and s->>'outcome' is distinct from 'challenge') or (p.config->>'wheel_type'='positive' and s->>'outcome' is distinct from 'activity') then raise exception 'Outcome does not match wheel type';end if;
   if s->>'outcome'='extra_spins' then
    if jsonb_typeof(s->'value') is distinct from 'number' then raise exception 'Extra spins must be numeric';end if;
    n:=(s->>'value')::numeric;if n<>trunc(n) or n not between 1 and 100 then raise exception 'Extra spins must be a whole number from 1 to 100';end if;
   end if;
   if (s->>'enabled')::boolean then
    if p.config->>'wheel_type'<>'punishment' or (s->>'approved')::boolean then active_count:=active_count+1;
    elsif p.status='published' then raise exception 'Approve every enabled challenge before publishing';end if;
   end if;
  end loop;
  if p.status='published' and active_count<2 then raise exception 'Enable at least two approved segments';end if;
 end if;
 if p.status='published' then
  if trim(p.description)='' then raise exception 'Add a description before publishing';end if;
  if p.type in('pool','wheel') and (p.config->>'goal') is null then raise exception 'Set the community point goal';end if;
  if p.type='fixed' and (p.config->>'price') is null then raise exception 'Set a point price';end if;
  if p.type='auction' and ((p.config->>'starting_bid') is null or (p.config->>'reserve') is null or (p.config->>'increment') is null or p.opens_at is null or p.closes_at is null) then raise exception 'Set starting bid, reserve, increment and auction dates';end if;
 end if;
end;$$;

create function public.spark_rewards_supervisor(p_action text,p_pin text default null,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,spark_rewards,pg_temp as $$
declare c spark_rewards.catalog;old jsonb;record uuid;cfg spark_rewards.settings;school bigint;balance numeric:=0;
begin
 if p_action='capabilities' then return jsonb_build_object('supervisor_available',true,'manager_enabled',false,'protocol_version',1);end if;
 if p_action is null or p_action not in('context','save','duplicate','settings') then raise exception 'SPARK Rewards manager participation and real awards are not enabled';end if;
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization required';end if;
 select * into cfg from spark_rewards.settings where id for update;
 if p_action='settings' then
  if p_payload->>'manager_enabled' is distinct from 'false' then raise exception 'Manager activation is locked until financial integration is approved';end if;
  if (p_payload->>'revision')::int is distinct from cfg.revision then raise exception 'Settings changed. Refresh first';end if;
  old:=to_jsonb(cfg);update spark_rewards.settings set manager_enabled=false,meeting_spin_limit=(p_payload->>'meeting_spin_limit')::int,revision=revision+1 where id;
  insert into spark_rewards.audit(action,before_data,after_data) select p_action,old,to_jsonb(s) from spark_rewards.settings s;
 elsif p_action='save' then
  if p_payload->>'id' is not null then
   select * into c from spark_rewards.catalog where id=(p_payload->>'id')::uuid for update;
   if c.id is null or c.revision is distinct from (p_payload->>'revision')::int then raise exception 'Reward changed. Refresh first';end if;old:=to_jsonb(c);
  else c.id:=gen_random_uuid();c.revision:=0;end if;
  c.name:=trim(p_payload->>'name');c.description:=coalesce(p_payload->>'description','');c.icon:=coalesce(nullif(p_payload->>'icon',''),'🎁');c.image_url:=nullif(p_payload->>'image_url','');c.type:=p_payload->>'type';c.active:=coalesce((p_payload->>'active')::boolean,false);c.status:=coalesce(p_payload->>'status','draft');c.config:=coalesce(p_payload->'config','{}');c.opens_at:=(p_payload->>'opens_at')::timestamptz;c.closes_at:=(p_payload->>'closes_at')::timestamptz;c.fulfillment:=coalesce(p_payload->>'fulfillment','not_started');
  perform spark_rewards.validate_reward(c);
  insert into spark_rewards.catalog(id,name,description,icon,image_url,type,active,status,config,opens_at,closes_at,fulfillment,revision)
  values(c.id,c.name,c.description,c.icon,c.image_url,c.type,c.active,c.status,c.config,c.opens_at,c.closes_at,c.fulfillment,c.revision+1)
  on conflict(id) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,image_url=excluded.image_url,type=excluded.type,active=excluded.active,status=excluded.status,config=excluded.config,opens_at=excluded.opens_at,closes_at=excluded.closes_at,fulfillment=excluded.fulfillment,revision=excluded.revision;
  insert into spark_rewards.audit(action,record_id,before_data,after_data) select p_action,c.id,old,to_jsonb(r) from spark_rewards.catalog r where id=c.id;
 elsif p_action='duplicate' then
  select * into c from spark_rewards.catalog where id=(p_payload->>'id')::uuid;if c.id is null then raise exception 'Reward not found';end if;
  insert into spark_rewards.catalog(name,description,icon,image_url,type,config) values(left(c.name,90)||' (copy)',c.description,c.icon,c.image_url,c.type,c.config) returning id into record;
  insert into spark_rewards.audit(action,record_id,after_data) select p_action,record,to_jsonb(r) from spark_rewards.catalog r where id=record;

 end if;
 school:=(p_payload->>'location_id')::bigint;
 if school is not null then
  if not exists(select 1 from public.locations where id=school and active) then raise exception 'Select an active school';end if;
  balance:=public.spark_bingo_season_balance(school);
 end if;
 return jsonb_build_object('environment','production','supervisor_only',true,'launch_ready',false,'manager_enabled',false,'settings',(select to_jsonb(s) from spark_rewards.settings s),'catalog',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at,name),'[]') from spark_rewards.catalog r),'schools',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'school_name',school_name) order by school_name),'[]') from public.locations where active),'location_id',school,'balance',balance::text,'wheel','[]'::jsonb,'spins','[]'::jsonb,'history',(select coalesce(jsonb_agg(to_jsonb(a) order by id desc),'[]') from (select * from spark_rewards.audit order by id desc limit 200)a));
end;$$;
revoke all on all tables in schema spark_rewards from public,anon,authenticated;
revoke all on all sequences in schema spark_rewards from public,anon,authenticated;
revoke all on function spark_rewards.validate_reward(spark_rewards.catalog),public.spark_rewards_supervisor(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.spark_rewards_supervisor(text,text,jsonb) to service_role;
commit;
