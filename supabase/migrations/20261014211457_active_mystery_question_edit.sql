BEGIN;
SET LOCAL lock_timeout='5s';
DO $$DECLARE ns text; definition text; original text;BEGIN
FOREACH ns IN ARRAY ARRAY['october_dev','october_live'] LOOP
SELECT pg_get_functiondef(to_regprocedure(ns||'.selection_legacy(text,text,text,jsonb)')) INTO definition;original:=definition;
EXECUTE format('INSERT INTO %I.monthly_engine_backup VALUES($1,$2)',ns) USING 'question-edit:selection_legacy',original;
definition:=replace(definition,'''collection_move'',''collection_append''','''collection_move'',''collection_append'',''collection_question''');
definition:=replace(definition,'ELSIF p_action=''collection_append'' THEN',replace($edit$
ELSIF p_action='collection_question' THEN
 SELECT revision INTO next_id FROM @s@.rounds WHERE id=(p_payload->>'id')::int AND collection_id=c.id AND solved_at IS NULL FOR UPDATE;
 IF next_id IS NULL OR next_id IS DISTINCT FROM (p_payload->>'revision')::int THEN RAISE EXCEPTION 'Mystery changed or already solved. Refresh first.';END IF;
 UPDATE @s@.rounds SET question=coalesce(nullif(trim(p_payload->>'question'),''),'Who is this?'),revision=revision+1 WHERE id=(p_payload->>'id')::int;
 UPDATE @s@.mystery_collections SET revision=revision+1 WHERE id=c.id;
ELSIF p_action='collection_append' THEN
$edit$,'@s@',ns));
IF definition=original THEN RAISE EXCEPTION 'Unexpected collection engine';END IF;EXECUTE definition;
SELECT pg_get_functiondef(to_regprocedure(ns||'.lock_monthly_mystery()')) INTO definition;original:=definition;
EXECUTE format('INSERT INTO %I.monthly_engine_backup VALUES($1,$2)',ns) USING 'question-edit:lock_monthly_mystery',original;
definition:=replace(definition,'NEW.question IS DISTINCT FROM OLD.question OR ','');
IF definition=original THEN RAISE EXCEPTION 'Unexpected question lock';END IF;EXECUTE definition;
END LOOP;END$$;
NOTIFY pgrst,'reload schema';
COMMIT;
