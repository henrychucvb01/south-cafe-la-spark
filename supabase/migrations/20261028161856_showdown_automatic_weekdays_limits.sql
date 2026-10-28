BEGIN;
SET LOCAL lock_timeout='5s';
-- Change rules only; never rewrite existing photographs, votes or awards.
DO $install$
DECLARE env text;ns text;definition text;original text;start_at int;end_at int;replacement text;before_records jsonb;after_records jsonb;
BEGIN
 FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
  ns:='october_'||env;
  EXECUTE format('SELECT 1 FROM %I.settings WHERE id FOR UPDATE',ns);
  EXECUTE format('SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM %I.entries e),(SELECT jsonb_agg(to_jsonb(r) ORDER BY event) FROM %I.rewards r),(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM %I.showdown_submissions s),(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM %I.showdown_rounds r))',ns,ns,ns,ns) INTO before_records;
  EXECUTE replace($helpers$
   CREATE FUNCTION @s@.showdown_start_day(p_at timestamptz) RETURNS boolean
   LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
    SELECT extract(isodow FROM p_at AT TIME ZONE 'America/Los_Angeles') BETWEEN 1 AND 4
   $$;
   CREATE FUNCTION @s@.showdown_attempt_count(p_school bigint,p_month date) RETURNS integer
   LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
    SELECT count(*)::int FROM @s@.showdown_submissions s
    WHERE s.location_id=p_school AND date_trunc('month',coalesce(s.reviewed_at,s.submitted_at) AT TIME ZONE 'America/Los_Angeles')::date=p_month
     AND EXISTS(SELECT 1 FROM @s@.showdown_photos p WHERE p.submission=s.id)
   $$;
   CREATE FUNCTION @s@.start_showdown(p_id uuid,p_revision int,p_automatic boolean) RETURNS void
   LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
   DECLARE s @s@.showdown_submissions;r @s@.showdown_rounds;q @s@.quests;champ record;current_month date:=date_trunc('month',clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date;
   BEGIN
    PERFORM 1 FROM @s@.settings WHERE id FOR UPDATE;
    SELECT * INTO s FROM @s@.showdown_submissions WHERE id=p_id FOR UPDATE;
    IF s.id IS NULL OR s.state<>'pending' OR s.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Submission changed. Refresh first';END IF;
    IF NOT @s@.showdown_start_day(clock_timestamp()) THEN RAISE EXCEPTION 'New challenges start Monday through Thursday in Los Angeles time. No Friday or weekend starts';END IF;
    IF EXISTS(SELECT 1 FROM @s@.showdown_submissions old JOIN @s@.showdown_photos p ON p.submission=old.id WHERE old.location_id=s.location_id AND old.quest=s.quest) THEN RAISE EXCEPTION 'Your school has already challenged this prompt. Each prompt can be challenged only once';END IF;
    IF @s@.showdown_attempt_count(s.location_id,current_month)>=5 THEN RAISE EXCEPTION 'Your school has used all 5 challenges this month';END IF;
    IF @s@.showdown_competition(s.quest) IS DISTINCT FROM s.month THEN RAISE EXCEPTION 'This monthly competition is closed';END IF;
    SELECT * INTO q FROM @s@.quests WHERE id=s.quest;
    IF NOT EXISTS(SELECT 1 FROM public.locations l JOIN @s@.schools sc ON sc.location_id=l.id WHERE l.id=s.location_id AND l.active AND sc.participating) OR (q.eligible IS NOT NULL AND NOT s.location_id=ANY(q.eligible)) THEN RAISE EXCEPTION 'The challenging school is no longer eligible';END IF;
    SELECT * INTO champ FROM @s@.showdown_current(s.quest);
    IF champ.location_id IS DISTINCT FROM s.target_school OR champ.photo_path IS DISTINCT FROM s.target_photo THEN RAISE EXCEPTION 'The champion changed. Refresh before challenging';END IF;
    IF champ.location_id=s.location_id THEN RAISE EXCEPTION 'Your school cannot challenge its own photo';END IF;
    IF EXISTS(SELECT 1 FROM @s@.showdown_used WHERE quest=s.quest AND location_id=s.location_id) THEN RAISE EXCEPTION 'Your school has used its challenge for this Side Quest';END IF;
    SELECT * INTO r FROM @s@.showdown_rounds WHERE quest=s.quest AND state IN('voting','decision') FOR UPDATE;
    IF r.id IS NULL THEN
     INSERT INTO @s@.showdown_rounds(quest,month,defender,reward_points,quest_name,quest_description,quest_goal)
      VALUES(s.quest,s.month,champ.location_id,q.reward_points,q.name,q.description,q.goal) RETURNING * INTO r;
     INSERT INTO @s@.showdown_photos(round_id,location_id,photo_path,role) VALUES(r.id,champ.location_id,champ.photo_path,'defender');
    ELSE
     IF r.state<>'voting' OR r.closes_at<=clock_timestamp() OR (SELECT count(*) FROM @s@.showdown_photos WHERE round_id=r.id AND withdrawn_at IS NULL)>=3 THEN RAISE EXCEPTION 'This showdown is full or voting has closed';END IF;
     UPDATE @s@.showdown_rounds SET generation=generation+1,started_at=clock_timestamp(),closes_at=clock_timestamp()+interval '24 hours',revision=revision+1 WHERE id=r.id RETURNING * INTO r;
    END IF;
    INSERT INTO @s@.showdown_photos(round_id,location_id,photo_path,role,submission) VALUES(r.id,s.location_id,s.photo_path,'challenger',s.id);
    INSERT INTO @s@.showdown_used VALUES(s.quest,s.month,s.location_id,r.id,'approved');
    UPDATE @s@.showdown_submissions SET state='approved',reviewed_at=clock_timestamp(),revision=revision+1 WHERE id=s.id;
    INSERT INTO @s@.showdown_audit(round_id,submission,action,details) VALUES(r.id,s.id,'approved',jsonb_build_object('automatic',p_automatic,'generation',r.generation,'closes_at',r.closes_at));
   END$$;
   REVOKE ALL ON FUNCTION @s@.showdown_start_day(timestamptz),@s@.showdown_attempt_count(bigint,date),@s@.start_showdown(uuid,int,boolean) FROM PUBLIC,anon,authenticated,service_role;
  $helpers$,'@s@',ns);

  SELECT pg_get_functiondef(to_regprocedure('public.october_games_'||env||'(text,text,text,jsonb)')) INTO definition;
  original:=definition;
  IF definition NOT LIKE '%ELSIF p_action=''showdown_cancel'' THEN%' THEN RAISE EXCEPTION 'Expected cancellation-capable engine for %',ns;END IF;
  replacement:=replace($auto$
   SELECT * INTO s FROM @s@.showdown_submissions WHERE id=request;
   IF s.state='pending' THEN PERFORM @s@.start_showdown(s.id,s.revision,true);END IF;
  ELSIF p_action='showdown_cancel' THEN
  $auto$,'@s@',ns);
  definition:=replace(definition,'  ELSIF p_action=''showdown_cancel'' THEN',replacement);
  IF definition=original THEN RAISE EXCEPTION 'Automatic start insertion failed for %',ns;END IF;

  -- Keep the existing pending-review route for historical pending photographs.
  -- Any later manual approval has the same weekday/attempt guards as auto-start.
  start_at:=strpos(definition,'  ELSIF p_action IN(''showdown_approve'',''showdown_reject'') THEN');
  end_at:=strpos(definition,'  ELSIF p_action=''showdown_vote'' THEN');
  IF start_at=0 OR end_at<=start_at THEN RAISE EXCEPTION 'Expected approval handler for %',ns;END IF;
  replacement:=replace($approve$
  ELSIF p_action IN('showdown_approve','showdown_reject') THEN
   SELECT * INTO s FROM @s@.showdown_submissions WHERE id=(p_payload->>'id')::uuid FOR UPDATE;
   IF s.id IS NULL THEN RAISE EXCEPTION 'Submission not found';END IF;
   IF (p_action='showdown_approve' AND s.state='approved') OR (p_action='showdown_reject' AND s.state='rejected') THEN NULL;
   ELSE
    IF s.state<>'pending' OR s.revision IS DISTINCT FROM (p_payload->>'revision')::int THEN RAISE EXCEPTION 'Submission changed. Refresh first';END IF;
    IF p_action='showdown_reject' THEN
     UPDATE @s@.showdown_submissions SET state='rejected',private_feedback=left(coalesce(p_payload->>'feedback',''),1000),reviewed_at=clock_timestamp(),revision=revision+1 WHERE id=s.id;
     INSERT INTO @s@.showdown_audit(submission,action) VALUES(s.id,'rejected');
    ELSE PERFORM @s@.start_showdown(s.id,s.revision,false);END IF;
   END IF;
  $approve$,'@s@',ns);
  definition:=left(definition,start_at-1)||replacement||substr(definition,end_at);

  -- Supervisor removal is a withdrawal with an audit, never physical deletion.
  -- It does not restore an attempt or modify a finalized reward.
  replacement:=replace($remove$
 IF p_action='showdown_remove' THEN
  IF NOT admin THEN RAISE EXCEPTION 'Supervisor authorization required';END IF;
  IF coalesce((p_payload->>'confirmed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Confirm removal';END IF;
  SELECT * INTO s FROM @s@.showdown_submissions WHERE id=(p_payload->>'id')::uuid FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Submission not found';END IF;
  IF s.state='cancelled' THEN NULL;
  ELSE
   IF s.state NOT IN('pending','approved') OR s.revision IS DISTINCT FROM (p_payload->>'revision')::int THEN RAISE EXCEPTION 'Submission changed. Refresh first';END IF;
   IF s.state='approved' THEN
    SELECT * INTO ph FROM @s@.showdown_photos WHERE submission=s.id AND withdrawn_at IS NULL;
    SELECT * INTO r FROM @s@.showdown_rounds WHERE id=ph.round_id FOR UPDATE;
    IF r.id IS NULL OR r.state NOT IN('voting','decision') THEN RAISE EXCEPTION 'This showdown has already ended';END IF;
    IF r.revision IS DISTINCT FROM (p_payload->>'round_revision')::int THEN RAISE EXCEPTION 'Showdown changed. Refresh before removing';END IF;
    UPDATE @s@.showdown_photos SET withdrawn_at=clock_timestamp() WHERE id=ph.id;
    IF NOT EXISTS(SELECT 1 FROM @s@.showdown_photos WHERE round_id=r.id AND role='challenger' AND withdrawn_at IS NULL) THEN
     UPDATE @s@.showdown_rounds SET state='cancelled',cancelled_at=clock_timestamp(),revision=revision+1 WHERE id=r.id;
    ELSE UPDATE @s@.showdown_rounds SET revision=revision+1 WHERE id=r.id;END IF;
   END IF;
   UPDATE @s@.showdown_submissions SET state='cancelled',cancelled_at=clock_timestamp(),private_feedback=left(coalesce(p_payload->>'feedback',''),1000),revision=revision+1 WHERE id=s.id;
   INSERT INTO @s@.showdown_audit(round_id,submission,action,details) VALUES(r.id,s.id,'supervisor_removed',jsonb_build_object('school',s.location_id,'previous_state',s.state,'opportunity_restored',false));
  END IF;
  p_action:='list';
 END IF;
 IF p_action='showdown_poll' THEN
  $remove$,'@s@',ns);
  IF strpos(definition,' IF p_action=''showdown_poll'' THEN')=0 THEN RAISE EXCEPTION 'Expected poll handler';END IF;
  definition:=replace(definition,' IF p_action=''showdown_poll'' THEN',replacement);
  definition:=replace(definition,'''opportunity_restored'',true','''opportunity_restored'',false');

  replacement:=replace($policy$
 result:=jsonb_set(result,'{showdowns,used}',(SELECT coalesce(jsonb_agg(quest),'[]') FROM (
  SELECT quest FROM @s@.showdown_used WHERE location_id=lid
  UNION SELECT su.quest FROM @s@.showdown_submissions su WHERE su.location_id=lid AND EXISTS(SELECT 1 FROM @s@.showdown_photos p WHERE p.submission=su.id)
 ) attempted));
 result:=jsonb_set(result,'{showdowns,policy}',jsonb_build_object('version',1,'can_start',@s@.showdown_start_day(clock_timestamp()),'limit',5,
  'used_this_month',@s@.showdown_attempt_count(lid,date_trunc('month',clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date),
  'remaining',greatest(0,5-@s@.showdown_attempt_count(lid,date_trunc('month',clock_timestamp() AT TIME ZONE 'America/Los_Angeles')::date))));
 RETURN result||jsonb_build_object('unused_showdown_photo',duplicate_photo);
  $policy$,'@s@',ns);
  IF strpos(definition,' RETURN result||jsonb_build_object(''unused_showdown_photo'',duplicate_photo);')=0 THEN RAISE EXCEPTION 'Expected response projection';END IF;
  definition:=replace(definition,' RETURN result||jsonb_build_object(''unused_showdown_photo'',duplicate_photo);',replacement);
  EXECUTE definition;
  -- CREATE OR REPLACE retains the existing service-role-only RPC grants.
  EXECUTE format('SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM %I.entries e),(SELECT jsonb_agg(to_jsonb(r) ORDER BY event) FROM %I.rewards r),(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM %I.showdown_submissions s),(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM %I.showdown_rounds r))',ns,ns,ns,ns) INTO after_records;
  IF before_records IS DISTINCT FROM after_records THEN RAISE EXCEPTION 'Existing records changed in %',ns;END IF;
 END LOOP;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
