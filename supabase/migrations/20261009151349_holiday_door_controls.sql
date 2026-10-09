begin;
do $migration$
declare env text; definition text; old text; replacement text; pair text[];
begin
 foreach env in array array['dev','live'] loop
  execute format($ddl$alter table october_%s.settings
   add column door_title text not null default 'Halloween Door Decorating Contest' check(length(trim(door_title)) between 1 and 100),
   add column door_theme text not null default 'halloween' check(door_theme in ('halloween','autumn','winter','valentine','spring','custom')),
   add column door_border_style text not null default 'double' check(door_border_style in ('double','solid','dashed','dotted')),
   add column door_border_color text not null default '#ffaf46' check(door_border_color ~ '^#[0-9a-fA-F]{6}$'),
   add column door_background text not null default '#472713' check(door_background ~ '^#[0-9a-fA-F]{6}$')$ddl$,env);
  select replace(pg_get_functiondef(format('public.october_games_%s(text,text,text,jsonb)',env)::regprocedure),E'\r\n',E'\n') into definition;
  old:=definition;
  definition:=replace(definition,'''settings'',''quest'',''quest_create''','''door_settings'',''settings'',''quest'',''quest_create''');
  if old=definition then raise exception 'Missing authorization anchor: %',env;end if;
  replacement:=format($patch$if p_action='door_settings' then
  if (p_payload->>'revision')::int is distinct from cfg.revision then raise exception 'Settings changed. Refresh first.';end if;
  if coalesce(length(trim(p_payload->>'door_title')),0) not between 1 and 100
   or coalesce(p_payload->>'door_theme','') not in ('halloween','autumn','winter','valentine','spring','custom')
   or coalesce(p_payload->>'door_border_style','') not in ('double','solid','dashed','dotted')
   or coalesce(p_payload->>'door_border_color','') !~ '^#[0-9a-fA-F]{6}$'
   or coalesce(p_payload->>'door_background','') !~ '^#[0-9a-fA-F]{6}$'
   or coalesce(p_payload->>'door_state','') not in ('active','paused','ended') then raise exception 'Choose a contest name, theme, border and colors';end if;
  if coalesce(p_payload->>'door_participation_points','') !~ '^[0-9]{1,4}$'
   or coalesce(p_payload->>'door_champion_points','') !~ '^[0-9]{1,4}$'
   or (p_payload->>'door_participation_points')::int not between 0 and 1000
   or (p_payload->>'door_champion_points')::int not between 0 and 1000 then raise exception 'Enter 0 to 1000 whole SPARK Points';end if;
  if nullif(p_payload->>'submission_end','') is null or nullif(p_payload->>'voting_end','') is null then raise exception 'Enter both closing dates';end if;
  if not isfinite((p_payload->>'submission_end')::timestamptz) or not isfinite((p_payload->>'voting_end')::timestamptz)
   or (p_payload->>'submission_end')::timestamptz > (p_payload->>'voting_end')::timestamptz then raise exception 'Voting must close at or after submissions close';end if;
  if cfg.champion is not null and ((p_payload->>'submission_end')::timestamptz is distinct from cfg.submission_end or (p_payload->>'voting_end')::timestamptz is distinct from cfg.voting_end or p_payload->>'door_state'='active') then raise exception 'This contest has a confirmed champion. Its dates and results are preserved.';end if;
  update october_%s.settings set door_title=trim(p_payload->>'door_title'),door_theme=p_payload->>'door_theme',
   door_border_style=p_payload->>'door_border_style',door_border_color=p_payload->>'door_border_color',door_background=p_payload->>'door_background',
   door_state=p_payload->>'door_state',door_participation_points=(p_payload->>'door_participation_points')::int,door_champion_points=(p_payload->>'door_champion_points')::int,
   submission_start=least(coalesce(submission_start,now()),now()),voting_start=least(coalesce(voting_start,now()),now()),
   submission_end=(p_payload->>'submission_end')::timestamptz,voting_end=(p_payload->>'voting_end')::timestamptz,revision=revision+1,changed_at=now() where id;
 elsif p_action='settings' then$patch$,env);
  old:=definition;definition:=replace(definition,'if p_action=''settings'' then',replacement);
  if old=definition then raise exception 'Missing settings anchor: %',env;end if;
  -- Voting and submissions overlap. Only the specific voted entry is protected from review changes.
  foreach pair slice 1 in array array[
   ['cfg.submission_start is null or now()<cfg.submission_start or now()>=cfg.submission_end','cfg.champion is not null or cfg.submission_end is null or now()>=cfg.submission_end'],
   ['cfg.voting_start is null or now()<cfg.voting_start or now()>=cfg.voting_end','cfg.champion is not null or cfg.voting_end is null or now()>=cfg.voting_end'],
   [format('if e.quest=0 and exists(select 1 from october_%s.votes) then raise exception ''Door entries are locked once voting begins'';',env),format('if e.quest=0 and exists(select 1 from october_%s.votes where entry=e.id) then raise exception ''This door entry has votes and is locked'';',env)],
   ['(cfg.voting_start is not null and now()>=cfg.voting_start)','(cfg.voting_end is null or now()>=cfg.voting_end or cfg.champion is not null)'],
   ['Review door entries before voting opens','Review door entries before voting closes']
  ] loop
   old:=definition;definition:=replace(definition,pair[1],pair[2]);
   if old=definition then raise exception 'Missing contest rule anchor: %',pair[1];end if;
  end loop;
  execute definition;
 end loop;
end $migration$;
commit;
