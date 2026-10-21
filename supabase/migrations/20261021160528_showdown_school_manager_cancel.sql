BEGIN;
SET LOCAL lock_timeout='5s';
-- Cancellation belongs to the challenging school, including its authorized temporary manager.
-- Existing session validation, school ownership, confirmation and revision locks remain required.
DO $install$
DECLARE env text; definition text; before_definition text;
BEGIN
 FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
  EXECUTE format('SELECT 1 FROM october_%s.settings WHERE id FOR UPDATE',env);
  SELECT pg_get_functiondef(to_regprocedure('public.october_games_'||env||'(text,text,text,jsonb)')) INTO definition;
  IF definition IS NULL OR position('showdown_cancel' IN definition)=0 THEN RAISE EXCEPTION 'Cancellation engine required';END IF;
  before_definition:=definition;
  definition:=replace(definition,
   'IF admin OR session.actor_role IS DISTINCT FROM ''manager'' OR session.employee_id IS NULL THEN RAISE EXCEPTION ''Registered challenging manager required'';',
   'IF admin OR session.actor_role IS DISTINCT FROM ''manager'' THEN RAISE EXCEPTION ''Challenging school manager required'';');
  IF definition=before_definition THEN RAISE EXCEPTION 'Cancellation role guard not found';END IF;
  before_definition:=definition;
  definition:=replace(definition,
   's.id IS NULL OR s.location_id IS DISTINCT FROM lid OR s.employee_id IS DISTINCT FROM session.employee_id::text THEN RAISE EXCEPTION ''Only the manager who submitted this challenge may cancel it'';',
   's.id IS NULL OR s.location_id IS DISTINCT FROM lid THEN RAISE EXCEPTION ''Only a manager signed in to the challenging school may cancel it'';');
  IF definition=before_definition THEN RAISE EXCEPTION 'Cancellation ownership guard not found';END IF;
  before_definition:=definition;
  definition:=replace(definition,
   'session.actor_role=''manager'' AND session.employee_id IS NOT NULL AND su.location_id=lid AND su.employee_id=session.employee_id::text AND',
   'session.actor_role=''manager'' AND su.location_id=lid AND');
  IF definition=before_definition THEN RAISE EXCEPTION 'Cancellation button permission not found';END IF;
  -- Record the authorized session's display name as well as its employee id (null for temporary managers).
  definition:=replace(definition,'''previous_state'',s.state,''photo'',ph.id',
   '''manager_name'',to_jsonb(session)->>''monitor_name'',''temporary_manager'',session.employee_id IS NULL,''previous_state'',s.state,''photo'',ph.id');
  EXECUTE definition;
 END LOOP;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
