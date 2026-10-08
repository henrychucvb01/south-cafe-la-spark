-- Production launch: preserve supervisor setup; keep development fully isolated.
begin;
create schema october_live;
revoke all on schema october_live from public,anon,authenticated;
do $$
declare t text; c record;
begin
 foreach t in array array['settings','schools','quests','entries','rounds','guesses','votes','rewards','unlocks','seen','quest_claims'] loop
  execute format('lock table october_dev.%I in share mode',t);
  execute format('create table october_live.%I (like october_dev.%I including all)',t,t);
  execute format('insert into october_live.%I select * from october_dev.%I',t,t);
 end loop;
 for c in select conrelid::regclass::text tbl,conname,pg_get_constraintdef(oid) def from pg_constraint where contype='f' and connamespace='october_dev'::regnamespace loop
  execute format('alter table %s add constraint %I %s',replace(c.tbl,'october_dev.','october_live.'),c.conname,replace(c.def,'october_dev.','october_live.'));
 end loop;
end $$;
alter table october_live.rewards add column live_award boolean not null default false;
alter table october_live.rewards alter column live_award set default true;
update october_live.settings set revision=revision+1,changed_at=now();
-- Only new production rewards enter the normal SPARK ledger. Imported test rewards never do.
create function october_live.sync_spark_reward() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare previous_points int:=0; actual_points int; month_start date;
begin
 if not new.live_award then return new;end if;
 actual_points:=case when new.voided then 0 else new.points end;
 select points into previous_points from public.spark_points where unique_key='october-live:'||new.event;
 insert into public.spark_points(location_id,points,point_type,description,service_date,source,unique_key)
 values(new.location_id,actual_points,'october_games','October Games — '||new.event,new.service_date,'october_games','october-live:'||new.event)
 on conflict(unique_key) do update set points=excluded.points,description=excluded.description;
 -- Correct saved standings if an award is withdrawn/restored after the month closes; never issue Pull tokens.
 month_start:=date_trunc('month',new.service_date)::date;
 perform pg_advisory_xact_lock(hashtextextended('mystery-prize-pool',0));
 update public.spark_monthly_cup_results set points=points+actual_points-coalesce(previous_points,0) where month=month_start and location_id=new.location_id;
 if found then
  with ranks as(select location_id,rank() over(order by points desc)::int r from public.spark_monthly_cup_results where month=month_start)
  update public.spark_monthly_cup_results c set rank=r.r from ranks r where c.month=month_start and c.location_id=r.location_id;
 end if;
 return new;
