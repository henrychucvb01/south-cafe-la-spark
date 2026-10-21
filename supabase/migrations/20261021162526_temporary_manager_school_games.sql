BEGIN;
SET LOCAL lock_timeout='5s';
-- Temporary managers already have a verified school session. Give their game
-- records one stable, non-employee identity per school; never invent an employee.
-- All participating-school, deadline, self-vote, approval and reward guards stay.
DO $install$
DECLARE env text; ns text; f record; definition text; original text; changed int;
BEGIN
 FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
  ns:='october_'||env;changed:=0;
  EXECUTE format('SELECT 1 FROM %I.settings WHERE id FOR UPDATE',ns);
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.prokind='f' AND ((n.nspname=ns AND p.proname IN('game_engine','credit_game_engine','monthly_legacy','games_legacy','weekly_legacy'))
    OR (n.nspname='public' AND p.proname='october_games_'||env)) LOOP
   SELECT pg_get_functiondef(f.oid) INTO definition;original:=definition;
   -- Keep numeric employee IDs unchanged; all temporary sessions for a school share this key.
   definition:=replace(definition,'s.employee_id::text','coalesce(s.employee_id::text,''covering-school:''||s.location_id::text)');
   definition:=replace(definition,'session.employee_id::text','coalesce(session.employee_id::text,''covering-school:''||session.location_id::text)');
   definition:=replace(definition,'OR s.employee_id IS NULL OR NOT coalesce','OR NOT coalesce');
   definition:=replace(definition,'OR session.employee_id IS NULL OR NOT coalesce','OR NOT coalesce');
   definition:=replace(definition,'(public.require_supper_monitoring_session(p_token)).employee_id::text',
    'coalesce((public.require_supper_monitoring_session(p_token)).employee_id::text,''covering-school:''||(public.require_supper_monitoring_session(p_token)).location_id::text)');
   definition:=replace(definition,'AND (public.require_supper_monitoring_session(p_token)).employee_id IS NOT NULL',
    'AND (public.require_supper_monitoring_session(p_token)).actor_role=''manager''');
   IF definition<>original THEN EXECUTE definition;changed:=changed+1;END IF;
  END LOOP;
  IF changed=0 THEN RAISE EXCEPTION 'No game authorization engine updated for %',ns;END IF;
 END LOOP;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
