-- Local-only fixture; never run as a production migration.
begin;
do $$begin if current_setting('spark.rewards_development',true) is distinct from 'on' then raise exception 'Rewards Phase 1 is development-only. Explicit isolated development setup required.';end if;end;$$;
create schema rewards_dev;
revoke all on schema rewards_dev from public,anon,authenticated;
create table rewards_dev.settings(id boolean primary key default true check(id),manager_enabled boolean not null default false check(not manager_enabled),meeting_spin_limit integer not null default 1 check(meeting_spin_limit between 1 and 100),revision integer not null default 1);
insert into rewards_dev.settings(id) values(true);
create table rewards_dev.catalog(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 100),description text not null default '',icon text not null default '🎁',image_url text,type text not null check(type in('pool','fixed','auction')),active boolean not null default false,status text not null default 'draft' check(status in('draft','published')),config jsonb not null default '{}',opens_at timestamptz,closes_at timestamptz,fulfillment text not null default 'not_started' check(fulfillment in('not_started','in_progress','fulfilled','canceled')),revision integer not null default 1,created_at timestamptz not null default now(),check(closes_at is null or opens_at is null or closes_at>opens_at));
create table rewards_dev.wheel_challenges(id uuid primary key default gen_random_uuid(),label text not null check(length(trim(label)) between 1 and 80),approved boolean not null default false,active boolean not null default false,retired boolean not null default false,revision integer not null default 1,check(not active or approved));
create table rewards_dev.wheel_spins(id uuid primary key default gen_random_uuid(),request_id uuid not null unique,challenge_id uuid not null references rewards_dev.wheel_challenges(id),label text not null,is_preview boolean not null default true check(is_preview),created_at timestamptz not null default now());
create table rewards_dev.audit(id bigint generated always as identity primary key,action text not null,record_id uuid,before_data jsonb,after_data jsonb,created_at timestamptz not null default now());
alter table rewards_dev.settings enable row level security;
alter table rewards_dev.catalog enable row level security;
alter table rewards_dev.wheel_challenges enable row level security;
alter table rewards_dev.wheel_spins enable row level security;
alter table rewards_dev.audit enable row level security;
revoke all on all tables in schema rewards_dev from public,anon,authenticated;
insert into rewards_dev.catalog(name,type,description) values
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
insert into rewards_dev.wheel_challenges(label) values('Wear a funny hat'),('Tell an appropriate embarrassing story'),('Perform a short dance move'),('Make a funny pose'),('Tell a joke'),('Do an impression'),('Complete an approved mystery challenge');

create function rewards_dev.validate_reward(p rewards_dev.catalog) returns void language plpgsql set search_path=pg_catalog as $$
declare k text;n numeric;
begin
 if p.config is null or jsonb_typeof(p.config)<>'object' then raise exception 'Reward configuration must be an object';end if;
 for k in select jsonb_object_keys(p.config) loop
  if not k=any(array['goal','minimum','maximum','show_names','refund_policy','price','quantity','max_claims','approval_required','sold_out','starting_bid','increment','max_bids','allow_raise','wheel_spins']) then raise exception 'Unsupported reward configuration';end if;
  if k=any(array['goal','minimum','maximum','price','quantity','max_claims','starting_bid','increment','max_bids','wheel_spins']) and p.config->k<>'null'::jsonb then
   if jsonb_typeof(p.config->k)<>'number' then raise exception 'Enter numeric point and limit values';end if;
   n:=(p.config->>k)::numeric;if n<=0 or n<>trunc(n) or n>2147483647 then raise exception 'Points and limits must be positive whole numbers';end if;
  elsif k=any(array['show_names','approval_required','sold_out','allow_raise']) and jsonb_typeof(p.config->k)<>'boolean' then raise exception 'Invalid reward option';end if;
 end loop;
 if p.config?'refund_policy' and p.config->>'refund_policy' not in('refund','no_refund','supervisor_review') then raise exception 'Invalid refund policy';end if;
 if length(p.description)>2000 or length(p.icon)>16 then raise exception 'Reward text is too long';end if;
 if p.image_url is not null and p.image_url!~'^https://[^[:space:]]+$' then raise exception 'Image URL must use HTTPS';end if;
 if (p.config->>'maximum')::numeric<(p.config->>'minimum')::numeric then raise exception 'Maximum contribution must not be below the minimum';end if;
 if p.status='published' then
  if trim(p.description)='' then raise exception 'Add a description before publishing';end if;
  if p.type='pool' and (p.config->>'goal') is null then raise exception 'Set the community point goal';end if;
  if p.type='fixed' and ((p.config->>'price') is null or (p.config->>'quantity') is null) then raise exception 'Set a point price and quantity';end if;
  if p.type='auction' and ((p.config->>'starting_bid') is null or p.opens_at is null or p.closes_at is null) then raise exception 'Set the starting bid and auction dates';end if;
 end if;
