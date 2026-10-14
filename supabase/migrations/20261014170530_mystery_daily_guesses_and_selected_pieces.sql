BEGIN;
SET LOCAL lock_timeout='5s';
DO $install$
DECLARE env text; ns text; definition text; original text; constraint_text text; fn record;
BEGIN
FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
 ns:='october_'||env;
 EXECUTE format('CREATE TABLE %I.mystery_economy_backup(signature text PRIMARY KEY,definition text NOT NULL)',ns);
 EXECUTE format('ALTER TABLE %I.mystery_economy_backup ENABLE ROW LEVEL SECURITY',ns);
 EXECUTE format('REVOKE ALL ON %I.mystery_economy_backup FROM PUBLIC,anon,authenticated,service_role',ns);
 FOR fn IN SELECT p.oid,p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND (n.nspname=ns OR (n.nspname='public' AND p.proname='october_games_'||env)) LOOP
  EXECUTE format('INSERT INTO %I.mystery_economy_backup VALUES($1,$2)',ns) USING fn.signature,pg_get_functiondef(fn.oid);
 END LOOP;
 EXECUTE replace($ddl$
 ALTER TABLE @s@.rounds ADD COLUMN revealed_indices int[];
 ALTER TABLE @s@.unlocks ADD COLUMN banked boolean NOT NULL DEFAULT false;
 ALTER TABLE @s@.unlock_credit_events ADD COLUMN quest_entry uuid UNIQUE REFERENCES @s@.entries(id),ADD COLUMN piece_index integer CHECK(piece_index>=0);
 ALTER TABLE @s@.unlock_credit_events DROP CONSTRAINT unlock_credit_events_kind_check,ADD CONSTRAINT unlock_credit_events_kind_check CHECK(kind IN('daily','purchase','reveal','quest'));
 ALTER TABLE @s@.school_guesses DROP CONSTRAINT school_guesses_location_id_guess_day_key;
 CREATE UNIQUE INDEX one_free_school_guess_daily ON @s@.school_guesses(location_id,guess_day) WHERE purchase_id IS NULL AND prize_win IS NULL;
 CREATE FUNCTION @s@.selectable_monthly_pieces() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN
 IF EXISTS(SELECT 1 FROM @s@.mystery_collections WHERE id=NEW.collection_id AND NOT legacy) THEN NEW.revealed_indices:='{}';END IF;RETURN NEW;END$$;
 REVOKE ALL ON FUNCTION @s@.selectable_monthly_pieces() FROM PUBLIC,anon,authenticated,service_role;
 CREATE TRIGGER selectable_monthly_pieces BEFORE INSERT ON @s@.rounds FOR EACH ROW EXECUTE FUNCTION @s@.selectable_monthly_pieces();
 $ddl$,'@s@',ns);
 SELECT pg_get_constraintdef(oid) INTO constraint_text FROM pg_constraint WHERE conrelid=to_regclass(ns||'.unlock_credit_events') AND conname='unlock_credit_events_check';
 EXECUTE format('ALTER TABLE %I.unlock_credit_events DROP CONSTRAINT unlock_credit_events_check, ADD CONSTRAINT unlock_credit_events_check CHECK ((%s) OR (kind=''quest'' AND credits>0 AND price=0 AND quest_entry IS NOT NULL AND request_id IS NULL AND round IS NULL))',ns,substring(constraint_text FROM 8 FOR length(constraint_text)-8));
 SELECT pg_get_functiondef(to_regprocedure(ns||'.credit_game_engine(text,text,text,jsonb)')) INTO definition;original:=definition;
 definition:=replace(definition,'IF guessed_today THEN RAISE EXCEPTION ''Your school has already guessed today. Try again tomorrow.''; END IF;','-- A daily free guess may be followed by an available paid/prize guess.');
 definition:=replace(definition,'SELECT EXISTS(SELECT 1 FROM '||ns||'.guess_history() g WHERE g.location_id=lid AND g.round=r.id) INTO used_free;','used_free:=guessed_today;');
 definition:=replace(definition,'SELECT EXISTS(SELECT 1 FROM '||ns||'.guess_history() g WHERE g.location_id=lid AND g.round=current_round) INTO used_free;','used_free:=guessed_today;');
 IF definition=original OR position('IF guessed_today THEN RAISE' IN definition)>0 THEN RAISE EXCEPTION 'Unexpected guessing engine';END IF;
 EXECUTE definition;
 -- New Side Quest awards enter the winning school's bank exactly once.
 SELECT pg_get_functiondef(to_regprocedure(ns||'.game_engine(text,text,text,jsonb)')) INTO definition;original:=definition;
 definition:=replace(definition,
 'insert into '||ns||'.unlocks(entry,round) values(e.id,case when cfg.mystery_state=''active'' then current_round end) on conflict do nothing returning pieces into n;',
 'insert into '||ns||'.unlocks(entry,round,banked) values(e.id,NULL,true) on conflict do nothing returning pieces into n;');
 definition:=replace(definition,
 'if found and cfg.mystery_state=''active'' and current_round is not null then update '||ns||'.rounds set unlock_credits=unlock_credits+n,unlocked=october_dev.revealed_count(piece_costs,unlock_credits+n) where id=current_round;end if;',
 'if found then insert into '||ns||'.unlock_credit_events(location_id,kind,credits,service_date,quest_entry) values(e.location_id,''quest'',3,(now() AT TIME ZONE ''America/Los_Angeles'')::date,e.id) on conflict(quest_entry) do nothing;end if;');
 definition:=replace(definition,'where u.round is null and entry.state=''approved''','where u.round is null and NOT u.banked and entry.state=''approved''');
 definition:=replace(definition,'where round is null and entry in(select id from','where round is null and NOT banked and entry in(select id from');
 -- Preserve old pending awards, converting them only when a new selectable puzzle starts.
 definition:=replace(definition,'if cfg.mystery_state=''active'' and current_round is not null then',replace($pending$
 if cfg.mystery_state='active' and current_round is not null then
  if exists(select 1 from @s@.rounds where id=current_round and revealed_indices is not null) then
   insert into @s@.unlock_credit_events(location_id,kind,credits,service_date,quest_entry)
   select entry.location_id,'quest',u.pieces,(now() AT TIME ZONE 'America/Los_Angeles')::date,u.entry from @s@.unlocks u join @s@.entries entry on entry.id=u.entry where u.round is null and not u.banked and entry.state='approved' on conflict(quest_entry) do nothing;
   update @s@.unlocks set banked=true where round is null and not banked and entry in(select id from @s@.entries where state='approved');
  end if;
 $pending$,'@s@',ns));
 IF definition=original OR position('unlocks(entry,round,banked)' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected Side Quest engine';END IF;
 EXECUTE definition;
 SELECT pg_get_functiondef(to_regprocedure('public.october_games_'||env||'(text,text,text,jsonb)')) INTO definition;
 definition:=replace(definition,'FUNCTION public.october_games_'||env||'(','FUNCTION '||ns||'.selection_legacy(');EXECUTE definition;
 EXECUTE format('REVOKE ALL ON FUNCTION %I.selection_legacy(text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role',ns);
 definition:=$wrapper$
 CREATE OR REPLACE FUNCTION public.october_games_@env@(p_action text,p_token text DEFAULT NULL,p_pin text DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE result jsonb; r @s@.rounds; s public.supper_monitoring_sessions; prior @s@.unlock_credit_events; request uuid; selected int; needed int; bank bigint; lid bigint; cfg @s@.settings;
 BEGIN
 IF p_action='reveal_piece' THEN SELECT * INTO r FROM @s@.rounds WHERE id=(p_payload->>'round')::int;END IF;
 IF p_action='reveal_piece' AND r.revealed_indices IS NOT NULL THEN
  IF p_pin IS NOT NULL THEN RAISE EXCEPTION 'Participating school manager required';END IF;
  s:=public.require_supper_monitoring_session(p_token);lid:=s.location_id;
  IF s.actor_role<>'manager' OR s.employee_id IS NULL OR NOT coalesce((SELECT participating FROM @s@.schools WHERE location_id=lid),false) THEN RAISE EXCEPTION 'Participating school manager required';END IF;
  SELECT * INTO cfg FROM @s@.settings WHERE id FOR UPDATE;
  request:=nullif(p_payload->>'request_id','')::uuid;selected:=(p_payload->>'piece_index')::int;
  IF request IS NULL OR selected IS NULL THEN RAISE EXCEPTION 'Select a piece and refresh before continuing';END IF;
  SELECT * INTO prior FROM @s@.unlock_credit_events WHERE request_id=request;
  IF FOUND THEN
   IF prior.location_id<>lid OR prior.kind<>'reveal' OR prior.round IS DISTINCT FROM r.id OR prior.piece_index IS DISTINCT FROM selected OR -prior.credits IS DISTINCT FROM (p_payload->>'expected_cost')::int THEN RAISE EXCEPTION 'Unlock request changed';END IF;
  ELSE
   result:=@s@.selection_legacy('list',p_token,NULL,'{}');
   SELECT * INTO r FROM @s@.rounds WHERE id=(p_payload->>'round')::int FOR UPDATE;
   IF cfg.mystery_state<>'active' OR @s@.current_mystery() IS DISTINCT FROM r.id OR r.photo_path IS NULL OR selected<0 OR selected>=jsonb_array_length(r.pieces) OR selected=ANY(r.revealed_indices) OR r.unlocked IS DISTINCT FROM (p_payload->>'expected_unlocked')::int THEN RAISE EXCEPTION 'The puzzle changed. Refresh before revealing another piece.';END IF;
   needed:=r.piece_costs[selected+1];
   IF needed IS NULL OR needed IS DISTINCT FROM (p_payload->>'expected_cost')::int THEN RAISE EXCEPTION 'The piece cost changed. Refresh.';END IF;
   SELECT coalesce(sum(credits),0) INTO bank FROM @s@.unlock_credit_events WHERE location_id=lid;
   IF bank<needed THEN RAISE EXCEPTION 'Your school does not have enough unlock credits';END IF;
   INSERT INTO @s@.unlock_credit_events(location_id,kind,credits,service_date,request_id,round,employee_id,piece_index) VALUES(lid,'reveal',-needed,(now() AT TIME ZONE 'America/Los_Angeles')::date,request,r.id,s.employee_id::text,selected);
   UPDATE @s@.rounds SET revealed_indices=array_append(revealed_indices,selected),unlocked=cardinality(revealed_indices)+1,unlock_credits=unlock_credits+needed WHERE id=r.id;
  END IF;
  result:=@s@.selection_legacy('list',p_token,NULL,'{}')||jsonb_build_object('piece_revealed',true);
 ELSE result:=@s@.selection_legacy(p_action,p_token,p_pin,p_payload);END IF;
 IF p_action IN('authorize','rewards') THEN RETURN result;END IF;
 IF NOT coalesce((result->>'admin')::boolean,false) THEN
  result:=result||jsonb_build_object('recent_guesses',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY submitted_at DESC,attempt_key DESC),'[]') FROM (SELECT h.attempt_key,h.guess,h.submitted_at,l.school_name FROM @s@.guess_history() h JOIN public.locations l ON l.id=h.location_id WHERE h.round=(result->>'current_round')::int AND h.location_id<>(result->>'location_id')::bigint ORDER BY h.submitted_at DESC,h.attempt_key DESC LIMIT 5)g));
 END IF;
 RETURN result;
 END$$;
 $wrapper$;
 EXECUTE replace(replace(definition,'@s@',ns),'@env@',env);
 EXECUTE format('REVOKE ALL ON FUNCTION public.october_games_%s(text,text,text,jsonb) FROM PUBLIC,anon,authenticated',env);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.october_games_%s(text,text,text,jsonb) TO service_role',env);
END LOOP;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
