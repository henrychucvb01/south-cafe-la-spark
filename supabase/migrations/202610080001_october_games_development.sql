-- Isolated preview games. No existing table/function or live points are modified.
begin;
create schema if not exists october_dev;
revoke all on schema october_dev from public,anon,authenticated;
create table october_dev.settings(id boolean primary key default true check(id), revision int not null default 1,
 quests_state text not null default 'paused', door_state text not null default 'paused', mystery_state text not null default 'paused',
 submission_start timestamptz, submission_end timestamptz, voting_start timestamptz, voting_end timestamptz,
 champion bigint references public.locations(id), changed_at timestamptz not null default now());
insert into october_dev.settings(id) values(true);
create table october_dev.schools(location_id bigint primary key references public.locations(id), participating boolean not null default true);
insert into october_dev.schools select id, lower(school_name) !~ '(test|demo|sample)' from public.locations where active;
create table october_dev.quests(id int primary key, name text not null, description text not null, enabled boolean not null default true,
 eligible bigint[], revision int not null default 1);
insert into october_dev.quests(id,name,description,eligible) values
 (1,'Picture Perfect Lunch','Photograph a beautifully presented, complete school lunch tray.',null),
 (2,'Team Spirit','Take a creative group photo of your cafeteria team.',null),
 (3,'Teacher Taste Test','Photograph a teacher enjoying a school meal and include their written review.',null),
 (4,'Rainbow Challenge','Photograph a colorful fruit and vegetable display.',null),
 (5,'Breakfast Champions','Photograph your breakfast setup before service.',null),
 (6,'School Pride','Show school colors or mascot displayed in the cafeteria.',null),
 (7,'Clean Machine','Photograph your clean serving area after cleanup.',null),
 (8,'Lunch Hero','Photograph a cafeteria employee proudly serving lunch.',null),
 (9,'The Admin Squad','Take a group photo of the entire school administrative staff.',null),
 (10,'Fruit Masterpiece','Create and photograph a creative, food-safe fruit arrangement.',null),
 (11,'Milk Mustache','Photograph a consenting adult posing playfully with school milk.',null),
 (12,'Behind the Scenes','Photograph your cafeteria team preparing for meal service.',null),
 (13,'BIC Bag Champions','Photograph workers preparing Breakfast in the Classroom bags. Supervisor confirms eligible schools.',array[]::bigint[]),
 (14,'Supper Spotlight','Photograph your Supper Program meals or service. Supervisor confirms eligible schools.',array[]::bigint[]),
 (15,'The Hidden SPARK','Creatively hide the letters S-P-A-R-K in a cafeteria scene and photograph them.',null);
create table october_dev.entries(id uuid primary key default gen_random_uuid(),location_id bigint not null references public.locations(id),
 quest int not null check(quest between 0 and 15), photo_path text not null, note text not null default '', consent boolean not null check(consent),
 state text not null default 'pending' check(state in ('pending','approved','rejected','replacement')), feedback text not null default '',
 revision int not null default 1, submitted_at timestamptz not null default now(), reviewed_at timestamptz, unique(location_id,quest));
create table october_dev.rounds(id int primary key check(id between 1 and 5), photo_path text, answer text not null default '', aliases text[] not null default '{}',
 pieces jsonb, unlocked int not null default 0, winner bigint references public.locations(id), solved_at timestamptz, revision int not null default 1);
insert into october_dev.rounds(id,answer) values(1,'Jack-o''-lantern'),(2,'Ursula'),(3,'Maleficent'),(4,'Wicked Witch'),(5,'Scarlet Witch');
create table october_dev.guesses(round int references october_dev.rounds(id),employee_id text,location_id bigint references public.locations(id),
 guess text not null, correct boolean not null, submitted_at timestamptz not null default clock_timestamp(),primary key(round,employee_id));
