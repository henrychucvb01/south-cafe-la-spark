begin;
-- Additive settings; existing awards and uploaded photos remain unchanged.
alter table october_dev.settings
 add column door_participation_points int not null default 10 check(door_participation_points between 0 and 1000),
 add column door_champion_points int not null default 20 check(door_champion_points between 0 and 1000);
alter table october_live.settings
 add column door_participation_points int not null default 10 check(door_participation_points between 0 and 1000),
 add column door_champion_points int not null default 20 check(door_champion_points between 0 and 1000);

-- Patch both RPCs in place, retaining their current authorization and launch logic.
do $migration$
declare env text; definition text; previous text; needle text; replacement text;
begin
 foreach env in array array['dev','live'] loop
  select pg_get_functiondef(format('public.october_games_%s(text,text,text,jsonb)',env)::regprocedure) into definition;
  definition:=replace(definition,E'\r\n',E'\n');
  needle := '  else
   if not ((p_payload->>''submission_start'')::timestamptz';
  replacement := format($patch$  elsif p_payload ? 'door_participation_points' or p_payload ? 'door_champion_points' then
   if coalesce(p_payload->>'door_participation_points','') !~ '^[0-9]{1,4}$'
    or coalesce(p_payload->>'door_champion_points','') !~ '^[0-9]{1,4}$'
    or (p_payload->>'door_participation_points')::int not between 0 and 1000
    or (p_payload->>'door_champion_points')::int not between 0 and 1000 then
    raise exception 'Enter 0 to 1000 whole SPARK Points for both rewards';
   end if;
   update october_%s.settings set door_participation_points=(p_payload->>'door_participation_points')::int,
    door_champion_points=(p_payload->>'door_champion_points')::int where id;
  else
   if not (p_payload ?& array['submission_start','submission_end','voting_start','voting_end'])
    or nullif(p_payload->>'submission_start','') is null or nullif(p_payload->>'submission_end','') is null
    or nullif(p_payload->>'voting_start','') is null or nullif(p_payload->>'voting_end','') is null then
    raise exception 'Enter all four submission and voting dates';
   end if;
   if not ((p_payload->>'submission_start')::timestamptz$patch$,env);
  previous:=definition; definition:=replace(definition,needle,replacement);
  if definition=previous then raise exception 'Unexpected October settings function: %',env;end if;
  previous:=definition; definition:=replace(definition,'case when e.quest=0 then 10 else','case when e.quest=0 then cfg.door_participation_points else');
  if definition=previous then raise exception 'Unexpected October participation function: %',env;end if;
  previous:=definition; definition:=replace(definition,'''door:champion'',target,20','''door:champion'',target,cfg.door_champion_points');
  if definition=previous then raise exception 'Unexpected October champion function: %',env;end if;
  execute definition;
 end loop;
end $migration$;
commit;
