-- Emergency rollback preserves all added drafts and school records. Restore the old
-- application together with these functions. If new mysteries are already live,
-- use a forward repair instead so selected-piece locking cannot be weakened.
BEGIN;
DO $$DECLARE ns text; row record; active_new boolean;BEGIN
FOREACH ns IN ARRAY ARRAY['october_dev','october_live'] LOOP
EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.rounds r JOIN %I.mystery_collections c ON c.id=r.collection_id WHERE c.legacy AND r.revealed_indices IS NOT NULL)',ns,ns) INTO active_new;
IF active_new THEN RAISE EXCEPTION 'Additional mysteries are activated; use a forward repair';END IF;
FOR row IN EXECUTE format('SELECT definition FROM %I.monthly_engine_backup WHERE signature LIKE ''extension:%%''',ns) LOOP EXECUTE row.definition;END LOOP;
END LOOP;END$$;
NOTIFY pgrst,'reload schema';
COMMIT;
