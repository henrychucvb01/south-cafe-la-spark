begin;
-- Keep original rows, UUIDs, paths, rewards and ledger records. Only contest
-- membership is backfilled; the completed contest remains the current contest.
do $migration$
declare env text; ns text; definition text; old text; pair text[]; signature text; preserved jsonb; verified jsonb;
begin
 foreach env in array array['dev','live'] loop
 ns:='october_'||env;
 execute format('lock table %I.settings,%I.entries,%I.votes,%I.rewards in share row exclusive mode',ns,ns,ns,ns);
 execute format('select jsonb_build_object(''settings'',(select to_jsonb(s)-''door_contest'' from %1$I.settings s),''entries'',(select coalesce(jsonb_agg(to_jsonb(e)-''door_contest'' order by id),''[]'') from %1$I.entries e),''votes'',(select coalesce(jsonb_agg(to_jsonb(v)-''door_contest'' order by employee_id),''[]'') from %1$I.votes v),''rewards'',(select coalesce(jsonb_agg(to_jsonb(r) order by event),''[]'') from %1$I.rewards r))',ns) into preserved;
 execute replace($ddl$
  alter table @s@.settings add column door_contest integer not null default 1;
  alter table @s@.entries add column door_contest integer not null default 0;
  update @s@.entries set door_contest=1 where quest=0;
  alter table @s@.entries drop constraint entries_location_id_quest_key;
  alter table @s@.entries add constraint entries_location_quest_contest_key unique(location_id,quest,door_contest);
  alter table @s@.entries add constraint entries_door_membership check((quest=0 and door_contest>0) or (quest>0 and door_contest=0));
  alter table @s@.votes add column door_contest integer not null default 1;
  alter table @s@.votes drop constraint votes_pkey;
  alter table @s@.votes add primary key(employee_id,door_contest);
  create table @s@.door_contests(id integer primary key,settings jsonb not null,archived_at timestamptz not null default now());
  create table @s@.door_next(id boolean primary key default true check(id),settings jsonb not null,scheduled boolean not null default false,updated_at timestamptz not null default now());
  alter table @s@.door_contests enable row level security;
  alter table @s@.door_next enable row level security;
  revoke all on @s@.door_contests,@s@.door_next from public,anon,authenticated;
 $ddl$,'@s@',ns);
 -- Patch the original engine, leaving every unrelated layer intact.
 signature:=ns||'.game_engine(text,text,text,jsonb)';
 select replace(pg_get_functiondef(to_regprocedure(signature)),E'\r\n',E'\n') into definition;
 if definition is null then raise exception 'Missing game engine: %',ns;end if;
 foreach pair slice 1 in array array[
  ['where location_id=lid and quest=n;','where location_id=lid and quest=n and door_contest=case when n=0 then cfg.door_contest else 0 end;'],
  ['entries(location_id,quest,photo_path,note,consent) values(lid,n,','entries(location_id,quest,door_contest,photo_path,note,consent) values(lid,n,case when n=0 then cfg.door_contest else 0 end,'],
  ['on conflict(location_id,quest) do update','on conflict(location_id,quest,door_contest) do update'],
  ['where id=(p_payload->>''id'')::uuid and quest=0 and state=''approved''','where id=(p_payload->>''id'')::uuid and quest=0 and door_contest=cfg.door_contest and state=''approved'''],
  ['.votes where employee_id=eid)','.votes where employee_id=eid and door_contest=cfg.door_contest)'],
  ['.votes values(eid,lid,e.id,now());','.votes(employee_id,location_id,entry,created_at,door_contest) values(eid,lid,e.id,now(),cfg.door_contest);'],
  ['where e.quest=0 and e.state=''approved''','where e.quest=0 and e.door_contest=cfg.door_contest and e.state=''approved'''],
  ['values(''door:champion'',target,cfg.door_champion_points)','values(case when cfg.door_contest=1 then ''door:champion'' else ''door:contest:''||cfg.door_contest||'':champion'' end,target,cfg.door_champion_points)'],
  ['.entries e where admin or e.location_id=lid or e.state=''approved'';','.entries e where (e.quest<>0 or e.door_contest=cfg.door_contest) and (admin or e.location_id=lid or e.state=''approved'');'],
  ['cfg.champion is not null or cfg.submission_end is null','cfg.champion is not null or cfg.submission_start is null or now()<cfg.submission_start or cfg.submission_end is null'],
  ['cfg.champion is not null or cfg.voting_end is null','cfg.champion is not null or cfg.voting_start is null or now()<cfg.voting_start or cfg.voting_end is null']
 ] loop
  old:=definition;definition:=replace(definition,pair[1],pair[2]);
  if old=definition then raise exception 'Missing door engine anchor: % / %',ns,pair[1];end if;
 end loop;
 -- Do not let an old settings client bypass the archived winner lock.
 definition:=replace(definition,'if p_payload->>''game'' in (''quests'',''door'',''mystery'') then',
 'if cfg.champion is not null and (p_payload->>''game''=''door'' or p_payload ? ''submission_end'' or p_payload ? ''door_participation_points'') then raise exception ''Completed contest is preserved. Use Next decoration contest.'';end if;'||chr(10)||'  if p_payload->>''game'' in (''quests'',''door'',''mystery'') then');
 -- Completed settings are wholly read-only, including title and reward amounts.
 definition:=replace(definition,'if p_action=''door_settings'' then','if p_action=''door_settings'' then'||chr(10)||'  if cfg.champion is not null then raise exception ''Completed contest is preserved. Use Next decoration contest.'';end if;');
 execute definition;
 execute replace($ddl$
 create function @s@.door_activate_next(p_force boolean default false) returns boolean language plpgsql security definer set search_path=pg_catalog as $body$
 declare cfg @s@.settings; nxt @s@.door_next; v jsonb;
 begin
  select * into cfg from @s@.settings where id for update;
  select * into nxt from @s@.door_next where id for update;
  if nxt.id is null then return false;end if;v:=nxt.settings;
  if not p_force and (not nxt.scheduled or (v->>'submission_start')::timestamptz>now()) then return false;end if;
  -- Never silently discard an unfinished competition or start after its deadline.
  if cfg.champion is null and exists(select 1 from @s@.entries where quest=0 and door_contest=cfg.door_contest) then
   if p_force then raise exception 'Confirm the current contest winner before starting the next contest';end if;return false;
  end if;
  if (v->>'submission_end')::timestamptz<=now() then
   if p_force then raise exception 'Update the next contest closing dates before starting';end if;return false;
  end if;
  insert into @s@.door_contests(id,settings) values(cfg.door_contest,to_jsonb(cfg)) on conflict do nothing;
  update @s@.settings set door_contest=cfg.door_contest+1,champion=null,door_state='active',
   door_title=v->>'door_title',door_theme=v->>'door_theme',door_border_style=v->>'door_border_style',
   door_border_color=v->>'door_border_color',door_background=v->>'door_background',
   door_participation_points=(v->>'door_participation_points')::int,door_champion_points=(v->>'door_champion_points')::int,
   submission_start=case when p_force then now() else (v->>'submission_start')::timestamptz end,
   voting_start=case when p_force then now() else (v->>'submission_start')::timestamptz end,
   submission_end=(v->>'submission_end')::timestamptz,voting_end=(v->>'voting_end')::timestamptz,
   revision=revision+1,changed_at=now() where id;
  delete from @s@.door_next where id;
  return true;
 end $body$;
 revoke all on function @s@.door_activate_next(boolean) from public,anon,authenticated;
 $ddl$,'@s@',ns);
 -- Keep existing authorization, photo rotation, Side Quests and mysteries intact.
 execute format('alter function public.october_games_%s(text,text,text,jsonb) set schema %I',env,ns);
 execute format('alter function %I.october_games_%s(text,text,text,jsonb) rename to door_previous_api',ns,env);
 execute format('revoke all on function %I.door_previous_api(text,text,text,jsonb) from public,anon,authenticated,service_role',ns);
 execute replace(replace($ddl$
 create function public.october_games_@env@(p_action text,p_token text default null,p_pin text default null,p_payload jsonb default '{}') returns jsonb
 language plpgsql security definer set search_path=pg_catalog as $body$
 declare actor jsonb; result jsonb; cfg @s@.settings; v jsonb; s timestamptz; e timestamptz; c timestamptz; h @s@.door_contests;
 begin
  actor:=@s@.door_previous_api('authorize',p_token,p_pin,'{}');
  perform 1 from @s@.settings where id for update;
  -- Editing a plan does not unexpectedly activate the stale version first.
  if p_action not in ('door_next_save','door_next_cancel','door_next_start') then perform @s@.door_activate_next(false);end if;
  select * into cfg from @s@.settings where id;
  if p_action in ('door_next_save','door_next_cancel','door_next_start') then
   if (actor->>'admin')::boolean is not true then raise exception 'Supervisor authorization required';end if;
   if (p_payload->>'revision')::integer is distinct from cfg.revision then raise exception 'Settings changed. Refresh first.';end if;
   if p_action='door_next_save' then
    v:=p_payload;
    if coalesce(length(trim(v->>'door_title')),0) not between 1 and 100
     or coalesce(v->>'door_theme','') not in ('halloween','autumn','winter','valentine','spring','custom')
     or coalesce(v->>'door_border_style','') not in ('double','solid','dashed','dotted')
     or coalesce(v->>'door_border_color','') !~ '^#[0-9a-fA-F]{6}$'
     or coalesce(v->>'door_background','') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Choose a contest name, theme, border and colors';end if;
    if coalesce(v->>'door_participation_points','') !~ '^[0-9]{1,4}$' or coalesce(v->>'door_champion_points','') !~ '^[0-9]{1,4}$'
     or (v->>'door_participation_points')::integer not between 0 and 1000 or (v->>'door_champion_points')::integer not between 0 and 1000 then raise exception 'Enter 0 to 1000 whole SPARK Points';end if;
    -- Local inputs always use Los Angeles time, independent of the device timezone.
    if coalesce(v->>'opens_local','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
     or coalesce(v->>'submission_local','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
     or coalesce(v->>'voting_local','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'Enter the opening date and both closing dates';end if;
    s:=(v->>'opens_local')::timestamp at time zone 'America/Los_Angeles';
    e:=(v->>'submission_local')::timestamp at time zone 'America/Los_Angeles';
    c:=(v->>'voting_local')::timestamp at time zone 'America/Los_Angeles';
    if not isfinite(s) or not isfinite(e) or not isfinite(c) or s>=e or e>c or e<=now() then raise exception 'Opening must precede submissions close; voting must close at or after submissions';end if;
    if coalesce((v->>'scheduled')::boolean,false) and s<=now() then raise exception 'Choose a future opening to schedule, or save a draft and start now';end if;
    if cfg.champion is null and exists(select 1 from @s@.entries where quest=0 and door_contest=cfg.door_contest) and s<cfg.voting_end then raise exception 'The next contest must open after current voting closes';end if;
    v:=jsonb_build_object('door_title',trim(v->>'door_title'),'door_theme',v->>'door_theme','door_border_style',v->>'door_border_style',
     'door_border_color',v->>'door_border_color','door_background',v->>'door_background','door_participation_points',(v->>'door_participation_points')::int,
     'door_champion_points',(v->>'door_champion_points')::int,'submission_start',s,'submission_end',e,'voting_start',s,'voting_end',c);
    insert into @s@.door_next(settings,scheduled) values(v,coalesce((p_payload->>'scheduled')::boolean,false))
     on conflict(id) do update set settings=excluded.settings,scheduled=excluded.scheduled,updated_at=now();
   elsif p_action='door_next_cancel' then
    if coalesce((p_payload->>'confirmed')::boolean,false) is not true then raise exception 'Confirm removing the next contest plan';end if;
    delete from @s@.door_next where id;
   else
    if coalesce((p_payload->>'confirmed')::boolean,false) is not true then raise exception 'Confirm starting the next contest';end if;
    if not @s@.door_activate_next(true) then raise exception 'Save the next contest first';end if;
   end if;
   update @s@.settings set revision=revision+1,changed_at=now() where id;
   result:=@s@.door_previous_api('list',p_token,p_pin,'{}');
  else
   if p_action in ('review','photo_rotate') and exists(select 1 from @s@.entries where id=(p_payload->>'id')::uuid and quest=0 and door_contest<>cfg.door_contest) then raise exception 'Past contest photos and results are read-only';end if;
   if p_action='door_history' then
    select * into h from @s@.door_contests where id=(p_payload->>'contest')::int;
    if h.id is null then raise exception 'Past contest not found';end if;
    result:=jsonb_build_object('door_history_detail',jsonb_build_object('settings',h.settings,'entries',
     (select coalesce(jsonb_agg((case when (actor->>'admin')::boolean then to_jsonb(en) else to_jsonb(en)-'feedback' end)||jsonb_build_object(
      'school_name',(select school_name from public.locations where id=en.location_id),'votes',(select count(*) from @s@.votes where entry=en.id),
      'awarded_points',coalesce((select points from @s@.rewards where event='entry:'||en.id and not voided),0))),'[]')
      from @s@.entries en where quest=0 and door_contest=h.id and (state='approved' and consent or (actor->>'admin')::boolean or location_id=(actor->>'location_id')::bigint))));
   else result:=@s@.door_previous_api(p_action,p_token,p_pin,p_payload);end if;
  end if;
  if p_action in ('authorize','rewards','showdown_poll','door_history') then return result;end if;
  -- History summaries are tiny; private photographs are loaded only on demand.
  result:=result||jsonb_build_object('door_history',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',settings->>'door_title','champion',settings->'champion','voting_end',settings->>'voting_end') order by id desc),'[]') from @s@.door_contests));
  if (actor->>'admin')::boolean then result:=result||jsonb_build_object('door_next',(select to_jsonb(n) from @s@.door_next n where id));end if;
  return result;
 end $body$;
 revoke all on function public.october_games_@env@(text,text,text,jsonb) from public,anon,authenticated;
 grant execute on function public.october_games_@env@(text,text,text,jsonb) to service_role;
 $ddl$,'@s@',ns),'@env@',env);
 execute format('select jsonb_build_object(''settings'',(select to_jsonb(s)-''door_contest'' from %1$I.settings s),''entries'',(select coalesce(jsonb_agg(to_jsonb(e)-''door_contest'' order by id),''[]'') from %1$I.entries e),''votes'',(select coalesce(jsonb_agg(to_jsonb(v)-''door_contest'' order by employee_id),''[]'') from %1$I.votes v),''rewards'',(select coalesce(jsonb_agg(to_jsonb(r) order by event),''[]'') from %1$I.rewards r))',ns) into verified;
 if verified is distinct from preserved then raise exception 'Existing contest evidence changed during migration: %',ns;end if;
 end loop;
end $migration$;
-- CRON-BEGIN
select cron.schedule('spark-door-contest-schedule','* * * * *','select october_live.door_activate_next(false); select october_dev.door_activate_next(false);');
-- CRON-END
commit;