end;$$;

create function public.spark_rewards_dev(p_action text,p_pin text default null,p_token text default null,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,rewards_dev,pg_temp as $$
declare c rewards_dev.catalog;old jsonb;record uuid;cfg rewards_dev.settings;w rewards_dev.wheel_challenges;spin rewards_dev.wheel_spins;school bigint;balance numeric:=0;
begin
 -- No manager participation is implemented in Phase 1, even with a forged enabled flag.
 if p_action in('manager_context','contribute','claim','bid','refund','spin','use_spin','cancel_claim') then raise exception 'SPARK Rewards manager launch is not enabled. Phase 2 validation and Supervisor approval are required.';end if;
 if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization required';end if;
 select * into cfg from rewards_dev.settings where id for update;
 if p_action='settings' then
  if p_payload->>'manager_enabled' is distinct from 'false' then raise exception 'Manager activation is locked during Phase 1';end if;
  if (p_payload->>'revision')::int is distinct from cfg.revision then raise exception 'Settings changed. Refresh first';end if;
  old:=to_jsonb(cfg);update rewards_dev.settings set manager_enabled=false,meeting_spin_limit=(p_payload->>'meeting_spin_limit')::int,revision=revision+1 where id;
  insert into rewards_dev.audit(action,before_data,after_data) select p_action,old,to_jsonb(s) from rewards_dev.settings s;
 elsif p_action='save' then
  if p_payload->>'id' is not null then
   select * into c from rewards_dev.catalog where id=(p_payload->>'id')::uuid for update;
   if c.id is null or c.revision is distinct from (p_payload->>'revision')::int then raise exception 'Reward changed. Refresh first';end if;old:=to_jsonb(c);
  else c.id:=gen_random_uuid();c.revision:=0;end if;
  c.name:=trim(p_payload->>'name');c.description:=coalesce(p_payload->>'description','');c.icon:=coalesce(nullif(p_payload->>'icon',''),'🎁');c.image_url:=nullif(p_payload->>'image_url','');c.type:=p_payload->>'type';c.active:=coalesce((p_payload->>'active')::boolean,false);c.status:=coalesce(p_payload->>'status','draft');c.config:=coalesce(p_payload->'config','{}');c.opens_at:=(p_payload->>'opens_at')::timestamptz;c.closes_at:=(p_payload->>'closes_at')::timestamptz;c.fulfillment:=coalesce(p_payload->>'fulfillment','not_started');
  perform rewards_dev.validate_reward(c);
  insert into rewards_dev.catalog(id,name,description,icon,image_url,type,active,status,config,opens_at,closes_at,fulfillment,revision)
  values(c.id,c.name,c.description,c.icon,c.image_url,c.type,c.active,c.status,c.config,c.opens_at,c.closes_at,c.fulfillment,c.revision+1)
  on conflict(id) do update set name=excluded.name,description=excluded.description,icon=excluded.icon,image_url=excluded.image_url,type=excluded.type,active=excluded.active,status=excluded.status,config=excluded.config,opens_at=excluded.opens_at,closes_at=excluded.closes_at,fulfillment=excluded.fulfillment,revision=excluded.revision;
  insert into rewards_dev.audit(action,record_id,before_data,after_data) select p_action,c.id,old,to_jsonb(r) from rewards_dev.catalog r where id=c.id;
 elsif p_action='duplicate' then
  select * into c from rewards_dev.catalog where id=(p_payload->>'id')::uuid;if c.id is null then raise exception 'Reward not found';end if;
  insert into rewards_dev.catalog(name,description,icon,image_url,type,config) values(left(c.name,90)||' (copy)',c.description,c.icon,c.image_url,c.type,c.config) returning id into record;
  insert into rewards_dev.audit(action,record_id,after_data) select p_action,record,to_jsonb(r) from rewards_dev.catalog r where id=record;
 elsif p_action='wheel_save' then
  if p_payload->>'id' is not null then select * into w from rewards_dev.wheel_challenges where id=(p_payload->>'id')::uuid for update;if w.id is null or w.revision is distinct from (p_payload->>'revision')::int then raise exception 'Wheel challenge changed. Refresh first';end if;old:=to_jsonb(w);else w.id:=gen_random_uuid();w.revision:=0;end if;
  insert into rewards_dev.wheel_challenges(id,label,active,approved,retired,revision) values(w.id,trim(p_payload->>'label'),coalesce((p_payload->>'active')::boolean,false),coalesce((p_payload->>'approved')::boolean,false),coalesce((p_payload->>'retired')::boolean,false),w.revision+1)
  on conflict(id) do update set label=excluded.label,active=excluded.active,approved=excluded.approved,retired=excluded.retired,revision=excluded.revision;
  insert into rewards_dev.audit(action,record_id,before_data,after_data) select p_action,w.id,old,to_jsonb(r) from rewards_dev.wheel_challenges r where id=w.id;
 elsif p_action='preview_spin' then
  select * into spin from rewards_dev.wheel_spins where request_id=(p_payload->>'request_id')::uuid;
  if spin.id is null then
   select * into w from rewards_dev.wheel_challenges where active and approved and not retired order by random() limit 1;
   if w.id is null then raise exception 'Approve and activate a wheel challenge first';end if;
   insert into rewards_dev.wheel_spins(request_id,challenge_id,label) values((p_payload->>'request_id')::uuid,w.id,w.label) returning * into spin;
   insert into rewards_dev.audit(action,record_id,after_data) values(p_action,spin.id,to_jsonb(spin));
  end if;
 elsif p_action<>'context' then raise exception 'Unknown Rewards action';end if;
 school:=(p_payload->>'location_id')::bigint;
 if school is not null then
  if not exists(select 1 from public.locations where id=school and active) then raise exception 'Select an active school';end if;
  balance:=public.spark_bingo_season_balance(school);
 end if;
 return jsonb_build_object('launch_ready',false,'manager_enabled',false,'settings',(select to_jsonb(s) from rewards_dev.settings s),'catalog',(select coalesce(jsonb_agg(to_jsonb(r) order by created_at,name),'[]') from rewards_dev.catalog r),'schools',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'school_name',school_name) order by school_name),'[]') from public.locations where active),'location_id',school,'balance',balance::text,'wheel',(select coalesce(jsonb_agg(to_jsonb(r) order by label),'[]') from rewards_dev.wheel_challenges r where not retired),'spins',(select coalesce(jsonb_agg(to_jsonb(s) order by created_at desc),'[]') from (select * from rewards_dev.wheel_spins order by created_at desc limit 100)s),'last_spin',to_jsonb(spin),'history',(select coalesce(jsonb_agg(to_jsonb(a) order by id desc),'[]') from (select * from rewards_dev.audit order by id desc limit 200)a));
end;$$;
revoke all on function rewards_dev.validate_reward(rewards_dev.catalog),public.spark_rewards_dev(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.spark_rewards_dev(text,text,text,jsonb) to service_role;
commit;
