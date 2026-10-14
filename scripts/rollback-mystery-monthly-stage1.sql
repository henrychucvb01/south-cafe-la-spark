-- Emergency Stage 1 application rollback only. Run after restoring the previous application.
-- Keeps collections and drafts for recovery. Refuses if any new collection has gone live.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$DECLARE ns text; saved record; BEGIN
 FOREACH ns IN ARRAY ARRAY['october_dev','october_live'] LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.mystery_collections WHERE NOT legacy AND state<>''draft'') activated',ns) INTO saved;
  IF saved.activated THEN RAISE EXCEPTION 'A new collection has activated; use a forward repair to preserve it'; END IF;
  FOR saved IN EXECUTE format('SELECT definition FROM %I.monthly_engine_backup',ns) LOOP EXECUTE saved.definition; END LOOP;
 END LOOP;
END$$;
NOTIFY pgrst,'reload schema';
COMMIT;
