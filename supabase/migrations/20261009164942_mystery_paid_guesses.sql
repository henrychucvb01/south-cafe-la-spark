BEGIN;
SET LOCAL lock_timeout='5s';
DO $migration$
DECLARE env text; ns text; history_sql text; sql_text text;
BEGIN
FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
 ns:='october_'||env;
 EXECUTE replace($ddl$
 CREATE TABLE @s@.guess_purchases(
  id uuid PRIMARY KEY,location_id bigint NOT NULL REFERENCES public.locations(id),round integer NOT NULL REFERENCES @s@.rounds(id),
  employee_id text NOT NULL,price integer NOT NULL CHECK(price>0),purchased_at timestamptz NOT NULL DEFAULT now(),
  available_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Los_Angeles')::date+1),
  consumed_at timestamptz,refunded_at timestamptz,CHECK(consumed_at IS NULL OR refunded_at IS NULL)
 );
 CREATE INDEX guess_purchase_school_round ON @s@.guess_purchases(location_id,round);
 CREATE INDEX guess_purchase_refunds ON @s@.guess_purchases(round) WHERE consumed_at IS NULL AND refunded_at IS NULL;
 CREATE TABLE @s@.school_guesses(
  id uuid PRIMARY KEY,round integer NOT NULL REFERENCES @s@.rounds(id),location_id bigint NOT NULL REFERENCES public.locations(id),
  employee_id text NOT NULL,guess text NOT NULL,correct boolean NOT NULL,submitted_at timestamptz NOT NULL DEFAULT now(),
  guess_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Los_Angeles')::date),
  purchase_id uuid UNIQUE REFERENCES @s@.guess_purchases(id),prize_win bigint UNIQUE,
  UNIQUE(location_id,guess_day),CHECK(purchase_id IS NULL OR prize_win IS NULL)
 );
 CREATE INDEX school_guesses_round ON @s@.school_guesses(round);
 CREATE TABLE @s@.guess_overrides(
  round integer PRIMARY KEY REFERENCES @s@.rounds(id),attempt_key text NOT NULL,location_id bigint NOT NULL REFERENCES public.locations(id),
  accepted_at timestamptz NOT NULL DEFAULT now(),accepted_by text NOT NULL DEFAULT 'Supervisor / AFSS'
 );
 ALTER TABLE @s@.guess_purchases ENABLE ROW LEVEL SECURITY;
 ALTER TABLE @s@.school_guesses ENABLE ROW LEVEL SECURITY;
 ALTER TABLE @s@.guess_overrides ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON @s@.guess_purchases,@s@.school_guesses,@s@.guess_overrides FROM PUBLIC,anon,authenticated;
 $ddl$,'@s@',ns);

 history_sql:=replace($history$
 SELECT 'original:'||g.round||':'||g.employee_id AS attempt_key,g.round,g.employee_id,g.location_id,g.guess,g.correct,g.submitted_at FROM @s@.guesses g
 UNION ALL SELECT 'attempt:'||g.id,g.round,g.employee_id,g.location_id,g.guess,g.correct,g.submitted_at FROM @s@.school_guesses g
 $history$,'@s@',ns);
 IF env='live' THEN history_sql:=history_sql||' UNION ALL SELECT ''prize:''||g.win_id,g.round,g.employee_id,g.location_id,g.guess,g.correct,g.submitted_at FROM october_live.extra_guesses g'; END IF;
 EXECUTE format('CREATE FUNCTION %I.guess_history() RETURNS TABLE(attempt_key text,round int,employee_id text,location_id bigint,guess text,correct boolean,submitted_at timestamptz) LANGUAGE sql STABLE SET search_path=pg_catalog AS %L',ns,history_sql);

 -- The private legacy engine retains all unrelated game behavior, but cannot be called by clients.
 EXECUTE format('ALTER FUNCTION public.october_games_%s(text,text,text,jsonb) SET SCHEMA %I',env,ns);
 EXECUTE format('ALTER FUNCTION %I.october_games_%s(text,text,text,jsonb) RENAME TO game_engine',ns,env);
 EXECUTE format('REVOKE ALL ON FUNCTION %I.game_engine(text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role',ns);

 sql_text:=$ledger$
 CREATE FUNCTION @s@.guess_points(p_school bigint,p_amount int,p_key text,p_description text) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN
 @ledger@
 END $$;
 $ledger$;
 IF env='live' THEN
 sql_text:=replace(sql_text,'@ledger@',$live$
 INSERT INTO public.spark_points(location_id,points,point_type,description,service_date,source,awarded_by,unique_key)
 VALUES(p_school,p_amount,CASE WHEN p_amount<0 THEN 'mystery_guess_purchase' ELSE 'mystery_guess_refund' END,p_description,
 (now() AT TIME ZONE 'America/Los_Angeles')::date,'automatic','SPARK Mystery Photo',p_key) ON CONFLICT(unique_key) DO NOTHING;
 $live$);
 ELSE sql_text:=replace(sql_text,'@ledger@','INSERT INTO october_dev.rewards(event,location_id,points,reason) VALUES(p_key,p_school,p_amount,p_description) ON CONFLICT DO NOTHING;'); END IF;
 EXECUTE replace(sql_text,'@s@',ns);

 EXECUTE replace($solve$
 CREATE FUNCTION @s@.solve_mystery(p_round int,p_school bigint) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
 DECLARE purchase @s@.guess_purchases; reward int;
 BEGIN
 UPDATE @s@.rounds SET winner=p_school,solved_at=now(),unlocked=jsonb_array_length(pieces) WHERE id=p_round AND solved_at IS NULL RETURNING reward_points INTO reward;
 IF NOT FOUND THEN RAISE EXCEPTION 'This mystery already has a winner'; END IF;
 INSERT INTO @s@.rewards(event,location_id,points) VALUES('mystery:'||p_round,p_school,reward) ON CONFLICT DO NOTHING;
 FOR purchase IN SELECT * FROM @s@.guess_purchases WHERE round=p_round AND consumed_at IS NULL AND refunded_at IS NULL FOR UPDATE LOOP
  PERFORM @s@.guess_points(purchase.location_id,purchase.price,'mystery-guess-refund:'||purchase.id,'Refund: unused guess for Mystery '||p_round);
  UPDATE @s@.guess_purchases SET refunded_at=now() WHERE id=purchase.id;
 END LOOP;
 END $$;
 $solve$,'@s@',ns);

 sql_text:=$wrapper$
 CREATE FUNCTION public.october_games_@env@(p_action text,p_token text DEFAULT NULL,p_pin text DEFAULT NULL,p_payload jsonb DEFAULT '{}')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE s public.supper_monitoring_sessions; cfg @s@.settings; r @s@.rounds; purchase @s@.guess_purchases; attempt @s@.school_guesses;
 actor record; prize public.mystery_wins; lid bigint; eid text; admin boolean:=false; result jsonb; history jsonb; balance bigint;
 today date:=(now() AT TIME ZONE 'America/Los_Angeles')::date; current_round int; ordinal int; cost bigint; request_id uuid;
 text_guess text; correct boolean; guessed_today boolean; used_free boolean;
 BEGIN
 IF p_pin IS NOT NULL THEN
  IF public.verify_supervisor_pin(p_pin) IS NOT TRUE THEN RAISE EXCEPTION 'Supervisor authorization required'; END IF;admin:=true;
 ELSE s:=public.require_supper_monitoring_session(p_token);IF s.actor_role<>'manager' THEN RAISE EXCEPTION 'Manager session required'; END IF;lid:=s.location_id;eid:=s.employee_id::text;
 END IF;
 SELECT * INTO cfg FROM @s@.settings WHERE id FOR UPDATE;
 SELECT min(id) INTO current_round FROM @s@.rounds WHERE solved_at IS NULL;
 IF p_action IN ('buy_guess','guess') THEN
  IF admin OR eid IS NULL OR NOT coalesce((SELECT participating FROM @s@.schools WHERE location_id=lid),false) THEN RAISE EXCEPTION 'Participating school manager required'; END IF;
  request_id:=nullif(p_payload->>'request_id','')::uuid;
  IF request_id IS NULL THEN RAISE EXCEPTION 'Refresh the page before continuing'; END IF;
  -- Retrying the exact confirmed operation never charges or submits twice, even after a round closes.
  IF p_action='buy_guess' THEN
   IF extract(month FROM today) IN (6,7) AND today>make_date(extract(year FROM today)::int,6,7) THEN RAISE EXCEPTION 'Season purchases reopen August 1'; END IF;
   SELECT * INTO purchase FROM @s@.guess_purchases WHERE id=request_id;
   IF FOUND THEN
    IF purchase.location_id<>lid OR purchase.round IS DISTINCT FROM (p_payload->>'round')::int OR purchase.price IS DISTINCT FROM (p_payload->>'expected_price')::int THEN RAISE EXCEPTION 'Purchase request changed'; END IF;
    RETURN public.october_games_@env@('list',p_token,p_pin,'{}')||jsonb_build_object('purchase_saved',true);
   END IF;
  ELSE
   SELECT * INTO attempt FROM @s@.school_guesses WHERE id=request_id;
   IF FOUND THEN
    IF attempt.location_id<>lid OR attempt.round IS DISTINCT FROM (p_payload->>'round')::int OR attempt.guess IS DISTINCT FROM lower(regexp_replace(trim(p_payload->>'guess'),'\s+',' ','g')) THEN RAISE EXCEPTION 'Guess request changed'; END IF;
    RETURN public.october_games_@env@('list',p_token,p_pin,'{}')||jsonb_build_object('guess_correct',attempt.correct,'guess_points',(SELECT reward_points FROM @s@.rounds WHERE id=attempt.round));
   END IF;
  END IF;
  IF cfg.mystery_state<>'active' OR current_round IS NULL OR current_round IS DISTINCT FROM (p_payload->>'round')::int THEN RAISE EXCEPTION 'That mystery is no longer active. Refresh.'; END IF;
  SELECT * INTO r FROM @s@.rounds WHERE id=current_round;
  IF r.photo_path IS NULL THEN RAISE EXCEPTION 'Waiting for the mystery photo'; END IF;
  IF p_action='buy_guess' THEN
   SELECT count(*)+1 INTO ordinal FROM @s@.guess_purchases WHERE location_id=lid AND round=r.id;
   cost:=CASE WHEN ordinal=1 THEN 10 WHEN ordinal<29 THEN (25*power(2,ordinal-2))::bigint ELSE NULL END;
   IF cost IS NULL OR cost>2147483647 THEN RAISE EXCEPTION 'No affordable extra guesses remain'; END IF;
   IF (p_payload->>'confirmed')::boolean IS NOT TRUE OR cost IS DISTINCT FROM (p_payload->>'expected_price')::bigint THEN RAISE EXCEPTION 'Confirm the current purchase price before spending points'; END IF;
   @balance@
   IF balance<cost THEN RAISE EXCEPTION 'Your school does not have enough SPARK Points'; END IF;
   INSERT INTO @s@.guess_purchases(id,location_id,round,employee_id,price) VALUES(request_id,lid,r.id,eid,cost);
   PERFORM @s@.guess_points(lid,-cost::int,'mystery-guess-purchase:'||request_id,'Extra guess purchase for Mystery '||r.id);
  ELSE
   SELECT EXISTS(SELECT 1 FROM @s@.guess_history() g WHERE g.location_id=lid AND (g.submitted_at AT TIME ZONE 'America/Los_Angeles')::date=today) INTO guessed_today;
   IF guessed_today THEN RAISE EXCEPTION 'Your school has already guessed today. Try again tomorrow.'; END IF;
   SELECT EXISTS(SELECT 1 FROM @s@.guess_history() g WHERE g.location_id=lid AND g.round=r.id) INTO used_free;
   text_guess:=lower(regexp_replace(trim(p_payload->>'guess'),'\s+',' ','g'));
   IF text_guess IS NULL OR length(text_guess) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Enter a guess (up to 120 characters)'; END IF;
   IF used_free THEN
    IF p_payload->>'extra_guess_win' IS NOT NULL THEN
     @prize@
    ELSE
     SELECT * INTO purchase FROM @s@.guess_purchases WHERE location_id=lid AND round=r.id AND consumed_at IS NULL AND refunded_at IS NULL AND available_on<=today ORDER BY purchased_at,price,id LIMIT 1 FOR UPDATE;
     IF purchase.id IS NULL THEN RAISE EXCEPTION 'No extra guess is available today. Purchased guesses unlock tomorrow.'; END IF;
    END IF;
   ELSIF p_payload->>'extra_guess_win' IS NOT NULL THEN RAISE EXCEPTION 'Use your school''s free guess first'; END IF;
   correct:=EXISTS(SELECT 1 FROM unnest(array_append(r.aliases,r.answer)) a WHERE lower(regexp_replace(trim(a),'\s+',' ','g'))=text_guess);
   INSERT INTO @s@.school_guesses(id,round,location_id,employee_id,guess,correct,purchase_id,prize_win) VALUES(request_id,r.id,lid,eid,text_guess,correct,purchase.id,prize.id);
   IF purchase.id IS NOT NULL THEN UPDATE @s@.guess_purchases SET consumed_at=now() WHERE id=purchase.id; END IF;
   @consume_prize@
   IF correct THEN PERFORM @s@.solve_mystery(r.id,lid); END IF;
  END IF;
 ELSIF p_action='accept_guess' THEN
  IF NOT admin THEN RAISE EXCEPTION 'Supervisor authorization required'; END IF;
  SELECT * INTO actor FROM @s@.guess_history() WHERE attempt_key=p_payload->>'attempt_key' AND round=(p_payload->>'round')::int;
  IF NOT FOUND THEN RAISE EXCEPTION 'Submitted guess not found'; END IF;
  IF NOT EXISTS(SELECT 1 FROM @s@.guess_overrides WHERE round=actor.round AND attempt_key=actor.attempt_key) THEN
   INSERT INTO @s@.guess_overrides(round,attempt_key,location_id) VALUES(actor.round,actor.attempt_key,actor.location_id);
   PERFORM @s@.solve_mystery(actor.round,actor.location_id);
  END IF;
 END IF;
 IF p_action='round' AND (EXISTS(SELECT 1 FROM @s@.school_guesses WHERE round=(p_payload->>'id')::int) OR EXISTS(SELECT 1 FROM @s@.guess_purchases WHERE round=(p_payload->>'id')::int)) THEN RAISE EXCEPTION 'Started mystery rounds are locked'; END IF;
 result:=@s@.game_engine(CASE WHEN p_action IN ('buy_guess','guess','accept_guess') THEN 'list' ELSE p_action END,p_token,p_pin,CASE WHEN p_action IN ('buy_guess','guess','accept_guess') THEN '{}'::jsonb ELSE p_payload END);
 IF p_action IN ('authorize','rewards') THEN RETURN result; END IF;
 SELECT min(id) INTO current_round FROM @s@.rounds WHERE solved_at IS NULL;
 SELECT count(*)+1 INTO ordinal FROM @s@.guess_purchases WHERE location_id=lid AND round=current_round;
 cost:=CASE WHEN ordinal=1 THEN 10 WHEN ordinal<29 THEN (25*power(2,ordinal-2))::bigint END;
 @balance@
 SELECT EXISTS(SELECT 1 FROM @s@.guess_history() g WHERE g.location_id=lid AND (g.submitted_at AT TIME ZONE 'America/Los_Angeles')::date=today) INTO guessed_today;
 SELECT EXISTS(SELECT 1 FROM @s@.guess_history() g WHERE g.location_id=lid AND g.round=current_round) INTO used_free;
 result:=result||jsonb_build_object('guess_shop',jsonb_build_object('next_price',cost,'purchase_number',ordinal,'balance',balance,'used_today',guessed_today,'free_available',NOT used_free,
  'available',(SELECT count(*) FROM @s@.guess_purchases WHERE location_id=lid AND round=current_round AND consumed_at IS NULL AND refunded_at IS NULL AND available_on<=today),
  'tomorrow',(SELECT count(*) FROM @s@.guess_purchases WHERE location_id=lid AND round=current_round AND consumed_at IS NULL AND refunded_at IS NULL AND available_on>today)),
  'guess_correct',correct,'guess_points',CASE WHEN correct THEN r.reward_points END,'purchase_saved',p_action='buy_guess');
 result:=jsonb_set(result,'{rounds}',(SELECT coalesce(jsonb_agg(item||jsonb_build_object('winner_name',(SELECT school_name FROM public.locations WHERE id=(item->>'winner')::bigint)) ORDER BY (item->>'id')::int),'[]') FROM jsonb_array_elements(result->'rounds') item));
 IF admin THEN
  SELECT coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('correct',g.correct OR o.round IS NOT NULL,'supervisor_accepted',o.round IS NOT NULL) ORDER BY g.submitted_at DESC),'[]') INTO history FROM @s@.guess_history() g LEFT JOIN @s@.guess_overrides o ON o.attempt_key=g.attempt_key AND o.round=g.round;
  result:=jsonb_set(result,'{guesses}',history);
 END IF;
 RETURN result;
 END $$;
 $wrapper$;
 -- Balance policy is filled explicitly below; development uses its own test ledger only.
 IF env='live' THEN
  sql_text:=replace(sql_text,'@balance@','SELECT coalesce(sum(points),0) INTO balance FROM public.spark_points WHERE location_id=lid AND service_date>=make_date(extract(year FROM today)::int-CASE WHEN extract(month FROM today)<8 THEN 1 ELSE 0 END,8,1) AND service_date<=least(today,make_date(extract(year FROM today)::int+CASE WHEN extract(month FROM today)>=8 THEN 1 ELSE 0 END,6,7));');
  sql_text:=replace(sql_text,'@prize@',$prize$
   SELECT * INTO prize FROM public.mystery_wins WHERE id=(p_payload->>'extra_guess_win')::bigint AND location_id=lid AND reward_type='extra_guess' AND status='waiting' FOR UPDATE;
   IF prize.id IS NULL THEN RAISE EXCEPTION 'That extra guess prize is unavailable'; END IF;
  $prize$);
  sql_text:=replace(sql_text,'@consume_prize@',$consume$
   IF prize.id IS NOT NULL THEN
    INSERT INTO public.mystery_redemptions(win_id,location_id,reward_type,details) VALUES(prize.id,lid,'extra_guess',jsonb_build_object('round',r.id,'employee_id',eid));
    UPDATE public.mystery_wins SET status='received',fulfilled_at=now() WHERE id=prize.id;
   END IF;
  $consume$);
 ELSE
  sql_text:=replace(sql_text,'@balance@','SELECT coalesce(sum(points),0) INTO balance FROM october_dev.rewards WHERE location_id=lid AND NOT voided;');
  sql_text:=replace(sql_text,'@prize@','RAISE EXCEPTION ''Prize redemption is only available in the live game'';');
  sql_text:=replace(sql_text,'@consume_prize@','');
 END IF;
 EXECUTE replace(replace(sql_text,'@s@',ns),'@env@',env);
 EXECUTE format('REVOKE ALL ON FUNCTION %I.guess_history(),%I.guess_points(bigint,int,text,text),%I.solve_mystery(int,bigint) FROM PUBLIC,anon,authenticated,service_role',ns,ns,ns);
 EXECUTE format('REVOKE ALL ON FUNCTION public.october_games_%s(text,text,text,jsonb) FROM PUBLIC,anon,authenticated',env);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.october_games_%s(text,text,text,jsonb) TO service_role',env);
END LOOP;
END $migration$;
COMMIT;
