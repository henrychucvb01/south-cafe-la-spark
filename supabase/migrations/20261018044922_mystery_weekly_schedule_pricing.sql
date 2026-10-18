BEGIN;
SET LOCAL lock_timeout='5s';
DO $install$
DECLARE env text;ns text;definition text;before_definition text;f record;before_records jsonb;after_records jsonb;
BEGIN
FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
 ns:='october_'||env;
 EXECUTE format('SELECT jsonb_build_array((SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),''[]'') FROM %I.rounds r),(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),''[]'') FROM %I.guess_purchases p),(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),''[]'') FROM %I.unlock_credit_events e))',ns,ns,ns) INTO before_records;
 EXECUTE replace($ddl$
 ALTER TABLE @s@.mystery_collections
  ADD COLUMN guess_first_price int NOT NULL DEFAULT 10 CHECK(guess_first_price BETWEEN 1 AND 10000),
  ADD COLUMN guess_next_price int NOT NULL DEFAULT 25 CHECK(guess_next_price BETWEEN 1 AND 10000),
  ADD COLUMN guess_multiplier int NOT NULL DEFAULT 2 CHECK(guess_multiplier BETWEEN 2 AND 10),
  ADD COLUMN unlock_single_price int NOT NULL DEFAULT 5 CHECK(unlock_single_price BETWEEN 1 AND 10000),
  ADD COLUMN unlock_bundle_price int NOT NULL DEFAULT 20 CHECK(unlock_bundle_price BETWEEN 1 AND 10000),
  ADD CONSTRAINT mystery_progressive_prices CHECK(guess_next_price>=guess_first_price);
 ALTER TABLE @s@.rounds DROP CONSTRAINT rounds_position_check,ADD CONSTRAINT rounds_position_check CHECK(position BETWEEN 1 AND 20);
 ALTER TABLE @s@.mystery_drafts DROP CONSTRAINT mystery_drafts_position_check,ADD CONSTRAINT mystery_drafts_position_check CHECK(position BETWEEN 1 AND 20);
 CREATE TABLE @s@.mystery_weeks(collection_id uuid REFERENCES @s@.mystery_collections(id),week int CHECK(week BETWEEN 1 AND 4),release_at timestamptz NOT NULL,state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','scheduled','released')),revision int NOT NULL DEFAULT 1,released_at timestamptz,PRIMARY KEY(collection_id,week));
 ALTER TABLE @s@.mystery_weeks ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON @s@.mystery_weeks FROM PUBLIC,anon,authenticated,service_role;
 CREATE FUNCTION @s@.prepare_mystery_weeks(p_collection uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
 DECLARE c @s@.mystery_collections;first_monday date;
 BEGIN
 SELECT * INTO c FROM @s@.mystery_collections WHERE id=p_collection;
 IF c.state NOT IN('draft','active') THEN RETURN;END IF;
 INSERT INTO @s@.mystery_drafts(collection_id,position,piece_count,reward_points,difficulty)
 SELECT c.id,n,(ARRAY[32,32,32,36,36,40,40,44,48,48])[1+(n-1)%10],(ARRAY[10,15,20,25,30,35,40,45,50,60])[1+(n-1)%10],CASE WHEN (n-1)%10<3 THEN 1 WHEN (n-1)%10<7 THEN 2 ELSE 3 END
 FROM generate_series(1,20)n WHERE NOT EXISTS(SELECT 1 FROM @s@.rounds r WHERE r.collection_id=c.id AND r.position=n) AND NOT EXISTS(SELECT 1 FROM @s@.mystery_drafts d WHERE d.collection_id=c.id AND d.position=n);
 first_monday:=c.month+((8-extract(isodow FROM c.month)::int)%7);
 INSERT INTO @s@.mystery_weeks(collection_id,week,release_at,state,released_at)
 SELECT c.id,w,((first_monday+(w-1)*7)+time '07:00') AT TIME ZONE 'America/Los_Angeles',CASE WHEN EXISTS(SELECT 1 FROM @s@.rounds r WHERE r.collection_id=c.id AND r.position BETWEEN (w-1)*5+1 AND w*5) THEN 'released' ELSE 'draft' END,CASE WHEN EXISTS(SELECT 1 FROM @s@.rounds r WHERE r.collection_id=c.id AND r.position BETWEEN (w-1)*5+1 AND w*5) THEN c.activated_at END FROM generate_series(1,4)w ON CONFLICT DO NOTHING;
 END$$;
 CREATE FUNCTION @s@.monthly_guess_number(p_school bigint,p_round int) RETURNS bigint LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT count(*)+1 FROM @s@.guess_purchases p JOIN @s@.rounds bought ON bought.id=p.round JOIN @s@.rounds current ON current.id=p_round WHERE p.location_id=p_school AND bought.collection_id=current.collection_id
 $$;
 CREATE FUNCTION @s@.monthly_guess_price(p_school bigint,p_round int) RETURNS bigint LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
 DECLARE c @s@.mystery_collections;n bigint;price numeric;
 BEGIN
 SELECT mc.* INTO c FROM @s@.mystery_collections mc JOIN @s@.rounds r ON r.collection_id=mc.id WHERE r.id=p_round;
 IF c.id IS NULL THEN RETURN NULL;END IF;
 n:=@s@.monthly_guess_number(p_school,p_round);
 IF n=1 THEN RETURN c.guess_first_price;END IF;
 IF n>32 AND c.guess_multiplier>1 THEN RETURN NULL;END IF;
 price:=c.guess_next_price::numeric*power(c.guess_multiplier::numeric,n-2);
 IF price>2147483647 THEN RETURN NULL;END IF;RETURN price::bigint;
 END$$;
 CREATE FUNCTION @s@.release_mystery_weeks() RETURNS int LANGUAGE plpgsql SET search_path=pg_catalog AS $$
 DECLARE w @s@.mystery_weeks;c @s@.mystery_collections;d @s@.mystery_drafts;p @s@.guess_purchases;next_id int;released int:=0;
 BEGIN
 PERFORM 1 FROM @s@.settings WHERE id FOR UPDATE;
 FOR w IN SELECT mw.* FROM @s@.mystery_weeks mw JOIN @s@.mystery_collections mc ON mc.id=mw.collection_id WHERE mw.state='scheduled' AND mw.release_at<=now() AND mc.state IN('active','draft') ORDER BY mc.month,mw.week FOR UPDATE OF mw LOOP
  SELECT * INTO c FROM @s@.mystery_collections WHERE id=w.collection_id FOR UPDATE;
  IF c.month>date_trunc('month',now() AT TIME ZONE 'America/Los_Angeles')::date THEN CONTINUE;END IF;
  IF EXISTS(SELECT 1 FROM @s@.mystery_weeks WHERE collection_id=c.id AND week<w.week AND state<>'released') THEN CONTINUE;END IF;
  IF (SELECT count(*) FROM @s@.mystery_drafts WHERE collection_id=c.id AND position BETWEEN (w.week-1)*5+1 AND w.week*5 AND photo_path IS NOT NULL AND trim(answer)<>'' AND jsonb_array_length(pieces)=piece_count AND cardinality(piece_costs)=piece_count)<>5 THEN CONTINUE;END IF;
  IF c.state='draft' THEN
   IF EXISTS(SELECT 1 FROM @s@.mystery_collections WHERE state='active' AND month>=c.month) THEN CONTINUE;END IF;
   FOR p IN SELECT gp.* FROM @s@.guess_purchases gp JOIN @s@.rounds r ON r.id=gp.round JOIN @s@.mystery_collections mc ON mc.id=r.collection_id WHERE mc.state='active' AND gp.consumed_at IS NULL AND gp.refunded_at IS NULL FOR UPDATE OF gp LOOP
    PERFORM @s@.guess_points(p.location_id,p.price,'mystery-guess-refund:'||p.id,'Refund: unused guess at monthly archive');
    UPDATE @s@.guess_purchases SET refunded_at=now() WHERE id=p.id;
   END LOOP;
   UPDATE @s@.mystery_collections SET state='archived',archived_at=now(),revision=revision+1 WHERE state='active';
   UPDATE @s@.mystery_collections SET state='active',activated_at=now(),revision=revision+1 WHERE id=c.id;
  END IF;
  SELECT coalesce(max(id),0) INTO next_id FROM @s@.rounds;
  FOR d IN SELECT md.* FROM @s@.mystery_drafts md WHERE md.collection_id=c.id AND md.position BETWEEN (w.week-1)*5+1 AND w.week*5 ORDER BY md.position LOOP
   next_id:=next_id+1;
   INSERT INTO @s@.rounds(id,photo_path,answer,aliases,pieces,piece_costs,reward_points,collection_id,position,revealed_indices,question)
   VALUES(next_id,d.photo_path,d.answer,d.aliases,d.pieces,d.piece_costs,d.reward_points,c.id,d.position,'{}',d.question);
  END LOOP;
  UPDATE @s@.mystery_weeks SET state='released',released_at=now(),revision=revision+1 WHERE collection_id=w.collection_id AND week=w.week;
  UPDATE @s@.mystery_collections SET revision=revision+1 WHERE id=c.id;
  UPDATE @s@.settings SET mystery_state='active' WHERE id;
  released:=released+5;
 END LOOP;
 RETURN released;
 END$$;
 $ddl$,'@s@',ns);
 SELECT pg_get_constraintdef(oid) INTO before_definition FROM pg_constraint WHERE conrelid=to_regclass(ns||'.unlock_credit_events') AND conname='unlock_credit_events_check';
 definition:=replace(replace(before_definition,'(credits = 1) AND (price = 5)','(credits = 1) AND (price > 0)'),'(credits = 5) AND (price = 20)','(credits = 5) AND (price > 0)');
 IF definition IS NULL OR definition=before_definition THEN RAISE EXCEPTION 'Unexpected unlock purchase validation';END IF;
 EXECUTE format('ALTER TABLE %I.unlock_credit_events DROP CONSTRAINT unlock_credit_events_check,ADD CONSTRAINT unlock_credit_events_check %s',ns,definition);
 -- Keep the proven purchase/retry/accounting engines. Only their pricing inputs change.
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN(ns,'public') AND (n.nspname=ns OR p.proname='october_games_'||env) AND p.prokind='f' LOOP
  definition:=pg_get_functiondef(f.oid);before_definition:=definition;
  definition:=replace(definition,'SELECT count(*)+1 INTO ordinal FROM '||ns||'.guess_purchases WHERE location_id=lid AND round=r.id;','ordinal:='||ns||'.monthly_guess_number(lid,r.id);');
  definition:=replace(definition,'SELECT count(*)+1 INTO ordinal FROM '||ns||'.guess_purchases WHERE location_id=lid AND round=current_round;','ordinal:='||ns||'.monthly_guess_number(lid,current_round);');
  definition:=replace(definition,'cost:=CASE WHEN ordinal=1 THEN 10 WHEN ordinal<29 THEN (25*power(2,ordinal-2))::bigint ELSE NULL END;','cost:='||ns||'.monthly_guess_price(lid,r.id);');
  definition:=replace(definition,'cost:=CASE WHEN ordinal=1 THEN 10 WHEN ordinal<29 THEN (25*power(2,ordinal-2))::bigint END;','cost:='||ns||'.monthly_guess_price(lid,current_round);');
  definition:=replace(definition,'price:=CASE quantity WHEN 1 THEN 5 WHEN 5 THEN 20 END;','SELECT CASE quantity WHEN 1 THEN unlock_single_price WHEN 5 THEN unlock_bundle_price END INTO price FROM '||ns||'.mystery_collections WHERE state=''active'';');
  IF definition<>before_definition THEN EXECUTE definition;END IF;
 END LOOP;
 -- Retain all existing routing, authentication, approvals and game behavior underneath.
 SELECT pg_get_functiondef(to_regprocedure('public.october_games_'||env||'(text,text,text,jsonb)')) INTO definition;
 EXECUTE replace(definition,'FUNCTION public.october_games_'||env||'(','FUNCTION '||ns||'.weekly_legacy(');
 EXECUTE replace(replace($wrapper$
 CREATE OR REPLACE FUNCTION public.october_games_@env@(p_action text,p_token text DEFAULT NULL,p_pin text DEFAULT NULL,p_payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
 DECLARE result jsonb;actor jsonb;c @s@.mystery_collections;w @s@.mystery_weeks;release_time timestamptz;
 BEGIN
 IF p_action IN('collection_pricing','collection_schedule','collection_unschedule') THEN
  actor:=@s@.weekly_legacy('authorize',p_token,p_pin,'{}');
  IF (actor->>'admin')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Supervisor authorization required';END IF;
  PERFORM 1 FROM @s@.settings WHERE id FOR UPDATE;
  SELECT * INTO c FROM @s@.mystery_collections WHERE id=(p_payload->>'collection_id')::uuid FOR UPDATE;
  IF c.id IS NULL OR c.state='archived' OR c.revision IS DISTINCT FROM (p_payload->>'collection_revision')::int THEN RAISE EXCEPTION 'Collection changed. Refresh first';END IF;
  IF p_action='collection_pricing' THEN
   UPDATE @s@.mystery_collections SET guess_first_price=(p_payload->>'guess_first_price')::int,guess_next_price=(p_payload->>'guess_next_price')::int,guess_multiplier=(p_payload->>'guess_multiplier')::int,unlock_single_price=(p_payload->>'unlock_single_price')::int,unlock_bundle_price=(p_payload->>'unlock_bundle_price')::int,revision=revision+1 WHERE id=c.id;
  ELSE
   SELECT * INTO w FROM @s@.mystery_weeks WHERE collection_id=c.id AND week=(p_payload->>'week')::int FOR UPDATE;
   IF w.collection_id IS NULL OR w.state='released' OR w.revision IS DISTINCT FROM (p_payload->>'revision')::int THEN RAISE EXCEPTION 'Week changed or already released. Refresh first';END IF;
   IF p_action='collection_schedule' THEN
    IF (p_payload->>'confirmed')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'Confirm the weekly release';END IF;
    IF coalesce(p_payload->>'release_local','')!~'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' THEN RAISE EXCEPTION 'Choose a release date and time';END IF;
    release_time:=(p_payload->>'release_local')::timestamp AT TIME ZONE 'America/Los_Angeles';
    IF release_time<=now() OR date_trunc('month',release_time AT TIME ZONE 'America/Los_Angeles')::date<>c.month THEN RAISE EXCEPTION 'Choose a future release in the collection month';END IF;
    IF (SELECT count(*) FROM @s@.mystery_drafts WHERE collection_id=c.id AND position BETWEEN (w.week-1)*5+1 AND w.week*5 AND photo_path IS NOT NULL AND trim(answer)<>'' AND jsonb_array_length(pieces)=piece_count AND cardinality(piece_costs)=piece_count)<>5 THEN RAISE EXCEPTION 'Finish all five photos and answers before scheduling';END IF;
    IF EXISTS(SELECT 1 FROM @s@.mystery_weeks WHERE collection_id=c.id AND state<>'draft' AND ((week<w.week AND release_at>=release_time) OR (week>w.week AND release_at<=release_time))) THEN RAISE EXCEPTION 'Weeks must release in order';END IF;
    UPDATE @s@.mystery_weeks SET release_at=release_time,state='scheduled',revision=revision+1 WHERE collection_id=c.id AND week=w.week;
   ELSE UPDATE @s@.mystery_weeks SET state='draft',revision=revision+1 WHERE collection_id=c.id AND week=w.week;
   END IF;
   UPDATE @s@.mystery_collections SET revision=revision+1 WHERE id=c.id;
  END IF;
  result:=@s@.weekly_legacy('list',p_token,p_pin,'{}');
 ELSIF p_action IN('collection_activate','collection_append') THEN RAISE EXCEPTION 'Schedule weekly releases in Monthly Mystery Collections';
 ELSE
  IF p_action IN('collection_round','collection_move') THEN
   PERFORM 1 FROM @s@.settings WHERE id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM @s@.mystery_drafts md JOIN @s@.mystery_weeks mw ON mw.collection_id=md.collection_id AND mw.week=(md.position-1)/5+1 WHERE md.id=(p_payload->>'id')::uuid AND mw.state='scheduled') OR (p_action='collection_move' AND EXISTS(SELECT 1 FROM @s@.mystery_drafts md JOIN @s@.mystery_weeks mw ON mw.collection_id=md.collection_id AND mw.week=(md.position+(p_payload->>'direction')::int-1)/5+1 WHERE md.id=(p_payload->>'id')::uuid AND mw.state='scheduled')) THEN RAISE EXCEPTION 'Unschedule the week before editing';END IF;
  END IF;
  result:=@s@.weekly_legacy(p_action,p_token,p_pin,p_payload);
  IF p_action='collection_create' THEN
   PERFORM @s@.prepare_mystery_weeks(id) FROM @s@.mystery_collections WHERE month=(p_payload->>'month'||'-01')::date;
   result:=@s@.weekly_legacy('list',p_token,p_pin,'{}');
  END IF;
 END IF;
 IF p_action IN('authorize','rewards') THEN RETURN result;END IF;
 IF jsonb_typeof(result)<>'object' THEN RETURN result;END IF;
 SELECT * INTO c FROM @s@.mystery_collections WHERE state='active';
 IF result->'unlock_shop' IS NOT NULL THEN result:=jsonb_set(result,'{unlock_shop}',(result->'unlock_shop')||jsonb_build_object('single_price',c.unlock_single_price,'bundle_price',c.unlock_bundle_price));END IF;
 IF (result->>'admin')::boolean THEN
  result:=result||jsonb_build_object('mystery_weeks',(SELECT coalesce(jsonb_agg(to_jsonb(mw) ORDER BY collection_id,week),'[]') FROM @s@.mystery_weeks mw));
 END IF;
 RETURN result;
 END$$;
 $wrapper$,'@s@',ns),'@env@',env);
 EXECUTE format('SELECT %I.prepare_mystery_weeks(id) FROM %I.mystery_collections WHERE state IN(''draft'',''active'')',ns,ns);
 EXECUTE format('REVOKE ALL ON FUNCTION %I.prepare_mystery_weeks(uuid),%I.monthly_guess_number(bigint,int),%I.monthly_guess_price(bigint,int),%I.release_mystery_weeks(),%I.weekly_legacy(text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role',ns,ns,ns,ns,ns);
 EXECUTE format('REVOKE ALL ON FUNCTION public.october_games_%s(text,text,text,jsonb) FROM PUBLIC,anon,authenticated',env);
 EXECUTE format('GRANT EXECUTE ON FUNCTION public.october_games_%s(text,text,text,jsonb) TO service_role',env);
 EXECUTE format('SELECT jsonb_build_array((SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),''[]'') FROM %I.rounds r),(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),''[]'') FROM %I.guess_purchases p),(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),''[]'') FROM %I.unlock_credit_events e))',ns,ns,ns) INTO after_records;
 IF before_records IS DISTINCT FROM after_records THEN RAISE EXCEPTION 'Mystery Photo record preservation failed';END IF;
END LOOP;
END $install$;
-- Hosted scheduler: no manager login or browser session is needed.
DO $$BEGIN
 IF to_regnamespace('cron') IS NULL THEN RAISE EXCEPTION 'The existing automatic scheduler must be available before enabling weekly releases';END IF;
 PERFORM cron.schedule('mystery-weekly-releases','* * * * *','SELECT october_live.release_mystery_weeks()');
END$$;
NOTIFY pgrst,'reload schema';
COMMIT;
