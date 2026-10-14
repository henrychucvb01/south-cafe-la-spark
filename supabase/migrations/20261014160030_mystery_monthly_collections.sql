BEGIN;
SET LOCAL lock_timeout='5s';
DO $install$
DECLARE env text; ns text; definition text; fn record; old_text text; changed int; original_rounds jsonb;
BEGIN
FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
 ns:='october_'||env;
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),''[]'') FROM %I.rounds r',ns) INTO original_rounds;
 EXECUTE format('CREATE TABLE %I.monthly_engine_backup(signature text PRIMARY KEY,definition text NOT NULL)',ns);
 EXECUTE format('ALTER TABLE %I.monthly_engine_backup ENABLE ROW LEVEL SECURITY',ns);
 EXECUTE format('REVOKE ALL ON %I.monthly_engine_backup FROM PUBLIC,anon,authenticated,service_role',ns);
 FOR fn IN SELECT p.oid,p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND (n.nspname=ns OR (n.nspname='public' AND p.proname='october_games_'||env)) LOOP
  EXECUTE format('INSERT INTO %I.monthly_engine_backup VALUES($1,$2)',ns) USING fn.signature,pg_get_functiondef(fn.oid);
 END LOOP;
 EXECUTE replace($ddl$
 CREATE TABLE @s@.mystery_collections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),month date NOT NULL UNIQUE CHECK(month=date_trunc('month',month)::date),state text NOT NULL CHECK(state IN('draft','active','archived')),legacy boolean NOT NULL DEFAULT false,revision int NOT NULL DEFAULT 1,activated_at timestamptz,archived_at timestamptz);
 CREATE UNIQUE INDEX mystery_one_active_collection ON @s@.mystery_collections(state) WHERE state='active';
 ALTER TABLE @s@.rounds DROP CONSTRAINT rounds_id_check, ADD CONSTRAINT rounds_positive_id CHECK(id>0), ADD COLUMN collection_id uuid REFERENCES @s@.mystery_collections(id),ADD COLUMN position int CHECK(position BETWEEN 1 AND 10);
 INSERT INTO @s@.mystery_collections(month,state,legacy,activated_at) SELECT date_trunc('month',coalesce(min(solved_at),now()) AT TIME ZONE 'America/Los_Angeles')::date,'active',true,now() FROM @s@.rounds;
 UPDATE @s@.rounds SET collection_id=(SELECT id FROM @s@.mystery_collections WHERE legacy),position=id;
 CREATE UNIQUE INDEX mystery_round_position ON @s@.rounds(collection_id,position);
 CREATE TABLE @s@.mystery_drafts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),collection_id uuid NOT NULL REFERENCES @s@.mystery_collections(id),position int NOT NULL CHECK(position BETWEEN 1 AND 10),photo_path text,answer text NOT NULL DEFAULT '',aliases text[] NOT NULL DEFAULT '{}',reward_points int NOT NULL CHECK(reward_points BETWEEN 1 AND 1000),piece_count int NOT NULL CHECK(piece_count BETWEEN 2 AND 29),difficulty int NOT NULL DEFAULT 1 CHECK(difficulty BETWEEN 1 AND 3),pieces jsonb NOT NULL DEFAULT '[]',piece_costs int[] NOT NULL DEFAULT '{}',revision int NOT NULL DEFAULT 1,UNIQUE(collection_id,position) DEFERRABLE INITIALLY IMMEDIATE);
 ALTER TABLE @s@.mystery_collections ENABLE ROW LEVEL SECURITY;
 ALTER TABLE @s@.mystery_drafts ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON @s@.mystery_collections,@s@.mystery_drafts FROM PUBLIC,anon,authenticated,service_role;
 CREATE FUNCTION @s@.current_mystery() RETURNS integer LANGUAGE sql STABLE SET search_path=pg_catalog AS $$SELECT r.id FROM @s@.rounds r JOIN @s@.mystery_collections c ON c.id=r.collection_id WHERE c.state='active' AND r.solved_at IS NULL ORDER BY r.position LIMIT 1$$;
 REVOKE ALL ON FUNCTION @s@.current_mystery() FROM PUBLIC,anon,authenticated,service_role;
 CREATE FUNCTION @s@.lock_monthly_mystery() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$BEGIN
 IF EXISTS(SELECT 1 FROM @s@.mystery_collections WHERE id=OLD.collection_id AND NOT legacy) AND (NEW.pieces IS DISTINCT FROM OLD.pieces OR NEW.piece_costs IS DISTINCT FROM OLD.piece_costs OR NEW.photo_path IS DISTINCT FROM OLD.photo_path OR NEW.reward_points IS DISTINCT FROM OLD.reward_points OR NEW.answer IS DISTINCT FROM OLD.answer OR NEW.aliases IS DISTINCT FROM OLD.aliases OR NEW.position IS DISTINCT FROM OLD.position OR NEW.collection_id IS DISTINCT FROM OLD.collection_id) THEN RAISE EXCEPTION 'Activated mystery settings are permanently locked';END IF;RETURN NEW;END$$;
 CREATE TRIGGER mystery_layout_locked BEFORE UPDATE ON @s@.rounds FOR EACH ROW EXECUTE FUNCTION @s@.lock_monthly_mystery();
 REVOKE ALL ON FUNCTION @s@.lock_monthly_mystery() FROM PUBLIC,anon,authenticated,service_role;
 $ddl$,'@s@',ns);
 -- Reuse every deployed guessing/reward engine. Only its active-round lookup changes.
 changed:=0;
 FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN(ns,'public') AND p.prokind='f' AND (n.nspname=ns OR p.proname='october_games_'||env) LOOP
  SELECT pg_get_functiondef(fn.oid) INTO definition;old_text:=definition;
  definition:=regexp_replace(definition,'select min\(id\) into current_round from '||ns||'\.rounds where solved_at is null;', 'SELECT '||ns||'.current_mystery() INTO current_round;','gi');
  IF definition<>old_text THEN EXECUTE definition;changed:=changed+1;END IF;
 END LOOP;
 IF changed<2 THEN RAISE EXCEPTION 'Unexpected mystery engine: %',ns;END IF;
 -- Preserve the complete outer engine including any independently deployed game planning.
 SELECT pg_get_functiondef(to_regprocedure('public.october_games_'||env||'(text,text,text,jsonb)')) INTO definition;
 definition:=replace(definition,'FUNCTION public.october_games_'||env||'(','FUNCTION '||ns||'.monthly_legacy(');EXECUTE definition;
 EXECUTE format('REVOKE ALL ON FUNCTION %I.monthly_legacy(text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role',ns);
 definition:=$wrapper$
 CREATE OR REPLACE FUNCTION public.october_games_@env@(p_action text,p_token text DEFAULT NULL,p_pin text DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE result jsonb; actor jsonb; c @s@.mystery_collections; d @s@.mystery_drafts; previous @s@.mystery_collections; row @s@.mystery_drafts; purchase @s@.guess_purchases; month_date date; next_id int; target_position int; ready int; costs int[]; active_id uuid; today date:=(now() AT TIME ZONE 'America/Los_Angeles')::date;
 BEGIN
 IF p_action LIKE 'collection_%' THEN
  actor:=@s@.monthly_legacy('authorize',p_token,p_pin,'{}');
  IF coalesce((actor->>'admin')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Supervisor authorization required';END IF;
  PERFORM 1 FROM @s@.settings WHERE id FOR UPDATE;
  IF p_action='collection_create' THEN
   IF coalesce(p_payload->>'month','') !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Select a month';END IF;
   month_date:=(p_payload->>'month'||'-01')::date;
   IF month_date<date_trunc('month',today)::date THEN RAISE EXCEPTION 'Cannot prepare a past month';END IF;
   INSERT INTO @s@.mystery_collections(month,state) VALUES(month_date,'draft') ON CONFLICT(month) DO NOTHING RETURNING * INTO c;
   IF c.id IS NOT NULL THEN
    INSERT INTO @s@.mystery_drafts(collection_id,position,piece_count,reward_points,difficulty) SELECT c.id,n,(ARRAY[12,14,16,18,20,22,24,25,28,28])[n],(ARRAY[10,15,20,25,30,35,40,45,50,60])[n],CASE WHEN n<=3 THEN 1 WHEN n<=7 THEN 2 ELSE 3 END FROM generate_series(1,10)n;
   END IF;
  ELSE
   SELECT * INTO c FROM @s@.mystery_collections WHERE id=(p_payload->>'collection_id')::uuid FOR UPDATE;
   IF c.id IS NULL OR c.state<>'draft' THEN RAISE EXCEPTION 'Only draft collections may be changed';END IF;
   IF c.revision IS DISTINCT FROM (p_payload->>'collection_revision')::int THEN RAISE EXCEPTION 'Collection changed. Refresh first.';END IF;
   IF p_action IN('collection_round','collection_move') THEN
    SELECT * INTO d FROM @s@.mystery_drafts WHERE id=(p_payload->>'id')::uuid AND collection_id=c.id FOR UPDATE;
    IF d.id IS NULL OR d.revision IS DISTINCT FROM (p_payload->>'revision')::int THEN RAISE EXCEPTION 'Mystery changed. Refresh first.';END IF;
    IF p_action='collection_move' THEN
     target_position:=d.position+(p_payload->>'direction')::int;
     IF (p_payload->>'direction')::int NOT IN(-1,1) OR target_position NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Invalid order';END IF;
     SET CONSTRAINTS ALL DEFERRED;
     UPDATE @s@.mystery_drafts SET position=CASE WHEN id=d.id THEN target_position ELSE d.position END,revision=revision+1 WHERE collection_id=c.id AND position IN(d.position,target_position);
     SET CONSTRAINTS ALL IMMEDIATE;
    ELSE
     IF length(coalesce(p_payload->>'answer',''))>120 OR jsonb_array_length(coalesce(p_payload->'aliases','[]'))>30 THEN RAISE EXCEPTION 'Answer is too long';END IF;
     IF p_payload ? 'photo_path' AND p_payload->>'photo_path' !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.webp$' THEN RAISE EXCEPTION 'Invalid photo';END IF;
     costs:=ARRAY(SELECT value::int FROM jsonb_array_elements_text(p_payload->'piece_costs'));
     IF jsonb_array_length(p_payload->'pieces') IS DISTINCT FROM (p_payload->>'piece_count')::int OR cardinality(costs) IS DISTINCT FROM (p_payload->>'piece_count')::int OR EXISTS(SELECT 1 FROM unnest(costs)k WHERE k NOT BETWEEN 1 AND 5) THEN RAISE EXCEPTION 'Invalid puzzle layout';END IF;
     UPDATE @s@.mystery_drafts SET photo_path=coalesce(p_payload->>'photo_path',photo_path),answer=trim(coalesce(p_payload->>'answer','')),aliases=ARRAY(SELECT trim(value) FROM jsonb_array_elements_text(coalesce(p_payload->'aliases','[]'))),reward_points=(p_payload->>'reward_points')::int,piece_count=(p_payload->>'piece_count')::int,difficulty=(p_payload->>'difficulty')::int,pieces=p_payload->'pieces',piece_costs=costs,revision=revision+1 WHERE id=d.id;
    END IF;
    UPDATE @s@.mystery_collections SET revision=revision+1 WHERE id=c.id;
   ELSIF p_action='collection_activate' THEN
    IF (p_payload->>'confirmed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Confirm monthly activation';END IF;
    SELECT * INTO previous FROM @s@.mystery_collections WHERE state='active';
    IF c.month>date_trunc('month',today)::date OR (previous.id IS NOT NULL AND c.month<=previous.month) THEN RAISE EXCEPTION 'Activate the next collection when its month begins';END IF;
    SELECT count(*) INTO ready FROM @s@.mystery_drafts WHERE collection_id=c.id AND photo_path IS NOT NULL AND answer<>'' AND jsonb_array_length(pieces)=piece_count AND cardinality(piece_costs)=piece_count;
    IF ready=0 OR (ready<10 AND (p_payload->>'confirm_incomplete')::boolean IS NOT TRUE) THEN RAISE EXCEPTION 'Collection incomplete. Confirm the number of ready mysteries first.';END IF;
    -- Refund unused guesses for archived unsolved mysteries, once; never reset school credits.
    FOR purchase IN SELECT p.* FROM @s@.guess_purchases p JOIN @s@.rounds r ON r.id=p.round WHERE r.collection_id=previous.id AND p.consumed_at IS NULL AND p.refunded_at IS NULL FOR UPDATE OF p LOOP
     PERFORM @s@.guess_points(purchase.location_id,purchase.price,'mystery-guess-refund:'||purchase.id,'Refund: unused guess at monthly archive');
     UPDATE @s@.guess_purchases SET refunded_at=now() WHERE id=purchase.id;
    END LOOP;
    UPDATE @s@.mystery_collections SET state='archived',archived_at=now(),revision=revision+1 WHERE state='active';
    SELECT coalesce(max(id),0) INTO next_id FROM @s@.rounds;
    FOR row IN SELECT * FROM @s@.mystery_drafts WHERE collection_id=c.id AND photo_path IS NOT NULL AND answer<>'' AND jsonb_array_length(pieces)=piece_count AND cardinality(piece_costs)=piece_count ORDER BY position LOOP
     next_id:=next_id+1;
     INSERT INTO @s@.rounds(id,photo_path,answer,aliases,pieces,piece_costs,reward_points,collection_id,position) VALUES(next_id,row.photo_path,row.answer,row.aliases,row.pieces,row.piece_costs,row.reward_points,c.id,row.position);
    END LOOP;
    UPDATE @s@.mystery_collections SET state='active',activated_at=now(),revision=revision+1 WHERE id=c.id;
    UPDATE @s@.settings SET mystery_state='active' WHERE id;
   ELSE RAISE EXCEPTION 'Unknown collection action';END IF;
  END IF;
  result:=actor||jsonb_build_object('collection_update',true,'current_round',@s@.current_mystery(),'settings',(SELECT to_jsonb(cfg) FROM @s@.settings cfg WHERE id),'rounds',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') FROM @s@.rounds r));
 ELSE result:=@s@.monthly_legacy(p_action,p_token,p_pin,p_payload);END IF;
 IF p_action IN('authorize','rewards') THEN RETURN result;END IF;
 SELECT id INTO active_id FROM @s@.mystery_collections WHERE state='active';
 RETURN result||jsonb_build_object('active_collection',active_id,'collections',(SELECT coalesce(jsonb_agg(to_jsonb(mc) ORDER BY month DESC),'[]') FROM @s@.mystery_collections mc WHERE mc.state<>'draft' OR (result->>'admin')::boolean),'mystery_drafts',CASE WHEN (result->>'admin')::boolean THEN (SELECT coalesce(jsonb_agg(to_jsonb(md) ORDER BY position),'[]') FROM @s@.mystery_drafts md) ELSE '[]'::jsonb END);
 END $$;
 $wrapper$;
 EXECUTE replace(replace(definition,'@s@',ns),'@env@',env);
 EXECUTE format('REVOKE ALL ON FUNCTION public.october_games_%s(text,text,text,jsonb) FROM PUBLIC,anon,authenticated',env);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.october_games_%s(text,text,text,jsonb) TO service_role',env);
 EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r)-''collection_id''-''position'' ORDER BY id),''[]'') FROM %I.rounds r',ns) INTO old_text;
 IF old_text::jsonb IS DISTINCT FROM original_rounds THEN RAISE EXCEPTION 'Historical mystery preservation failed: %',ns; END IF;
END LOOP;
END $install$;
NOTIFY pgrst,'reload schema';
COMMIT;
