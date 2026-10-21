BEGIN;
SET LOCAL lock_timeout='5s';
-- Preserve all photographs and votes for audit. Withdrawn photos stop participating.
DO $install$
DECLARE env text; ns text; definition text; before_definition text; replacement text;
BEGIN
FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
 ns:='october_'||env;
 EXECUTE format('SELECT 1 FROM %I.settings WHERE id FOR UPDATE',ns);
 EXECUTE replace($ddl$
 ALTER TABLE @s@.showdown_submissions DROP CONSTRAINT showdown_submissions_state_check,
  ADD CONSTRAINT showdown_submissions_state_check CHECK(state IN('pending','approved','rejected','cancelled')),
  ADD COLUMN cancelled_at timestamptz;
 ALTER TABLE @s@.showdown_rounds DROP CONSTRAINT showdown_rounds_state_check,
  ADD CONSTRAINT showdown_rounds_state_check CHECK(state IN('voting','decision','finalized','cancelled')),
  ADD COLUMN cancelled_at timestamptz;
 ALTER TABLE @s@.showdown_photos ADD COLUMN withdrawn_at timestamptz,
  DROP CONSTRAINT showdown_photos_round_id_location_id_key;
 DROP INDEX @s@.showdown_one_active;
 CREATE UNIQUE INDEX showdown_one_active ON @s@.showdown_rounds(quest) WHERE state IN('voting','decision');
 CREATE UNIQUE INDEX showdown_one_active_school_photo ON @s@.showdown_photos(round_id,location_id) WHERE withdrawn_at IS NULL;
 $ddl$,'@s@',ns);
 SELECT pg_get_functiondef(to_regprocedure('public.october_games_'||env||'(text,text,text,jsonb)')) INTO definition;
 IF definition IS NULL OR position('showdown_cancel' IN definition)>0 THEN RAISE EXCEPTION 'Unexpected Showdown engine version';END IF;
 -- Existing settings lock serializes cancel against approval, votes and finalization.
 definition:=replace(definition,'state<>''finalized''','state IN(''voting'',''decision'')');
 definition:=replace(definition,'WHERE round_id=r.id)>=3','WHERE round_id=r.id AND withdrawn_at IS NULL)>=3');
 definition:=replace(definition,'AND round_id=r.id;','AND round_id=r.id AND withdrawn_at IS NULL;');
 -- Preserve historical votes, but a withdrawn photo no longer has a current ballot.
 definition:=replace(definition,'AND location_id=lid),''photos''',
  replace('AND location_id=lid AND photo IN(SELECT id FROM @s@.showdown_photos WHERE withdrawn_at IS NULL)),''photos''','@s@',ns));
 definition:=replace(definition,'AND location_id=lid),'||chr(10),
  replace('AND location_id=lid AND photo IN(SELECT id FROM @s@.showdown_photos WHERE withdrawn_at IS NULL)),'||chr(10),'@s@',ns));
 -- Full responses retain canceled round photographs in history. Active comparisons omit withdrawals.
 definition:=replace(definition,'WHERE p.round_id=sr.id)',
  'WHERE p.round_id=sr.id AND (p.withdrawn_at IS NULL OR sr.state=''cancelled''))');
 -- Supervisor voting activity keeps the target school's name after a withdrawal.
 definition:=replace(definition,'jsonb_agg(to_jsonb(v) ORDER BY generation,updated_at)',
  replace('jsonb_agg(to_jsonb(v)||jsonb_build_object(''photo_school_name'',(SELECT l.school_name FROM @s@.showdown_photos vp JOIN public.locations l ON l.id=vp.location_id WHERE vp.id=v.photo)) ORDER BY generation,updated_at)','@s@',ns));
 before_definition:=definition;
 replacement:=$auth$
  ELSIF p_action='showdown_cancel' THEN
   IF admin OR session.actor_role IS DISTINCT FROM 'manager' OR session.employee_id IS NULL THEN RAISE EXCEPTION 'Registered challenging manager required';END IF;
  ELSIF p_action IN('showdown_submit','showdown_vote') THEN
 $auth$;
 definition:=replace(definition,'  ELSIF p_action IN(''showdown_submit'',''showdown_vote'') THEN',replacement);
 IF definition=before_definition THEN RAISE EXCEPTION 'Cancellation authorization insertion failed';END IF;
 before_definition:=definition;
 replacement:=replace($cancel$
  ELSIF p_action='showdown_cancel' THEN
   IF coalesce((p_payload->>'confirmed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Confirm cancellation';END IF;
   SELECT * INTO s FROM @s@.showdown_submissions WHERE id=(p_payload->>'id')::uuid FOR UPDATE;
   IF s.id IS NULL OR s.location_id IS DISTINCT FROM lid OR s.employee_id IS DISTINCT FROM session.employee_id::text THEN RAISE EXCEPTION 'Only the manager who submitted this challenge may cancel it';END IF;
   IF s.state='cancelled' THEN NULL; -- A lost-response retry has no second effect.
   ELSE
    IF s.state NOT IN('pending','approved') OR s.revision IS DISTINCT FROM (p_payload->>'revision')::int THEN RAISE EXCEPTION 'Challenge changed. Refresh before canceling';END IF;
    IF s.state='approved' THEN
     SELECT * INTO ph FROM @s@.showdown_photos WHERE submission=s.id AND withdrawn_at IS NULL;
     SELECT * INTO r FROM @s@.showdown_rounds WHERE id=ph.round_id FOR UPDATE;
     IF r.id IS NULL OR r.state NOT IN('voting','decision') THEN RAISE EXCEPTION 'This showdown has already ended';END IF;
     IF r.revision IS DISTINCT FROM (p_payload->>'round_revision')::int THEN RAISE EXCEPTION 'Showdown changed. Refresh before canceling';END IF;
     UPDATE @s@.showdown_photos SET withdrawn_at=clock_timestamp() WHERE id=ph.id;
     IF NOT EXISTS(SELECT 1 FROM @s@.showdown_photos WHERE round_id=r.id AND role='challenger' AND withdrawn_at IS NULL) THEN
      UPDATE @s@.showdown_rounds SET state='cancelled',cancelled_at=clock_timestamp(),revision=revision+1 WHERE id=r.id;
     ELSE
      -- Keep remaining schools' votes, voting generation and original deadline.
      UPDATE @s@.showdown_rounds SET revision=revision+1 WHERE id=r.id;
     END IF;
     DELETE FROM @s@.showdown_used WHERE quest=s.quest AND month=s.month AND location_id=lid AND round_id=r.id AND reason='approved';
    END IF;
    UPDATE @s@.showdown_submissions SET state='cancelled',cancelled_at=clock_timestamp(),revision=revision+1 WHERE id=s.id;
    INSERT INTO @s@.showdown_audit(round_id,submission,action,details) VALUES(r.id,s.id,'cancelled',jsonb_build_object('school',lid,'employee_id',session.employee_id,'previous_state',s.state,'photo',ph.id,'opportunity_restored',true));
   END IF;
  ELSIF p_action IN('showdown_approve','showdown_reject') THEN
 $cancel$,'@s@',ns);
 definition:=replace(definition,'  ELSIF p_action IN(''showdown_approve'',''showdown_reject'') THEN',replacement);
 IF definition=before_definition THEN RAISE EXCEPTION 'Cancellation handler insertion failed';END IF;
 before_definition:=definition;
 replacement:=replace($permission$CASE WHEN admin THEN jsonb_build_object('private_feedback',su.private_feedback) ELSE jsonb_build_object('can_cancel',session.actor_role='manager' AND session.employee_id IS NOT NULL AND su.location_id=lid AND su.employee_id=session.employee_id::text AND (su.state='pending' OR (su.state='approved' AND EXISTS(SELECT 1 FROM @s@.showdown_photos cp JOIN @s@.showdown_rounds cr ON cr.id=cp.round_id WHERE cp.submission=su.id AND cp.withdrawn_at IS NULL AND cr.state IN('voting','decision'))))) END$permission$,'@s@',ns);
 definition:=replace(definition,'CASE WHEN admin THEN jsonb_build_object(''private_feedback'',su.private_feedback) ELSE ''{}''::jsonb END',replacement);
 IF definition=before_definition THEN RAISE EXCEPTION 'Cancellation permission projection failed';END IF;
 EXECUTE definition;
 -- CREATE OR REPLACE preserves the existing service-role-only grants and pg_catalog search path.
END LOOP;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