end $$;
revoke all on function october_live.sync_spark_reward() from public,anon,authenticated;
create trigger october_live_reward_sync after insert or update on october_live.rewards for each row execute function october_live.sync_spark_reward();
create or replace function public.october_games_live(p_action text,p_token text default null,p_pin text default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,october_live,pg_temp as $$
#variable_conflict use_column
declare s public.supper_monitoring_sessions; admin boolean:=false; cfg october_live.settings;
 e october_live.entries; q october_live.quests; r october_live.rounds; lid bigint; eid text;
 schools jsonb; entries jsonb; rounds jsonb; quests jsonb; result jsonb; old_photo text; key text;
 n int; target bigint; correct boolean; text_guess text; part boolean; current_round int;
begin
 if p_pin is not null then
  if public.verify_supervisor_pin(p_pin) is not true then raise exception 'Supervisor authorization required';end if;admin:=true;
 else
  s:=public.require_supper_monitoring_session(p_token);
  if s.actor_role<>'manager' then raise exception 'Manager session required';end if;
  lid:=s.location_id;eid:=s.employee_id::text;
 end if;
 -- Serializes approvals, guesses, winner confirmation and corrections across schools.
 select * into cfg from october_live.settings where id for update;
 select participating into part from october_live.schools where location_id=lid;
 select min(id) into current_round from october_live.rounds where solved_at is null;
 if p_action='rewards' then return (select coalesce(jsonb_agg(jsonb_build_object('location_id',location_id,'points',points,'service_date',service_date)),'[]') from october_live.rewards where not voided and live_award);end if;
 if p_action in ('settings','quest','quest_create','review','round','champion','reward') and not admin then raise exception 'Supervisor authorization required';end if;
 if p_action in ('submit','vote','guess') and (admin or not coalesce(part,false)) then raise exception 'Participating school manager required';end if;
 if p_action='settings' then
  if (p_payload->>'revision')::int is distinct from cfg.revision then raise exception 'Settings changed. Refresh first.';end if;
  if p_payload->>'game' in ('quests','door','mystery') then
   if p_payload->>'state' not in ('active','paused','ended') then raise exception 'Invalid game state';end if;
   if p_payload->>'game'='mystery' and p_payload->>'state'='active' and exists(select 1 from october_live.rounds where photo_path is null or pieces is null or trim(answer)='') then raise exception 'Upload all five mystery photos and answers first';end if;
   update october_live.settings set quests_state=case when p_payload->>'game'='quests' then p_payload->>'state' else quests_state end,
    door_state=case when p_payload->>'game'='door' then p_payload->>'state' else door_state end,
    mystery_state=case when p_payload->>'game'='mystery' then p_payload->>'state' else mystery_state end where id;
  elsif p_payload ? 'schools' then
   insert into october_live.schools select id,false from public.locations where active on conflict do nothing;
   update october_live.schools set participating=location_id in(select value::bigint from jsonb_array_elements_text(p_payload->'schools'));
  else
   if not ((p_payload->>'submission_start')::timestamptz < (p_payload->>'submission_end')::timestamptz and
     (p_payload->>'submission_end')::timestamptz <= (p_payload->>'voting_start')::timestamptz and
     (p_payload->>'voting_start')::timestamptz < (p_payload->>'voting_end')::timestamptz) then raise exception 'Set submission dates before voting dates';end if;
   if exists(select 1 from october_live.votes) then raise exception 'Voting has begun. Dates are locked.';end if;
   update october_live.settings set submission_start=(p_payload->>'submission_start')::timestamptz,submission_end=(p_payload->>'submission_end')::timestamptz,
    voting_start=(p_payload->>'voting_start')::timestamptz,voting_end=(p_payload->>'voting_end')::timestamptz where id;
  end if;
  update october_live.settings set revision=revision+1,changed_at=now() where id;
 elsif p_action='quest_create' then
  if (p_payload->>'revision')::int is distinct from cfg.revision then raise exception 'Settings changed. Refresh first.';end if;
  if coalesce(length(trim(p_payload->>'name')),0) not between 1 and 100 or coalesce(length(trim(p_payload->>'description')),0) not between 1 and 1000 then raise exception 'Enter a quest name and instructions';end if;
  if p_payload ? 'reward_points' and (p_payload->>'reward_points' is null or p_payload->>'reward_points' !~ '^[0-9]{1,4}$' or (p_payload->>'reward_points')::int not between 1 and 1000) then raise exception 'Reward must be 1 to 1000 whole SPARK Points';end if;
  select coalesce(max(id),0)+1 into n from october_live.quests;
  insert into october_live.quests(id,name,description,enabled,eligible,reward_points) values(n,trim(p_payload->>'name'),trim(p_payload->>'description'),coalesce((p_payload->>'enabled')::boolean,true),null,coalesce((p_payload->>'reward_points')::int,10));
  update october_live.settings set revision=revision+1,changed_at=now() where id;
 elsif p_action='quest' then
  select * into q from october_live.quests where id=(p_payload->>'id')::int;
  if q.id is null or q.revision is distinct from (p_payload->>'revision')::int then raise exception 'Quest changed. Refresh first.';end if;
  if length(trim(p_payload->>'name')) not between 1 and 100 or length(trim(p_payload->>'description')) not between 1 and 1000 then raise exception 'Enter a quest name and instructions';end if;
  if p_payload ? 'reward_points' and (p_payload->>'reward_points' is null or p_payload->>'reward_points' !~ '^[0-9]{1,4}$' or (p_payload->>'reward_points')::int not between 1 and 1000) then raise exception 'Reward must be 1 to 1000 whole SPARK Points';end if;
  if exists(select 1 from october_live.quest_claims where quest=q.id) and coalesce((p_payload->>'reward_points')::int,q.reward_points)<>q.reward_points then raise exception 'Completed quest rewards are locked';end if;
  update october_live.quests set reward_points=coalesce((p_payload->>'reward_points')::int,q.reward_points),name=trim(p_payload->>'name'),description=trim(p_payload->>'description'),enabled=(p_payload->>'enabled')::boolean,
   eligible=case when p_payload->'eligible'='null'::jsonb then null else array(select value::bigint from jsonb_array_elements_text(p_payload->'eligible')) end,revision=revision+1 where id=q.id;
  update october_live.settings set revision=revision+1,changed_at=now() where id;
 elsif p_action='submit' then
  n:=(p_payload->>'quest')::int;
  if n=0 then
   if cfg.door_state<>'active' or cfg.submission_start is null or now()<cfg.submission_start or now()>=cfg.submission_end then raise exception 'Door submissions are closed';end if;
  else
   if exists(select 1 from october_live.quest_claims where quest=n and location_id<>lid) then raise exception 'This quest has been completed by another school and is locked';end if;
   select * into q from october_live.quests where id=n and enabled and (eligible is null or lid=any(eligible));
   if cfg.quests_state<>'active' or q.id is null then raise exception 'Quest is not available for this school';end if;
   if n=3 and length(trim(p_payload->>'note'))<5 then raise exception 'Include the teacher written review';end if;
  end if;
  if coalesce((p_payload->>'consent')::boolean,false) is not true then raise exception 'Confirm permission to publish';end if;
  if p_payload->>'photo_path' is null or p_payload->>'photo_path' !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$' then raise exception 'Photo is required';end if;
  if length(coalesce(p_payload->>'note',''))>2000 then raise exception 'Keep notes under 2,000 characters';end if;
  select * into e from october_live.entries where location_id=lid and quest=n;
  if e.id is not null and (e.state not in ('rejected','replacement') or e.revision is distinct from (p_payload->>'revision')::int) then raise exception 'Already submitted. Wait for supervisor review.';end if;
  old_photo:=e.photo_path;
  insert into october_live.entries(location_id,quest,photo_path,note,consent) values(lid,n,p_payload->>'photo_path',coalesce(p_payload->>'note',''),true)
   on conflict(location_id,quest) do update set photo_path=excluded.photo_path,note=excluded.note,state='pending',feedback='',revision=october_live.entries.revision+1,submitted_at=now();
 elsif p_action='review' then
  select * into e from october_live.entries where id=(p_payload->>'id')::uuid;
  if e.id is null or e.revision is distinct from (p_payload->>'revision')::int then raise exception 'Entry changed. Refresh first.';end if;
  if p_payload->>'state' not in ('approved','rejected','replacement') then raise exception 'Invalid review';end if;
  if e.quest>0 and p_payload->>'state'='approved' and exists(select 1 from october_live.quest_claims where quest=e.quest and entry<>e.id) then raise exception 'This quest has been completed by another school and is locked';end if;
  if e.quest=0 and exists(select 1 from october_live.votes) then raise exception 'Door entries are locked once voting begins';end if;
  if e.quest>0 and cfg.quests_state<>'active' then raise exception 'Activate Side Quests before reviewing';end if;
  if e.quest=0 and (cfg.door_state<>'active' or (cfg.voting_start is not null and now()>=cfg.voting_start)) then raise exception 'Review door entries before voting opens';end if;
  update october_live.entries set state=p_payload->>'state',feedback=left(coalesce(p_payload->>'feedback',''),1000),revision=revision+1,reviewed_at=now() where id=e.id;
  key:=case when e.quest=0 then 'entry:'||e.id else 'quest:first:'||e.quest end;
  if p_payload->>'state'='approved' then
   if e.quest>0 then
    insert into october_live.quest_claims(quest,entry,location_id) values(e.quest,e.id,e.location_id) on conflict(quest) do nothing;
    update october_live.entries set state='rejected',feedback='This quest was completed by another school and is now locked.',revision=revision+1 where quest=e.quest and id<>e.id and state in ('pending','replacement');
   end if;
   if e.quest=0 or exists(select 1 from october_live.quest_claims where quest=e.quest and entry=e.id) then
    insert into october_live.rewards(event,location_id,points) values(key,e.location_id,case when e.quest=0 then 10 else (select reward_points from october_live.quests where id=e.quest) end) on conflict(event) do update set voided=false,reason='Reapproved';
   end if;
   if e.quest>0 then
    -- Approval is retained if mysteries have not started; queued unlocks apply to round 1 on activation.
    insert into october_live.unlocks(entry,round) values(e.id,case when cfg.mystery_state='active' then current_round end) on conflict do nothing;
    if found and cfg.mystery_state='active' and current_round is not null then update october_live.rounds set unlocked=least(jsonb_array_length(pieces),unlocked+5) where id=current_round;end if;
   end if;
  else update october_live.rewards set voided=true,reason='Approval withdrawn' where event=key and location_id=e.location_id;end if;
 elsif p_action='round' then
  select * into r from october_live.rounds where id=(p_payload->>'id')::int;
  if r.id is null or r.revision is distinct from (p_payload->>'revision')::int then raise exception 'Round changed. Refresh first.';end if;
  if r.solved_at is not null or r.unlocked>0 or exists(select 1 from october_live.guesses where round=r.id) then raise exception 'Started mystery rounds are locked';end if;
  if length(trim(p_payload->>'answer')) not between 1 and 120 then raise exception 'Enter the accepted answer';end if;
  if p_payload ? 'photo_path' then
   if p_payload->>'photo_path' !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$' or jsonb_array_length(p_payload->'pieces') not between 30 and 40 then raise exception 'Invalid mystery image or pieces';end if;
   old_photo:=r.photo_path;
  end if;
  update october_live.rounds set photo_path=coalesce(p_payload->>'photo_path',photo_path),pieces=coalesce(p_payload->'pieces',pieces),answer=trim(p_payload->>'answer'),
   aliases=array(select left(value,120) from jsonb_array_elements_text(p_payload->'aliases')),revision=revision+1 where id=r.id;
 elsif p_action='vote' then
  if eid is null then raise exception 'Use your registered manager login to vote';end if;
  if cfg.door_state<>'active' or cfg.voting_start is null or now()<cfg.voting_start or now()>=cfg.voting_end then raise exception 'Voting is closed';end if;
  select * into e from october_live.entries where id=(p_payload->>'id')::uuid and quest=0 and state='approved';
  if e.id is null or e.location_id=lid or not exists(select 1 from october_live.schools where location_id=e.location_id and participating) then raise exception 'Choose an approved entry from another school';end if;
  if exists(select 1 from october_live.votes where employee_id=eid) then raise exception 'Your vote is already recorded';end if;
  insert into october_live.votes values(eid,lid,e.id,now());
 elsif p_action='guess' then
  if eid is null then raise exception 'Use your registered manager login to guess';end if;
  if cfg.mystery_state<>'active' or current_round is null or current_round is distinct from (p_payload->>'round')::int then raise exception 'That mystery is no longer active. Refresh.';end if;
  select * into r from october_live.rounds where id=current_round;
  if r.photo_path is null then raise exception 'Waiting for the mystery photo';end if;
  text_guess:=lower(regexp_replace(trim(p_payload->>'guess'),'\s+',' ','g'));
  if text_guess is null or length(text_guess) not between 1 and 120 then raise exception 'Enter a guess (up to 120 characters)';end if;
  if exists(select 1 from october_live.guesses where round=r.id and employee_id=eid) then raise exception 'You already guessed this mystery';end if;
  correct:=exists(select 1 from unnest(array_append(r.aliases,r.answer)) a where lower(regexp_replace(trim(a),'\s+',' ','g'))=text_guess);
  insert into october_live.guesses values(r.id,eid,lid,text_guess,correct,clock_timestamp());
  if correct then
   update october_live.rounds set winner=lid,solved_at=clock_timestamp(),unlocked=jsonb_array_length(pieces) where id=r.id;
   insert into october_live.rewards(event,location_id,points) values('mystery:'||r.id,lid,25) on conflict do nothing;
  end if;
 elsif p_action='champion' then
  if cfg.voting_end is null or now()<cfg.voting_end then raise exception 'Wait until voting ends';end if;
  target:=(p_payload->>'location_id')::bigint;
  select max(total) into n from(select count(v.employee_id)::int total from october_live.entries e left join october_live.votes v on v.entry=e.id where e.quest=0 and e.state='approved' group by e.id) z;
  if not exists(select 1 from october_live.entries e left join october_live.votes v on v.entry=e.id where e.quest=0 and e.state='approved' and e.location_id=target group by e.id having count(v.employee_id)=n) then raise exception 'Choose a school tied for the highest vote total';end if;
  if cfg.champion is not null and cfg.champion<>target then raise exception 'Winner already confirmed';end if;
  update october_live.settings set champion=target where id;
  insert into october_live.rewards(event,location_id,points) values('door:champion',target,20) on conflict do nothing;
 elsif p_action='reward' then
  if length(trim(p_payload->>'reason'))<5 then raise exception 'Explain the correction';end if;
  update october_live.rewards set voided=(p_payload->>'voided')::boolean,reason=left(p_payload->>'reason',1000) where event=p_payload->>'event';
 elsif p_action='seen' then
  if eid is not null then insert into october_live.seen values(eid,cfg.revision) on conflict(employee_id) do update set revision=excluded.revision;end if;
 elsif p_action not in ('list','authorize') then raise exception 'Unknown Games action';
 end if;
 if p_action='authorize' then return jsonb_build_object('admin',admin,'location_id',lid);end if;
 select * into cfg from october_live.settings where id;
 select min(id) into current_round from october_live.rounds where solved_at is null;
 if cfg.mystery_state='active' and current_round is not null then
  select count(*) into n from october_live.unlocks u join october_live.entries entry on entry.id=u.entry where u.round is null and entry.state='approved';
  if n>0 then update october_live.rounds set unlocked=least(jsonb_array_length(pieces),unlocked+5*n) where id=current_round;update october_live.unlocks set round=current_round where round is null and entry in(select id from october_live.entries where state='approved');end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'school_name',l.school_name,'participating',coalesce(a.participating,false)) order by l.school_name),'[]') into schools from public.locations l left join october_live.schools a on a.location_id=l.id where l.active and (admin or a.participating);
 select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('first_school',(select location_id from october_live.quest_claims where quest=q.id)) order by q.id),'[]') into quests from october_live.quests q where admin or (q.enabled and (q.eligible is null or lid=any(q.eligible)));
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('awarded_points',coalesce((select points from october_live.rewards where event=case when e.quest=0 then 'entry:'||e.id else 'quest:first:'||e.quest end and location_id=e.location_id and not voided and live_award),0),'quest_name',(select name from october_live.quests where id=e.quest),'school_name',(select school_name from public.locations where id=e.location_id),'votes',case when cfg.voting_end is not null and now()>=cfg.voting_end then (select count(*) from october_live.votes v where v.entry=e.id) else null end) order by e.reviewed_at desc nulls last),'[]') into entries from october_live.entries e where admin or e.location_id=lid or e.state='approved';
 select coalesce(jsonb_agg((case when admin then to_jsonb(r) else to_jsonb(r)-'aliases'-'answer'-'pieces'-'photo_path' end)||jsonb_build_object(
  'piece_count',coalesce(jsonb_array_length(r.pieces),0),'guessed',exists(select 1 from october_live.guesses g where g.round=r.id and g.employee_id=eid),
  'answer',case when admin or r.solved_at is not null then r.answer else null end,
  'photo_path',case when admin or r.solved_at is not null or r.id=current_round then r.photo_path else null end,
  'pieces',case when admin or r.id=current_round then r.pieces else null end) order by r.id),'[]') into rounds from october_live.rounds r;
 result:=jsonb_build_object('admin',admin,'location_id',lid,'identified',eid is not null,'participating',coalesce(part,false),'settings',to_jsonb(cfg),'schools',schools,'quests',quests,'entries',entries,'rounds',rounds,
  'current_round',current_round,'vote',(select entry from october_live.votes where employee_id=eid),'new_challenge',eid is not null and coalesce((select revision from october_live.seen where employee_id=eid),0)<cfg.revision,
  'rewards',(select coalesce(jsonb_agg(to_jsonb(w) order by service_date desc),'[]') from october_live.rewards w where live_award),
  'guesses',case when admin then (select coalesce(jsonb_agg(to_jsonb(g) order by submitted_at desc),'[]') from october_live.guesses g) else '[]'::jsonb end,
  'unlock_events',case when admin then (select coalesce(jsonb_agg(to_jsonb(u)),'[]') from october_live.unlocks u) else '[]'::jsonb end,
  'old_photo',old_photo,'guess_correct',correct,'server_time',now());
 return result;
end $$;

revoke all on function public.october_games_live(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.october_games_live(text,text,text,jsonb) to service_role;
commit;
