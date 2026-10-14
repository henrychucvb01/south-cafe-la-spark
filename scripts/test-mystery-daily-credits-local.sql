BEGIN;
CREATE FUNCTION pg_temp.check_it(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message;END IF;END$$;
DO $$
DECLARE started timestamptz:='2026-10-12 12:00:00 America/Los_Angeles'; token text; other_token text; second_token text; admin_token text;
  result jsonb; payload jsonb; request uuid; before_points bigint; before_rounds jsonb; before_guesses jsonb; i int;
BEGIN
  PERFORM pg_temp.check_it(current_database()='spark_mystery_monthly_release' AND inet_server_port()=55432,'dedicated synthetic database');
  UPDATE public.employees SET active=true WHERE id=900001;
  DELETE FROM spark_private.login_limits;
  INSERT INTO public.locations(id,location_code,school_name,active,created_at)
  VALUES(900101,'9101','Daily credit test A',true,started-interval '10 days'),(900102,'9102','Daily credit test B',true,started-interval '10 days'),
    (900103,'9103','New school test',true,started+interval '2 days') ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at;
  DELETE FROM october_live.unlock_credit_events;
  UPDATE october_live.settings SET unlock_credits_started_at=started;
  INSERT INTO public.spark_excluded_days(location_id,service_date,reason) VALUES(900101,'2026-10-13','existing calendar test exclusion');
  PERFORM october_live.award_daily_unlocks(started-interval '1 second');
  PERFORM pg_temp.check_it((SELECT count(*)=0 FROM october_live.unlock_credit_events),'no awards before deployment');
  PERFORM october_live.award_daily_unlocks(started);
  PERFORM october_live.award_daily_unlocks(started+interval '1 hour');
  PERFORM pg_temp.check_it((SELECT count(*)=1 FROM october_live.unlock_credit_events WHERE location_id=900101),'one daily credit without a login');
  PERFORM october_live.award_daily_unlocks(started+interval '11 hours 30 minutes');
  PERFORM pg_temp.check_it((SELECT count(*)=1 AND max(service_date)='2026-10-12'::date FROM october_live.unlock_credit_events WHERE location_id=900102),'UTC next-day boundary still uses school timezone');
  PERFORM october_live.award_daily_unlocks(started+interval '6 days');
  PERFORM pg_temp.check_it((SELECT sum(credits)=4 FROM october_live.unlock_credit_events WHERE location_id=900101),'weekend and recorded holiday excluded; credits carry over');
  PERFORM pg_temp.check_it((SELECT sum(credits)=5 FROM october_live.unlock_credit_events WHERE location_id=900102),'weekdays fallback without an invented holiday');
  PERFORM pg_temp.check_it((SELECT min(service_date)='2026-10-14'::date FROM october_live.unlock_credit_events WHERE location_id=900103),'new schools have no retroactive awards');
  PERFORM october_live.award_daily_unlocks(started+interval '6 days');
  PERFORM pg_temp.check_it((SELECT sum(credits)=4 FROM october_live.unlock_credit_events WHERE location_id=900101),'repeated scheduled runs are idempotent');
  PERFORM pg_temp.check_it((SELECT command='SELECT october_live.award_daily_unlocks();' AND schedule='*/5 * * * *' FROM cron.job WHERE jobname='spark-mystery-daily-unlocks'),'server scheduler is registered');
  RAISE NOTICE 'PASS daily credits: scheduler, school days, holidays, timezone boundaries, carry-forward and idempotency';
END$$;
ROLLBACK;
