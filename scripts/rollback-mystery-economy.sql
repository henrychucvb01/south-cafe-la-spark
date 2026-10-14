-- Restore Stage 2 only before any Stage 3 activity. Retain all added data for recovery.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$DECLARE ns text; fn record; blocked boolean; BEGIN
 FOREACH ns IN ARRAY ARRAY['october_dev','october_live'] LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.unlock_credit_events WHERE kind=''quest'' OR piece_index IS NOT NULL) OR EXISTS(SELECT 1 FROM %I.school_guesses GROUP BY location_id,guess_day HAVING count(*)>1)',ns,ns) INTO blocked;
  IF blocked THEN RAISE EXCEPTION 'New economy activity exists. Use a forward repair; do not discard activity.';END IF;
  FOR fn IN EXECUTE format('SELECT definition FROM %I.mystery_economy_backup',ns) LOOP EXECUTE fn.definition;END LOOP;
  EXECUTE format('ALTER TABLE %I.school_guesses ADD CONSTRAINT school_guesses_location_id_guess_day_key UNIQUE(location_id,guess_day)',ns);
  EXECUTE format('DROP TRIGGER selectable_monthly_pieces ON %I.rounds',ns);
 END LOOP;
END$$;
NOTIFY pgrst,'reload schema';
COMMIT;