create table october_dev.votes(employee_id text primary key,location_id bigint references public.locations(id),entry uuid references october_dev.entries(id),created_at timestamptz not null default now());
create table october_dev.rewards(event text primary key,location_id bigint references public.locations(id),points int not null,
 service_date date not null default (now() at time zone 'America/Los_Angeles')::date, voided boolean not null default false,reason text not null default '');
create table october_dev.unlocks(entry uuid primary key references october_dev.entries(id),round int references october_dev.rounds(id),pieces int not null default 5);
create table october_dev.seen(employee_id text primary key,revision int not null);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('october-games-dev','october-games-dev',false,2097152,array['image/webp']);

-- This endpoint is callable only by the Preview server's service role. Public browser
-- keys cannot invoke it, read tables, or retrieve unpublished/mystery originals.
create function public.october_games_dev(p_action text,p_token text default null,p_pin text default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,october_dev,pg_temp as $$
#variable_conflict use_column
declare s public.supper_monitoring_sessions; admin boolean:=false; cfg october_dev.settings;
 e october_dev.entries; q october_dev.quests; r october_dev.rounds; lid bigint; eid text;
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
 select * into cfg from october_dev.settings where id for update;
 select participating into part from october_dev.schools where location_id=lid;
 select min(id) into current_round from october_dev.rounds where solved_at is null;
 if p_action='rewards' then return (select coalesce(jsonb_agg(jsonb_build_object('location_id',location_id,'points',points,'service_date',service_date)),'[]') from october_dev.rewards where not voided);end if;
 if p_action in ('settings','quest','review','round','champion','reward') and not admin then raise exception 'Supervisor authorization required';end if;
 if p_action in ('submit','vote','guess') and (admin or not coalesce(part,false)) then raise exception 'Participating school manager required';end if;
 if p_action='settings' then
  if (p_payload->>'revision')::int is distinct from cfg.revision then raise exception 'Settings changed. Refresh first.';end if;
  if p_payload->>'game' in ('quests','door','mystery') then
   if p_payload->>'state' not in ('active','paused','ended') then raise exception 'Invalid game state';end if;
   if p_payload->>'game'='mystery' and p_payload->>'state'='active' and exists(select 1 from october_dev.rounds where photo_path is null or pieces is null or trim(answer)='') then raise exception 'Upload all five mystery photos and answers first';end if;
   update october_dev.settings set quests_state=case when p_payload->>'game'='quests' then p_payload->>'state' else quests_state end,
    door_state=case when p_payload->>'game'='door' then p_payload->>'state' else door_state end,
    mystery_state=case when p_payload->>'game'='mystery' then p_payload->>'state' else mystery_state end where id;
  elsif p_payload ? 'schools' then
   insert into october_dev.schools select id,false from public.locations where active on conflict do nothing;
   update october_dev.schools set participating=location_id in(select value::bigint from jsonb_array_elements_text(p_payload->'schools'));
  else
   if not ((p_payload->>'submission_start')::timestamptz < (p_payload->>'submission_end')::timestamptz and
     (p_payload->>'submission_end')::timestamptz <= (p_payload->>'voting_start')::timestamptz and
     (p_payload->>'voting_start')::timestamptz < (p_payload->>'voting_end')::timestamptz) then raise exception 'Set submission dates before voting dates';end if;
   if exists(select 1 from october_dev.votes) then raise exception 'Voting has begun. Dates are locked.';end if;
   update october_dev.settings set submission_start=(p_payload->>'submission_start')::timestamptz,submission_end=(p_payload->>'submission_end')::timestamptz,
    voting_start=(p_payload->>'voting_start')::timestamptz,voting_end=(p_payload->>'voting_end')::timestamptz where id;
  end if;
  update october_dev.settings set revision=revision+1,changed_at=now() where id;
 elsif p_action='quest' then
  select * into q from october_dev.quests where id=(p_payload->>'id')::int;
  if q.id is null or q.revision is distinct from (p_payload->>'revision')::int then raise exception 'Quest changed. Refresh first.';end if;
  if length(trim(p_payload->>'name')) not between 1 and 100 or length(trim(p_payload->>'description')) not between 1 and 1000 then raise exception 'Enter a quest name and instructions';end if;
  update october_dev.quests set name=trim(p_payload->>'name'),description=trim(p_payload->>'description'),enabled=(p_payload->>'enabled')::boolean,
   eligible=case when p_payload->'eligible'='null'::jsonb then null else array(select value::bigint from jsonb_array_elements_text(p_payload->'eligible')) end,revision=revision+1 where id=q.id;
  update october_dev.settings set revision=revision+1,changed_at=now() where id;
 elsif p_action='submit' then
  n:=(p_payload->>'quest')::int;
  if n=0 then
   if cfg.door_state<>'active' or cfg.submission_start is null or now()<cfg.submission_start or now()>=cfg.submission_end then raise exception 'Door submissions are closed';end if;
  else
   select * into q from october_dev.quests where id=n and enabled and (eligible is null or lid=any(eligible));
   if cfg.quests_state<>'active' or q.id is null then raise exception 'Quest is not available for this school';end if;
   if n=3 and length(trim(p_payload->>'note'))<5 then raise exception 'Include the teacher written review';end if;
  end if;
  if coalesce((p_payload->>'consent')::boolean,false) is not true then raise exception 'Confirm permission to publish';end if;
  if p_payload->>'photo_path' is null or p_payload->>'photo_path' !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$' then raise exception 'Photo is required';end if;
  if length(coalesce(p_payload->>'note',''))>2000 then raise exception 'Keep notes under 2,000 characters';end if;
  select * into e from october_dev.entries where location_id=lid and quest=n;
  if e.id is not null and (e.state not in ('rejected','replacement') or e.revision is distinct from (p_payload->>'revision')::int) then raise exception 'Already submitted. Wait for supervisor review.';end if;
  old_photo:=e.photo_path;
  insert into october_dev.entries(location_id,quest,photo_path,note,consent) values(lid,n,p_payload->>'photo_path',coalesce(p_payload->>'note',''),true)
   on conflict(location_id,quest) do update set photo_path=excluded.photo_path,note=excluded.note,state='pending',feedback='',revision=october_dev.entries.revision+1,submitted_at=now();
 elsif p_action='review' then
  select * into e from october_dev.entries where id=(p_payload->>'id')::uuid;
  if e.id is null or e.revision is distinct from (p_payload->>'revision')::int then raise exception 'Entry changed. Refresh first.';end if;
  if p_payload->>'state' not in ('approved','rejected','replacement') then raise exception 'Invalid review';end if;
  if e.quest=0 and exists(select 1 from october_dev.votes) then raise exception 'Door entries are locked once voting begins';end if;
  if e.quest>0 and cfg.quests_state<>'active' then raise exception 'Activate Side Quests before reviewing';end if;
  if e.quest=0 and (cfg.door_state<>'active' or (cfg.voting_start is not null and now()>=cfg.voting_start)) then raise exception 'Review door entries before voting opens';end if;
  update october_dev.entries set state=p_payload->>'state',feedback=left(coalesce(p_payload->>'feedback',''),1000),revision=revision+1,reviewed_at=now() where id=e.id;
  key:='entry:'||e.id;
  if p_payload->>'state'='approved' then
   insert into october_dev.rewards(event,location_id,points) values(key,e.location_id,10) on conflict(event) do update set voided=false,reason='Reapproved';
   if e.quest>0 then
    -- Approval is retained if mysteries have not started; queued unlocks apply to round 1 on activation.
    insert into october_dev.unlocks(entry,round) values(e.id,case when cfg.mystery_state='active' then current_round end) on conflict do nothing;
    if found and cfg.mystery_state='active' and current_round is not null then update october_dev.rounds set unlocked=least(jsonb_array_length(pieces),unlocked+5) where id=current_round;end if;
   end if;
  else update october_dev.rewards set voided=true,reason='Approval withdrawn' where event=key;end if;
 elsif p_action='round' then
  select * into r from october_dev.rounds where id=(p_payload->>'id')::int;
  if r.id is null or r.revision is distinct from (p_payload->>'revision')::int then raise exception 'Round changed. Refresh first.';end if;
  if r.solved_at is not null or r.unlocked>0 or exists(select 1 from october_dev.guesses where round=r.id) then raise exception 'Started mystery rounds are locked';end if;
  if length(trim(p_payload->>'answer')) not between 1 and 120 then raise exception 'Enter the accepted answer';end if;
  if p_payload ? 'photo_path' then
   if p_payload->>'photo_path' !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$' or jsonb_array_length(p_payload->'pieces') not between 30 and 40 then raise exception 'Invalid mystery image or pieces';end if;
   old_photo:=r.photo_path;
  end if;
  update october_dev.rounds set photo_path=coalesce(p_payload->>'photo_path',photo_path),pieces=coalesce(p_payload->'pieces',pieces),answer=trim(p_payload->>'answer'),
   aliases=array(select left(value,120) from jsonb_array_elements_text(p_payload->'aliases')),revision=revision+1 where id=r.id;
 elsif p_action='vote' then
  if eid is null then raise exception 'Use your registered manager login to vote';end if;
  if cfg.door_state<>'active' or cfg.voting_start is null or now()<cfg.voting_start or now()>=cfg.voting_end then raise exception 'Voting is closed';end if;
  select * into e from october_dev.entries where id=(p_payload->>'id')::uuid and quest=0 and state='approved';
  if e.id is null or e.location_id=lid or not exists(select 1 from october_dev.schools where location_id=e.location_id and participating) then raise exception 'Choose an approved entry from another school';end if;
  if exists(select 1 from october_dev.votes where employee_id=eid) then raise exception 'Your vote is already recorded';end if;
  insert into october_dev.votes values(eid,lid,e.id,now());
 elsif p_action='guess' then
  if eid is null then raise exception 'Use your registered manager login to guess';end if;
  if cfg.mystery_state<>'active' or current_round is null or current_round is distinct from (p_payload->>'round')::int then raise exception 'That mystery is no longer active. Refresh.';end if;
  select * into r from october_dev.rounds where id=current_round;
  if r.photo_path is null then raise exception 'Waiting for the mystery photo';end if;
  text_guess:=lower(regexp_replace(trim(p_payload->>'guess'),'\s+',' ','g'));
  if text_guess is null or length(text_guess) not between 1 and 120 then raise exception 'Enter a guess (up to 120 characters)';end if;
  if exists(select 1 from october_dev.guesses where round=r.id and employee_id=eid) then raise exception 'You already guessed this mystery';end if;
  correct:=exists(select 1 from unnest(array_append(r.aliases,r.answer)) a where lower(regexp_replace(trim(a),'\s+',' ','g'))=text_guess);
  insert into october_dev.guesses values(r.id,eid,lid,text_guess,correct,clock_timestamp());
  if correct then
   update october_dev.rounds set winner=lid,solved_at=clock_timestamp(),unlocked=jsonb_array_length(pieces) where id=r.id;
   insert into october_dev.rewards(event,location_id,points) values('mystery:'||r.id,lid,25) on conflict do nothing;
  end if;
 elsif p_action='champion' then
  if cfg.voting_end is null or now()<cfg.voting_end then raise exception 'Wait until voting ends';end if;
  target:=(p_payload->>'location_id')::bigint;
  select max(total) into n from(select count(v.employee_id)::int total from october_dev.entries e left join october_dev.votes v on v.entry=e.id where e.quest=0 and e.state='approved' group by e.id) z;
  if not exists(select 1 from october_dev.entries e left join october_dev.votes v on v.entry=e.id where e.quest=0 and e.state='approved' and e.location_id=target group by e.id having count(v.employee_id)=n) then raise exception 'Choose a school tied for the highest vote total';end if;
  if cfg.champion is not null and cfg.champion<>target then raise exception 'Winner already confirmed';end if;
  update october_dev.settings set champion=target where id;
  insert into october_dev.rewards(event,location_id,points) values('door:champion',target,20) on conflict do nothing;
 elsif p_action='reward' then
  if length(trim(p_payload->>'reason'))<5 then raise exception 'Explain the correction';end if;
  update october_dev.rewards set voided=(p_payload->>'voided')::boolean,reason=left(p_payload->>'reason',1000) where event=p_payload->>'event';
 elsif p_action='seen' then
  if eid is not null then insert into october_dev.seen values(eid,cfg.revision) on conflict(employee_id) do update set revision=excluded.revision;end if;
 elsif p_action not in ('list','authorize') then raise exception 'Unknown Games action';
 end if;
 if p_action='authorize' then return jsonb_build_object('admin',admin,'location_id',lid);end if;
 select * into cfg from october_dev.settings where id;
 select min(id) into current_round from october_dev.rounds where solved_at is null;
 if cfg.mystery_state='active' and current_round is not null then
  select count(*) into n from october_dev.unlocks where round is null;
  if n>0 then update october_dev.rounds set unlocked=least(jsonb_array_length(pieces),unlocked+5*n) where id=current_round;update october_dev.unlocks set round=current_round where round is null;end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'school_name',l.school_name,'participating',coalesce(a.participating,false)) order by l.school_name),'[]') into schools from public.locations l left join october_dev.schools a on a.location_id=l.id where l.active and (admin or a.participating);
 select coalesce(jsonb_agg(to_jsonb(q) order by q.id),'[]') into quests from october_dev.quests q where admin or (q.enabled and (q.eligible is null or lid=any(q.eligible)));
 select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('votes',case when cfg.voting_end is not null and now()>=cfg.voting_end then (select count(*) from october_dev.votes v where v.entry=e.id) else null end) order by e.reviewed_at desc nulls last),'[]') into entries from october_dev.entries e where admin or e.location_id=lid or e.state='approved';
 select coalesce(jsonb_agg((case when admin then to_jsonb(r) else to_jsonb(r)-'aliases'-'answer'-'pieces'-'photo_path' end)||jsonb_build_object(
  'piece_count',coalesce(jsonb_array_length(r.pieces),0),'guessed',exists(select 1 from october_dev.guesses g where g.round=r.id and g.employee_id=eid),
  'answer',case when admin or r.solved_at is not null then r.answer else null end,
  'photo_path',case when admin or r.solved_at is not null or r.id=current_round then r.photo_path else null end,
  'pieces',case when admin or r.id=current_round then r.pieces else null end) order by r.id),'[]') into rounds from october_dev.rounds r;
 result:=jsonb_build_object('admin',admin,'location_id',lid,'identified',eid is not null,'participating',coalesce(part,false),'settings',to_jsonb(cfg),'schools',schools,'quests',quests,'entries',entries,'rounds',rounds,
  'current_round',current_round,'vote',(select entry from october_dev.votes where employee_id=eid),'new_challenge',eid is not null and (cfg.quests_state='active' or cfg.door_state='active' or cfg.mystery_state='active') and coalesce((select revision from october_dev.seen where employee_id=eid),0)<cfg.revision,
  'rewards',(select coalesce(jsonb_agg(to_jsonb(w) order by service_date desc),'[]') from october_dev.rewards w),
  'guesses',case when admin then (select coalesce(jsonb_agg(to_jsonb(g) order by submitted_at desc),'[]') from october_dev.guesses g) else '[]'::jsonb end,
  'unlock_events',case when admin then (select coalesce(jsonb_agg(to_jsonb(u)),'[]') from october_dev.unlocks u) else '[]'::jsonb end,
  'old_photo',old_photo,'guess_correct',correct,'server_time',now());
 return result;
end $$;
revoke all on all tables in schema october_dev from public,anon,authenticated;
revoke all on function public.october_games_dev(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.october_games_dev(text,text,text,jsonb) to service_role;
commit;
