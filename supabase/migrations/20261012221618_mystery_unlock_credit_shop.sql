BEGIN;
SET LOCAL lock_timeout = '5s';

-- All SPARK schools currently use the existing district timezone, America/Los_Angeles.
-- A separate school ledger adds credits without rewriting prior quest awards or round progress.
DO $migration$
DECLARE env text; ns text; definition text;
BEGIN
  FOREACH env IN ARRAY ARRAY['dev','live'] LOOP
    ns := 'october_' || env;
    EXECUTE format('ALTER TABLE %I.settings ADD COLUMN unlock_credits_started_at timestamptz NOT NULL DEFAULT clock_timestamp()', ns);
    EXECUTE replace($ddl$
      CREATE TABLE @s@.unlock_credit_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        location_id bigint NOT NULL REFERENCES public.locations(id),
        kind text NOT NULL CHECK (kind IN ('daily','purchase','reveal')),
        credits integer NOT NULL,
        price integer NOT NULL DEFAULT 0,
        service_date date NOT NULL,
        request_id uuid UNIQUE,
        round integer REFERENCES @s@.rounds(id),
        employee_id text,
        created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        CHECK ((kind='daily' AND credits=1 AND price=0 AND request_id IS NULL AND round IS NULL)
          OR (kind='purchase' AND ((credits=1 AND price=5) OR (credits=5 AND price=20)) AND request_id IS NOT NULL AND round IS NULL)
          OR (kind='reveal' AND credits<0 AND price=0 AND request_id IS NOT NULL AND round IS NOT NULL))
      );
      CREATE UNIQUE INDEX unlock_credit_daily_once ON @s@.unlock_credit_events(location_id,service_date) WHERE kind='daily';
      CREATE INDEX unlock_credit_school ON @s@.unlock_credit_events(location_id);
      ALTER TABLE @s@.unlock_credit_events ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON @s@.unlock_credit_events FROM PUBLIC,anon,authenticated,service_role;

      CREATE FUNCTION @s@.award_daily_unlocks(p_now timestamptz DEFAULT clock_timestamp()) RETURNS integer
      LANGUAGE plpgsql SET search_path=pg_catalog AS $$
      DECLARE started timestamptz; added integer;
      BEGIN
        SELECT unlock_credits_started_at INTO started FROM @s@.settings WHERE id;
        IF started IS NULL OR p_now<started THEN RETURN 0; END IF;
        INSERT INTO @s@.unlock_credit_events(location_id,kind,credits,service_date)
        SELECT l.id,'daily',1,d.day::date
        FROM public.locations l
        CROSS JOIN LATERAL generate_series(
          greatest((started AT TIME ZONE 'America/Los_Angeles')::date,
                   (coalesce(l.created_at,started) AT TIME ZONE 'America/Los_Angeles')::date)::timestamp,
          ((p_now AT TIME ZONE 'America/Los_Angeles')::date)::timestamp, interval '1 day') d(day)
        WHERE l.active AND extract(isodow FROM d.day) BETWEEN 1 AND 5
          AND NOT EXISTS (SELECT 1 FROM public.spark_excluded_days e WHERE e.location_id=l.id AND e.service_date=d.day::date)
        ON CONFLICT (location_id,service_date) WHERE kind='daily' DO NOTHING;
        GET DIAGNOSTICS added = ROW_COUNT;
        RETURN added;
      END $$;
      REVOKE ALL ON FUNCTION @s@.award_daily_unlocks(timestamptz) FROM PUBLIC,anon,authenticated,service_role;
    $ddl$,'@s@',ns);

    -- Preserve the complete deployed guessing/quest engine and all of its existing rules.
    EXECUTE format('ALTER FUNCTION public.october_games_%s(text,text,text,jsonb) SET SCHEMA %I', env,ns);
    EXECUTE format('ALTER FUNCTION %I.october_games_%s(text,text,text,jsonb) RENAME TO credit_game_engine', ns,env);
    EXECUTE format('REVOKE ALL ON FUNCTION %I.credit_game_engine(text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role', ns);
    definition := $wrapper$
      CREATE FUNCTION public.october_games_@env@(p_action text,p_token text DEFAULT NULL,p_pin text DEFAULT NULL,p_payload jsonb DEFAULT '{}')
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
      DECLARE s public.supper_monitoring_sessions; cfg @s@.settings; r @s@.rounds;
        prior @s@.unlock_credit_events; result jsonb; request uuid; lid bigint;
        quantity integer; price integer; bank bigint; points bigint; needed integer;
        current_round integer; expected_unlocked integer; saved boolean:=false;
        today date:=(now() AT TIME ZONE 'America/Los_Angeles')::date;
      BEGIN
        IF p_action NOT IN ('buy_unlocks','reveal_piece') THEN
          result:=@s@.credit_game_engine(p_action,p_token,p_pin,p_payload);
          IF p_action IN ('authorize','rewards') THEN RETURN result; END IF;
        ELSE
          IF p_pin IS NOT NULL THEN RAISE EXCEPTION 'Participating school manager required'; END IF;
          s:=public.require_supper_monitoring_session(p_token);
          lid:=s.location_id;
          IF s.actor_role<>'manager' OR s.employee_id IS NULL OR NOT coalesce((SELECT participating FROM @s@.schools WHERE location_id=lid),false)
            THEN RAISE EXCEPTION 'Participating school manager required'; END IF;
          -- Same lock as extra-guess purchases, solves, and Side Quest approvals.
          SELECT * INTO cfg FROM @s@.settings WHERE id FOR UPDATE;
          IF NOT FOUND THEN RAISE EXCEPTION 'Mystery Photo settings are unavailable. Refresh.'; END IF;
          request:=nullif(p_payload->>'request_id','')::uuid;
          IF request IS NULL THEN RAISE EXCEPTION 'Refresh the page before continuing'; END IF;
          SELECT * INTO prior FROM @s@.unlock_credit_events WHERE request_id=request;
          IF FOUND THEN
            IF prior.location_id<>lid OR prior.kind IS DISTINCT FROM (CASE WHEN p_action='buy_unlocks' THEN 'purchase' ELSE 'reveal' END)
              OR (p_action='buy_unlocks' AND (prior.credits IS DISTINCT FROM (p_payload->>'credits')::int OR prior.price IS DISTINCT FROM (p_payload->>'expected_price')::int))
              OR (p_action='reveal_piece' AND (prior.round IS DISTINCT FROM (p_payload->>'round')::int OR -prior.credits IS DISTINCT FROM (p_payload->>'expected_cost')::int))
              THEN RAISE EXCEPTION 'Unlock request changed'; END IF;
            saved:=true;
          ELSE
            result:=@s@.credit_game_engine('list',p_token,NULL,'{}');
            SELECT coalesce(sum(credits),0) INTO bank FROM @s@.unlock_credit_events WHERE location_id=lid;
            IF p_action='buy_unlocks' THEN
              IF extract(month FROM today) IN (6,7) AND today>make_date(extract(year FROM today)::int,6,7)
                THEN RAISE EXCEPTION 'Season purchases reopen August 1'; END IF;
              quantity:=(p_payload->>'credits')::int;
              price:=CASE quantity WHEN 1 THEN 5 WHEN 5 THEN 20 END;
              IF price IS NULL OR (p_payload->>'confirmed')::boolean IS NOT TRUE OR price IS DISTINCT FROM (p_payload->>'expected_price')::int
                THEN RAISE EXCEPTION 'Confirm a valid unlock package before spending points'; END IF;
              points:=(result#>>'{guess_shop,balance}')::bigint;
              IF points IS NULL OR points<price THEN RAISE EXCEPTION 'Your school does not have enough SPARK Points'; END IF;
              INSERT INTO @s@.unlock_credit_events(location_id,kind,credits,price,service_date,request_id,employee_id)
              VALUES(lid,'purchase',quantity,price,today,request,s.employee_id::text);
              @debit@
            ELSE
              current_round:=(result->>'current_round')::int;
              SELECT * INTO r FROM @s@.rounds WHERE id=current_round;
              IF cfg.mystery_state<>'active' OR current_round IS NULL OR current_round IS DISTINCT FROM (p_payload->>'round')::int
                OR r.photo_path IS NULL OR r.unlocked>=jsonb_array_length(r.pieces)
                THEN RAISE EXCEPTION 'No puzzle piece is available to reveal. Refresh.'; END IF;
              SELECT greatest(0,sum(coalesce(r.piece_costs[i],1))-r.unlock_credits)::int INTO needed
              FROM generate_series(1,r.unlocked+1) i;
              expected_unlocked:=(p_payload->>'expected_unlocked')::int;
              IF needed<1 OR needed IS DISTINCT FROM (p_payload->>'expected_cost')::int OR r.unlocked IS DISTINCT FROM expected_unlocked
                THEN RAISE EXCEPTION 'The puzzle changed. Refresh before revealing another piece.'; END IF;
              IF bank<needed THEN RAISE EXCEPTION 'Your school does not have enough unlock credits'; END IF;
              INSERT INTO @s@.unlock_credit_events(location_id,kind,credits,service_date,request_id,round,employee_id)
              VALUES(lid,'reveal',-needed,today,request,r.id,s.employee_id::text);
              UPDATE @s@.rounds SET unlock_credits=unlock_credits+needed,
                unlocked=october_dev.revealed_count(piece_costs,unlock_credits+needed) WHERE id=r.id;
            END IF;
            saved:=true;
          END IF;
          result:=@s@.credit_game_engine('list',p_token,NULL,'{}');
        END IF;
        lid:=(result->>'location_id')::bigint;
        SELECT coalesce(sum(credits),0) INTO bank FROM @s@.unlock_credit_events WHERE location_id=lid;
        current_round:=(result->>'current_round')::int;
        SELECT * INTO r FROM @s@.rounds WHERE id=current_round;
        needed:=NULL;
        IF r.photo_path IS NOT NULL AND r.unlocked<jsonb_array_length(r.pieces) THEN
          SELECT greatest(0,sum(coalesce(r.piece_costs[i],1))-r.unlock_credits)::int INTO needed
          FROM generate_series(1,r.unlocked+1) i;
        END IF;
        RETURN result || jsonb_build_object('unlock_shop',jsonb_build_object(
          'balance',bank,'points',(result#>>'{guess_shop,balance}')::bigint,'daily_credits',1,
          'timezone','America/Los_Angeles','started_on',(SELECT (unlock_credits_started_at AT TIME ZONE 'America/Los_Angeles')::date FROM @s@.settings WHERE id),
          'next_piece_cost',needed,'round',current_round,'unlocked',r.unlocked),
          'unlock_purchase_saved',p_action='buy_unlocks' AND saved,'piece_revealed',p_action='reveal_piece' AND saved);
      END $$;
    $wrapper$;
    IF env='live' THEN
      definition:=replace(definition,'@debit@',$debit$
        INSERT INTO public.spark_points(location_id,points,point_type,description,service_date,source,employee_id,awarded_by,unique_key)
        VALUES(lid,-price,'mystery_unlock_purchase',quantity||' Mystery Photo unlock credit'||CASE WHEN quantity=1 THEN '' ELSE 's' END,
          today,'automatic',s.employee_id,'SPARK Mystery Photo','mystery-unlock-purchase:'||request);
      $debit$);
    ELSE
      definition:=replace(definition,'@debit@',$debit$
        INSERT INTO october_dev.rewards(event,location_id,points,reason)
        VALUES('mystery-unlock-purchase:'||request,lid,-price,'Mystery Photo unlock credits');
      $debit$);
    END IF;
    EXECUTE replace(replace(definition,'@s@',ns),'@env@',env);
    EXECUTE format('REVOKE ALL ON FUNCTION public.october_games_%s(text,text,text,jsonb) FROM PUBLIC,anon,authenticated', env);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.october_games_%s(text,text,text,jsonb) TO service_role', env);
  END LOOP;
END $migration$;

-- Runs without a browser or login; retries/catch-up use the school/day unique index.
SELECT cron.schedule('spark-mystery-daily-unlocks','*/5 * * * *','SELECT october_live.award_daily_unlocks();');
SELECT october_live.award_daily_unlocks();
NOTIFY pgrst,'reload schema';
COMMIT;
