BEGIN;
SET LOCAL lock_timeout='5s';
DO $install$
DECLARE env text;ns text;definition text;original_records jsonb;after_records jsonb;
BEGIN
FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
 ns:='october_'||env;
 EXECUTE format('SELECT 1 FROM %I.settings WHERE id FOR UPDATE',ns);
 EXECUTE format('SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM %I.entries e),(SELECT jsonb_agg(to_jsonb(c) ORDER BY quest) FROM %I.quest_claims c),(SELECT jsonb_agg(to_jsonb(r) ORDER BY event) FROM %I.rewards r))',ns,ns,ns) INTO original_records;
 EXECUTE replace($ddl$
 CREATE TABLE @s@.showdown_submissions(id uuid PRIMARY KEY,quest int NOT NULL REFERENCES @s@.quests(id),month date NOT NULL,location_id bigint NOT NULL REFERENCES public.locations(id),employee_id text NOT NULL,photo_path text NOT NULL,note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),consent boolean NOT NULL CHECK(consent),target_school bigint NOT NULL,target_photo text NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','approved','rejected')),private_feedback text NOT NULL DEFAULT '',revision int NOT NULL DEFAULT 1,submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),reviewed_at timestamptz);
 CREATE UNIQUE INDEX showdown_one_pending ON @s@.showdown_submissions(quest,month,location_id) WHERE state='pending';
 CREATE TABLE @s@.showdown_rounds(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),quest int NOT NULL REFERENCES @s@.quests(id),month date NOT NULL,state text NOT NULL DEFAULT 'voting' CHECK(state IN('voting','decision','finalized')),generation int NOT NULL DEFAULT 1,revision int NOT NULL DEFAULT 1,started_at timestamptz NOT NULL DEFAULT clock_timestamp(),closes_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '24 hours'),finalized_at timestamptz,winner uuid,defender bigint NOT NULL REFERENCES public.locations(id),reward_points int NOT NULL CHECK(reward_points BETWEEN 1 AND 1000),points_recovered int,points_shortfall int,decision_request uuid UNIQUE);
 CREATE UNIQUE INDEX showdown_one_active ON @s@.showdown_rounds(quest) WHERE state<>'finalized';
 ALTER TABLE @s@.showdown_rounds ADD COLUMN quest_name text NOT NULL,ADD COLUMN quest_description text NOT NULL,ADD COLUMN quest_goal text;
 CREATE TABLE @s@.showdown_photos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),round_id uuid NOT NULL REFERENCES @s@.showdown_rounds(id),location_id bigint NOT NULL REFERENCES public.locations(id),photo_path text NOT NULL,role text NOT NULL CHECK(role IN('defender','challenger')),submission uuid UNIQUE REFERENCES @s@.showdown_submissions(id),UNIQUE(round_id,location_id));
 ALTER TABLE @s@.showdown_rounds ADD FOREIGN KEY(winner) REFERENCES @s@.showdown_photos(id);
 CREATE TABLE @s@.showdown_votes(round_id uuid NOT NULL REFERENCES @s@.showdown_rounds(id),generation int NOT NULL,location_id bigint NOT NULL REFERENCES public.locations(id),photo uuid NOT NULL REFERENCES @s@.showdown_photos(id),employee_id text NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(round_id,generation,location_id));
 CREATE TABLE @s@.showdown_used(quest int NOT NULL REFERENCES @s@.quests(id),month date NOT NULL,location_id bigint NOT NULL REFERENCES public.locations(id),round_id uuid NOT NULL REFERENCES @s@.showdown_rounds(id),reason text NOT NULL CHECK(reason IN('approved','defeated')),PRIMARY KEY(quest,month,location_id));
 CREATE TABLE @s@.showdown_champions(quest int PRIMARY KEY REFERENCES @s@.quests(id),location_id bigint NOT NULL REFERENCES public.locations(id),photo_path text NOT NULL,round_id uuid NOT NULL REFERENCES @s@.showdown_rounds(id),updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE TABLE @s@.showdown_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,round_id uuid REFERENCES @s@.showdown_rounds(id),submission uuid REFERENCES @s@.showdown_submissions(id),action text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE INDEX showdown_pending_school ON @s@.showdown_submissions(location_id,quest,month,state);
 CREATE INDEX showdown_quest_history ON @s@.showdown_rounds(quest,month,started_at DESC);
 CREATE INDEX showdown_deadlines ON @s@.showdown_rounds(closes_at) WHERE state='voting';
 CREATE INDEX showdown_vote_totals ON @s@.showdown_votes(round_id,generation,photo);
 ALTER TABLE @s@.showdown_submissions ENABLE ROW LEVEL SECURITY;
 ALTER TABLE @s@.showdown_rounds ENABLE ROW LEVEL SECURITY;
 ALTER TABLE @s@.showdown_photos ENABLE ROW LEVEL SECURITY;
 ALTER TABLE @s@.showdown_votes ENABLE ROW LEVEL SECURITY;
 ALTER TABLE @s@.showdown_used ENABLE ROW LEVEL SECURITY;
 ALTER TABLE @s@.showdown_champions ENABLE ROW LEVEL SECURITY;
 ALTER TABLE @s@.showdown_audit ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON @s@.showdown_submissions,@s@.showdown_rounds,@s@.showdown_photos,@s@.showdown_votes,@s@.showdown_used,@s@.showdown_champions,@s@.showdown_audit FROM PUBLIC,anon,authenticated,service_role;
 REVOKE ALL ON SEQUENCE @s@.showdown_audit_id_seq FROM PUBLIC,anon,authenticated,service_role;
 ALTER TABLE @s@.unlock_credit_events ADD COLUMN showdown_round uuid UNIQUE REFERENCES @s@.showdown_rounds(id);
 ALTER TABLE @s@.unlock_credit_events DROP CONSTRAINT unlock_credit_events_kind_check,ADD CONSTRAINT unlock_credit_events_kind_check CHECK(kind IN('daily','purchase','reveal','quest','showdown'));
 CREATE FUNCTION @s@.showdown_competition(p_quest int) RETURNS date LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN q.cycle_id IS NOT NULL THEN (SELECT c.month FROM @s@.game_cycles c WHERE c.id=q.cycle_id AND c.state='active' AND c.closed_at IS NULL) ELSE (SELECT date_trunc('month',r.service_date)::date FROM @s@.rewards r WHERE r.event='quest:first:'||q.id AND NOT r.voided AND date_trunc('month',r.service_date)::date=coalesce((SELECT c.month FROM @s@.game_cycles c WHERE c.state='active' AND c.closed_at IS NULL ORDER BY month DESC LIMIT 1),date_trunc('month',now() AT TIME ZONE 'America/Los_Angeles')::date) AND NOT EXISTS(SELECT 1 FROM @s@.game_cycles c WHERE c.month=date_trunc('month',r.service_date)::date AND c.state='archived')) END
 FROM @s@.quests q WHERE q.id=p_quest AND q.enabled AND (SELECT quests_state='active' FROM @s@.settings WHERE id) AND EXISTS(SELECT 1 FROM @s@.quest_claims WHERE quest=q.id) AND (EXISTS(SELECT 1 FROM @s@.showdown_champions WHERE quest=q.id) OR EXISTS(SELECT 1 FROM @s@.quest_claims qc JOIN @s@.entries e ON e.id=qc.entry WHERE qc.quest=q.id AND e.state='approved'))
 $$;
 CREATE FUNCTION @s@.showdown_current(p_quest int) RETURNS TABLE(location_id bigint,photo_path text) LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT c.location_id,c.photo_path FROM @s@.showdown_champions c WHERE c.quest=p_quest
 UNION ALL SELECT qc.location_id,e.photo_path FROM @s@.quest_claims qc JOIN @s@.entries e ON e.id=qc.entry WHERE qc.quest=p_quest AND e.state='approved' AND NOT EXISTS(SELECT 1 FROM @s@.showdown_champions WHERE quest=p_quest)
 $$;
 CREATE FUNCTION @s@.expire_showdowns() RETURNS int LANGUAGE plpgsql SET search_path=pg_catalog AS $$DECLARE n int;BEGIN
 PERFORM 1 FROM @s@.settings WHERE id FOR UPDATE;
 UPDATE @s@.showdown_rounds SET state='decision',revision=revision+1 WHERE state='voting' AND closes_at<=clock_timestamp();GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
 END$$;
 $ddl$,'@s@',ns);
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conrelid=to_regclass(ns||'.unlock_credit_events') AND conname='unlock_credit_events_check';
 EXECUTE format('ALTER TABLE %I.unlock_credit_events DROP CONSTRAINT unlock_credit_events_check,ADD CONSTRAINT unlock_credit_events_check CHECK((%s) OR (kind=''showdown'' AND credits=3 AND price=0 AND showdown_round IS NOT NULL AND request_id IS NULL AND quest_entry IS NULL AND round IS NULL))',ns,substring(definition FROM 8 FOR length(definition)-8));
 SELECT pg_get_functiondef(to_regprocedure('public.october_games_'||env||'(text,text,text,jsonb)')) INTO definition;
 EXECUTE replace(definition,'FUNCTION public.october_games_'||env||'(','FUNCTION '||ns||'.showdown_legacy(');
 definition:=replace(replace($wrapper$
 CREATE OR REPLACE FUNCTION public.october_games_@env@(p_action text,p_token text DEFAULT NULL,p_pin text DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE result jsonb;actor jsonb;admin boolean;lid bigint;session public.supper_monitoring_sessions;q @s@.quests;s @s@.showdown_submissions;r @s@.showdown_rounds;ph @s@.showdown_photos;champ record;month_date date;award_date date;request uuid;recover int;balance numeric;item jsonb;rounds jsonb;photos jsonb;submissions jsonb;champions jsonb;duplicate_photo boolean:=false;
 BEGIN
 actor:=@s@.showdown_legacy('authorize',p_token,p_pin,'{}');admin:=coalesce((actor->>'admin')::boolean,false);
 lid:=(actor->>'location_id')::bigint;
 IF NOT admin THEN session:=public.require_supper_monitoring_session(p_token);lid:=session.location_id;END IF;
 PERFORM 1 FROM @s@.settings WHERE id FOR UPDATE;
 PERFORM @s@.expire_showdowns();
 IF p_action='showdown_poll' THEN
  RETURN jsonb_build_object('showdown_poll',true,'server_time',clock_timestamp(),'rounds',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',sr.id,'state',sr.state,'generation',sr.generation,'revision',sr.revision,'closes_at',sr.closes_at,'started_at',sr.started_at,'winner',sr.winner,'finalized_at',sr.finalized_at,'my_vote',(SELECT photo FROM @s@.showdown_votes WHERE round_id=sr.id AND generation=sr.generation AND location_id=lid),'photos',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'votes',(SELECT count(*) FROM @s@.showdown_votes v WHERE v.round_id=sr.id AND v.generation=sr.generation AND v.photo=p.id))),'[]') FROM @s@.showdown_photos p WHERE p.round_id=sr.id))),'[]') FROM @s@.showdown_rounds sr));
 END IF;
 IF p_action LIKE 'showdown_%' THEN
  IF p_action IN('showdown_approve','showdown_reject','showdown_finalize') THEN
   IF NOT admin THEN RAISE EXCEPTION 'Supervisor authorization required';END IF;
  ELSIF p_action IN('showdown_submit','showdown_vote') THEN
   IF admin OR session.actor_role<>'manager' OR session.employee_id IS NULL OR NOT coalesce((SELECT participating FROM @s@.schools WHERE location_id=lid),false) OR NOT EXISTS(SELECT 1 FROM public.locations WHERE id=lid AND active) THEN RAISE EXCEPTION 'Participating school manager required';END IF;
  ELSE RAISE EXCEPTION 'Unknown showdown action';END IF;
  IF p_action='showdown_submit' THEN
   request:=nullif(p_payload->>'request_id','')::uuid;IF request IS NULL THEN RAISE EXCEPTION 'Refresh before submitting';END IF;
   SELECT * INTO s FROM @s@.showdown_submissions WHERE id=request;
   IF s.id IS NOT NULL THEN
    IF s.location_id<>lid OR s.quest IS DISTINCT FROM (p_payload->>'quest')::int THEN RAISE EXCEPTION 'Submission request changed';END IF;
    duplicate_photo:=s.photo_path IS DISTINCT FROM p_payload->>'photo_path';
   ELSE
    SELECT * INTO q FROM @s@.quests WHERE id=(p_payload->>'quest')::int;
    month_date:=@s@.showdown_competition(q.id);IF month_date IS NULL THEN RAISE EXCEPTION 'This monthly competition is closed';END IF;
    SELECT * INTO champ FROM @s@.showdown_current(q.id);
    IF champ.location_id IS NULL OR champ.photo_path IS NULL THEN RAISE EXCEPTION 'The winning photo is not available';END IF;
    IF champ.location_id=lid THEN RAISE EXCEPTION 'Your school cannot challenge its own photo';END IF;
    IF q.eligible IS NOT NULL AND NOT lid=ANY(q.eligible) THEN RAISE EXCEPTION 'This Side Quest is not available for your school';END IF;
    IF EXISTS(SELECT 1 FROM @s@.showdown_used WHERE quest=q.id AND month=month_date AND location_id=lid) THEN RAISE EXCEPTION 'Your school has used its challenge for this Side Quest';END IF;
    SELECT * INTO r FROM @s@.showdown_rounds WHERE quest=q.id AND state<>'finalized';
    IF r.state='decision' OR (r.id IS NOT NULL AND (SELECT count(*) FROM @s@.showdown_photos WHERE round_id=r.id)>=3) THEN RAISE EXCEPTION 'Wait until the current showdown is finalized';END IF;
    IF coalesce((p_payload->>'confirmed')::boolean,false) IS NOT TRUE OR coalesce((p_payload->>'consent')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Confirm submission and permission to publish';END IF;
    IF p_payload->>'photo_path' IS NULL OR p_payload->>'photo_path'!~'^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$' THEN RAISE EXCEPTION 'Photo is required';END IF;
    INSERT INTO @s@.showdown_submissions(id,quest,month,location_id,employee_id,photo_path,note,consent,target_school,target_photo) VALUES(request,q.id,month_date,lid,session.employee_id::text,p_payload->>'photo_path',coalesce(p_payload->>'note',''),true,champ.location_id,champ.photo_path);
    INSERT INTO @s@.showdown_audit(submission,action,details) VALUES(request,'submitted',jsonb_build_object('school',lid));
   END IF;
  ELSIF p_action IN('showdown_approve','showdown_reject') THEN
   SELECT * INTO s FROM @s@.showdown_submissions WHERE id=(p_payload->>'id')::uuid FOR UPDATE;
   IF s.id IS NULL THEN RAISE EXCEPTION 'Submission not found';END IF;
   IF (p_action='showdown_approve' AND s.state='approved') OR (p_action='showdown_reject' AND s.state='rejected') THEN NULL;
   ELSE
    IF s.state<>'pending' OR s.revision IS DISTINCT FROM (p_payload->>'revision')::int THEN RAISE EXCEPTION 'Submission changed. Refresh first';END IF;
    IF p_action='showdown_reject' THEN
     UPDATE @s@.showdown_submissions SET state='rejected',private_feedback=left(coalesce(p_payload->>'feedback',''),1000),reviewed_at=clock_timestamp(),revision=revision+1 WHERE id=s.id;
     INSERT INTO @s@.showdown_audit(submission,action) VALUES(s.id,'rejected');
    ELSE
     IF @s@.showdown_competition(s.quest) IS DISTINCT FROM s.month THEN RAISE EXCEPTION 'This monthly competition is closed';END IF;
     SELECT * INTO q FROM @s@.quests WHERE id=s.quest;
     IF NOT EXISTS(SELECT 1 FROM public.locations l JOIN @s@.schools sc ON sc.location_id=l.id WHERE l.id=s.location_id AND l.active AND sc.participating) OR (q.eligible IS NOT NULL AND NOT s.location_id=ANY(q.eligible)) THEN RAISE EXCEPTION 'The challenging school is no longer eligible';END IF;
     SELECT * INTO champ FROM @s@.showdown_current(s.quest);
     IF champ.location_id IS DISTINCT FROM s.target_school OR champ.photo_path IS DISTINCT FROM s.target_photo THEN RAISE EXCEPTION 'The champion changed. Request a corrected submission';END IF;
     IF EXISTS(SELECT 1 FROM @s@.showdown_used WHERE quest=s.quest AND month=s.month AND location_id=s.location_id) THEN RAISE EXCEPTION 'Challenge opportunity already used';END IF;
     SELECT * INTO r FROM @s@.showdown_rounds WHERE quest=s.quest AND state<>'finalized' FOR UPDATE;
     IF r.id IS NULL THEN
      INSERT INTO @s@.showdown_rounds(quest,month,defender,reward_points,quest_name,quest_description,quest_goal) SELECT s.quest,s.month,champ.location_id,reward_points,name,description,goal FROM @s@.quests WHERE id=s.quest RETURNING * INTO r;
      INSERT INTO @s@.showdown_photos(round_id,location_id,photo_path,role) VALUES(r.id,champ.location_id,champ.photo_path,'defender');
     ELSE
      IF r.state<>'voting' OR r.closes_at<=clock_timestamp() OR (SELECT count(*) FROM @s@.showdown_photos WHERE round_id=r.id)>=3 THEN RAISE EXCEPTION 'This showdown is full or voting has closed';END IF;
      UPDATE @s@.showdown_rounds SET generation=generation+1,started_at=clock_timestamp(),closes_at=clock_timestamp()+interval '24 hours',revision=revision+1 WHERE id=r.id RETURNING * INTO r;
     END IF;
     INSERT INTO @s@.showdown_photos(round_id,location_id,photo_path,role,submission) VALUES(r.id,s.location_id,s.photo_path,'challenger',s.id);
     INSERT INTO @s@.showdown_used VALUES(s.quest,s.month,s.location_id,r.id,'approved');
     UPDATE @s@.showdown_submissions SET state='approved',reviewed_at=clock_timestamp(),revision=revision+1 WHERE id=s.id;
     INSERT INTO @s@.showdown_audit(round_id,submission,action,details) VALUES(r.id,s.id,'approved',jsonb_build_object('generation',r.generation,'closes_at',r.closes_at));
    END IF;
   END IF;
  ELSIF p_action='showdown_vote' THEN
   SELECT * INTO r FROM @s@.showdown_rounds WHERE id=(p_payload->>'round_id')::uuid FOR UPDATE;
   IF r.id IS NULL OR r.state<>'voting' OR r.closes_at<=clock_timestamp() OR r.generation IS DISTINCT FROM (p_payload->>'generation')::int THEN RAISE EXCEPTION 'Voting closed or restarted. Refresh first';END IF;
   SELECT * INTO ph FROM @s@.showdown_photos WHERE id=(p_payload->>'photo')::uuid AND round_id=r.id;
   IF ph.id IS NULL OR ph.location_id=lid THEN RAISE EXCEPTION 'Choose another school in this showdown';END IF;
   INSERT INTO @s@.showdown_votes(round_id,generation,location_id,photo,employee_id) VALUES(r.id,r.generation,lid,ph.id,session.employee_id::text) ON CONFLICT(round_id,generation,location_id) DO UPDATE SET photo=excluded.photo,employee_id=excluded.employee_id,updated_at=clock_timestamp();
  ELSIF p_action='showdown_finalize' THEN
   request:=nullif(p_payload->>'request_id','')::uuid;
   IF request IS NULL OR (p_payload->>'confirmed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Confirm the final decision';END IF;
   SELECT * INTO r FROM @s@.showdown_rounds WHERE id=(p_payload->>'round_id')::uuid FOR UPDATE;
   SELECT * INTO ph FROM @s@.showdown_photos WHERE id=(p_payload->>'photo')::uuid AND round_id=r.id;
   IF ph.id IS NULL OR r.id IS NULL THEN RAISE EXCEPTION 'Choose a participating photograph';END IF;
   IF r.state='finalized' THEN
    IF r.winner IS DISTINCT FROM ph.id THEN RAISE EXCEPTION 'This decision was already finalized';END IF;
   ELSE
    IF r.state<>'decision' OR r.closes_at>clock_timestamp() OR r.revision IS DISTINCT FROM (p_payload->>'revision')::int THEN RAISE EXCEPTION 'Wait for voting to close and refresh before deciding';END IF;
    recover:=0;
    IF ph.location_id<>r.defender THEN
     @balance@
     recover:=least(r.reward_points,greatest(0,balance))::int;
     SELECT service_date INTO award_date FROM @s@.rewards WHERE event='quest:first:'||r.quest;
     award_date:=coalesce(award_date,r.month);
     INSERT INTO @s@.rewards(event,location_id,points,reason,service_date) VALUES('showdown:'||r.id||':reversal',r.defender,-recover,'Showdown reversal; original award preserved. Requested '||r.reward_points||', recovered '||recover||', zero-floor shortfall '||(r.reward_points-recover),award_date);
     INSERT INTO @s@.rewards(event,location_id,points,reason,service_date) VALUES('showdown:'||r.id||':award',ph.location_id,r.reward_points,'Side Quest Showdown champion',award_date);
     INSERT INTO @s@.unlock_credit_events(location_id,kind,credits,price,service_date,showdown_round) VALUES(ph.location_id,'showdown',3,0,(now() AT TIME ZONE 'America/Los_Angeles')::date,r.id);
     INSERT INTO @s@.showdown_used(quest,month,location_id,round_id,reason) VALUES(r.quest,r.month,r.defender,r.id,'defeated') ON CONFLICT DO NOTHING;
    END IF;
    INSERT INTO @s@.showdown_champions(quest,location_id,photo_path,round_id) VALUES(r.quest,ph.location_id,ph.photo_path,r.id) ON CONFLICT(quest) DO UPDATE SET location_id=excluded.location_id,photo_path=excluded.photo_path,round_id=excluded.round_id,updated_at=clock_timestamp();
    UPDATE @s@.showdown_rounds SET state='finalized',winner=ph.id,points_recovered=recover,points_shortfall=CASE WHEN ph.location_id<>r.defender THEN reward_points-recover ELSE 0 END,finalized_at=clock_timestamp(),decision_request=request,revision=revision+1 WHERE id=r.id;
    INSERT INTO @s@.showdown_audit(round_id,action,details) VALUES(r.id,'finalized',jsonb_build_object('winner',ph.location_id,'previous_champion',r.defender,'reward',r.reward_points,'recovered',recover,'shortfall',CASE WHEN ph.location_id<>r.defender THEN r.reward_points-recover ELSE 0 END,'policy','zero_floor_full_reward','request_id',request));
   END IF;
  END IF;
  result:=@s@.showdown_legacy('list',p_token,p_pin,'{}');
 ELSE
  IF p_action='review' AND EXISTS(SELECT 1 FROM @s@.entries e JOIN @s@.showdown_rounds sr ON sr.quest=e.quest WHERE e.id=(p_payload->>'id')::uuid) THEN RAISE EXCEPTION 'A challenged quest retains its original approval. Use Side Quest Challenges';END IF;
  IF p_action='reward' AND (p_payload->>'event' LIKE 'showdown:%' OR EXISTS(SELECT 1 FROM @s@.showdown_rounds sr WHERE p_payload->>'event'='quest:first:'||sr.quest)) THEN RAISE EXCEPTION 'Showdown reward history is immutable';END IF;
  result:=@s@.showdown_legacy(p_action,p_token,p_pin,p_payload);
 END IF;
 IF p_action='authorize' OR jsonb_typeof(result)<>'object' THEN RETURN result;END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('school_name',l.school_name)),'[]') INTO champions FROM @s@.showdown_champions c JOIN public.locations l ON l.id=c.location_id;
 SELECT coalesce(jsonb_agg((to_jsonb(sr)-'decision_request'-'points_recovered'-'points_shortfall')||CASE WHEN admin THEN jsonb_build_object('points_recovered',sr.points_recovered,'points_shortfall',sr.points_shortfall,'reward_events',(SELECT coalesce(jsonb_agg(to_jsonb(rw) ORDER BY rw.service_date,rw.event),'[]') FROM @s@.rewards rw WHERE rw.event IN('quest:first:'||sr.quest,'showdown:'||sr.id||':reversal','showdown:'||sr.id||':award'))) ELSE '{}'::jsonb END||jsonb_build_object(
 'photos',(SELECT coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('school_name',l.school_name,'votes',(SELECT count(*) FROM @s@.showdown_votes v WHERE v.round_id=sr.id AND v.generation=sr.generation AND v.photo=p.id)) ORDER BY p.role DESC,p.id),'[]') FROM @s@.showdown_photos p JOIN public.locations l ON l.id=p.location_id WHERE p.round_id=sr.id),
 'my_vote',(SELECT photo FROM @s@.showdown_votes WHERE round_id=sr.id AND generation=sr.generation AND location_id=lid),
 'vote_activity',CASE WHEN admin THEN (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY generation,updated_at),'[]') FROM @s@.showdown_votes v WHERE v.round_id=sr.id) ELSE '[]'::jsonb END) ORDER BY sr.started_at DESC),'[]') INTO rounds FROM @s@.showdown_rounds sr;
 SELECT coalesce(jsonb_agg((to_jsonb(su)-'private_feedback'-'employee_id')||CASE WHEN admin THEN jsonb_build_object('private_feedback',su.private_feedback) ELSE '{}'::jsonb END||jsonb_build_object('school_name',l.school_name) ORDER BY su.submitted_at DESC),'[]') INTO submissions FROM @s@.showdown_submissions su JOIN public.locations l ON l.id=su.location_id WHERE admin OR su.location_id=lid;
 result:=result||jsonb_build_object('showdowns',jsonb_build_object('rounds',rounds,'submissions',submissions,'champions',champions,'used',(SELECT coalesce(jsonb_agg(quest),'[]') FROM @s@.showdown_used WHERE location_id=lid),'eligible_quests',(SELECT coalesce(jsonb_agg(qs.id),'[]') FROM @s@.quests qs WHERE @s@.showdown_competition(qs.id) IS NOT NULL AND (qs.eligible IS NULL OR lid=ANY(qs.eligible)))),'server_time',clock_timestamp());
 result:=jsonb_set(result,'{quests}',(SELECT coalesce(jsonb_agg(qi||CASE WHEN sc.quest IS NOT NULL THEN jsonb_build_object('first_school',sc.location_id) ELSE '{}'::jsonb END),'[]') FROM jsonb_array_elements(result->'quests') qi LEFT JOIN @s@.showdown_champions sc ON sc.quest=(qi->>'id')::int));
 RETURN result||jsonb_build_object('unused_showdown_photo',duplicate_photo);
 END$$;
 $wrapper$,'@s@',ns),'@env@',env);
 definition:=replace(definition,'@balance@',CASE WHEN env='live' THEN 'SELECT public.spark_bingo_season_balance(r.defender) INTO balance;' ELSE 'SELECT coalesce(sum(points),0) INTO balance FROM october_dev.rewards WHERE location_id=r.defender AND NOT voided;' END);
 EXECUTE definition;
 EXECUTE format('REVOKE ALL ON FUNCTION %I.showdown_competition(int),%I.showdown_current(int),%I.expire_showdowns(),%I.showdown_legacy(text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role',ns,ns,ns,ns);
 EXECUTE format('REVOKE ALL ON FUNCTION public.october_games_%s(text,text,text,jsonb) FROM PUBLIC,anon,authenticated',env);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.october_games_%s(text,text,text,jsonb) TO service_role',env);
 EXECUTE format('SELECT jsonb_build_array((SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM %I.entries e),(SELECT jsonb_agg(to_jsonb(c) ORDER BY quest) FROM %I.quest_claims c),(SELECT jsonb_agg(to_jsonb(r) ORDER BY event) FROM %I.rewards r))',ns,ns,ns) INTO after_records;
 IF after_records IS DISTINCT FROM original_records THEN RAISE EXCEPTION 'Existing Side Quest record preservation failed';END IF;
END LOOP;
END $install$;
DO $$BEGIN IF to_regnamespace('cron') IS NULL THEN RAISE EXCEPTION 'Automatic scheduler required';END IF;PERFORM cron.schedule('sidequest-showdown-deadlines','* * * * *','SELECT october_live.expire_showdowns()');END$$;
NOTIFY pgrst,'reload schema';
COMMIT;
