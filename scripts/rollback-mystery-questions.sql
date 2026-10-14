-- Restore prior functions together with the prior application only if a forward
-- repair is unsuitable. Questions and all guesses, winners and points are retained.
BEGIN;
DO $$DECLARE ns text; row record;BEGIN
FOREACH ns IN ARRAY ARRAY['october_dev','october_live'] LOOP
FOR row IN EXECUTE format('SELECT definition FROM %I.monthly_engine_backup WHERE signature LIKE ''question:%%''',ns) LOOP EXECUTE row.definition;END LOOP;
END LOOP;END$$;
NOTIFY pgrst,'reload schema';
COMMIT;
