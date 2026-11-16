begin;
-- A tab left open on Halloween must refresh before acting on a later contest.
do $migration$
declare env text; definition text; previous text; anchor text;
begin
 foreach env in array array['dev','live'] loop
  select replace(pg_get_functiondef(to_regprocedure('public.october_games_'||env||'(text,text,text,jsonb)')),E'\r\n',E'\n') into definition;
  anchor:='select * into cfg from october_'||env||'.settings where id;';
  previous:=definition;
  definition:=replace(definition,anchor,anchor||$patch$
  if cfg.door_contest>1 and (p_action in ('vote','champion') or (p_action='submit' and (p_payload->>'quest')::int=0))
   and (p_payload->>'door_contest')::integer is distinct from cfg.door_contest then
   raise exception 'The decoration contest changed. Refresh before submitting or voting.';
  end if;
$patch$);
  if previous=definition then raise exception 'Missing current contest guard anchor: %',env;end if;
  execute definition;
 end loop;
end $migration$;
commit;
