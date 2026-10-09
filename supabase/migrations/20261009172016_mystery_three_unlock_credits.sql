BEGIN;
SET LOCAL lock_timeout='5s';
DO $$
DECLARE env text; ns text; definition text; old_insert text; new_insert text; old_pending text;
BEGIN
 FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
  ns:='october_'||env;
  -- Existing approvals retain their five credits, including approvals queued while paused.
  EXECUTE format('ALTER TABLE %I.unlocks ALTER COLUMN pieces SET DEFAULT 3',ns);
  SELECT pg_get_functiondef(format('%I.game_engine(text,text,text,jsonb)',ns)::regprocedure) INTO definition;
  old_insert:=format('insert into %I.unlocks(entry,round) values(e.id,case when cfg.mystery_state=''active'' then current_round end) on conflict do nothing;',ns);
  new_insert:=replace(old_insert,'on conflict do nothing;','on conflict do nothing returning pieces into n;');
  old_pending:=format('select count(*) into n from %I.unlocks u join %I.entries entry on entry.id=u.entry where u.round is null and entry.state=''approved'';',ns,ns);
  IF strpos(definition,old_insert)=0 OR strpos(definition,old_pending)=0 OR strpos(definition,'unlock_credits+5*n')=0 THEN RAISE EXCEPTION 'Unexpected game engine in %; no changes applied',ns;END IF;
  definition:=replace(definition,old_insert,new_insert);
  definition:=replace(definition,old_pending,replace(old_pending,'count(*)','coalesce(sum(u.pieces),0)'));
  definition:=replace(replace(definition,'unlock_credits+5*n','unlock_credits+n'),'unlock_credits+5','unlock_credits+n');
  EXECUTE definition;
 END LOOP;
END$$;
COMMIT;
