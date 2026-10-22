begin;
set local lock_timeout='5s';
-- Rotate only pending photos; approval/reward logic remains in the existing engine.
do $migration$
declare ns text;definition text;branch text;anchor constant text:=' IF p_action=''showdown_poll'' THEN';
begin
 foreach ns in array array['october_dev','october_live'] loop
  execute format('create table %I.photo_rotation_audit(id bigint generated always as identity primary key,entry uuid not null references %I.entries(id),old_photo text not null,new_photo text not null,angle integer not null check(angle in(90,180,270)),created_at timestamptz not null default clock_timestamp())',ns,ns);
  execute format('alter table %I.photo_rotation_audit enable row level security',ns);
  execute format('revoke all on %I.photo_rotation_audit from public,anon,authenticated',ns);
  execute format('revoke all on sequence %I.photo_rotation_audit_id_seq from public,anon,authenticated',ns);
  definition:=pg_get_functiondef(format('public.%I(text,text,text,jsonb)',replace(ns,'october_','october_games_'))::regprocedure);
  -- Public wrappers are october_games_dev / october_games_live.
  branch:=format($branch$
 IF p_action='photo_rotate' THEN
  IF NOT admin THEN RAISE EXCEPTION 'Supervisor authorization required';END IF;
  IF (p_payload->>'angle')::integer NOT IN(90,180,270) OR p_payload->>'angle' IS NULL THEN RAISE EXCEPTION 'Choose a quarter-turn rotation';END IF;
  IF coalesce(p_payload->>'photo_path','') !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$' THEN RAISE EXCEPTION 'A rotated photo is required';END IF;
  PERFORM 1 FROM %1$I.entries e WHERE e.id=(p_payload->>'id')::uuid FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM %1$I.entries e WHERE e.id=(p_payload->>'id')::uuid AND e.state='pending' AND e.revision=(p_payload->>'revision')::integer AND e.photo_path=p_payload->>'expected_photo_path') THEN RAISE EXCEPTION 'Submission changed. Refresh before rotating';END IF;
  INSERT INTO %1$I.photo_rotation_audit(entry,old_photo,new_photo,angle) VALUES((p_payload->>'id')::uuid,p_payload->>'expected_photo_path',p_payload->>'photo_path',(p_payload->>'angle')::integer);
  UPDATE %1$I.entries SET photo_path=p_payload->>'photo_path',revision=revision+1 WHERE id=(p_payload->>'id')::uuid;
  p_action:='list';
 END IF;
$branch$,ns);
  if position(anchor in definition)=0 then raise exception 'Photo rotation insertion point missing in %',ns;end if;
  definition:=replace(definition,anchor,branch||anchor);
  execute definition;
 end loop;
end $migration$;
notify pgrst,'reload schema';
commit;
