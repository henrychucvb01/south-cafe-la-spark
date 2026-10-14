BEGIN;
SET LOCAL lock_timeout='5s';
DO $install$
DECLARE ns text; definition text; original text; name text;
BEGIN
FOREACH ns IN ARRAY ARRAY['october_dev','october_live'] LOOP
 EXECUTE format('ALTER TABLE %I.rounds ADD COLUMN question text NOT NULL DEFAULT ''Who is this?'' CHECK(length(trim(question)) BETWEEN 1 AND 240)',ns);
 EXECUTE format('ALTER TABLE %I.mystery_drafts ADD COLUMN question text NOT NULL DEFAULT ''Who is this?'' CHECK(length(trim(question)) BETWEEN 1 AND 240)',ns);
 FOREACH name IN ARRAY ARRAY['selection_legacy','lock_monthly_mystery','credit_game_engine','game_engine'] LOOP
  SELECT pg_get_functiondef(to_regprocedure(ns||'.'||name||CASE WHEN name='lock_monthly_mystery' THEN '()' ELSE '(text,text,text,jsonb)' END)) INTO definition;original:=definition;
  EXECUTE format('INSERT INTO %I.monthly_engine_backup(signature,definition) VALUES($1,$2)',ns) USING 'question:'||name,definition;
  IF name='selection_legacy' THEN
   definition:=replace(definition,'SET photo_path=coalesce(p_payload->>''photo_path'',photo_path),answer=', 'SET question=coalesce(nullif(trim(p_payload->>''question''),''''),''Who is this?''),photo_path=coalesce(p_payload->>''photo_path'',photo_path),answer=');
   definition:=replace(definition,'reward_points,collection_id,position)', 'reward_points,collection_id,position,question)');
   definition:=replace(definition,'reward_points,collection_id,position,revealed_indices)', 'reward_points,collection_id,position,question,revealed_indices)');
   definition:=replace(definition,'row.reward_points,c.id,row.position)', 'row.reward_points,c.id,row.position,row.question)');
   definition:=replace(definition,'row.reward_points,c.id,row.position,''{}'')', 'row.reward_points,c.id,row.position,row.question,''{}'')');
  ELSIF name='lock_monthly_mystery' THEN
   definition:=replace(definition,'NEW.pieces IS DISTINCT FROM OLD.pieces', 'NEW.question IS DISTINCT FROM OLD.question OR NEW.pieces IS DISTINCT FROM OLD.pieces');
  ELSE
   -- Compare whitespace-insensitively, retaining submitted text and request retry behavior.
   definition:=replace(definition,$old$lower(regexp_replace(trim(a),'\s+',' ','g'))=text_guess$old$,$new$lower(regexp_replace(a,'[[:space:]]+','','g'))=lower(regexp_replace(text_guess,'[[:space:]]+','','g'))$new$);
  END IF;
  IF definition IS NULL OR definition=original THEN RAISE EXCEPTION 'Unexpected mystery function: %.%',ns,name;END IF;
  EXECUTE definition;
 END LOOP;
END LOOP;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
