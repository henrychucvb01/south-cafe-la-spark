-- Phase 1: deploy only with the matching session-aware application.
-- Self-service enrollment is deliberately preserved. No school data is seeded.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE SCHEMA IF NOT EXISTS spark_private;
REVOKE ALL ON SCHEMA spark_private FROM PUBLIC, anon, authenticated;
CREATE TABLE spark_private.security_release(id boolean PRIMARY KEY DEFAULT true CHECK(id),available boolean NOT NULL DEFAULT true);
INSERT INTO spark_private.security_release(id) VALUES(true);
ALTER TABLE spark_private.security_release ENABLE ROW LEVEL SECURITY;

CREATE TABLE spark_private.sessions (
  token_hash text PRIMARY KEY,
  actor_role text NOT NULL CHECK (actor_role IN ('employee','covering','supervisor')),
  employee_id bigint REFERENCES public.employees(id),
  actor_name text NOT NULL,
  credential_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  CHECK ((actor_role = 'employee') = (employee_id IS NOT NULL))
);
CREATE INDEX spark_sessions_expiry ON spark_private.sessions(expires_at);
ALTER TABLE spark_private.sessions ENABLE ROW LEVEL SECURITY;
CREATE TABLE spark_private.login_limits (
  identity_key text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  window_started timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE spark_private.login_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA spark_private FROM PUBLIC, anon, authenticated;

CREATE FUNCTION spark_private.session(p_token text)
RETURNS SETOF spark_private.sessions LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT s.* FROM spark_private.sessions s
  WHERE length(p_token)=64 AND s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')
    AND EXISTS(SELECT FROM spark_private.security_release WHERE available)
    AND s.expires_at > now()
    AND s.credential_fingerprint = (
      SELECT encode(sha256(convert_to(e.manager_pin_hash,'UTF8')),'hex')
      FROM public.employees e WHERE s.actor_role='employee' AND e.id=s.employee_id AND e.active
      UNION ALL
      SELECT encode(sha256(convert_to(k.value_hash,'UTF8')),'hex')
      FROM public.spark_security_settings k
      WHERE k.setting_key=CASE s.actor_role WHEN 'covering' THEN 'covering_manager_pin' WHEN 'supervisor' THEN 'supervisor_pin' END
    );
$$;
REVOKE ALL ON FUNCTION spark_private.session(text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.spark_login(p_role text, p_pin text, p_employee_id bigint DEFAULT NULL, p_covering_name text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE v_key text; v_hash text; v_name text; v_token text; v_failures integer;
BEGIN
  IF NOT EXISTS(SELECT FROM spark_private.security_release WHERE available) THEN RETURN NULL; END IF;
  IF p_role='employee' THEN
    SELECT manager_pin_hash,employee_name INTO v_hash,v_name FROM public.employees WHERE id=p_employee_id AND active;
    v_key:='employee:'||p_employee_id::text;
  ELSIF p_role IN ('covering','supervisor') AND p_employee_id IS NULL THEN
    v_key:=p_role;
    SELECT value_hash INTO v_hash FROM public.spark_security_settings
      WHERE setting_key=CASE p_role WHEN 'covering' THEN 'covering_manager_pin' ELSE 'supervisor_pin' END;
    v_name:=CASE p_role WHEN 'covering' THEN trim(p_covering_name) ELSE 'Supervisor / AFSS' END;
  ELSE RETURN NULL;
  END IF;
  IF v_key IS NULL OR v_hash IS NULL THEN RETURN NULL; END IF;
  -- The limit is per credential, never per school or user-supplied name.
  -- Invalid responses return normally so failed attempts cannot roll back.
  PERFORM pg_advisory_xact_lock(hashtextextended('spark-login:'||v_key,0));
  INSERT INTO spark_private.login_limits(identity_key) VALUES(v_key) ON CONFLICT DO NOTHING;
  UPDATE spark_private.login_limits SET failures=0,window_started=now()
    WHERE identity_key=v_key AND window_started <= now()-interval '15 minutes';
  SELECT failures INTO v_failures FROM spark_private.login_limits WHERE identity_key=v_key;
  IF v_failures>=10 THEN RETURN NULL; END IF;
  UPDATE spark_private.login_limits SET failures=failures+1 WHERE identity_key=v_key;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' OR v_name IS NULL OR length(v_name) NOT BETWEEN 1 AND 160
    OR (p_role='covering' AND length(v_name)<3) THEN RETURN NULL; END IF;
  IF extensions.crypt(p_pin,v_hash)<>v_hash THEN RETURN NULL; END IF;
  UPDATE spark_private.login_limits SET failures=0,window_started=now() WHERE identity_key=v_key;
  DELETE FROM spark_private.sessions WHERE expires_at < now();
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO spark_private.sessions(token_hash,actor_role,employee_id,actor_name,credential_fingerprint)
    VALUES(encode(sha256(convert_to(v_token,'UTF8')),'hex'),p_role,p_employee_id,v_name,encode(sha256(convert_to(v_hash,'UTF8')),'hex'));
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.spark_login(text,text,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spark_login(text,text,bigint,text) TO anon,authenticated;

CREATE FUNCTION public.spark_session_valid(p_token text, p_supervisor boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT EXISTS(SELECT FROM spark_private.session(p_token) s WHERE NOT p_supervisor OR s.actor_role='supervisor'); $$;
REVOKE ALL ON FUNCTION public.spark_session_valid(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spark_session_valid(text,boolean) TO anon,authenticated,service_role;

CREATE FUNCTION public.spark_authenticated(p_supervisor boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT public.spark_session_valid(NULLIF(current_setting('request.headers',true),'')::jsonb->>'x-spark-session',p_supervisor); $$;
REVOKE ALL ON FUNCTION public.spark_authenticated(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spark_authenticated(boolean) TO anon,authenticated;

CREATE FUNCTION public.spark_logout(p_token text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog
AS $$ DELETE FROM spark_private.sessions WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex'); $$;
REVOKE ALL ON FUNCTION public.spark_logout(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spark_logout(text) TO anon,authenticated;

-- Compatibility names now validate opaque sessions, never a four-digit PIN.
-- Existing feature RPCs can retain their argument shapes without another login.
CREATE OR REPLACE FUNCTION public.verify_manager_pin(p_employee_id text,p_pin text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT EXISTS(SELECT FROM spark_private.session(p_pin) s WHERE s.actor_role='employee' AND s.employee_id::text=p_employee_id); $$;
CREATE OR REPLACE FUNCTION public.verify_covering_pin(p_pin text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT EXISTS(SELECT FROM spark_private.session(p_pin) s WHERE s.actor_role='covering'); $$;
CREATE OR REPLACE FUNCTION public.verify_supervisor_pin(p_pin text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT public.spark_session_valid(p_pin,true); $$;
REVOKE ALL ON FUNCTION public.verify_manager_pin(text,text),public.verify_covering_pin(text),public.verify_supervisor_pin(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_manager_pin(text,text),public.verify_covering_pin(text),public.verify_supervisor_pin(text) TO anon,authenticated,service_role;

CREATE FUNCTION public.spark_employee_directory(p_location_id bigint)
RETURNS TABLE(id bigint,employee_name text,location_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT e.id,e.employee_name,e.location_id FROM public.employees e JOIN public.locations l ON l.id=e.location_id WHERE e.active AND l.active AND l.id=p_location_id ORDER BY e.employee_name; $$;
REVOKE ALL ON FUNCTION public.spark_employee_directory(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spark_employee_directory(bigint) TO anon,authenticated;
REVOKE ALL ON public.employees FROM anon,authenticated;
-- Self-service enrollment intentionally remains available for unclaimed names.
-- The owner accepted this account-claiming risk; existing PINs cannot be replaced.
CREATE OR REPLACE FUNCTION public.set_manager_pin(p_employee_id text,p_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE v_key text; v_count integer;
BEGIN
  IF NOT EXISTS(SELECT FROM spark_private.security_release WHERE available) THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT FROM public.employees WHERE id::text=p_employee_id AND active AND manager_pin_hash IS NULL) THEN RETURN false; END IF;
  v_key:='enroll:'||p_employee_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_key,0));
  INSERT INTO spark_private.login_limits(identity_key) VALUES(v_key) ON CONFLICT DO NOTHING;
  UPDATE spark_private.login_limits SET failures=0,window_started=now() WHERE identity_key=v_key AND window_started<=now()-interval '15 minutes';
  IF (SELECT failures FROM spark_private.login_limits WHERE identity_key=v_key)>=10 THEN RETURN false; END IF;
  UPDATE spark_private.login_limits SET failures=failures+1 WHERE identity_key=v_key;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN RETURN false; END IF;
  UPDATE public.employees SET manager_pin_hash=extensions.crypt(p_pin,extensions.gen_salt('bf')) WHERE id::text=p_employee_id AND active AND manager_pin_hash IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count=1;
END;
$$;
CREATE OR REPLACE FUNCTION public.reset_manager_pin(p_employee_id text,p_supervisor_pin text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE v_count integer;
BEGIN
  IF public.verify_supervisor_pin(p_supervisor_pin) IS NOT true THEN RAISE EXCEPTION 'Supervisor authorization required.' USING ERRCODE='42501'; END IF;
  UPDATE public.employees SET manager_pin_hash=NULL WHERE id::text=p_employee_id AND active;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count=1;
END;
$$;
REVOKE ALL ON FUNCTION public.set_manager_pin(text,text),public.reset_manager_pin(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_manager_pin(text,text),public.reset_manager_pin(text,text) TO anon,authenticated;
ALTER TABLE public.supper_monitoring_sessions ADD COLUMN spark_session_hash text;

CREATE OR REPLACE FUNCTION public.open_supper_monitoring_session(p_location_id bigint,p_employee_id bigint,p_pin text,p_covering_name text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE s spark_private.sessions; v_token text;
BEGIN
  SELECT * INTO s FROM spark_private.session(p_pin);
  IF s.token_hash IS NULL OR s.actor_role='supervisor' OR s.employee_id IS DISTINCT FROM p_employee_id
    OR NOT EXISTS(SELECT FROM public.locations WHERE id=p_location_id AND active) THEN RETURN NULL; END IF;
  v_token:=gen_random_uuid()::text||gen_random_uuid()::text;
  INSERT INTO public.supper_monitoring_sessions(token_hash,location_id,employee_id,monitor_name,covering,expires_at,spark_session_hash)
    VALUES(encode(sha256(convert_to(v_token,'UTF8')),'hex'),p_location_id,s.employee_id,s.actor_name,s.actor_role='covering',s.expires_at,s.token_hash);
  RETURN v_token;
END;
$$;
CREATE OR REPLACE FUNCTION public.open_supper_supervisor_session(p_location_id bigint,p_pin text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE s spark_private.sessions; v_token text;
BEGIN
  SELECT * INTO s FROM spark_private.session(p_pin) WHERE actor_role='supervisor';
  IF s.token_hash IS NULL OR NOT EXISTS(SELECT FROM public.locations WHERE id=p_location_id AND active) THEN RETURN NULL; END IF;
  v_token:=gen_random_uuid()::text||gen_random_uuid()::text;
  INSERT INTO public.supper_monitoring_sessions(token_hash,location_id,monitor_name,actor_role,expires_at,spark_session_hash)
    VALUES(encode(sha256(convert_to(v_token,'UTF8')),'hex'),p_location_id,s.actor_name,'supervisor',s.expires_at,s.token_hash);
  RETURN v_token;
END;
$$;
CREATE OR REPLACE FUNCTION public.require_supper_monitoring_session(p_token text)
RETURNS public.supper_monitoring_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE s public.supper_monitoring_sessions; a spark_private.sessions; v_fingerprint text;
BEGIN
  SELECT * INTO s FROM public.supper_monitoring_sessions WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') AND expires_at>now();
  SELECT * INTO a FROM spark_private.sessions WHERE token_hash=s.spark_session_hash AND expires_at>now() AND EXISTS(SELECT FROM spark_private.security_release WHERE available);
  IF a.actor_role='employee' THEN
    SELECT encode(sha256(convert_to(manager_pin_hash,'UTF8')),'hex') INTO v_fingerprint FROM public.employees WHERE id=a.employee_id AND active;
  ELSE
    SELECT encode(sha256(convert_to(value_hash,'UTF8')),'hex') INTO v_fingerprint FROM public.spark_security_settings
      WHERE setting_key=CASE a.actor_role WHEN 'covering' THEN 'covering_manager_pin' WHEN 'supervisor' THEN 'supervisor_pin' END;
  END IF;
  IF s.token_hash IS NULL OR a.token_hash IS NULL OR v_fingerprint IS DISTINCT FROM a.credential_fingerprint THEN
    RAISE EXCEPTION 'Session expired. Reconnect using your SPARK sign-in.' USING ERRCODE='28000';
  END IF;
  IF NOT EXISTS(SELECT FROM public.locations WHERE id=s.location_id AND active) THEN RAISE EXCEPTION 'School access is no longer active.'; END IF;
  RETURN s;
END;
$$;
CREATE FUNCTION spark_private.require_actor(p_location_id bigint DEFAULT NULL)
RETURNS spark_private.sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE s spark_private.sessions;
BEGIN
  SELECT * INTO s FROM spark_private.session(NULLIF(current_setting('request.headers',true),'')::jsonb->>'x-spark-session');
  IF s.token_hash IS NULL THEN RAISE EXCEPTION 'Sign in to SPARK to continue.' USING ERRCODE='28000'; END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.locations WHERE id=p_location_id AND active) THEN
    RAISE EXCEPTION 'School is not active.' USING ERRCODE='42501';
  END IF;
  RETURN s;
END;
$$;
REVOKE ALL ON FUNCTION spark_private.require_actor(bigint) FROM PUBLIC,anon,authenticated;

-- Remove administrative table privileges that RLS does not protect.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') LOOP
    EXECUTE format('REVOKE TRUNCATE,REFERENCES,TRIGGER ON TABLE %I.%I FROM PUBLIC,anon,authenticated',t.nspname,t.relname);
  END LOOP;
END $$;
REVOKE ALL ON public.employees FROM PUBLIC;
REVOKE INSERT,UPDATE,DELETE ON public.spark_points,public.daily_bites_game_progress FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_daily_bites_game(bigint,bigint,text,text,text,date,jsonb,integer,integer,text,text,text),public.refresh_monthly_staffing_allocations(text,text[]) FROM PUBLIC,anon,authenticated;

-- Restrictive policies combine with existing policies instead of broadening
-- access. School assistance is intentional: authentication is not home-school
-- ownership. Privileged server functions still enforce their own authorization.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['meal_counts','finish_line_checks','finish_line_items','finish_line_audit_log','labor_hours','spark_points','daily_bites_game_progress'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY spark_session_required ON public.%I AS RESTRICTIVE FOR ALL TO anon,authenticated USING ((SELECT public.spark_authenticated())) WITH CHECK ((SELECT public.spark_authenticated()))',t);
  END LOOP;
END $$;
CREATE POLICY spark_calendar_insert ON public.spark_excluded_days AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK ((SELECT public.spark_authenticated(true)));
CREATE POLICY spark_calendar_update ON public.spark_excluded_days AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING ((SELECT public.spark_authenticated(true))) WITH CHECK ((SELECT public.spark_authenticated(true)));
CREATE POLICY spark_calendar_delete ON public.spark_excluded_days AS RESTRICTIVE FOR DELETE TO anon,authenticated USING ((SELECT public.spark_authenticated(true)));

CREATE FUNCTION public.spark_adjust_points(p_location_id bigint,p_points integer,p_service_date date,p_reason text,p_request_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE s spark_private.sessions; v_id bigint; v_key text; v_old public.spark_points;
BEGIN
  s:=spark_private.require_actor(p_location_id);
  IF s.actor_role<>'supervisor' THEN RAISE EXCEPTION 'Supervisor access required.' USING ERRCODE='42501'; END IF;
  IF p_points IS NULL OR p_points=0 OR p_service_date IS NULL OR p_request_id IS NULL OR length(trim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Enter points, service date, and a reason.'; END IF;
  v_key:='supervisor-adjustment-'||p_request_id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_key,0));
  SELECT * INTO v_old FROM public.spark_points WHERE unique_key=v_key;
  IF FOUND THEN
    IF (v_old.location_id,v_old.points,v_old.service_date,v_old.adjustment_reason) IS DISTINCT FROM (p_location_id,p_points,p_service_date,trim(p_reason)) THEN RAISE EXCEPTION 'Adjustment request was already used for different values.'; END IF;
    RETURN v_old.id;
  END IF;
  INSERT INTO public.spark_points(location_id,points,point_type,description,service_date,source,awarded_by,adjustment_reason,unique_key)
    VALUES(p_location_id,p_points,'supervisor_adjustment',CASE WHEN p_points<0 THEN 'Supervisor point correction' ELSE 'Supervisor point award' END,p_service_date,'supervisor',s.actor_name,trim(p_reason),v_key) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.spark_adjust_points(bigint,integer,date,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spark_adjust_points(bigint,integer,date,text,uuid) TO anon,authenticated;

CREATE FUNCTION public.spark_claim_school_points(p_location_id bigint,p_service_date date,p_kind text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE s spark_private.sessions; m public.meal_counts; c public.finish_line_checks; v_points integer:=5; v_key text; v_type text; v_description text;
BEGIN
  s:=spark_private.require_actor(p_location_id);
  IF p_service_date IS NULL OR p_service_date>(now() AT TIME ZONE 'America/Los_Angeles')::date THEN RAISE EXCEPTION 'Invalid service date.'; END IF;
  SELECT * INTO m FROM public.meal_counts WHERE location_id=p_location_id AND service_date=p_service_date;
  SELECT * INTO c FROM public.finish_line_checks WHERE location_id=p_location_id AND service_date=p_service_date;
  IF p_kind='daily_bites_visit' THEN
    IF p_service_date<>(now() AT TIME ZONE 'America/Los_Angeles')::date THEN RAISE EXCEPTION 'Daily Bites visits must use today.'; END IF;
    v_points:=1; v_key:='daily-bites-'||p_location_id||'-'||p_service_date; v_type:=p_kind; v_description:='Visited Daily Bites';
  ELSIF p_kind IN ('breakfast_meal_count','lunch_meal_count','supper_meal_count') THEN
    IF m.id IS NULL OR (CASE p_kind WHEN 'breakfast_meal_count' THEN m.breakfast_count WHEN 'lunch_meal_count' THEN m.lunch_count ELSE m.supper_count END) IS NULL THEN RAISE EXCEPTION 'Save the meal count before claiming its reward.'; END IF;
    v_key:=split_part(p_kind,'_',1)||'-'||p_location_id||'-'||p_service_date;
    v_type:=p_kind; v_description:=initcap(split_part(p_kind,'_',1))||' meal count entered';
  ELSIF p_kind IN ('finish_line','finish_line_late') THEN
    IF c.id IS NULL OR m.breakfast_count IS NULL OR m.lunch_count IS NULL OR EXISTS(
      SELECT FROM unnest(ARRAY['previous_meal_counts','dairy_order_created','receivers_completed','production_worksheet','production_record','meal_count_entered','reports_reviewed']) required(item_key)
      WHERE NOT EXISTS(SELECT FROM public.finish_line_items i WHERE i.finish_line_check_id=c.id AND i.item_key=required.item_key AND i.answer IN ('yes','no','na'))
    ) THEN RAISE EXCEPTION 'Complete the checklist and meal counts before claiming its reward.'; END IF;
    v_key:='finish-line-'||p_location_id||'-'||p_service_date;
    v_points:=CASE WHEN p_service_date<date '2026-09-03' OR (c.submitted_at AT TIME ZONE 'America/Los_Angeles')::date=p_service_date THEN 5 ELSE 2 END;
    v_type:=CASE WHEN v_points=2 THEN 'finish_line_late' ELSE 'finish_line' END;
    v_description:=CASE WHEN p_service_date<date '2026-09-03' THEN 'Finish Line Checklist completed — rollout grace period' WHEN v_points=2 THEN 'Finish Line Checklist completed late — partial credit' ELSE 'Finish Line Checklist completed on time' END;
  ELSE RAISE EXCEPTION 'Unsupported reward.';
  END IF;
  INSERT INTO public.spark_points(location_id,points,point_type,description,service_date,source,employee_id,employee_name,unique_key)
    VALUES(p_location_id,v_points,v_type,v_description,p_service_date,'automatic',s.employee_id,s.actor_name,v_key) ON CONFLICT(unique_key) DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.spark_claim_school_points(bigint,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spark_claim_school_points(bigint,date,text) TO anon,authenticated;
CREATE FUNCTION public.spark_current_actor() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT jsonb_build_object('employee_id',s.employee_id,'name',s.actor_name,'role',s.actor_role) FROM spark_private.session(NULLIF(current_setting('request.headers',true),'')::jsonb->>'x-spark-session') s; $$;
REVOKE ALL ON FUNCTION public.spark_current_actor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spark_current_actor() TO anon,authenticated;

CREATE FUNCTION public.spark_core_write_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $$
DECLARE a jsonb;
BEGIN
  IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
  a:=public.spark_current_actor();
  IF a IS NULL THEN RAISE EXCEPTION 'Sign in to SPARK to continue.' USING ERRCODE='28000'; END IF;
  IF NOT EXISTS(SELECT FROM public.locations WHERE id=NEW.location_id AND active) THEN RAISE EXCEPTION 'School is not active.'; END IF;
  IF NEW.service_date>(now() AT TIME ZONE 'America/Los_Angeles')::date THEN RAISE EXCEPTION 'A future service date cannot be submitted.'; END IF;
  IF TG_OP='UPDATE' AND (NEW.id,NEW.location_id,NEW.service_date) IS DISTINCT FROM (OLD.id,OLD.location_id,OLD.service_date) THEN RAISE EXCEPTION 'A saved record cannot be reassigned.'; END IF;
  IF TG_TABLE_NAME='finish_line_checks' THEN
    NEW.employee_id:=(a->>'employee_id')::bigint; NEW.employee_name:=a->>'name';
    NEW.submitted_at:=CASE WHEN TG_OP='INSERT' THEN now() ELSE OLD.submitted_at END;
    NEW.updated_at:=now();
  ELSIF TG_TABLE_NAME='finish_line_audit_log' THEN
    NEW.employee_name:=a->>'name'; NEW.changed_at:=now();
  ELSE
    NEW.entered_by:=a->>'name'; NEW.updated_at:=now();
    NEW.created_at:=CASE WHEN TG_OP='INSERT' THEN now() ELSE OLD.created_at END;
    IF TG_TABLE_NAME='meal_counts' THEN
      IF NEW.breakfast_count<0 OR NEW.lunch_count<0 OR NEW.supper_count<0 THEN RAISE EXCEPTION 'Meal counts cannot be negative.'; END IF;
      NEW.supper_status:=CASE WHEN NEW.supper_count IS NULL THEN 'pending' ELSE 'complete' END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.spark_core_write_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER spark_secure_write BEFORE INSERT OR UPDATE ON public.finish_line_checks FOR EACH ROW EXECUTE FUNCTION public.spark_core_write_guard();
CREATE TRIGGER spark_secure_write BEFORE INSERT OR UPDATE ON public.meal_counts FOR EACH ROW EXECUTE FUNCTION public.spark_core_write_guard();
CREATE TRIGGER spark_secure_write BEFORE INSERT OR UPDATE ON public.labor_hours FOR EACH ROW EXECUTE FUNCTION public.spark_core_write_guard();
CREATE TRIGGER spark_secure_write BEFORE INSERT OR UPDATE ON public.finish_line_audit_log FOR EACH ROW EXECUTE FUNCTION public.spark_core_write_guard();
-- Authenticated legacy workflows: preserve rules and derive the actor server-side.
CREATE OR REPLACE FUNCTION public.submit_ar_training_answer(p_location_id bigint, p_employee_id bigint, p_employee_name text, p_service_date date, p_question_id text, p_selected_index integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_correct_index integer; v_is_correct boolean; v_progress public.ar_training_daily_progress%rowtype;
  v_points integer := 0; v_already_awarded boolean := false; v_is_weekday boolean;
  v_state public.ar_training_location_cycles%rowtype; v_answered jsonb; v_batch_advanced boolean := false;
  v_in_batch boolean := false;
  v_daily_cap integer := case when p_service_date >= date '2026-10-01' then 5 else 10 end;
begin
  SELECT employee_id,actor_name INTO p_employee_id,p_employee_name FROM spark_private.require_actor(p_location_id);
  if p_location_id is null or p_service_date is null then raise exception 'Location and service date are required'; end if;
  if p_service_date <> (now() at time zone 'America/Los_Angeles')::date then raise exception 'AR Training answers must use today in America/Los_Angeles'; end if;
  if p_selected_index < 0 or p_selected_index > 3 then raise exception 'Invalid answer selection'; end if;
  insert into public.ar_training_location_cycles (location_id) values (p_location_id) on conflict do nothing;
  select * into v_state from public.ar_training_location_cycles where location_id = p_location_id for update;
  select exists (
    select 1 from (
      select q.id from public.ar_training_questions q where q.active = true
      order by case when v_state.cycle_number = 0 then lpad(q.bank_order::text, 6, '0')
                    else md5(q.id || ':' || v_state.cycle_number::text || ':' || p_location_id::text) end
      offset v_state.batch_index * 50 limit 50
    ) batch where batch.id = p_question_id
  ) into v_in_batch;
  if not v_in_batch then raise exception 'Question is not in the active AR Training batch'; end if;
  select correct_index into v_correct_index from public.ar_training_questions where id = p_question_id and active = true;
  if not found then raise exception 'Unknown AR training question'; end if;
  v_is_correct := p_selected_index = v_correct_index;
  v_is_weekday := extract(isodow from p_service_date) between 1 and 5;
  insert into public.ar_training_daily_progress (location_id, service_date) values (p_location_id, p_service_date) on conflict do nothing;
  select * into v_progress from public.ar_training_daily_progress where location_id = p_location_id and service_date = p_service_date for update;
  v_already_awarded := v_progress.awarded_question_ids ? p_question_id;
  if v_is_correct and (v_is_weekday or p_service_date >= date '2026-10-01') and not v_already_awarded and v_progress.points_awarded < v_daily_cap then v_points := least(2, v_daily_cap - v_progress.points_awarded); end if;
  update public.ar_training_daily_progress set
    points_awarded = points_awarded + v_points,
    correct_answers = correct_answers + case when v_is_correct then 1 else 0 end,
    total_attempts = total_attempts + 1,
    awarded_question_ids = case when v_points > 0 then awarded_question_ids || to_jsonb(p_question_id) else awarded_question_ids end,
    updated_at = now()
  where location_id = p_location_id and service_date = p_service_date returning * into v_progress;
  insert into public.ar_training_attempts (location_id, employee_id, employee_name, service_date, question_id, selected_index, is_correct, points_awarded)
  values (p_location_id, p_employee_id, p_employee_name, p_service_date, p_question_id, p_selected_index, v_is_correct, v_points);
  if v_points > 0 then
    insert into public.spark_points (location_id, points, point_type, description, service_date, source, employee_id, employee_name, unique_key)
    values (p_location_id, v_points, 'ar_training', 'AR Training correct answer', p_service_date, 'automatic', p_employee_id, p_employee_name, format('ar-training-%s-%s-%s', p_location_id, p_service_date, p_question_id)) on conflict (unique_key) do nothing;
  end if;
  v_answered := case when v_state.answered_question_ids ? p_question_id then v_state.answered_question_ids else v_state.answered_question_ids || to_jsonb(p_question_id) end;
  if jsonb_array_length(v_answered) >= 50 then
    v_batch_advanced := true;
    update public.ar_training_location_cycles set
      cycle_number = case when batch_index = 9 then cycle_number + 1 else cycle_number end,
      batch_index = case when batch_index = 9 then 0 else batch_index + 1 end,
      answered_question_ids = '[]'::jsonb, updated_at = now()
    where location_id = p_location_id returning * into v_state;
  else
    update public.ar_training_location_cycles set answered_question_ids = v_answered, updated_at = now()
    where location_id = p_location_id returning * into v_state;
  end if;
  return jsonb_build_object('correct', v_is_correct, 'correct_index', v_correct_index, 'points_earned', v_points, 'daily_points', v_progress.points_awarded,
    'cap_reached', v_progress.points_awarded >= v_daily_cap, 'already_awarded', v_already_awarded, 'weekday', v_is_weekday,
    'batch_advanced', v_batch_advanced, 'batch_index', v_state.batch_index, 'cycle_number', v_state.cycle_number);
end; $function$
;

CREATE OR REPLACE FUNCTION public.get_ar_training_question_batch(p_location_id bigint)
 RETURNS TABLE(id text, question_type text, category text, prompt text, choices jsonb, explanation text, source_title text, source_locator text, source_chunk_id text, batch_index integer, cycle_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_state public.ar_training_location_cycles%rowtype;
begin
  PERFORM spark_private.require_actor(p_location_id);
  if p_location_id is null then raise exception 'Location is required'; end if;
  insert into public.ar_training_location_cycles (location_id) values (p_location_id) on conflict do nothing;
  select * into v_state from public.ar_training_location_cycles where location_id = p_location_id;
  return query
  select q.id, q.question_type, q.category, q.prompt, q.choices, q.explanation,
    q.source_title, q.source_locator, q.source_chunk_id, v_state.batch_index, v_state.cycle_number
  from public.ar_training_questions q
  where q.active = true
  order by
    case when v_state.cycle_number = 0 then lpad(q.bank_order::text, 6, '0')
         else md5(q.id || ':' || v_state.cycle_number::text || ':' || p_location_id::text) end
  offset v_state.batch_index * 50 limit 50;
end; $function$
;

CREATE OR REPLACE FUNCTION public.submit_spark_feedback(p_location_id bigint, p_location_code text, p_school_name text, p_employee_id bigint, p_employee_name text, p_category text, p_message text, p_page_route text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_location public.locations%rowtype;
begin
  SELECT employee_id,actor_name INTO p_employee_id,p_employee_name FROM spark_private.require_actor(p_location_id);
  if p_category not in ('Bug', 'Suggestion', 'Question') then raise exception 'Invalid feedback category'; end if;
  if char_length(trim(coalesce(p_message, ''))) not between 5 and 2000 then raise exception 'Feedback message must be 5 to 2000 characters'; end if;
  if char_length(trim(coalesce(p_page_route, ''))) not between 1 and 120 then raise exception 'Invalid page route'; end if;
  select * into v_location from public.locations where active = true and (id = p_location_id or location_code = p_location_code) limit 1;
  if v_location.id is null then raise exception 'Active location not found'; end if;
  insert into public.spark_feedback(location_id, location_code, school_name, employee_id, employee_name, category, message, page_route)
  values (v_location.id, v_location.location_code, v_location.school_name, p_employee_id, nullif(left(trim(coalesce(p_employee_name, '')), 160), ''), p_category, trim(p_message), trim(p_page_route))
  returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.get_manager_monthly_scorecard_dataset(p_manager_pin text, p_employee_id bigint, p_location_id bigint, p_school_year text, p_reporting_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
declare
  v_verified boolean := false;
  v_month date := date_trunc('month',p_reporting_month)::date;
  v_next date := (date_trunc('month',p_reporting_month)+interval '1 month')::date;
  v_previous date := (date_trunc('month',p_reporting_month)-interval '1 month')::date;
  v_source_site_id text;
begin
  if p_employee_id is null then
    execute 'select public.verify_covering_pin($1)' into v_verified using p_manager_pin;
  elsif to_regprocedure('public.verify_manager_pin(bigint,text)') is not null then
    execute 'select public.verify_manager_pin($1,$2)' into v_verified using p_employee_id,p_manager_pin;
  else
    execute 'select public.verify_manager_pin($1,$2)' into v_verified using p_employee_id::text,p_manager_pin;
  end if;

  if v_verified is not true then raise exception 'Manager authorization failed'; end if;
  if p_employee_id is not null and not exists (
    select 1 from public.employees e
    where e.id=p_employee_id and e.active=true
  ) then raise exception 'Manager location authorization failed'; end if;

  select m.source_site_id into v_source_site_id
  from public.locations l
  join public.location_information d on d.location_code=l.location_code and d.active=true
  join public.monthly_site_mappings m on m.main_location_id=d.id and m.active=true and m.program_type='main'
  where l.id=p_location_id and l.active=true
  order by m.source_site_id limit 1;
  if v_source_site_id is null then raise exception 'This location is not mapped to Monthly Scorecards'; end if;

  return jsonb_build_object(
    'schools',coalesce((select jsonb_agg(to_jsonb(s)) from (
      select d.id directory_id,l.id location_id,d.location_code,d.school_name,d.site_type,
        l.enrollment,l.labor_type,l.budget_labor_hours,v_source_site_id source_site_id
      from public.locations l
      join public.location_information d on d.location_code=l.location_code and d.active=true
      where l.id=p_location_id and l.active=true
    ) s),'[]'::jsonb),
    'official_meal_counts',coalesce((select jsonb_agg(to_jsonb(o)) from public.official_meal_counts o where o.location_id=p_location_id and o.service_date>=v_previous and o.service_date<v_next),'[]'::jsonb),
    'excluded_days',coalesce((select jsonb_agg(jsonb_build_object('location_id',e.location_id,'service_date',e.service_date)) from public.spark_excluded_days e where e.location_id=p_location_id and e.service_date>=v_previous and e.service_date<v_next),'[]'::jsonb),
    'meal_counts',coalesce((select jsonb_agg(to_jsonb(m)) from public.meal_counts m
      where m.location_id=p_location_id and m.service_date>=v_previous and m.service_date<v_next),'[]'::jsonb),
    'labor_hours',coalesce((select jsonb_agg(to_jsonb(h)) from public.labor_hours h
      where h.location_id=p_location_id and h.service_date>=v_previous and h.service_date<v_next),'[]'::jsonb),
    'production_rows',coalesce((select jsonb_agg(to_jsonb(p)) from public.monthly_production_rows p
      join public.monthly_import_batches b on b.id=p.batch_id
      where b.school_year=p_school_year and p.source_site_id=v_source_site_id
        and p.production_date>=v_previous and p.production_date<v_next),'[]'::jsonb),
    'cost_rows',coalesce((select jsonb_agg(to_jsonb(c)) from public.monthly_production_cost_rows c
      join public.monthly_import_batches b on b.id=c.batch_id
      where b.school_year=p_school_year and c.source_site_id=v_source_site_id
        and c.production_date>=v_previous and c.production_date<v_next),'[]'::jsonb),
    'rates',coalesce((select jsonb_agg(to_jsonb(r)) from public.monthly_reimbursement_rates r
      where r.school_year=p_school_year),'[]'::jsonb),
    'labor_rates',coalesce((select jsonb_agg(to_jsonb(r)) from public.monthly_labor_rates r
      where r.school_year=p_school_year),'[]'::jsonb),
    'staffing',coalesce((select jsonb_agg(to_jsonb(a)) from public.monthly_staffing_allocations a
      where a.school_year=p_school_year and a.source_site_id=v_source_site_id),'[]'::jsonb),
    'batches','[]'::jsonb,
    'available_months',coalesce((select jsonb_agg(x.available_month order by x.available_month desc) from (
      select distinct date_trunc('month',z.activity_date)::date as available_month from (
        select m.service_date activity_date from public.meal_counts m where m.location_id=p_location_id
        union all
        select p.production_date from public.monthly_production_rows p where p.source_site_id=v_source_site_id
        union all
        select c.production_date from public.monthly_production_cost_rows c where c.source_site_id=v_source_site_id
      ) z
    ) x),'[]'::jsonb)
  );
end $function$
;
CREATE TABLE spark_private.game_puzzles(puzzle_id text PRIMARY KEY,game_type text NOT NULL,service_date date NOT NULL,puzzle jsonb NOT NULL,UNIQUE(game_type,service_date));
CREATE TABLE spark_private.word_guesses(word text PRIMARY KEY);
CREATE TABLE spark_private.game_requests(location_id bigint NOT NULL,request_key text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(location_id,request_key));
ALTER TABLE spark_private.game_puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE spark_private.word_guesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE spark_private.game_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON spark_private.game_puzzles,spark_private.word_guesses,spark_private.game_requests FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.spark_game_action(p_location_id bigint,p_puzzle_id text,p_action text,p_input jsonb,p_expected_state jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE a spark_private.sessions; p spark_private.game_puzzles; g public.daily_bites_game_progress; v_date date:=(now() AT TIME ZONE 'America/Los_Angeles')::date;
  v_key text; v_result jsonb; v_state jsonb; v_guesses jsonb; v_guess text; v_solved jsonb; v_mistakes integer; v_hints integer;
  v_group jsonb; v_index bigint; v_group_id text; v_points integer:=0; v_type text; v_name text;
BEGIN
  a:=spark_private.require_actor(p_location_id);
  WHILE extract(isodow FROM v_date)>5 LOOP v_date:=v_date-1; END LOOP;
  SELECT * INTO p FROM spark_private.game_puzzles WHERE puzzle_id=p_puzzle_id AND service_date=v_date;
  IF p.puzzle_id IS NULL OR p_input IS NULL OR p_expected_state IS NULL THEN RAISE EXCEPTION 'The daily puzzle is not available. Refresh Daily Bites.'; END IF;
  v_key:=encode(sha256(convert_to(jsonb_build_array(p_puzzle_id,p_action,p_input,p_expected_state)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('spark-game:'||p_location_id||':'||p_puzzle_id,0));
  SELECT result INTO v_result FROM spark_private.game_requests WHERE location_id=p_location_id AND request_key=v_key;
  IF FOUND THEN RETURN v_result; END IF;
  INSERT INTO public.daily_bites_game_progress(location_id,employee_id,employee_name,game_type,puzzle_id,service_date)
    VALUES(p_location_id,a.employee_id,a.actor_name,p.game_type,p_puzzle_id,v_date) ON CONFLICT(location_id,game_type,puzzle_id) DO NOTHING;
  SELECT * INTO g FROM public.daily_bites_game_progress WHERE location_id=p_location_id AND game_type=p.game_type AND puzzle_id=p_puzzle_id FOR UPDATE;
  IF g.status<>'in_progress' OR g.state IS DISTINCT FROM p_expected_state THEN RAISE EXCEPTION 'This school’s game has changed. Refresh Daily Bites before continuing.' USING ERRCODE='40001'; END IF;
  IF p.game_type='word' AND p_action='guess' THEN
    v_guess:=upper(p_input->>'guess');
    IF v_guess IS NULL OR NOT EXISTS(SELECT FROM spark_private.word_guesses WHERE word=v_guess) THEN RAISE EXCEPTION 'Choose a five-letter word from the SPARK word list.'; END IF;
    v_guesses:=coalesce(g.state->'guesses','[]'::jsonb);
    IF jsonb_array_length(v_guesses)>=6 THEN RAISE EXCEPTION 'No guesses remain.'; END IF;
    v_guesses:=v_guesses||to_jsonb(v_guess); g.attempt_count:=jsonb_array_length(v_guesses);
    g.status:=CASE WHEN v_guess=p.puzzle->>'answer' THEN 'won' WHEN g.attempt_count=6 THEN 'lost' ELSE 'in_progress' END;
    v_state:=jsonb_build_object('guesses',v_guesses);
    IF g.status='won' THEN v_points:=greatest(0,6-g.attempt_count); END IF;
    v_type:='daily_bites_word_game'; v_name:='Cafeteria Word';
  ELSIF p.game_type='spark_sort' AND p_action IN ('group','hint') THEN
    v_solved:=coalesce(g.state->'solvedGroupIds','[]'::jsonb); v_mistakes:=coalesce((g.state->>'mistakes')::integer,0); v_hints:=coalesce((g.state->>'hintsUsed')::integer,0);
    IF v_mistakes>=5 OR jsonb_array_length(v_solved)>=4 THEN RAISE EXCEPTION 'This puzzle is already finished.'; END IF;
    IF p_action='hint' THEN
      IF v_hints>=4 OR 5-v_mistakes-v_hints<=0 THEN RAISE EXCEPTION 'No more hints are available.'; END IF;
      v_hints:=v_hints+1;
    ELSE
      IF jsonb_typeof(p_input->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'items')<>4 THEN RAISE EXCEPTION 'Select four items.'; END IF;
      IF (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_input->'items'))<>4 THEN RAISE EXCEPTION 'Select four different items.'; END IF;
      IF EXISTS(SELECT FROM jsonb_array_elements_text(p_input->'items') i WHERE NOT EXISTS(SELECT FROM jsonb_array_elements(p.puzzle->'groups') WITH ORDINALITY b(value,ord) WHERE b.value->'items' ? i.value AND NOT v_solved ? ((p.puzzle->>'id')||'-group-'||(b.ord-1)))) THEN RAISE EXCEPTION 'Select remaining puzzle items.'; END IF;
      SELECT b.value,b.ord-1 INTO v_group,v_index FROM jsonb_array_elements(p.puzzle->'groups') WITH ORDINALITY b(value,ord) WHERE b.value->'items' @> (p_input->'items') LIMIT 1;
      IF v_group IS NOT NULL THEN
        v_group_id:=(p.puzzle->>'id')||'-group-'||v_index;
        v_solved:=v_solved||to_jsonb(v_group_id);
      ELSE v_mistakes:=v_mistakes+1;
      END IF;
    END IF;
    g.attempt_count:=v_mistakes;
    g.status:=CASE WHEN jsonb_array_length(v_solved)=4 THEN 'won' WHEN v_mistakes>=5 THEN 'lost' ELSE 'in_progress' END;
    v_state:=jsonb_build_object('solvedGroupIds',v_solved,'mistakes',v_mistakes,'hintsUsed',v_hints);
    IF g.status='won' THEN v_points:=greatest(0,5-v_mistakes-v_hints); END IF;
    v_type:='daily_bites_spark_sort'; v_name:='SPARK Sort';
  ELSE RAISE EXCEPTION 'Unsupported game action.';
  END IF;
  UPDATE public.daily_bites_game_progress SET state=v_state,status=g.status,attempt_count=g.attempt_count,employee_id=a.employee_id,employee_name=a.actor_name,updated_at=now(),completed_at=CASE WHEN g.status IN ('won','lost') THEN now() ELSE NULL END WHERE id=g.id RETURNING * INTO g;
  IF g.status='won' AND v_points>0 THEN
    INSERT INTO public.spark_points(location_id,points,point_type,description,service_date,source,employee_id,employee_name,unique_key)
      VALUES(p_location_id,v_points,v_type,v_name||' completed — '||v_points||' points',v_date,'automatic',a.employee_id,a.actor_name,'daily-bites-'||p.game_type||'-'||p_location_id||'-'||p_puzzle_id) ON CONFLICT(unique_key) DO NOTHING;
  END IF;
  v_result:=to_jsonb(g);
  INSERT INTO spark_private.game_requests(location_id,request_key,result) VALUES(p_location_id,v_key,v_result);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.spark_game_action(bigint,text,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spark_game_action(bigint,text,text,jsonb,jsonb) TO anon,authenticated;
CREATE FUNCTION public.spark_supervisor_employees(p_location_id bigint)
RETURNS TABLE(id bigint,employee_name text,email text,active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$
DECLARE s spark_private.sessions;
BEGIN
  s:=spark_private.require_actor(p_location_id);
  IF s.actor_role<>'supervisor' THEN RAISE EXCEPTION 'Supervisor access required.' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT e.id,e.employee_name,e.email,e.active FROM public.employees e WHERE e.location_id=p_location_id AND e.active ORDER BY e.employee_name;
END;
$$;
REVOKE ALL ON FUNCTION public.spark_supervisor_employees(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spark_supervisor_employees(bigint) TO anon,authenticated;

CREATE FUNCTION public.spark_security_ready() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $$ SELECT jsonb_build_object('version',1,'ready',coalesce((SELECT available FROM spark_private.security_release WHERE id),false)); $$;
REVOKE ALL ON FUNCTION public.spark_security_ready() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.spark_security_ready() TO anon,authenticated;

-- BEGIN GENERATED PRIVATE PUZZLE BANK
INSERT INTO spark_private.game_puzzles(puzzle_id,game_type,service_date,puzzle) VALUES
('word-2026-08-12-serve','word','2026-08-12','{"id":"serve","answer":"SERVE","category":"Meal service","hint":"The action at the heart of the cafeteria line.","puzzleId":"word-2026-08-12-serve"}'::jsonb),
('spark-sort-2026-08-12-inventory-day','spark_sort','2026-08-12','{"id":"inventory-day","difficulty":"easy","groups":[{"category":"Counting words","items":["Each","Case","Dozen","Pound"]},{"category":"Storage areas","items":["Pantry","Cooler","Freezer","Shelf"]},{"category":"Inventory actions","items":["Count","Rotate","Record","Order"]},{"category":"Package types","items":["Can","Box","Bag","Carton"]}],"puzzleId":"spark-sort-2026-08-12-inventory-day"}'::jsonb),
('word-2026-08-13-steam','word','2026-08-13','{"id":"steam","answer":"STEAM","category":"Production","hint":"A moist-heat cooking method.","puzzleId":"word-2026-08-13-steam"}'::jsonb),
('spark-sort-2026-08-13-production-flow','spark_sort','2026-08-13','{"id":"production-flow","difficulty":"hard","groups":[{"category":"Before cooking","items":["Read","Gather","Measure","Prep"]},{"category":"Cooking methods","items":["Bake","Steam","Roast","Simmer"]},{"category":"Recipe information","items":["Yield","Portion","Time","Ingredient"]},{"category":"After service","items":["Cool","Store","Clean","Record"]}],"puzzleId":"spark-sort-2026-08-13-production-flow"}'::jsonb),
('word-2026-08-14-stock','word','2026-08-14','{"id":"stock","answer":"STOCK","category":"Inventory","hint":"Supplies currently available on hand.","puzzleId":"word-2026-08-14-stock"}'::jsonb),
('spark-sort-2026-08-14-nutrition-mix','spark_sort','2026-08-14','{"id":"nutrition-mix","difficulty":"medium","groups":[{"category":"Protein foods","items":["Beans","Eggs","Chicken","Tofu"]},{"category":"Whole grains","items":["Oats","Quinoa","Brown Rice","Whole Wheat"]},{"category":"Calcium sources","items":["Milk","Yogurt","Cheese","Fortified Soy"]},{"category":"Hydrating produce","items":["Melon","Cucumber","Orange","Lettuce"]}],"puzzleId":"spark-sort-2026-08-14-nutrition-mix"}'::jsonb),
('word-2026-08-17-tongs','word','2026-08-17','{"id":"tongs","answer":"TONGS","category":"Equipment","hint":"A gripping utensil useful on a serving line.","puzzleId":"word-2026-08-17-tongs"}'::jsonb),
('spark-sort-2026-08-17-cafeteria-sounds','spark_sort','2026-08-17','{"id":"cafeteria-sounds","difficulty":"hard","groups":[{"category":"Things that beep","items":["Timer","Oven","Scanner","Thermometer"]},{"category":"Things that roll","items":["Cart","Rack","Dolly","Tray Line"]},{"category":"Things with handles","items":["Ladle","Pan","Mop","Pitcher"]},{"category":"Things that stack","items":["Trays","Cups","Bowls","Crates"]}],"puzzleId":"spark-sort-2026-08-17-cafeteria-sounds"}'::jsonb),
('word-2026-08-18-trays','word','2026-08-18','{"id":"trays","answer":"TRAYS","category":"Meal service","hint":"Students carry meals on these.","puzzleId":"word-2026-08-18-trays"}'::jsonb),
('spark-sort-2026-08-18-clean-team','spark_sort','2026-08-18','{"id":"clean-team","difficulty":"hard","groups":[{"category":"Dish area","items":["Scrape","Rack","Wash","Air Dry"]},{"category":"Floor care","items":["Sweep","Mop","Sign","Squeegee"]},{"category":"Sanitation words","items":["Contact Time","Solution","Test Strip","Concentration"]},{"category":"End-of-day actions","items":["Empty","Wipe","Return","Lock"]}],"puzzleId":"spark-sort-2026-08-18-clean-team"}'::jsonb),
('word-2026-08-19-waste','word','2026-08-19','{"id":"waste","answer":"WASTE","category":"Operations","hint":"Careful forecasting can help reduce this.","puzzleId":"word-2026-08-19-waste"}'::jsonb),
('spark-sort-2026-08-19-produce-colors','spark_sort','2026-08-19','{"id":"produce-colors","difficulty":"medium","groups":[{"category":"Red produce","items":["Apple","Tomato","Strawberry","Radish"]},{"category":"Leafy greens","items":["Spinach","Kale","Lettuce","Chard"]},{"category":"Citrus fruits","items":["Orange","Lemon","Lime","Grapefruit"]},{"category":"Root vegetables","items":["Carrot","Beet","Turnip","Parsnip"]}],"puzzleId":"spark-sort-2026-08-19-produce-colors"}'::jsonb),
('word-2026-08-20-wheat','word','2026-08-20','{"id":"wheat","answer":"WHEAT","category":"Agriculture","hint":"A crop commonly milled into flour.","puzzleId":"word-2026-08-20-wheat"}'::jsonb),
('spark-sort-2026-08-20-kitchen-tools','spark_sort','2026-08-20','{"id":"kitchen-tools","difficulty":"easy","groups":[{"category":"Measuring tools","items":["Scale","Cup","Spoon","Thermometer"]},{"category":"Serving tools","items":["Ladle","Tongs","Scoop","Spatula"]},{"category":"Cleaning supplies","items":["Brush","Mop","Squeegee","Bucket"]},{"category":"Large equipment","items":["Oven","Mixer","Steamer","Freezer"]}],"puzzleId":"spark-sort-2026-08-20-kitchen-tools"}'::jsonb),
('word-2026-08-21-whisk','word','2026-08-21','{"id":"whisk","answer":"WHISK","category":"Equipment","hint":"A looped tool used to blend or aerate.","puzzleId":"word-2026-08-21-whisk"}'::jsonb),
('spark-sort-2026-08-21-farm-to-tray','spark_sort','2026-08-21','{"id":"farm-to-tray","difficulty":"easy","groups":[{"category":"Tree fruits","items":["Peach","Pear","Plum","Apple"]},{"category":"Grown underground","items":["Potato","Carrot","Onion","Radish"]},{"category":"Grain crops","items":["Wheat","Oats","Rice","Corn"]},{"category":"Farm jobs","items":["Plant","Water","Harvest","Pack"]}],"puzzleId":"spark-sort-2026-08-21-farm-to-tray"}'::jsonb),
('word-2026-08-24-yield','word','2026-08-24','{"id":"yield","answer":"YIELD","category":"Production","hint":"The amount a recipe produces.","puzzleId":"word-2026-08-24-yield"}'::jsonb),
('spark-sort-2026-08-24-meal-programs','spark_sort','2026-08-24','{"id":"meal-programs","difficulty":"medium","groups":[{"category":"Breakfast favorites","items":["Oatmeal","Yogurt","Toast","Cereal"]},{"category":"Lunch line items","items":["Entrée","Fruit","Vegetable","Milk"]},{"category":"After-school snacks","items":["Crackers","Cheese","Juice","Hummus"]},{"category":"Meal service actions","items":["Greet","Portion","Count","Serve"]}],"puzzleId":"spark-sort-2026-08-24-meal-programs"}'::jsonb),
('word-2026-08-25-apple','word','2026-08-25','{"id":"apple","answer":"APPLE","category":"Produce","hint":"A crisp fruit found in many school meals.","puzzleId":"word-2026-08-25-apple"}'::jsonb),
('spark-sort-2026-08-25-food-safety-fun','spark_sort','2026-08-25','{"id":"food-safety-fun","difficulty":"medium","groups":[{"category":"Wash hands","items":["Wet","Soap","Scrub","Rinse"]},{"category":"Temperature words","items":["Hot","Cold","Chill","Heat"]},{"category":"Keep food protected","items":["Cover","Label","Wrap","Store"]},{"category":"Things to inspect","items":["Seal","Date","Package","Surface"]}],"puzzleId":"spark-sort-2026-08-25-food-safety-fun"}'::jsonb),
('word-2026-08-26-apron','word','2026-08-26','{"id":"apron","answer":"APRON","category":"Kitchen","hint":"Wear this to help protect clothing.","puzzleId":"word-2026-08-26-apron"}'::jsonb),
('spark-sort-2026-08-26-inventory-day','spark_sort','2026-08-26','{"id":"inventory-day","difficulty":"easy","groups":[{"category":"Counting words","items":["Each","Case","Dozen","Pound"]},{"category":"Storage areas","items":["Pantry","Cooler","Freezer","Shelf"]},{"category":"Inventory actions","items":["Count","Rotate","Record","Order"]},{"category":"Package types","items":["Can","Box","Bag","Carton"]}],"puzzleId":"spark-sort-2026-08-26-inventory-day"}'::jsonb),
('word-2026-08-27-beans','word','2026-08-27','{"id":"beans","answer":"BEANS","category":"Nutrition","hint":"A food that brings both protein and fiber.","puzzleId":"word-2026-08-27-beans"}'::jsonb),
('spark-sort-2026-08-27-production-flow','spark_sort','2026-08-27','{"id":"production-flow","difficulty":"hard","groups":[{"category":"Before cooking","items":["Read","Gather","Measure","Prep"]},{"category":"Cooking methods","items":["Bake","Steam","Roast","Simmer"]},{"category":"Recipe information","items":["Yield","Portion","Time","Ingredient"]},{"category":"After service","items":["Cool","Store","Clean","Record"]}],"puzzleId":"spark-sort-2026-08-27-production-flow"}'::jsonb),
('word-2026-08-28-bread','word','2026-08-28','{"id":"bread","answer":"BREAD","category":"Meal service","hint":"Whole-grain varieties add fiber to a tray.","puzzleId":"word-2026-08-28-bread"}'::jsonb),
('spark-sort-2026-08-28-nutrition-mix','spark_sort','2026-08-28','{"id":"nutrition-mix","difficulty":"medium","groups":[{"category":"Protein foods","items":["Beans","Eggs","Chicken","Tofu"]},{"category":"Whole grains","items":["Oats","Quinoa","Brown Rice","Whole Wheat"]},{"category":"Calcium sources","items":["Milk","Yogurt","Cheese","Fortified Soy"]},{"category":"Hydrating produce","items":["Melon","Cucumber","Orange","Lettuce"]}],"puzzleId":"spark-sort-2026-08-28-nutrition-mix"}'::jsonb),
('word-2026-08-31-clean','word','2026-08-31','{"id":"clean","answer":"CLEAN","category":"Sanitation","hint":"A key condition for safe food-contact surfaces.","puzzleId":"word-2026-08-31-clean"}'::jsonb),
('spark-sort-2026-08-31-cafeteria-sounds','spark_sort','2026-08-31','{"id":"cafeteria-sounds","difficulty":"hard","groups":[{"category":"Things that beep","items":["Timer","Oven","Scanner","Thermometer"]},{"category":"Things that roll","items":["Cart","Rack","Dolly","Tray Line"]},{"category":"Things with handles","items":["Ladle","Pan","Mop","Pitcher"]},{"category":"Things that stack","items":["Trays","Cups","Bowls","Crates"]}],"puzzleId":"spark-sort-2026-08-31-cafeteria-sounds"}'::jsonb),
('word-2026-09-01-crate','word','2026-09-01','{"id":"crate","answer":"CRATE","category":"Inventory","hint":"Produce may arrive in one of these containers.","puzzleId":"word-2026-09-01-crate"}'::jsonb),
('spark-sort-2026-09-01-clean-team','spark_sort','2026-09-01','{"id":"clean-team","difficulty":"hard","groups":[{"category":"Dish area","items":["Scrape","Rack","Wash","Air Dry"]},{"category":"Floor care","items":["Sweep","Mop","Sign","Squeegee"]},{"category":"Sanitation words","items":["Contact Time","Solution","Test Strip","Concentration"]},{"category":"End-of-day actions","items":["Empty","Wipe","Return","Lock"]}],"puzzleId":"spark-sort-2026-09-01-clean-team"}'::jsonb),
('word-2026-09-02-dairy','word','2026-09-02','{"id":"dairy","answer":"DAIRY","category":"Meal programs","hint":"Milk and yogurt belong to this food group.","puzzleId":"word-2026-09-02-dairy"}'::jsonb),
('spark-sort-2026-09-02-produce-colors','spark_sort','2026-09-02','{"id":"produce-colors","difficulty":"medium","groups":[{"category":"Red produce","items":["Apple","Tomato","Strawberry","Radish"]},{"category":"Leafy greens","items":["Spinach","Kale","Lettuce","Chard"]},{"category":"Citrus fruits","items":["Orange","Lemon","Lime","Grapefruit"]},{"category":"Root vegetables","items":["Carrot","Beet","Turnip","Parsnip"]}],"puzzleId":"spark-sort-2026-09-02-produce-colors"}'::jsonb),
('word-2026-09-03-dates','word','2026-09-03','{"id":"dates","answer":"DATES","category":"Produce","hint":"Naturally sweet fruit that grows on palms.","puzzleId":"word-2026-09-03-dates"}'::jsonb),
('spark-sort-2026-09-03-kitchen-tools','spark_sort','2026-09-03','{"id":"kitchen-tools","difficulty":"easy","groups":[{"category":"Measuring tools","items":["Scale","Cup","Spoon","Thermometer"]},{"category":"Serving tools","items":["Ladle","Tongs","Scoop","Spatula"]},{"category":"Cleaning supplies","items":["Brush","Mop","Squeegee","Bucket"]},{"category":"Large equipment","items":["Oven","Mixer","Steamer","Freezer"]}],"puzzleId":"spark-sort-2026-09-03-kitchen-tools"}'::jsonb),
('word-2026-09-04-farms','word','2026-09-04','{"id":"farms","answer":"FARMS","category":"Agriculture","hint":"Places where food is grown or raised.","puzzleId":"word-2026-09-04-farms"}'::jsonb),
('spark-sort-2026-09-04-farm-to-tray','spark_sort','2026-09-04','{"id":"farm-to-tray","difficulty":"easy","groups":[{"category":"Tree fruits","items":["Peach","Pear","Plum","Apple"]},{"category":"Grown underground","items":["Potato","Carrot","Onion","Radish"]},{"category":"Grain crops","items":["Wheat","Oats","Rice","Corn"]},{"category":"Farm jobs","items":["Plant","Water","Harvest","Pack"]}],"puzzleId":"spark-sort-2026-09-04-farm-to-tray"}'::jsonb),
('word-2026-09-07-fiber','word','2026-09-07','{"id":"fiber","answer":"FIBER","category":"Nutrition","hint":"A nutrient in fruits, vegetables, beans, and whole grains.","puzzleId":"word-2026-09-07-fiber"}'::jsonb),
('spark-sort-2026-09-07-meal-programs','spark_sort','2026-09-07','{"id":"meal-programs","difficulty":"medium","groups":[{"category":"Breakfast favorites","items":["Oatmeal","Yogurt","Toast","Cereal"]},{"category":"Lunch line items","items":["Entrée","Fruit","Vegetable","Milk"]},{"category":"After-school snacks","items":["Crackers","Cheese","Juice","Hummus"]},{"category":"Meal service actions","items":["Greet","Portion","Count","Serve"]}],"puzzleId":"spark-sort-2026-09-07-meal-programs"}'::jsonb),
('word-2026-09-08-glove','word','2026-09-08','{"id":"glove","answer":"GLOVE","category":"Food safety","hint":"A barrier sometimes used for ready-to-eat food.","puzzleId":"word-2026-09-08-glove"}'::jsonb),
('spark-sort-2026-09-08-food-safety-fun','spark_sort','2026-09-08','{"id":"food-safety-fun","difficulty":"medium","groups":[{"category":"Wash hands","items":["Wet","Soap","Scrub","Rinse"]},{"category":"Temperature words","items":["Hot","Cold","Chill","Heat"]},{"category":"Keep food protected","items":["Cover","Label","Wrap","Store"]},{"category":"Things to inspect","items":["Seal","Date","Package","Surface"]}],"puzzleId":"spark-sort-2026-09-08-food-safety-fun"}'::jsonb),
('word-2026-09-09-grape','word','2026-09-09','{"id":"grape","answer":"GRAPE","category":"Produce","hint":"A small fruit that grows in bunches.","puzzleId":"word-2026-09-09-grape"}'::jsonb),
('spark-sort-2026-09-09-inventory-day','spark_sort','2026-09-09','{"id":"inventory-day","difficulty":"easy","groups":[{"category":"Counting words","items":["Each","Case","Dozen","Pound"]},{"category":"Storage areas","items":["Pantry","Cooler","Freezer","Shelf"]},{"category":"Inventory actions","items":["Count","Rotate","Record","Order"]},{"category":"Package types","items":["Can","Box","Bag","Carton"]}],"puzzleId":"spark-sort-2026-09-09-inventory-day"}'::jsonb),
('word-2026-09-10-grain','word','2026-09-10','{"id":"grain","answer":"GRAIN","category":"Nutrition","hint":"Rice, oats, and wheat are examples.","puzzleId":"word-2026-09-10-grain"}'::jsonb),
('spark-sort-2026-09-10-production-flow','spark_sort','2026-09-10','{"id":"production-flow","difficulty":"hard","groups":[{"category":"Before cooking","items":["Read","Gather","Measure","Prep"]},{"category":"Cooking methods","items":["Bake","Steam","Roast","Simmer"]},{"category":"Recipe information","items":["Yield","Portion","Time","Ingredient"]},{"category":"After service","items":["Cool","Store","Clean","Record"]}],"puzzleId":"spark-sort-2026-09-10-production-flow"}'::jsonb),
('word-2026-09-11-ladle','word','2026-09-11','{"id":"ladle","answer":"LADLE","category":"Equipment","hint":"A long-handled tool for serving soup or sauce.","puzzleId":"word-2026-09-11-ladle"}'::jsonb),
('spark-sort-2026-09-11-nutrition-mix','spark_sort','2026-09-11','{"id":"nutrition-mix","difficulty":"medium","groups":[{"category":"Protein foods","items":["Beans","Eggs","Chicken","Tofu"]},{"category":"Whole grains","items":["Oats","Quinoa","Brown Rice","Whole Wheat"]},{"category":"Calcium sources","items":["Milk","Yogurt","Cheese","Fortified Soy"]},{"category":"Hydrating produce","items":["Melon","Cucumber","Orange","Lettuce"]}],"puzzleId":"spark-sort-2026-09-11-nutrition-mix"}'::jsonb),
('word-2026-09-14-lemon','word','2026-09-14','{"id":"lemon","answer":"LEMON","category":"Produce","hint":"A bright yellow citrus fruit.","puzzleId":"word-2026-09-14-lemon"}'::jsonb),
('spark-sort-2026-09-14-cafeteria-sounds','spark_sort','2026-09-14','{"id":"cafeteria-sounds","difficulty":"hard","groups":[{"category":"Things that beep","items":["Timer","Oven","Scanner","Thermometer"]},{"category":"Things that roll","items":["Cart","Rack","Dolly","Tray Line"]},{"category":"Things with handles","items":["Ladle","Pan","Mop","Pitcher"]},{"category":"Things that stack","items":["Trays","Cups","Bowls","Crates"]}],"puzzleId":"spark-sort-2026-09-14-cafeteria-sounds"}'::jsonb),
('word-2026-09-15-melon','word','2026-09-15','{"id":"melon","answer":"MELON","category":"Produce","hint":"A juicy fruit with a firm rind.","puzzleId":"word-2026-09-15-melon"}'::jsonb),
('spark-sort-2026-09-15-clean-team','spark_sort','2026-09-15','{"id":"clean-team","difficulty":"hard","groups":[{"category":"Dish area","items":["Scrape","Rack","Wash","Air Dry"]},{"category":"Floor care","items":["Sweep","Mop","Sign","Squeegee"]},{"category":"Sanitation words","items":["Contact Time","Solution","Test Strip","Concentration"]},{"category":"End-of-day actions","items":["Empty","Wipe","Return","Lock"]}],"puzzleId":"spark-sort-2026-09-15-clean-team"}'::jsonb),
('word-2026-09-16-mixer','word','2026-09-16','{"id":"mixer","answer":"MIXER","category":"Equipment","hint":"Equipment that combines ingredients quickly.","puzzleId":"word-2026-09-16-mixer"}'::jsonb),
('spark-sort-2026-09-16-produce-colors','spark_sort','2026-09-16','{"id":"produce-colors","difficulty":"medium","groups":[{"category":"Red produce","items":["Apple","Tomato","Strawberry","Radish"]},{"category":"Leafy greens","items":["Spinach","Kale","Lettuce","Chard"]},{"category":"Citrus fruits","items":["Orange","Lemon","Lime","Grapefruit"]},{"category":"Root vegetables","items":["Carrot","Beet","Turnip","Parsnip"]}],"puzzleId":"spark-sort-2026-09-16-produce-colors"}'::jsonb),
('word-2026-09-17-onion','word','2026-09-17','{"id":"onion","answer":"ONION","category":"Produce","hint":"A layered vegetable that can make eyes water.","puzzleId":"word-2026-09-17-onion"}'::jsonb),
('spark-sort-2026-09-17-kitchen-tools','spark_sort','2026-09-17','{"id":"kitchen-tools","difficulty":"easy","groups":[{"category":"Measuring tools","items":["Scale","Cup","Spoon","Thermometer"]},{"category":"Serving tools","items":["Ladle","Tongs","Scoop","Spatula"]},{"category":"Cleaning supplies","items":["Brush","Mop","Squeegee","Bucket"]},{"category":"Large equipment","items":["Oven","Mixer","Steamer","Freezer"]}],"puzzleId":"spark-sort-2026-09-17-kitchen-tools"}'::jsonb),
('word-2026-09-18-peach','word','2026-09-18','{"id":"peach","answer":"PEACH","category":"Produce","hint":"A fuzzy stone fruit.","puzzleId":"word-2026-09-18-peach"}'::jsonb),
('spark-sort-2026-09-18-farm-to-tray','spark_sort','2026-09-18','{"id":"farm-to-tray","difficulty":"easy","groups":[{"category":"Tree fruits","items":["Peach","Pear","Plum","Apple"]},{"category":"Grown underground","items":["Potato","Carrot","Onion","Radish"]},{"category":"Grain crops","items":["Wheat","Oats","Rice","Corn"]},{"category":"Farm jobs","items":["Plant","Water","Harvest","Pack"]}],"puzzleId":"spark-sort-2026-09-18-farm-to-tray"}'::jsonb),
('word-2026-09-21-plate','word','2026-09-21','{"id":"plate","answer":"PLATE","category":"Meal service","hint":"Food may be served on this reusable item.","puzzleId":"word-2026-09-21-plate"}'::jsonb),
('spark-sort-2026-09-21-meal-programs','spark_sort','2026-09-21','{"id":"meal-programs","difficulty":"medium","groups":[{"category":"Breakfast favorites","items":["Oatmeal","Yogurt","Toast","Cereal"]},{"category":"Lunch line items","items":["Entrée","Fruit","Vegetable","Milk"]},{"category":"After-school snacks","items":["Crackers","Cheese","Juice","Hummus"]},{"category":"Meal service actions","items":["Greet","Portion","Count","Serve"]}],"puzzleId":"spark-sort-2026-09-21-meal-programs"}'::jsonb),
('word-2026-09-22-scoop','word','2026-09-22','{"id":"scoop","answer":"SCOOP","category":"Portioning","hint":"A tool that helps serve consistent portions.","puzzleId":"word-2026-09-22-scoop"}'::jsonb),
('spark-sort-2026-09-22-food-safety-fun','spark_sort','2026-09-22','{"id":"food-safety-fun","difficulty":"medium","groups":[{"category":"Wash hands","items":["Wet","Soap","Scrub","Rinse"]},{"category":"Temperature words","items":["Hot","Cold","Chill","Heat"]},{"category":"Keep food protected","items":["Cover","Label","Wrap","Store"]},{"category":"Things to inspect","items":["Seal","Date","Package","Surface"]}],"puzzleId":"spark-sort-2026-09-22-food-safety-fun"}'::jsonb),
('word-2026-09-23-serve','word','2026-09-23','{"id":"serve","answer":"SERVE","category":"Meal service","hint":"The action at the heart of the cafeteria line.","puzzleId":"word-2026-09-23-serve"}'::jsonb),
('spark-sort-2026-09-23-inventory-day','spark_sort','2026-09-23','{"id":"inventory-day","difficulty":"easy","groups":[{"category":"Counting words","items":["Each","Case","Dozen","Pound"]},{"category":"Storage areas","items":["Pantry","Cooler","Freezer","Shelf"]},{"category":"Inventory actions","items":["Count","Rotate","Record","Order"]},{"category":"Package types","items":["Can","Box","Bag","Carton"]}],"puzzleId":"spark-sort-2026-09-23-inventory-day"}'::jsonb),
('word-2026-09-24-steam','word','2026-09-24','{"id":"steam","answer":"STEAM","category":"Production","hint":"A moist-heat cooking method.","puzzleId":"word-2026-09-24-steam"}'::jsonb),
('spark-sort-2026-09-24-production-flow','spark_sort','2026-09-24','{"id":"production-flow","difficulty":"hard","groups":[{"category":"Before cooking","items":["Read","Gather","Measure","Prep"]},{"category":"Cooking methods","items":["Bake","Steam","Roast","Simmer"]},{"category":"Recipe information","items":["Yield","Portion","Time","Ingredient"]},{"category":"After service","items":["Cool","Store","Clean","Record"]}],"puzzleId":"spark-sort-2026-09-24-production-flow"}'::jsonb),
('word-2026-09-25-stock','word','2026-09-25','{"id":"stock","answer":"STOCK","category":"Inventory","hint":"Supplies currently available on hand.","puzzleId":"word-2026-09-25-stock"}'::jsonb),
('spark-sort-2026-09-25-nutrition-mix','spark_sort','2026-09-25','{"id":"nutrition-mix","difficulty":"medium","groups":[{"category":"Protein foods","items":["Beans","Eggs","Chicken","Tofu"]},{"category":"Whole grains","items":["Oats","Quinoa","Brown Rice","Whole Wheat"]},{"category":"Calcium sources","items":["Milk","Yogurt","Cheese","Fortified Soy"]},{"category":"Hydrating produce","items":["Melon","Cucumber","Orange","Lettuce"]}],"puzzleId":"spark-sort-2026-09-25-nutrition-mix"}'::jsonb),
('word-2026-09-28-season-melts','word','2026-09-28','{"id":"season-melts","answer":"MELTS","category":"Cooking","hint":"Changes from solid to liquid with heat.","puzzleId":"word-2026-09-28-season-melts"}'::jsonb),
('spark-sort-2026-09-28-season-market-basket-1','spark_sort','2026-09-28','{"id":"season-market-basket-1","difficulty":"easy","groups":[{"category":"Orchard fruit","items":["Apple","Pear","Peach","Plum"]},{"category":"Eating utensils","items":["Fork","Spoon","Soup Spoon","Teaspoon"]},{"category":"Kitchen appliances","items":["Oven","Blender","Toaster","Steamer"]},{"category":"Herbs","items":["Basil","Dill","Thyme","Rosemary"]}],"puzzleId":"spark-sort-2026-09-28-season-market-basket-1"}'::jsonb),
('word-2026-09-29-waste','word','2026-09-29','{"id":"waste","answer":"WASTE","category":"Operations","hint":"Careful forecasting can help reduce this.","puzzleId":"word-2026-09-29-waste"}'::jsonb),
('spark-sort-2026-09-29-season-rainbow-produce-1','spark_sort','2026-09-29','{"id":"season-rainbow-produce-1","difficulty":"easy","groups":[{"category":"Citrus fruit","items":["Lemon","Lime","Orange","Grapefruit"]},{"category":"Leafy greens","items":["Spinach","Kale","Chard","Arugula"]},{"category":"Root vegetables","items":["Carrot","Turnip","Radish","Parsnip"]},{"category":"Berries","items":["Strawberry","Blackberry","Cranberry","Gooseberry"]}],"puzzleId":"spark-sort-2026-09-29-season-rainbow-produce-1"}'::jsonb),
('word-2026-09-30-season-cress','word','2026-09-30','{"id":"season-cress","answer":"CRESS","category":"Produce","hint":"A small leafy plant with a peppery flavor.","puzzleId":"word-2026-09-30-season-cress"}'::jsonb),
('spark-sort-2026-09-30-season-kitchen-stations-1','spark_sort','2026-09-30','{"id":"season-kitchen-stations-1","difficulty":"medium","groups":[{"category":"Measuring tools","items":["Measuring Cup","Measuring Spoon","Scale","Thermometer"]},{"category":"Cutting tools","items":["Chef Knife","Paring Knife","Kitchen Shears","Pizza Cutter"]},{"category":"Cleaning tools","items":["Mop","Scrub Brush","Squeegee","Dustpan"]},{"category":"Cooking methods","items":["Bake","Simmer","Grill","Braise"]}],"puzzleId":"spark-sort-2026-09-30-season-kitchen-stations-1"}'::jsonb),
('word-2026-10-01-season-timer','word','2026-10-01','{"id":"season-timer","answer":"TIMER","category":"Equipment","hint":"A device that signals when a set time has passed.","puzzleId":"word-2026-10-01-season-timer"}'::jsonb),
('spark-sort-2026-10-01-season-word-menu-1','spark_sort','2026-10-01','{"id":"season-word-menu-1","difficulty":"hard","groups":[{"category":"Can come before CAKE","items":["Pan","Cup","Cheese","Short"]},{"category":"Can come before CORN","items":["Pop","Sweet","Field","Baby"]},{"category":"Can come before BOARD","items":["Cutting","Serving","Menu","Bulletin"]},{"category":"Can come before ROOM","items":["Dining","Store","Rest","Lunch"]}],"puzzleId":"spark-sort-2026-10-01-season-word-menu-1"}'::jsonb),
('word-2026-10-02-stock','word','2026-10-02','{"id":"stock","answer":"STOCK","category":"Inventory","hint":"Supplies currently available on hand.","puzzleId":"word-2026-10-02-stock"}'::jsonb),
('spark-sort-2026-10-02-season-pantry-labels-1','spark_sort','2026-10-02','{"id":"season-pantry-labels-1","difficulty":"easy","groups":[{"category":"Pasta shapes","items":["Penne","Rotini","Spaghetti","Farfalle"]},{"category":"Dried seasonings","items":["Cinnamon","Paprika","Turmeric","Nutmeg"]},{"category":"Beans","items":["Black Beans","Kidney Beans","Navy Beans","Lima Beans"]},{"category":"Container types","items":["Can","Carton","Pouch","Tin"]}],"puzzleId":"spark-sort-2026-10-02-season-pantry-labels-1"}'::jsonb),
('word-2026-10-05-melon','word','2026-10-05','{"id":"melon","answer":"MELON","category":"Produce","hint":"A juicy fruit with a firm rind.","puzzleId":"word-2026-10-05-melon"}'::jsonb),
('spark-sort-2026-10-05-season-bakery-counter-1','spark_sort','2026-10-05','{"id":"season-bakery-counter-1","difficulty":"medium","groups":[{"category":"Bread shapes","items":["Loaf","Baguette","Boule","Roll"]},{"category":"Baking ingredients","items":["Flour","Yeast","Baking Soda","Sugar"]},{"category":"Baking tools","items":["Rolling Pin","Pastry Brush","Cooling Rack","Muffin Tin"]},{"category":"Bakery treats","items":["Cookie","Doughnut","Eclair","Tart"]}],"puzzleId":"spark-sort-2026-10-05-season-bakery-counter-1"}'::jsonb),
('word-2026-10-06-season-green','word','2026-10-06','{"id":"season-green","answer":"GREEN","category":"Colors","hint":"The color of spinach.","puzzleId":"word-2026-10-06-season-green"}'::jsonb),
('spark-sort-2026-10-06-season-food-word-endings-1','spark_sort','2026-10-06','{"id":"season-food-word-endings-1","difficulty":"hard","groups":[{"category":"End in BERRY","items":["Strawberry","Blueberry","Blackberry","Raspberry"]},{"category":"End in NUT","items":["Walnut","Hazelnut","Coconut","Peanut"]},{"category":"End in MELON","items":["Watermelon","Winter Melon","Bitter Melon","Horned Melon"]},{"category":"End in PEPPER","items":["Bell Pepper","Cayenne Pepper","Banana Pepper","Cherry Pepper"]}],"puzzleId":"spark-sort-2026-10-06-season-food-word-endings-1"}'::jsonb),
('word-2026-10-07-season-nacho','word','2026-10-07','{"id":"season-nacho","answer":"NACHO","category":"Menu","hint":"A tortilla chip served with toppings.","puzzleId":"word-2026-10-07-season-nacho"}'::jsonb),
('spark-sort-2026-10-07-season-soup-and-salad-1','spark_sort','2026-10-07','{"id":"season-soup-and-salad-1","difficulty":"easy","groups":[{"category":"Salad greens","items":["Romaine","Iceberg","Arugula","Spinach"]},{"category":"Salad dressings","items":["Ranch","Italian","Balsamic Vinaigrette","French"]},{"category":"Soup varieties","items":["Minestrone","Chicken Noodle","Lentil Soup","Split Pea"]},{"category":"Serving dishes","items":["Soup Bowl","Tureen","Ramekin","Serving Tray"]}],"puzzleId":"spark-sort-2026-10-07-season-soup-and-salad-1"}'::jsonb),
('word-2026-10-08-season-aroma','word','2026-10-08','{"id":"season-aroma","answer":"AROMA","category":"Cooking","hint":"The pleasant smell coming from a kitchen.","puzzleId":"word-2026-10-08-season-aroma"}'::jsonb),
('spark-sort-2026-10-08-season-school-day-1','spark_sort','2026-10-08','{"id":"season-school-day-1","difficulty":"medium","groups":[{"category":"Places at school","items":["Cafeteria","Library","Gym","Classroom"]},{"category":"School supplies","items":["Pencil","Notebook","Crayon","Marker"]},{"category":"Ways to travel","items":["Walk","Bus","Car","Train"]},{"category":"Meal times or occasions","items":["Breakfast","Supper","Snack","Picnic"]}],"puzzleId":"spark-sort-2026-10-08-season-school-day-1"}'::jsonb),
('word-2026-10-09-season-cream','word','2026-10-09','{"id":"season-cream","answer":"CREAM","category":"Dairy","hint":"A rich dairy ingredient used in some sauces.","puzzleId":"word-2026-10-09-season-cream"}'::jsonb),
('spark-sort-2026-10-09-season-small-and-large-1','spark_sort','2026-10-09','{"id":"season-small-and-large-1","difficulty":"hard","groups":[{"category":"Small amount words","items":["Pinch","Dash","Drop","Smidgen"]},{"category":"Groups or quantities","items":["Batch","Bunch","Pair","Trio"]},{"category":"Words for reducing size","items":["Chop","Mince","Grate","Shred"]},{"category":"Words for combining","items":["Mix","Fold","Toss","Whisk"]}],"puzzleId":"spark-sort-2026-10-09-season-small-and-large-1"}'::jsonb),
('word-2026-10-12-season-flour','word','2026-10-12','{"id":"season-flour","answer":"FLOUR","category":"Baking","hint":"A powder made by grinding grain.","puzzleId":"word-2026-10-12-season-flour"}'::jsonb),
('spark-sort-2026-10-12-season-delivery-day-1','spark_sort','2026-10-12','{"id":"season-delivery-day-1","difficulty":"easy","groups":[{"category":"Wheeled transport","items":["Truck","Van","Cart","Dolly"]},{"category":"Packaging materials","items":["Cardboard","Bubble Wrap","Foam","Stretch Wrap"]},{"category":"Delivery paperwork","items":["Invoice","Purchase Order","Receipt","Delivery Note"]},{"category":"Count or measure units","items":["Each","Pound","Ounce","Gallon"]}],"puzzleId":"spark-sort-2026-10-12-season-delivery-day-1"}'::jsonb),
('word-2026-10-13-season-label','word','2026-10-13','{"id":"season-label","answer":"LABEL","category":"Storage","hint":"A tag that identifies a container.","puzzleId":"word-2026-10-13-season-label"}'::jsonb),
('spark-sort-2026-10-13-season-menu-variety-1','spark_sort','2026-10-13','{"id":"season-menu-variety-1","difficulty":"medium","groups":[{"category":"Rice dishes","items":["Pilaf","Risotto","Paella","Fried Rice"]},{"category":"Pasta dishes","items":["Lasagna","Mac and Cheese","Pasta Primavera","Baked Ziti"]},{"category":"Potato preparations","items":["Mashed Potatoes","Potato Wedges","Hash Browns","Roasted Potatoes"]},{"category":"Egg preparations","items":["Scrambled Eggs","Poached Egg","Hard-Boiled Egg","Deviled Eggs"]}],"puzzleId":"spark-sort-2026-10-13-season-menu-variety-1"}'::jsonb),
('word-2026-10-14-grape','word','2026-10-14','{"id":"grape","answer":"GRAPE","category":"Produce","hint":"A small fruit that grows in bunches.","puzzleId":"word-2026-10-14-grape"}'::jsonb),
('spark-sort-2026-10-14-season-can-follow-food-1','spark_sort','2026-10-14','{"id":"season-can-follow-food-1","difficulty":"hard","groups":[{"category":"Can come after FOOD","items":["Service","Safety","Court","Truck"]},{"category":"Can come after LUNCH","items":["Box","Bag","Money","Hour"]},{"category":"Can come after TABLE","items":["Cloth","Top","Tennis","Manners"]},{"category":"Can come after WATER","items":["Bottle","Proof","Color","Front"]}],"puzzleId":"spark-sort-2026-10-14-season-can-follow-food-1"}'::jsonb),
('word-2026-10-15-season-clamp','word','2026-10-15','{"id":"season-clamp","answer":"CLAMP","category":"Tools","hint":"A device that holds things firmly together.","puzzleId":"word-2026-10-15-season-clamp"}'::jsonb),
('spark-sort-2026-10-15-season-breakfast-shelves-1','spark_sort','2026-10-15','{"id":"season-breakfast-shelves-1","difficulty":"easy","groups":[{"category":"Cereal grains","items":["Wheat","Oats","Rice","Corn"]},{"category":"Dairy foods","items":["Milk","Yogurt","Butter","Cottage Cheese"]},{"category":"Tropical fruit","items":["Banana","Pineapple","Papaya","Guava"]},{"category":"Fruit spreads","items":["Strawberry Jam","Apple Butter","Apricot Jam","Peach Preserves"]}],"puzzleId":"spark-sort-2026-10-15-season-breakfast-shelves-1"}'::jsonb),
('word-2026-10-16-fiber','word','2026-10-16','{"id":"fiber","answer":"FIBER","category":"Nutrition","hint":"A nutrient in fruits, vegetables, beans, and whole grains.","puzzleId":"word-2026-10-16-fiber"}'::jsonb),
('spark-sort-2026-10-16-season-food-descriptions-1','spark_sort','2026-10-16','{"id":"season-food-descriptions-1","difficulty":"medium","groups":[{"category":"Taste words","items":["Sweet","Sour","Salty","Bitter"]},{"category":"Texture words","items":["Crunchy","Smooth","Chewy","Crisp"]},{"category":"Shape words","items":["Round","Oval","Triangular","Flat"]},{"category":"Color words","items":["Red","Orange","Purple","Brown"]}],"puzzleId":"spark-sort-2026-10-16-season-food-descriptions-1"}'::jsonb),
('word-2026-10-19-season-heats','word','2026-10-19','{"id":"season-heats","answer":"HEATS","category":"Cooking","hint":"Makes something warmer.","puzzleId":"word-2026-10-19-season-heats"}'::jsonb),
('spark-sort-2026-10-19-season-kitchen-phrases-1','spark_sort','2026-10-19','{"id":"season-kitchen-phrases-1","difficulty":"hard","groups":[{"category":"Can come before POT","items":["Coffee","Tea","Stock","Flower"]},{"category":"Can come before PAN","items":["Frying","Sauce","Cake","Loaf"]},{"category":"Can come before BOWL","items":["Mixing","Salad","Cereal","Sugar"]},{"category":"Can come before SPOON","items":["Table","Slotted","Wooden","Measuring"]}],"puzzleId":"spark-sort-2026-10-19-season-kitchen-phrases-1"}'::jsonb),
('word-2026-10-20-season-chick','word','2026-10-20','{"id":"season-chick","answer":"CHICK","category":"Farm","hint":"A young chicken.","puzzleId":"word-2026-10-20-season-chick"}'::jsonb),
('spark-sort-2026-10-20-season-garden-groups-1','spark_sort','2026-10-20','{"id":"season-garden-groups-1","difficulty":"easy","groups":[{"category":"Plant parts","items":["Root","Stem","Leaf","Flower"]},{"category":"Garden tools","items":["Shovel","Rake","Trowel","Watering Can"]},{"category":"Fruit trees","items":["Apple Tree","Peach Tree","Plum Tree","Cherry Tree"]},{"category":"Garden helpers","items":["Bee","Ladybug","Lacewing","Hoverfly"]}],"puzzleId":"spark-sort-2026-10-20-season-garden-groups-1"}'::jsonb),
('word-2026-10-21-season-berry','word','2026-10-21','{"id":"season-berry","answer":"BERRY","category":"Produce","hint":"A small juicy fruit, often found in a bowl of mixed fruit.","puzzleId":"word-2026-10-21-season-berry"}'::jsonb),
('spark-sort-2026-10-21-season-ready-for-service-1','spark_sort','2026-10-21','{"id":"season-ready-for-service-1","difficulty":"medium","groups":[{"category":"Actions with a knife","items":["Slice","Dice","Chop","Mince"]},{"category":"Actions with liquid","items":["Pour","Drain","Ladle","Splash"]},{"category":"Service supplies","items":["Napkin","Tray","Cup","Fork"]},{"category":"Schedule words","items":["Morning","Evening","Weekday","Weekend"]}],"puzzleId":"spark-sort-2026-10-21-season-ready-for-service-1"}'::jsonb),
('word-2026-10-22-season-cloth','word','2026-10-22','{"id":"season-cloth","answer":"CLOTH","category":"Cleaning","hint":"A piece of fabric used for wiping.","puzzleId":"word-2026-10-22-season-cloth"}'::jsonb),
('spark-sort-2026-10-22-season-food-or-something-else-1','spark_sort','2026-10-22','{"id":"season-food-or-something-else-1","difficulty":"hard","groups":[{"category":"Foods also used as colors","items":["Peach","Olive","Salmon","Plum"]},{"category":"Can come before BREAK","items":["Coffee","Tea","Day","Fast"]},{"category":"Menu headings","items":["Appetizers","Side Dishes","Beverages","Desserts"]},{"category":"Parts of a recipe","items":["Title","Yield","Prep Time","Cook Time"]}],"puzzleId":"spark-sort-2026-10-22-season-food-or-something-else-1"}'::jsonb),
('word-2026-10-23-season-lunch','word','2026-10-23','{"id":"season-lunch","answer":"LUNCH","category":"Service","hint":"The midday meal.","puzzleId":"word-2026-10-23-season-lunch"}'::jsonb),
('spark-sort-2026-10-23-season-menu-map-1','spark_sort','2026-10-23','{"id":"season-menu-map-1","difficulty":"medium","groups":[{"category":"Leaf herbs","items":["Basil","Parsley","Cilantro","Mint"]},{"category":"Noodle shapes","items":["Spaghetti","Linguine","Vermicelli","Bucatini"]},{"category":"Winter squash","items":["Butternut","Spaghetti Squash","Delicata","Kabocha"]},{"category":"Fruit with a stone or pit","items":["Peach","Cherry","Nectarine","Mango"]}],"puzzleId":"spark-sort-2026-10-23-season-menu-map-1"}'::jsonb),
('word-2026-10-26-season-loads','word','2026-10-26','{"id":"season-loads","answer":"LOADS","category":"Delivery","hint":"Places supplies onto a cart or vehicle.","puzzleId":"word-2026-10-26-season-loads"}'::jsonb),
('spark-sort-2026-10-26-season-market-basket-2','spark_sort','2026-10-26','{"id":"season-market-basket-2","difficulty":"easy","groups":[{"category":"Orchard fruit","items":["Apple","Pear","Peach","Apricot"]},{"category":"Eating utensils","items":["Fork","Spoon","Soup Spoon","Dessert Fork"]},{"category":"Kitchen appliances","items":["Oven","Blender","Toaster","Freezer"]},{"category":"Herbs","items":["Mint","Parsley","Dill","Thyme"]}],"puzzleId":"spark-sort-2026-10-26-season-market-basket-2"}'::jsonb),
('word-2026-10-27-season-smile','word','2026-10-27','{"id":"season-smile","answer":"SMILE","category":"Service","hint":"A friendly expression when greeting students.","puzzleId":"word-2026-10-27-season-smile"}'::jsonb),
('spark-sort-2026-10-27-season-rainbow-produce-2','spark_sort','2026-10-27','{"id":"season-rainbow-produce-2","difficulty":"easy","groups":[{"category":"Citrus fruit","items":["Lemon","Lime","Orange","Tangerine"]},{"category":"Leafy greens","items":["Spinach","Kale","Chard","Collards"]},{"category":"Root vegetables","items":["Carrot","Turnip","Radish","Rutabaga"]},{"category":"Berries","items":["Blueberry","Raspberry","Blackberry","Cranberry"]}],"puzzleId":"spark-sort-2026-10-27-season-rainbow-produce-2"}'::jsonb),
('word-2026-10-28-farms','word','2026-10-28','{"id":"farms","answer":"FARMS","category":"Agriculture","hint":"Places where food is grown or raised.","puzzleId":"word-2026-10-28-farms"}'::jsonb),
('spark-sort-2026-10-28-season-kitchen-stations-2','spark_sort','2026-10-28','{"id":"season-kitchen-stations-2","difficulty":"medium","groups":[{"category":"Measuring tools","items":["Measuring Cup","Measuring Spoon","Scale","Ruler"]},{"category":"Cutting tools","items":["Chef Knife","Paring Knife","Kitchen Shears","Peeler"]},{"category":"Cleaning tools","items":["Mop","Scrub Brush","Squeegee","Cleaning Cloth"]},{"category":"Cooking methods","items":["Roast","Steam","Simmer","Grill"]}],"puzzleId":"spark-sort-2026-10-28-season-kitchen-stations-2"}'::jsonb),
('word-2026-10-29-season-keeps','word','2026-10-29','{"id":"season-keeps","answer":"KEEPS","category":"Storage","hint":"Retains something for future use.","puzzleId":"word-2026-10-29-season-keeps"}'::jsonb),
('spark-sort-2026-10-29-season-word-menu-2','spark_sort','2026-10-29','{"id":"season-word-menu-2","difficulty":"hard","groups":[{"category":"Can come before CAKE","items":["Pan","Cup","Cheese","Fruit"]},{"category":"Can come before CORN","items":["Pop","Sweet","Field","Flint"]},{"category":"Can come before BOARD","items":["Cutting","Serving","Menu","White"]},{"category":"Can come before ROOM","items":["Class","Break","Store","Rest"]}],"puzzleId":"spark-sort-2026-10-29-season-word-menu-2"}'::jsonb),
('word-2026-10-30-season-bunch','word','2026-10-30','{"id":"season-bunch","answer":"BUNCH","category":"Produce","hint":"A cluster of bananas or grapes.","puzzleId":"word-2026-10-30-season-bunch"}'::jsonb),
('spark-sort-2026-10-30-season-pantry-labels-2','spark_sort','2026-10-30','{"id":"season-pantry-labels-2","difficulty":"easy","groups":[{"category":"Pasta shapes","items":["Penne","Rotini","Spaghetti","Macaroni"]},{"category":"Dried seasonings","items":["Cinnamon","Paprika","Turmeric","Ginger"]},{"category":"Beans","items":["Black Beans","Kidney Beans","Navy Beans","Cannellini Beans"]},{"category":"Container types","items":["Jar","Bottle","Carton","Pouch"]}],"puzzleId":"spark-sort-2026-10-30-season-pantry-labels-2"}'::jsonb),
('word-2026-11-02-season-strip','word','2026-11-02','{"id":"season-strip","answer":"STRIP","category":"Preparation","hint":"A long narrow piece.","puzzleId":"word-2026-11-02-season-strip"}'::jsonb),
('spark-sort-2026-11-02-season-bakery-counter-2','spark_sort','2026-11-02','{"id":"season-bakery-counter-2","difficulty":"medium","groups":[{"category":"Bread shapes","items":["Loaf","Baguette","Boule","Breadstick"]},{"category":"Baking ingredients","items":["Flour","Yeast","Baking Soda","Shortening"]},{"category":"Baking tools","items":["Rolling Pin","Pastry Brush","Cooling Rack","Pastry Bag"]},{"category":"Bakery treats","items":["Brownie","Cupcake","Doughnut","Eclair"]}],"puzzleId":"spark-sort-2026-11-02-season-bakery-counter-2"}'::jsonb),
('word-2026-11-03-season-fresh','word','2026-11-03','{"id":"season-fresh","answer":"FRESH","category":"Produce","hint":"Recently picked or prepared.","puzzleId":"word-2026-11-03-season-fresh"}'::jsonb),
('spark-sort-2026-11-03-season-food-word-endings-2','spark_sort','2026-11-03','{"id":"season-food-word-endings-2","difficulty":"hard","groups":[{"category":"End in BERRY","items":["Strawberry","Blueberry","Blackberry","Cranberry"]},{"category":"End in NUT","items":["Walnut","Hazelnut","Coconut","Butternut"]},{"category":"End in MELON","items":["Watermelon","Winter Melon","Bitter Melon","Canary Melon"]},{"category":"End in PEPPER","items":["Black Pepper","White Pepper","Cayenne Pepper","Banana Pepper"]}],"puzzleId":"spark-sort-2026-11-03-season-food-word-endings-2"}'::jsonb),
('word-2026-11-04-season-munch','word','2026-11-04','{"id":"season-munch","answer":"MUNCH","category":"Eating","hint":"Chew with repeated bites.","puzzleId":"word-2026-11-04-season-munch"}'::jsonb),
('spark-sort-2026-11-04-season-soup-and-salad-2','spark_sort','2026-11-04','{"id":"season-soup-and-salad-2","difficulty":"easy","groups":[{"category":"Salad greens","items":["Romaine","Iceberg","Arugula","Butter Lettuce"]},{"category":"Salad dressings","items":["Ranch","Italian","Balsamic Vinaigrette","Thousand Island"]},{"category":"Soup varieties","items":["Minestrone","Chicken Noodle","Lentil Soup","Vegetable Soup"]},{"category":"Serving dishes","items":["Salad Plate","Platter","Tureen","Ramekin"]}],"puzzleId":"spark-sort-2026-11-04-season-soup-and-salad-2"}'::jsonb),
('word-2026-11-05-glove','word','2026-11-05','{"id":"glove","answer":"GLOVE","category":"Food safety","hint":"A barrier sometimes used for ready-to-eat food.","puzzleId":"word-2026-11-05-glove"}'::jsonb),
('spark-sort-2026-11-05-season-school-day-2','spark_sort','2026-11-05','{"id":"season-school-day-2","difficulty":"medium","groups":[{"category":"Places at school","items":["Cafeteria","Library","Gym","Office"]},{"category":"School supplies","items":["Pencil","Notebook","Crayon","Glue Stick"]},{"category":"Ways to travel","items":["Walk","Bus","Car","Scooter"]},{"category":"Meal times or occasions","items":["Brunch","Lunch","Supper","Snack"]}],"puzzleId":"spark-sort-2026-11-05-season-school-day-2"}'::jsonb),
('word-2026-11-06-season-puree','word','2026-11-06','{"id":"season-puree","answer":"PUREE","category":"Preparation","hint":"Blend food into a smooth mixture.","puzzleId":"word-2026-11-06-season-puree"}'::jsonb),
('spark-sort-2026-11-06-season-small-and-large-2','spark_sort','2026-11-06','{"id":"season-small-and-large-2","difficulty":"hard","groups":[{"category":"Small amount words","items":["Pinch","Dash","Drop","Touch"]},{"category":"Groups or quantities","items":["Batch","Bunch","Pair","Quartet"]},{"category":"Words for reducing size","items":["Chop","Mince","Grate","Crush"]},{"category":"Words for combining","items":["Blend","Stir","Fold","Toss"]}],"puzzleId":"spark-sort-2026-11-06-season-small-and-large-2"}'::jsonb),
('word-2026-11-09-season-spice','word','2026-11-09','{"id":"season-spice","answer":"SPICE","category":"Seasoning","hint":"An ingredient that adds flavor from roots, seeds or bark.","puzzleId":"word-2026-11-09-season-spice"}'::jsonb),
('spark-sort-2026-11-09-season-delivery-day-2','spark_sort','2026-11-09','{"id":"season-delivery-day-2","difficulty":"easy","groups":[{"category":"Wheeled transport","items":["Truck","Van","Cart","Hand Truck"]},{"category":"Packaging materials","items":["Cardboard","Bubble Wrap","Foam","Packing Tape"]},{"category":"Delivery paperwork","items":["Invoice","Purchase Order","Receipt","Bill of Lading"]},{"category":"Count or measure units","items":["Case","Dozen","Pound","Ounce"]}],"puzzleId":"spark-sort-2026-11-09-season-delivery-day-2"}'::jsonb),
('word-2026-11-10-season-moist','word','2026-11-10','{"id":"season-moist","answer":"MOIST","category":"Texture","hint":"Slightly wet rather than dry.","puzzleId":"word-2026-11-10-season-moist"}'::jsonb),
('spark-sort-2026-11-10-season-menu-variety-2','spark_sort','2026-11-10','{"id":"season-menu-variety-2","difficulty":"medium","groups":[{"category":"Rice dishes","items":["Pilaf","Risotto","Paella","Rice Pudding"]},{"category":"Pasta dishes","items":["Lasagna","Mac and Cheese","Pasta Primavera","Pasta Salad"]},{"category":"Potato preparations","items":["Mashed Potatoes","Potato Wedges","Hash Browns","Potato Salad"]},{"category":"Egg preparations","items":["Omelet","Frittata","Poached Egg","Hard-Boiled Egg"]}],"puzzleId":"spark-sort-2026-11-10-season-menu-variety-2"}'::jsonb),
('word-2026-11-11-season-share','word','2026-11-11','{"id":"season-share","answer":"SHARE","category":"Teamwork","hint":"Let others use or enjoy something too.","puzzleId":"word-2026-11-11-season-share"}'::jsonb),
('spark-sort-2026-11-11-season-can-follow-food-2','spark_sort','2026-11-11','{"id":"season-can-follow-food-2","difficulty":"hard","groups":[{"category":"Can come after FOOD","items":["Service","Safety","Court","Bank"]},{"category":"Can come after LUNCH","items":["Box","Bag","Money","Lady"]},{"category":"Can come after TABLE","items":["Cloth","Top","Tennis","Setting"]},{"category":"Can come after WATER","items":["Melon","Fall","Proof","Color"]}],"puzzleId":"spark-sort-2026-11-11-season-can-follow-food-2"}'::jsonb),
('word-2026-11-12-season-plums','word','2026-11-12','{"id":"season-plums","answer":"PLUMS","category":"Produce","hint":"Smooth-skinned stone fruits.","puzzleId":"word-2026-11-12-season-plums"}'::jsonb),
('spark-sort-2026-11-12-season-breakfast-shelves-2','spark_sort','2026-11-12','{"id":"season-breakfast-shelves-2","difficulty":"easy","groups":[{"category":"Cereal grains","items":["Wheat","Oats","Rice","Barley"]},{"category":"Dairy foods","items":["Milk","Yogurt","Butter","Sour Cream"]},{"category":"Tropical fruit","items":["Banana","Pineapple","Papaya","Passion Fruit"]},{"category":"Fruit spreads","items":["Grape Jelly","Orange Marmalade","Apple Butter","Apricot Jam"]}],"puzzleId":"spark-sort-2026-11-12-season-breakfast-shelves-2"}'::jsonb),
('word-2026-11-13-steam','word','2026-11-13','{"id":"steam","answer":"STEAM","category":"Production","hint":"A moist-heat cooking method.","puzzleId":"word-2026-11-13-steam"}'::jsonb),
('spark-sort-2026-11-13-season-food-descriptions-2','spark_sort','2026-11-13','{"id":"season-food-descriptions-2","difficulty":"medium","groups":[{"category":"Taste words","items":["Sweet","Sour","Salty","Savory"]},{"category":"Texture words","items":["Crunchy","Smooth","Chewy","Tender"]},{"category":"Shape words","items":["Round","Oval","Triangular","Cylindrical"]},{"category":"Color words","items":["Green","Yellow","Orange","Purple"]}],"puzzleId":"spark-sort-2026-11-13-season-food-descriptions-2"}'::jsonb),
('word-2026-11-16-season-treat','word','2026-11-16','{"id":"season-treat","answer":"TREAT","category":"Menu","hint":"A special enjoyable food.","puzzleId":"word-2026-11-16-season-treat"}'::jsonb),
('spark-sort-2026-11-16-season-kitchen-phrases-2','spark_sort','2026-11-16','{"id":"season-kitchen-phrases-2","difficulty":"hard","groups":[{"category":"Can come before POT","items":["Coffee","Tea","Stock","Crack"]},{"category":"Can come before PAN","items":["Frying","Sauce","Cake","Roasting"]},{"category":"Can come before BOWL","items":["Mixing","Salad","Cereal","Punch"]},{"category":"Can come before SPOON","items":["Dessert","Serving","Slotted","Wooden"]}],"puzzleId":"spark-sort-2026-11-16-season-kitchen-phrases-2"}'::jsonb),
('word-2026-11-17-season-salts','word','2026-11-17','{"id":"season-salts","answer":"SALTS","category":"Seasoning","hint":"Adds a familiar mineral seasoning.","puzzleId":"word-2026-11-17-season-salts"}'::jsonb),
('spark-sort-2026-11-17-season-garden-groups-2','spark_sort','2026-11-17','{"id":"season-garden-groups-2","difficulty":"easy","groups":[{"category":"Plant parts","items":["Root","Stem","Leaf","Seed"]},{"category":"Garden tools","items":["Shovel","Rake","Trowel","Pruners"]},{"category":"Fruit trees","items":["Apple Tree","Peach Tree","Plum Tree","Apricot Tree"]},{"category":"Garden helpers","items":["Butterfly","Earthworm","Ladybug","Lacewing"]}],"puzzleId":"spark-sort-2026-11-17-season-garden-groups-2"}'::jsonb),
('word-2026-11-18-season-sharp','word','2026-11-18','{"id":"season-sharp","answer":"SHARP","category":"Tools","hint":"Having an edge that cuts easily.","puzzleId":"word-2026-11-18-season-sharp"}'::jsonb),
('spark-sort-2026-11-18-season-ready-for-service-2','spark_sort','2026-11-18','{"id":"season-ready-for-service-2","difficulty":"medium","groups":[{"category":"Actions with a knife","items":["Slice","Dice","Chop","Julienne"]},{"category":"Actions with liquid","items":["Pour","Drain","Ladle","Drizzle"]},{"category":"Service supplies","items":["Napkin","Tray","Cup","Spoon"]},{"category":"Schedule words","items":["Noon","Afternoon","Evening","Weekday"]}],"puzzleId":"spark-sort-2026-11-18-season-ready-for-service-2"}'::jsonb),
('word-2026-11-19-season-limes','word','2026-11-19','{"id":"season-limes","answer":"LIMES","category":"Produce","hint":"Small green citrus fruits.","puzzleId":"word-2026-11-19-season-limes"}'::jsonb),
('spark-sort-2026-11-19-season-food-or-something-else-2','spark_sort','2026-11-19','{"id":"season-food-or-something-else-2","difficulty":"hard","groups":[{"category":"Foods also used as colors","items":["Peach","Olive","Salmon","Chocolate"]},{"category":"Can come before BREAK","items":["Coffee","Tea","Day","Spring"]},{"category":"Menu headings","items":["Appetizers","Side Dishes","Beverages","Specials"]},{"category":"Parts of a recipe","items":["Ingredients","Directions","Yield","Prep Time"]}],"puzzleId":"spark-sort-2026-11-19-season-food-or-something-else-2"}'::jsonb),
('word-2026-11-20-season-smell','word','2026-11-20','{"id":"season-smell","answer":"SMELL","category":"Senses","hint":"Notice an aroma with your nose.","puzzleId":"word-2026-11-20-season-smell"}'::jsonb),
('spark-sort-2026-11-20-season-menu-map-2','spark_sort','2026-11-20','{"id":"season-menu-map-2","difficulty":"medium","groups":[{"category":"Leaf herbs","items":["Basil","Parsley","Cilantro","Dill"]},{"category":"Noodle shapes","items":["Spaghetti","Linguine","Vermicelli","Capellini"]},{"category":"Winter squash","items":["Butternut","Spaghetti Squash","Delicata","Hubbard"]},{"category":"Fruit with a stone or pit","items":["Plum","Apricot","Cherry","Nectarine"]}],"puzzleId":"spark-sort-2026-11-20-season-menu-map-2"}'::jsonb),
('word-2026-11-23-season-cubes','word','2026-11-23','{"id":"season-cubes","answer":"CUBES","category":"Preparation","hint":"Small pieces with square sides.","puzzleId":"word-2026-11-23-season-cubes"}'::jsonb),
('spark-sort-2026-11-23-season-market-basket-3','spark_sort','2026-11-23','{"id":"season-market-basket-3","difficulty":"easy","groups":[{"category":"Orchard fruit","items":["Apple","Pear","Peach","Cherry"]},{"category":"Eating utensils","items":["Fork","Spoon","Teaspoon","Dessert Fork"]},{"category":"Kitchen appliances","items":["Oven","Blender","Steamer","Freezer"]},{"category":"Herbs","items":["Mint","Parsley","Dill","Rosemary"]}],"puzzleId":"spark-sort-2026-11-23-season-market-basket-3"}'::jsonb),
('word-2026-11-24-season-taste','word','2026-11-24','{"id":"season-taste","answer":"TASTE","category":"Senses","hint":"The sense that notices sweet and sour.","puzzleId":"word-2026-11-24-season-taste"}'::jsonb),
('spark-sort-2026-11-24-season-rainbow-produce-3','spark_sort','2026-11-24','{"id":"season-rainbow-produce-3","difficulty":"easy","groups":[{"category":"Citrus fruit","items":["Lemon","Lime","Orange","Mandarin"]},{"category":"Leafy greens","items":["Spinach","Kale","Arugula","Collards"]},{"category":"Root vegetables","items":["Carrot","Turnip","Parsnip","Rutabaga"]},{"category":"Berries","items":["Blueberry","Raspberry","Blackberry","Gooseberry"]}],"puzzleId":"spark-sort-2026-11-24-season-rainbow-produce-3"}'::jsonb),
('word-2026-11-25-season-steep','word','2026-11-25','{"id":"season-steep","answer":"STEEP","category":"Beverages","hint":"Soak tea leaves to release their flavor.","puzzleId":"word-2026-11-25-season-steep"}'::jsonb),
('spark-sort-2026-11-25-season-kitchen-stations-3','spark_sort','2026-11-25','{"id":"season-kitchen-stations-3","difficulty":"medium","groups":[{"category":"Measuring tools","items":["Measuring Cup","Measuring Spoon","Scale","Graduated Pitcher"]},{"category":"Cutting tools","items":["Chef Knife","Paring Knife","Pizza Cutter","Peeler"]},{"category":"Cleaning tools","items":["Mop","Scrub Brush","Dustpan","Cleaning Cloth"]},{"category":"Cooking methods","items":["Roast","Steam","Simmer","Braise"]}],"puzzleId":"spark-sort-2026-11-25-season-kitchen-stations-3"}'::jsonb),
('word-2026-11-26-season-bakes','word','2026-11-26','{"id":"season-bakes","answer":"BAKES","category":"Cooking","hint":"Cooks using dry heat in an oven.","puzzleId":"word-2026-11-26-season-bakes"}'::jsonb),
('spark-sort-2026-11-26-season-word-menu-3','spark_sort','2026-11-26','{"id":"season-word-menu-3","difficulty":"hard","groups":[{"category":"Can come before CAKE","items":["Pan","Cup","Cheese","Carrot"]},{"category":"Can come before CORN","items":["Pop","Sweet","Baby","Flint"]},{"category":"Can come before BOARD","items":["Cutting","Serving","Bulletin","White"]},{"category":"Can come before ROOM","items":["Class","Break","Store","Lunch"]}],"puzzleId":"spark-sort-2026-11-26-season-word-menu-3"}'::jsonb),
('word-2026-11-27-season-water','word','2026-11-27','{"id":"season-water","answer":"WATER","category":"Beverages","hint":"A clear liquid used for drinking and cooking.","puzzleId":"word-2026-11-27-season-water"}'::jsonb),
('spark-sort-2026-11-27-season-pantry-labels-3','spark_sort','2026-11-27','{"id":"season-pantry-labels-3","difficulty":"easy","groups":[{"category":"Pasta shapes","items":["Penne","Rotini","Spaghetti","Rigatoni"]},{"category":"Dried seasonings","items":["Cinnamon","Paprika","Nutmeg","Ginger"]},{"category":"Beans","items":["Black Beans","Kidney Beans","Lima Beans","Cannellini Beans"]},{"category":"Container types","items":["Jar","Bottle","Carton","Tin"]}],"puzzleId":"spark-sort-2026-11-27-season-pantry-labels-3"}'::jsonb),
('word-2026-11-30-season-meals','word','2026-11-30','{"id":"season-meals","answer":"MEALS","category":"Service","hint":"Breakfast, lunch and supper are examples.","puzzleId":"word-2026-11-30-season-meals"}'::jsonb),
('spark-sort-2026-11-30-season-bakery-counter-3','spark_sort','2026-11-30','{"id":"season-bakery-counter-3","difficulty":"medium","groups":[{"category":"Bread shapes","items":["Loaf","Baguette","Boule","Bagel"]},{"category":"Baking ingredients","items":["Flour","Yeast","Sugar","Shortening"]},{"category":"Baking tools","items":["Rolling Pin","Pastry Brush","Muffin Tin","Pastry Bag"]},{"category":"Bakery treats","items":["Brownie","Cupcake","Doughnut","Tart"]}],"puzzleId":"spark-sort-2026-11-30-season-bakery-counter-3"}'::jsonb),
('word-2026-12-01-season-cooks','word','2026-12-01','{"id":"season-cooks","answer":"COOKS","category":"Kitchen","hint":"People who prepare food.","puzzleId":"word-2026-12-01-season-cooks"}'::jsonb),
('spark-sort-2026-12-01-season-food-word-endings-3','spark_sort','2026-12-01','{"id":"season-food-word-endings-3","difficulty":"hard","groups":[{"category":"End in BERRY","items":["Strawberry","Blueberry","Blackberry","Gooseberry"]},{"category":"End in NUT","items":["Walnut","Hazelnut","Peanut","Butternut"]},{"category":"End in MELON","items":["Watermelon","Winter Melon","Horned Melon","Canary Melon"]},{"category":"End in PEPPER","items":["Black Pepper","White Pepper","Cayenne Pepper","Cherry Pepper"]}],"puzzleId":"spark-sort-2026-12-01-season-food-word-endings-3"}'::jsonb),
('word-2026-12-02-season-tangy','word','2026-12-02','{"id":"season-tangy","answer":"TANGY","category":"Taste","hint":"Having a pleasantly sharp flavor.","puzzleId":"word-2026-12-02-season-tangy"}'::jsonb),
('spark-sort-2026-12-02-season-soup-and-salad-3','spark_sort','2026-12-02','{"id":"season-soup-and-salad-3","difficulty":"easy","groups":[{"category":"Salad greens","items":["Romaine","Iceberg","Arugula","Spring Mix"]},{"category":"Salad dressings","items":["Ranch","Italian","French","Thousand Island"]},{"category":"Soup varieties","items":["Minestrone","Chicken Noodle","Split Pea","Vegetable Soup"]},{"category":"Serving dishes","items":["Salad Plate","Platter","Tureen","Serving Tray"]}],"puzzleId":"spark-sort-2026-12-02-season-soup-and-salad-3"}'::jsonb),
('word-2026-12-03-season-layer','word','2026-12-03','{"id":"season-layer","answer":"LAYER","category":"Preparation","hint":"One level placed above or below another.","puzzleId":"word-2026-12-03-season-layer"}'::jsonb),
('spark-sort-2026-12-03-season-school-day-3','spark_sort','2026-12-03','{"id":"season-school-day-3","difficulty":"medium","groups":[{"category":"Places at school","items":["Cafeteria","Library","Gym","Playground"]},{"category":"School supplies","items":["Pencil","Notebook","Marker","Glue Stick"]},{"category":"Ways to travel","items":["Walk","Bus","Train","Scooter"]},{"category":"Meal times or occasions","items":["Brunch","Lunch","Supper","Picnic"]}],"puzzleId":"spark-sort-2026-12-03-season-school-day-3"}'::jsonb),
('word-2026-12-04-season-diced','word','2026-12-04','{"id":"season-diced","answer":"DICED","category":"Preparation","hint":"Cut into small cubes.","puzzleId":"word-2026-12-04-season-diced"}'::jsonb),
('spark-sort-2026-12-04-season-small-and-large-3','spark_sort','2026-12-04','{"id":"season-small-and-large-3","difficulty":"hard","groups":[{"category":"Small amount words","items":["Pinch","Dash","Drop","Trace"]},{"category":"Groups or quantities","items":["Batch","Bunch","Trio","Quartet"]},{"category":"Words for reducing size","items":["Chop","Mince","Shred","Crush"]},{"category":"Words for combining","items":["Blend","Stir","Fold","Whisk"]}],"puzzleId":"spark-sort-2026-12-04-season-small-and-large-3"}'::jsonb),
('word-2026-12-07-season-packs','word','2026-12-07','{"id":"season-packs","answer":"PACKS","category":"Service","hint":"Puts items into containers for carrying.","puzzleId":"word-2026-12-07-season-packs"}'::jsonb),
('spark-sort-2026-12-07-season-delivery-day-3','spark_sort','2026-12-07','{"id":"season-delivery-day-3","difficulty":"easy","groups":[{"category":"Wheeled transport","items":["Truck","Van","Cart","Pallet Jack"]},{"category":"Packaging materials","items":["Cardboard","Bubble Wrap","Stretch Wrap","Packing Tape"]},{"category":"Delivery paperwork","items":["Invoice","Purchase Order","Delivery Note","Bill of Lading"]},{"category":"Count or measure units","items":["Case","Dozen","Pound","Gallon"]}],"puzzleId":"spark-sort-2026-12-07-season-delivery-day-3"}'::jsonb),
('word-2026-12-08-season-steak','word','2026-12-08','{"id":"season-steak","answer":"STEAK","category":"Menu","hint":"A thick slice of meat or fish.","puzzleId":"word-2026-12-08-season-steak"}'::jsonb),
('spark-sort-2026-12-08-season-menu-variety-3','spark_sort','2026-12-08','{"id":"season-menu-variety-3","difficulty":"medium","groups":[{"category":"Rice dishes","items":["Pilaf","Risotto","Paella","Jambalaya"]},{"category":"Pasta dishes","items":["Lasagna","Mac and Cheese","Baked Ziti","Pasta Salad"]},{"category":"Potato preparations","items":["Mashed Potatoes","Potato Wedges","Roasted Potatoes","Potato Salad"]},{"category":"Egg preparations","items":["Omelet","Frittata","Poached Egg","Deviled Eggs"]}],"puzzleId":"spark-sort-2026-12-08-season-menu-variety-3"}'::jsonb),
('word-2026-12-09-season-count','word','2026-12-09','{"id":"season-count","answer":"COUNT","category":"Operations","hint":"Find how many items are present.","puzzleId":"word-2026-12-09-season-count"}'::jsonb),
('spark-sort-2026-12-09-season-can-follow-food-3','spark_sort','2026-12-09','{"id":"season-can-follow-food-3","difficulty":"hard","groups":[{"category":"Can come after FOOD","items":["Service","Safety","Court","Chain"]},{"category":"Can come after LUNCH","items":["Box","Bag","Hour","Lady"]},{"category":"Can come after TABLE","items":["Cloth","Top","Manners","Setting"]},{"category":"Can come after WATER","items":["Melon","Fall","Proof","Front"]}],"puzzleId":"spark-sort-2026-12-09-season-can-follow-food-3"}'::jsonb),
('word-2026-12-10-season-grown','word','2026-12-10','{"id":"season-grown","answer":"GROWN","category":"Farm","hint":"Raised from a seed or young plant.","puzzleId":"word-2026-12-10-season-grown"}'::jsonb),
('spark-sort-2026-12-10-season-breakfast-shelves-3','spark_sort','2026-12-10','{"id":"season-breakfast-shelves-3","difficulty":"easy","groups":[{"category":"Cereal grains","items":["Wheat","Oats","Rice","Rye"]},{"category":"Dairy foods","items":["Milk","Yogurt","Cottage Cheese","Sour Cream"]},{"category":"Tropical fruit","items":["Banana","Pineapple","Guava","Passion Fruit"]},{"category":"Fruit spreads","items":["Grape Jelly","Orange Marmalade","Apple Butter","Peach Preserves"]}],"puzzleId":"spark-sort-2026-12-10-season-breakfast-shelves-3"}'::jsonb),
('word-2026-12-11-season-table','word','2026-12-11','{"id":"season-table","answer":"TABLE","category":"Furniture","hint":"A piece of furniture with a flat top.","puzzleId":"word-2026-12-11-season-table"}'::jsonb),
('spark-sort-2026-12-11-season-food-descriptions-3','spark_sort','2026-12-11','{"id":"season-food-descriptions-3","difficulty":"medium","groups":[{"category":"Taste words","items":["Sweet","Sour","Salty","Tangy"]},{"category":"Texture words","items":["Crunchy","Smooth","Crisp","Tender"]},{"category":"Shape words","items":["Round","Oval","Flat","Cylindrical"]},{"category":"Color words","items":["Green","Yellow","Orange","Brown"]}],"puzzleId":"spark-sort-2026-12-11-season-food-descriptions-3"}'::jsonb),
('word-2026-12-14-season-crumb','word','2026-12-14','{"id":"season-crumb","answer":"CRUMB","category":"Baking","hint":"A tiny piece that falls from bread.","puzzleId":"word-2026-12-14-season-crumb"}'::jsonb),
('spark-sort-2026-12-14-season-kitchen-phrases-3','spark_sort','2026-12-14','{"id":"season-kitchen-phrases-3","difficulty":"hard","groups":[{"category":"Can come before POT","items":["Coffee","Tea","Stock","Honey"]},{"category":"Can come before PAN","items":["Frying","Sauce","Loaf","Roasting"]},{"category":"Can come before BOWL","items":["Mixing","Salad","Sugar","Punch"]},{"category":"Can come before SPOON","items":["Dessert","Serving","Slotted","Measuring"]}],"puzzleId":"spark-sort-2026-12-14-season-kitchen-phrases-3"}'::jsonb),
('word-2026-12-15-season-panes','word','2026-12-15','{"id":"season-panes","answer":"PANES","category":"Building","hint":"Sheets of glass in a window.","puzzleId":"word-2026-12-15-season-panes"}'::jsonb),
('spark-sort-2026-12-15-season-garden-groups-3','spark_sort','2026-12-15','{"id":"season-garden-groups-3","difficulty":"easy","groups":[{"category":"Plant parts","items":["Root","Stem","Leaf","Bud"]},{"category":"Garden tools","items":["Shovel","Rake","Watering Can","Pruners"]},{"category":"Fruit trees","items":["Apple Tree","Peach Tree","Cherry Tree","Apricot Tree"]},{"category":"Garden helpers","items":["Butterfly","Earthworm","Ladybug","Hoverfly"]}],"puzzleId":"spark-sort-2026-12-15-season-garden-groups-3"}'::jsonb),
('word-2026-12-16-apple','word','2026-12-16','{"id":"apple","answer":"APPLE","category":"Produce","hint":"A crisp fruit found in many school meals.","puzzleId":"word-2026-12-16-apple"}'::jsonb),
('spark-sort-2026-12-16-season-ready-for-service-3','spark_sort','2026-12-16','{"id":"season-ready-for-service-3","difficulty":"medium","groups":[{"category":"Actions with a knife","items":["Slice","Dice","Chop","Trim"]},{"category":"Actions with liquid","items":["Pour","Drain","Splash","Drizzle"]},{"category":"Service supplies","items":["Napkin","Tray","Fork","Spoon"]},{"category":"Schedule words","items":["Noon","Afternoon","Evening","Weekend"]}],"puzzleId":"spark-sort-2026-12-16-season-ready-for-service-3"}'::jsonb),
('word-2026-12-17-season-maple','word','2026-12-17','{"id":"season-maple","answer":"MAPLE","category":"Pantry","hint":"The tree associated with a familiar syrup.","puzzleId":"word-2026-12-17-season-maple"}'::jsonb),
('spark-sort-2026-12-17-season-food-or-something-else-3','spark_sort','2026-12-17','{"id":"season-food-or-something-else-3","difficulty":"hard","groups":[{"category":"Foods also used as colors","items":["Peach","Olive","Salmon","Cream"]},{"category":"Can come before BREAK","items":["Coffee","Tea","Fast","Spring"]},{"category":"Menu headings","items":["Appetizers","Side Dishes","Desserts","Specials"]},{"category":"Parts of a recipe","items":["Ingredients","Directions","Yield","Cook Time"]}],"puzzleId":"spark-sort-2026-12-17-season-food-or-something-else-3"}'::jsonb),
('word-2026-12-18-ladle','word','2026-12-18','{"id":"ladle","answer":"LADLE","category":"Equipment","hint":"A long-handled tool for serving soup or sauce.","puzzleId":"word-2026-12-18-ladle"}'::jsonb),
('spark-sort-2026-12-18-season-menu-map-3','spark_sort','2026-12-18','{"id":"season-menu-map-3","difficulty":"medium","groups":[{"category":"Leaf herbs","items":["Basil","Parsley","Cilantro","Sage"]},{"category":"Noodle shapes","items":["Spaghetti","Linguine","Bucatini","Capellini"]},{"category":"Winter squash","items":["Butternut","Spaghetti Squash","Kabocha","Hubbard"]},{"category":"Fruit with a stone or pit","items":["Plum","Apricot","Cherry","Mango"]}],"puzzleId":"spark-sort-2026-12-18-season-menu-map-3"}'::jsonb),
('word-2026-12-21-season-drink','word','2026-12-21','{"id":"season-drink","answer":"DRINK","category":"Service","hint":"A beverage.","puzzleId":"word-2026-12-21-season-drink"}'::jsonb),
('spark-sort-2026-12-21-season-market-basket-4','spark_sort','2026-12-21','{"id":"season-market-basket-4","difficulty":"easy","groups":[{"category":"Orchard fruit","items":["Apple","Pear","Plum","Apricot"]},{"category":"Eating utensils","items":["Fork","Chopsticks","Soup Spoon","Teaspoon"]},{"category":"Kitchen appliances","items":["Oven","Toaster","Steamer","Freezer"]},{"category":"Herbs","items":["Mint","Parsley","Thyme","Rosemary"]}],"puzzleId":"spark-sort-2026-12-21-season-market-basket-4"}'::jsonb),
('word-2026-12-22-season-leafy','word','2026-12-22','{"id":"season-leafy","answer":"LEAFY","category":"Produce","hint":"A word describing spinach and lettuce.","puzzleId":"word-2026-12-22-season-leafy"}'::jsonb),
('spark-sort-2026-12-22-season-rainbow-produce-4','spark_sort','2026-12-22','{"id":"season-rainbow-produce-4","difficulty":"easy","groups":[{"category":"Citrus fruit","items":["Lemon","Lime","Grapefruit","Tangerine"]},{"category":"Leafy greens","items":["Spinach","Lettuce","Chard","Arugula"]},{"category":"Root vegetables","items":["Carrot","Radish","Parsnip","Rutabaga"]},{"category":"Berries","items":["Blueberry","Raspberry","Cranberry","Gooseberry"]}],"puzzleId":"spark-sort-2026-12-22-season-rainbow-produce-4"}'::jsonb),
('word-2026-12-23-season-salsa','word','2026-12-23','{"id":"season-salsa","answer":"SALSA","category":"Menu","hint":"A sauce often made with tomatoes and peppers.","puzzleId":"word-2026-12-23-season-salsa"}'::jsonb),
('spark-sort-2026-12-23-season-kitchen-stations-4','spark_sort','2026-12-23','{"id":"season-kitchen-stations-4","difficulty":"medium","groups":[{"category":"Measuring tools","items":["Measuring Cup","Measuring Spoon","Thermometer","Ruler"]},{"category":"Cutting tools","items":["Chef Knife","Bread Knife","Kitchen Shears","Pizza Cutter"]},{"category":"Cleaning tools","items":["Mop","Squeegee","Dustpan","Cleaning Cloth"]},{"category":"Cooking methods","items":["Roast","Steam","Grill","Braise"]}],"puzzleId":"spark-sort-2026-12-23-season-kitchen-stations-4"}'::jsonb),
('word-2026-12-24-season-rinse','word','2026-12-24','{"id":"season-rinse","answer":"RINSE","category":"Preparation","hint":"Wash briefly with clean water.","puzzleId":"word-2026-12-24-season-rinse"}'::jsonb),
('spark-sort-2026-12-24-season-word-menu-4','spark_sort','2026-12-24','{"id":"season-word-menu-4","difficulty":"hard","groups":[{"category":"Can come before CAKE","items":["Pan","Cup","Short","Fruit"]},{"category":"Can come before CORN","items":["Pop","Candy","Field","Baby"]},{"category":"Can come before BOARD","items":["Cutting","Menu","Bulletin","White"]},{"category":"Can come before ROOM","items":["Class","Break","Rest","Lunch"]}],"puzzleId":"spark-sort-2026-12-24-season-word-menu-4"}'::jsonb),
('word-2026-12-25-season-glass','word','2026-12-25','{"id":"season-glass","answer":"GLASS","category":"Tableware","hint":"A drinking vessel or the material it is made from.","puzzleId":"word-2026-12-25-season-glass"}'::jsonb),
('spark-sort-2026-12-25-season-pantry-labels-4','spark_sort','2026-12-25','{"id":"season-pantry-labels-4","difficulty":"easy","groups":[{"category":"Pasta shapes","items":["Penne","Rotini","Farfalle","Macaroni"]},{"category":"Dried seasonings","items":["Cinnamon","Cumin","Turmeric","Nutmeg"]},{"category":"Beans","items":["Black Beans","Navy Beans","Lima Beans","Cannellini Beans"]},{"category":"Container types","items":["Jar","Bottle","Pouch","Tin"]}],"puzzleId":"spark-sort-2026-12-25-season-pantry-labels-4"}'::jsonb),
('word-2026-12-28-season-daily','word','2026-12-28','{"id":"season-daily","answer":"DAILY","category":"Routine","hint":"Happening every day.","puzzleId":"word-2026-12-28-season-daily"}'::jsonb),
('spark-sort-2026-12-28-season-bakery-counter-4','spark_sort','2026-12-28','{"id":"season-bakery-counter-4","difficulty":"medium","groups":[{"category":"Bread shapes","items":["Loaf","Baguette","Roll","Breadstick"]},{"category":"Baking ingredients","items":["Flour","Baking Powder","Baking Soda","Sugar"]},{"category":"Baking tools","items":["Rolling Pin","Cooling Rack","Muffin Tin","Pastry Bag"]},{"category":"Bakery treats","items":["Brownie","Cupcake","Eclair","Tart"]}],"puzzleId":"spark-sort-2026-12-28-season-bakery-counter-4"}'::jsonb),
('word-2026-12-29-season-whole','word','2026-12-29','{"id":"season-whole","answer":"WHOLE","category":"Ingredients","hint":"Complete, with no part removed.","puzzleId":"word-2026-12-29-season-whole"}'::jsonb),
('spark-sort-2026-12-29-season-food-word-endings-4','spark_sort','2026-12-29','{"id":"season-food-word-endings-4","difficulty":"hard","groups":[{"category":"End in BERRY","items":["Strawberry","Blueberry","Raspberry","Cranberry"]},{"category":"End in NUT","items":["Walnut","Chestnut","Coconut","Peanut"]},{"category":"End in MELON","items":["Watermelon","Bitter Melon","Horned Melon","Canary Melon"]},{"category":"End in PEPPER","items":["Black Pepper","White Pepper","Banana Pepper","Cherry Pepper"]}],"puzzleId":"spark-sort-2026-12-29-season-food-word-endings-4"}'::jsonb),
('word-2026-12-30-season-sieve','word','2026-12-30','{"id":"season-sieve","answer":"SIEVE","category":"Tools","hint":"A tool with mesh used to separate particles.","puzzleId":"word-2026-12-30-season-sieve"}'::jsonb),
('spark-sort-2026-12-30-season-soup-and-salad-4','spark_sort','2026-12-30','{"id":"season-soup-and-salad-4","difficulty":"easy","groups":[{"category":"Salad greens","items":["Romaine","Iceberg","Spinach","Butter Lettuce"]},{"category":"Salad dressings","items":["Ranch","Caesar","Balsamic Vinaigrette","French"]},{"category":"Soup varieties","items":["Minestrone","Lentil Soup","Split Pea","Vegetable Soup"]},{"category":"Serving dishes","items":["Salad Plate","Platter","Ramekin","Serving Tray"]}],"puzzleId":"spark-sort-2026-12-30-season-soup-and-salad-4"}'::jsonb),
('word-2026-12-31-season-grill','word','2026-12-31','{"id":"season-grill","answer":"GRILL","category":"Cooking","hint":"Cook on a heated grate or surface.","puzzleId":"word-2026-12-31-season-grill"}'::jsonb),
('spark-sort-2026-12-31-season-school-day-4','spark_sort','2026-12-31','{"id":"season-school-day-4","difficulty":"medium","groups":[{"category":"Places at school","items":["Cafeteria","Library","Classroom","Office"]},{"category":"School supplies","items":["Pencil","Eraser","Crayon","Marker"]},{"category":"Ways to travel","items":["Walk","Car","Train","Scooter"]},{"category":"Meal times or occasions","items":["Brunch","Lunch","Snack","Picnic"]}],"puzzleId":"spark-sort-2026-12-31-season-school-day-4"}'::jsonb),
('word-2027-01-01-dairy','word','2027-01-01','{"id":"dairy","answer":"DAIRY","category":"Meal programs","hint":"Milk and yogurt belong to this food group.","puzzleId":"word-2027-01-01-dairy"}'::jsonb),
('spark-sort-2027-01-01-season-small-and-large-4','spark_sort','2027-01-01','{"id":"season-small-and-large-4","difficulty":"hard","groups":[{"category":"Small amount words","items":["Pinch","Dash","Smidgen","Touch"]},{"category":"Groups or quantities","items":["Batch","Dozen","Pair","Trio"]},{"category":"Words for reducing size","items":["Chop","Grate","Shred","Crush"]},{"category":"Words for combining","items":["Blend","Stir","Toss","Whisk"]}],"puzzleId":"spark-sort-2027-01-01-season-small-and-large-4"}'::jsonb),
('word-2027-01-04-season-toast','word','2027-01-04','{"id":"season-toast","answer":"TOAST","category":"Breakfast","hint":"Bread browned by heat.","puzzleId":"word-2027-01-04-season-toast"}'::jsonb),
('spark-sort-2027-01-04-season-delivery-day-4','spark_sort','2027-01-04','{"id":"season-delivery-day-4","difficulty":"easy","groups":[{"category":"Wheeled transport","items":["Truck","Van","Dolly","Hand Truck"]},{"category":"Packaging materials","items":["Cardboard","Packing Paper","Foam","Stretch Wrap"]},{"category":"Delivery paperwork","items":["Invoice","Receipt","Delivery Note","Bill of Lading"]},{"category":"Count or measure units","items":["Case","Dozen","Ounce","Gallon"]}],"puzzleId":"spark-sort-2027-01-04-season-delivery-day-4"}'::jsonb),
('word-2027-01-05-season-skims','word','2027-01-05','{"id":"season-skims","answer":"SKIMS","category":"Cooking","hint":"Removes a layer from a liquid surface.","puzzleId":"word-2027-01-05-season-skims"}'::jsonb),
('spark-sort-2027-01-05-season-menu-variety-4','spark_sort','2027-01-05','{"id":"season-menu-variety-4","difficulty":"medium","groups":[{"category":"Rice dishes","items":["Pilaf","Risotto","Fried Rice","Rice Pudding"]},{"category":"Pasta dishes","items":["Lasagna","Spaghetti Marinara","Pasta Primavera","Baked Ziti"]},{"category":"Potato preparations","items":["Mashed Potatoes","Hash Browns","Roasted Potatoes","Potato Salad"]},{"category":"Egg preparations","items":["Omelet","Frittata","Hard-Boiled Egg","Deviled Eggs"]}],"puzzleId":"spark-sort-2027-01-05-season-menu-variety-4"}'::jsonb),
('word-2027-01-06-season-grate','word','2027-01-06','{"id":"season-grate","answer":"GRATE","category":"Preparation","hint":"Shred food against a rough-edged tool.","puzzleId":"word-2027-01-06-season-grate"}'::jsonb),
('spark-sort-2027-01-06-season-can-follow-food-4','spark_sort','2027-01-06','{"id":"season-can-follow-food-4","difficulty":"hard","groups":[{"category":"Can come after FOOD","items":["Service","Safety","Truck","Bank"]},{"category":"Can come after LUNCH","items":["Box","Break","Money","Hour"]},{"category":"Can come after TABLE","items":["Cloth","Tennis","Manners","Setting"]},{"category":"Can come after WATER","items":["Melon","Fall","Color","Front"]}],"puzzleId":"spark-sort-2027-01-06-season-can-follow-food-4"}'::jsonb),
('word-2027-01-07-season-juice','word','2027-01-07','{"id":"season-juice","answer":"JUICE","category":"Beverages","hint":"Liquid pressed from fruit or vegetables.","puzzleId":"word-2027-01-07-season-juice"}'::jsonb),
('spark-sort-2027-01-07-season-breakfast-shelves-4','spark_sort','2027-01-07','{"id":"season-breakfast-shelves-4","difficulty":"easy","groups":[{"category":"Cereal grains","items":["Wheat","Oats","Corn","Barley"]},{"category":"Dairy foods","items":["Milk","Cheese","Butter","Cottage Cheese"]},{"category":"Tropical fruit","items":["Banana","Papaya","Guava","Passion Fruit"]},{"category":"Fruit spreads","items":["Grape Jelly","Orange Marmalade","Apricot Jam","Peach Preserves"]}],"puzzleId":"spark-sort-2027-01-07-season-breakfast-shelves-4"}'::jsonb),
('word-2027-01-08-season-olive','word','2027-01-08','{"id":"season-olive","answer":"OLIVE","category":"Produce","hint":"A small fruit often used to make oil.","puzzleId":"word-2027-01-08-season-olive"}'::jsonb),
('spark-sort-2027-01-08-season-food-descriptions-4','spark_sort','2027-01-08','{"id":"season-food-descriptions-4","difficulty":"medium","groups":[{"category":"Taste words","items":["Sweet","Sour","Bitter","Savory"]},{"category":"Texture words","items":["Crunchy","Creamy","Chewy","Crisp"]},{"category":"Shape words","items":["Round","Triangular","Flat","Cylindrical"]},{"category":"Color words","items":["Green","Yellow","Purple","Brown"]}],"puzzleId":"spark-sort-2027-01-08-season-food-descriptions-4"}'::jsonb),
('word-2027-01-11-season-chard','word','2027-01-11','{"id":"season-chard","answer":"CHARD","category":"Produce","hint":"A leafy vegetable with colorful stems.","puzzleId":"word-2027-01-11-season-chard"}'::jsonb),
('spark-sort-2027-01-11-season-kitchen-phrases-4','spark_sort','2027-01-11','{"id":"season-kitchen-phrases-4","difficulty":"hard","groups":[{"category":"Can come before POT","items":["Coffee","Tea","Flower","Crack"]},{"category":"Can come before PAN","items":["Frying","Sheet","Cake","Loaf"]},{"category":"Can come before BOWL","items":["Mixing","Cereal","Sugar","Punch"]},{"category":"Can come before SPOON","items":["Dessert","Serving","Wooden","Measuring"]}],"puzzleId":"spark-sort-2027-01-11-season-kitchen-phrases-4"}'::jsonb),
('word-2027-01-12-season-wipes','word','2027-01-12','{"id":"season-wipes","answer":"WIPES","category":"Cleaning","hint":"Cleans a surface by rubbing.","puzzleId":"word-2027-01-12-season-wipes"}'::jsonb),
('spark-sort-2027-01-12-season-garden-groups-4','spark_sort','2027-01-12','{"id":"season-garden-groups-4","difficulty":"easy","groups":[{"category":"Plant parts","items":["Root","Stem","Flower","Seed"]},{"category":"Garden tools","items":["Shovel","Hoe","Trowel","Watering Can"]},{"category":"Fruit trees","items":["Apple Tree","Plum Tree","Cherry Tree","Apricot Tree"]},{"category":"Garden helpers","items":["Butterfly","Earthworm","Lacewing","Hoverfly"]}],"puzzleId":"spark-sort-2027-01-12-season-garden-groups-4"}'::jsonb),
('word-2027-01-13-season-herbs','word','2027-01-13','{"id":"season-herbs","answer":"HERBS","category":"Seasoning","hint":"Flavorful plant leaves used in cooking.","puzzleId":"word-2027-01-13-season-herbs"}'::jsonb),
('spark-sort-2027-01-13-season-ready-for-service-4','spark_sort','2027-01-13','{"id":"season-ready-for-service-4","difficulty":"medium","groups":[{"category":"Actions with a knife","items":["Slice","Dice","Mince","Julienne"]},{"category":"Actions with liquid","items":["Pour","Strain","Ladle","Splash"]},{"category":"Service supplies","items":["Napkin","Cup","Fork","Spoon"]},{"category":"Schedule words","items":["Noon","Afternoon","Weekday","Weekend"]}],"puzzleId":"spark-sort-2027-01-13-season-ready-for-service-4"}'::jsonb),
('word-2027-01-14-season-thaws','word','2027-01-14','{"id":"season-thaws","answer":"THAWS","category":"Preparation","hint":"Becomes unfrozen.","puzzleId":"word-2027-01-14-season-thaws"}'::jsonb),
('spark-sort-2027-01-14-season-food-or-something-else-4','spark_sort','2027-01-14','{"id":"season-food-or-something-else-4","difficulty":"hard","groups":[{"category":"Foods also used as colors","items":["Peach","Olive","Plum","Chocolate"]},{"category":"Can come before BREAK","items":["Coffee","Lunch","Day","Fast"]},{"category":"Menu headings","items":["Appetizers","Beverages","Desserts","Specials"]},{"category":"Parts of a recipe","items":["Ingredients","Directions","Prep Time","Cook Time"]}],"puzzleId":"spark-sort-2027-01-14-season-food-or-something-else-4"}'::jsonb),
('word-2027-01-15-season-board','word','2027-01-15','{"id":"season-board","answer":"BOARD","category":"Tools","hint":"A flat surface used under food when cutting.","puzzleId":"word-2027-01-15-season-board"}'::jsonb),
('spark-sort-2027-01-15-season-menu-map-4','spark_sort','2027-01-15','{"id":"season-menu-map-4","difficulty":"medium","groups":[{"category":"Leaf herbs","items":["Basil","Parsley","Mint","Dill"]},{"category":"Noodle shapes","items":["Spaghetti","Fettuccine","Vermicelli","Bucatini"]},{"category":"Winter squash","items":["Butternut","Delicata","Kabocha","Hubbard"]},{"category":"Fruit with a stone or pit","items":["Plum","Apricot","Nectarine","Mango"]}],"puzzleId":"spark-sort-2027-01-15-season-menu-map-4"}'::jsonb),
('word-2027-01-18-season-trims','word','2027-01-18','{"id":"season-trims","answer":"TRIMS","category":"Preparation","hint":"Cuts away unwanted edges.","puzzleId":"word-2027-01-18-season-trims"}'::jsonb),
('spark-sort-2027-01-18-season-market-basket-5','spark_sort','2027-01-18','{"id":"season-market-basket-5","difficulty":"easy","groups":[{"category":"Orchard fruit","items":["Apple","Pear","Plum","Cherry"]},{"category":"Eating utensils","items":["Fork","Chopsticks","Soup Spoon","Dessert Fork"]},{"category":"Kitchen appliances","items":["Mixer","Blender","Toaster","Steamer"]},{"category":"Herbs","items":["Mint","Dill","Thyme","Rosemary"]}],"puzzleId":"spark-sort-2027-01-18-season-market-basket-5"}'::jsonb),
('word-2027-01-19-season-vegan','word','2027-01-19','{"id":"season-vegan","answer":"VEGAN","category":"Menu","hint":"Describes food made without animal products.","puzzleId":"word-2027-01-19-season-vegan"}'::jsonb),
('spark-sort-2027-01-19-season-rainbow-produce-5','spark_sort','2027-01-19','{"id":"season-rainbow-produce-5","difficulty":"easy","groups":[{"category":"Citrus fruit","items":["Lemon","Lime","Grapefruit","Mandarin"]},{"category":"Leafy greens","items":["Spinach","Lettuce","Chard","Collards"]},{"category":"Root vegetables","items":["Beet","Turnip","Radish","Parsnip"]},{"category":"Berries","items":["Blueberry","Blackberry","Cranberry","Gooseberry"]}],"puzzleId":"spark-sort-2027-01-19-season-rainbow-produce-5"}'::jsonb),
('word-2027-01-20-season-zests','word','2027-01-20','{"id":"season-zests","answer":"ZESTS","category":"Preparation","hint":"Removes the colored outer peel of citrus.","puzzleId":"word-2027-01-20-season-zests"}'::jsonb),
('spark-sort-2027-01-20-season-kitchen-stations-5','spark_sort','2027-01-20','{"id":"season-kitchen-stations-5","difficulty":"medium","groups":[{"category":"Measuring tools","items":["Measuring Cup","Measuring Spoon","Thermometer","Graduated Pitcher"]},{"category":"Cutting tools","items":["Chef Knife","Bread Knife","Kitchen Shears","Peeler"]},{"category":"Cleaning tools","items":["Broom","Scrub Brush","Squeegee","Dustpan"]},{"category":"Cooking methods","items":["Roast","Simmer","Grill","Braise"]}],"puzzleId":"spark-sort-2027-01-20-season-kitchen-stations-5"}'::jsonb),
('word-2027-01-21-season-guava','word','2027-01-21','{"id":"season-guava","answer":"GUAVA","category":"Produce","hint":"A tropical fruit with fragrant flesh.","puzzleId":"word-2027-01-21-season-guava"}'::jsonb),
('spark-sort-2027-01-21-season-word-menu-5','spark_sort','2027-01-21','{"id":"season-word-menu-5","difficulty":"hard","groups":[{"category":"Can come before CAKE","items":["Pan","Cup","Short","Carrot"]},{"category":"Can come before CORN","items":["Pop","Candy","Field","Flint"]},{"category":"Can come before BOARD","items":["Chopping","Serving","Menu","Bulletin"]},{"category":"Can come before ROOM","items":["Class","Store","Rest","Lunch"]}],"puzzleId":"spark-sort-2027-01-21-season-word-menu-5"}'::jsonb),
('word-2027-01-22-season-sides','word','2027-01-22','{"id":"season-sides","answer":"SIDES","category":"Menu","hint":"Smaller dishes served alongside a main dish.","puzzleId":"word-2027-01-22-season-sides"}'::jsonb),
('spark-sort-2027-01-22-season-pantry-labels-5','spark_sort','2027-01-22','{"id":"season-pantry-labels-5","difficulty":"easy","groups":[{"category":"Pasta shapes","items":["Penne","Rotini","Farfalle","Rigatoni"]},{"category":"Dried seasonings","items":["Cinnamon","Cumin","Turmeric","Ginger"]},{"category":"Beans","items":["Pinto Beans","Kidney Beans","Navy Beans","Lima Beans"]},{"category":"Container types","items":["Jar","Carton","Pouch","Tin"]}],"puzzleId":"spark-sort-2027-01-22-season-pantry-labels-5"}'::jsonb),
('word-2027-01-25-season-chops','word','2027-01-25','{"id":"season-chops","answer":"CHOPS","category":"Preparation","hint":"Cuts food into pieces.","puzzleId":"word-2027-01-25-season-chops"}'::jsonb),
('spark-sort-2027-01-25-season-bakery-counter-5','spark_sort','2027-01-25','{"id":"season-bakery-counter-5","difficulty":"medium","groups":[{"category":"Bread shapes","items":["Loaf","Baguette","Roll","Bagel"]},{"category":"Baking ingredients","items":["Flour","Baking Powder","Baking Soda","Shortening"]},{"category":"Baking tools","items":["Dough Scraper","Pastry Brush","Cooling Rack","Muffin Tin"]},{"category":"Bakery treats","items":["Brownie","Doughnut","Eclair","Tart"]}],"puzzleId":"spark-sort-2027-01-25-season-bakery-counter-5"}'::jsonb),
('word-2027-01-26-season-shake','word','2027-01-26','{"id":"season-shake","answer":"SHAKE","category":"Preparation","hint":"Move a container back and forth.","puzzleId":"word-2027-01-26-season-shake"}'::jsonb),
('spark-sort-2027-01-26-season-food-word-endings-5','spark_sort','2027-01-26','{"id":"season-food-word-endings-5","difficulty":"hard","groups":[{"category":"End in BERRY","items":["Strawberry","Blueberry","Raspberry","Gooseberry"]},{"category":"End in NUT","items":["Walnut","Chestnut","Coconut","Butternut"]},{"category":"End in MELON","items":["Honeydew Melon","Winter Melon","Bitter Melon","Horned Melon"]},{"category":"End in PEPPER","items":["Black Pepper","Cayenne Pepper","Banana Pepper","Cherry Pepper"]}],"puzzleId":"spark-sort-2027-01-26-season-food-word-endings-5"}'::jsonb),
('word-2027-01-27-season-straw','word','2027-01-27','{"id":"season-straw","answer":"STRAW","category":"Service","hint":"A narrow tube used for sipping.","puzzleId":"word-2027-01-27-season-straw"}'::jsonb),
('spark-sort-2027-01-27-season-soup-and-salad-5','spark_sort','2027-01-27','{"id":"season-soup-and-salad-5","difficulty":"easy","groups":[{"category":"Salad greens","items":["Romaine","Iceberg","Spinach","Spring Mix"]},{"category":"Salad dressings","items":["Ranch","Caesar","Balsamic Vinaigrette","Thousand Island"]},{"category":"Soup varieties","items":["Tomato Soup","Chicken Noodle","Lentil Soup","Split Pea"]},{"category":"Serving dishes","items":["Salad Plate","Tureen","Ramekin","Serving Tray"]}],"puzzleId":"spark-sort-2027-01-27-season-soup-and-salad-5"}'::jsonb),
('word-2027-01-28-season-seeds','word','2027-01-28','{"id":"season-seeds","answer":"SEEDS","category":"Farm","hint":"Small structures from which plants can grow.","puzzleId":"word-2027-01-28-season-seeds"}'::jsonb),
('spark-sort-2027-01-28-season-school-day-5','spark_sort','2027-01-28','{"id":"season-school-day-5","difficulty":"medium","groups":[{"category":"Places at school","items":["Cafeteria","Library","Classroom","Playground"]},{"category":"School supplies","items":["Pencil","Eraser","Crayon","Glue Stick"]},{"category":"Ways to travel","items":["Bike","Bus","Car","Train"]},{"category":"Meal times or occasions","items":["Brunch","Supper","Snack","Picnic"]}],"puzzleId":"spark-sort-2027-01-28-season-school-day-5"}'::jsonb),
('word-2027-01-29-season-meats','word','2027-01-29','{"id":"season-meats","answer":"MEATS","category":"Menu","hint":"Foods such as beef and chicken.","puzzleId":"word-2027-01-29-season-meats"}'::jsonb),
('spark-sort-2027-01-29-season-small-and-large-5','spark_sort','2027-01-29','{"id":"season-small-and-large-5","difficulty":"hard","groups":[{"category":"Small amount words","items":["Pinch","Dash","Smidgen","Trace"]},{"category":"Groups or quantities","items":["Batch","Dozen","Pair","Quartet"]},{"category":"Words for reducing size","items":["Dice","Mince","Grate","Shred"]},{"category":"Words for combining","items":["Blend","Fold","Toss","Whisk"]}],"puzzleId":"spark-sort-2027-01-29-season-small-and-large-5"}'::jsonb),
('word-2027-02-01-season-pizza','word','2027-02-01','{"id":"season-pizza","answer":"PIZZA","category":"Menu","hint":"A baked crust with sauce and toppings.","puzzleId":"word-2027-02-01-season-pizza"}'::jsonb),
('spark-sort-2027-02-01-season-delivery-day-5','spark_sort','2027-02-01','{"id":"season-delivery-day-5","difficulty":"easy","groups":[{"category":"Wheeled transport","items":["Truck","Van","Dolly","Pallet Jack"]},{"category":"Packaging materials","items":["Cardboard","Packing Paper","Foam","Packing Tape"]},{"category":"Delivery paperwork","items":["Packing Slip","Purchase Order","Receipt","Delivery Note"]},{"category":"Count or measure units","items":["Case","Pound","Ounce","Gallon"]}],"puzzleId":"spark-sort-2027-02-01-season-delivery-day-5"}'::jsonb),
('word-2027-02-02-season-drain','word','2027-02-02','{"id":"season-drain","answer":"DRAIN","category":"Preparation","hint":"Let liquid run out.","puzzleId":"word-2027-02-02-season-drain"}'::jsonb),
('spark-sort-2027-02-02-season-menu-variety-5','spark_sort','2027-02-02','{"id":"season-menu-variety-5","difficulty":"medium","groups":[{"category":"Rice dishes","items":["Pilaf","Risotto","Fried Rice","Jambalaya"]},{"category":"Pasta dishes","items":["Lasagna","Spaghetti Marinara","Pasta Primavera","Pasta Salad"]},{"category":"Potato preparations","items":["Baked Potato","Potato Wedges","Hash Browns","Roasted Potatoes"]},{"category":"Egg preparations","items":["Omelet","Poached Egg","Hard-Boiled Egg","Deviled Eggs"]}],"puzzleId":"spark-sort-2027-02-02-season-menu-variety-5"}'::jsonb),
('word-2027-02-03-apron','word','2027-02-03','{"id":"apron","answer":"APRON","category":"Kitchen","hint":"Wear this to help protect clothing.","puzzleId":"word-2027-02-03-apron"}'::jsonb),
('spark-sort-2027-02-03-season-can-follow-food-5','spark_sort','2027-02-03','{"id":"season-can-follow-food-5","difficulty":"hard","groups":[{"category":"Can come after FOOD","items":["Service","Safety","Truck","Chain"]},{"category":"Can come after LUNCH","items":["Box","Break","Money","Lady"]},{"category":"Can come after TABLE","items":["Spoon","Top","Tennis","Manners"]},{"category":"Can come after WATER","items":["Melon","Proof","Color","Front"]}],"puzzleId":"spark-sort-2027-02-03-season-can-follow-food-5"}'::jsonb),
('word-2027-02-04-season-plant','word','2027-02-04','{"id":"season-plant","answer":"PLANT","category":"Farm","hint":"Put a seed into soil.","puzzleId":"word-2027-02-04-season-plant"}'::jsonb),
('spark-sort-2027-02-04-season-breakfast-shelves-5','spark_sort','2027-02-04','{"id":"season-breakfast-shelves-5","difficulty":"easy","groups":[{"category":"Cereal grains","items":["Wheat","Oats","Corn","Rye"]},{"category":"Dairy foods","items":["Milk","Cheese","Butter","Sour Cream"]},{"category":"Tropical fruit","items":["Mango","Pineapple","Papaya","Guava"]},{"category":"Fruit spreads","items":["Grape Jelly","Apple Butter","Apricot Jam","Peach Preserves"]}],"puzzleId":"spark-sort-2027-02-04-season-breakfast-shelves-5"}'::jsonb),
('word-2027-02-05-season-scrub','word','2027-02-05','{"id":"season-scrub","answer":"SCRUB","category":"Cleaning","hint":"Rub firmly to remove dirt.","puzzleId":"word-2027-02-05-season-scrub"}'::jsonb),
('spark-sort-2027-02-05-season-food-descriptions-5','spark_sort','2027-02-05','{"id":"season-food-descriptions-5","difficulty":"medium","groups":[{"category":"Taste words","items":["Sweet","Sour","Bitter","Tangy"]},{"category":"Texture words","items":["Crunchy","Creamy","Chewy","Tender"]},{"category":"Shape words","items":["Square","Oval","Triangular","Flat"]},{"category":"Color words","items":["Green","Orange","Purple","Brown"]}],"puzzleId":"spark-sort-2027-02-05-season-food-descriptions-5"}'::jsonb),
('word-2027-02-08-season-salad','word','2027-02-08','{"id":"season-salad","answer":"SALAD","category":"Menu","hint":"A dish often made with vegetables and a dressing.","puzzleId":"word-2027-02-08-season-salad"}'::jsonb),
('spark-sort-2027-02-08-season-kitchen-phrases-5','spark_sort','2027-02-08','{"id":"season-kitchen-phrases-5","difficulty":"hard","groups":[{"category":"Can come before POT","items":["Coffee","Tea","Flower","Honey"]},{"category":"Can come before PAN","items":["Frying","Sheet","Cake","Roasting"]},{"category":"Can come before BOWL","items":["Soup","Salad","Cereal","Sugar"]},{"category":"Can come before SPOON","items":["Dessert","Slotted","Wooden","Measuring"]}],"puzzleId":"spark-sort-2027-02-08-season-kitchen-phrases-5"}'::jsonb),
('word-2027-02-09-season-wraps','word','2027-02-09','{"id":"season-wraps","answer":"WRAPS","category":"Menu","hint":"Foods rolled inside a tortilla or flatbread.","puzzleId":"word-2027-02-09-season-wraps"}'::jsonb),
('spark-sort-2027-02-09-season-garden-groups-5','spark_sort','2027-02-09','{"id":"season-garden-groups-5","difficulty":"easy","groups":[{"category":"Plant parts","items":["Root","Stem","Flower","Bud"]},{"category":"Garden tools","items":["Shovel","Hoe","Trowel","Pruners"]},{"category":"Fruit trees","items":["Pear Tree","Peach Tree","Plum Tree","Cherry Tree"]},{"category":"Garden helpers","items":["Butterfly","Ladybug","Lacewing","Hoverfly"]}],"puzzleId":"spark-sort-2027-02-09-season-garden-groups-5"}'::jsonb),
('word-2027-02-10-season-soups','word','2027-02-10','{"id":"season-soups","answer":"SOUPS","category":"Menu","hint":"Liquid dishes served in bowls.","puzzleId":"word-2027-02-10-season-soups"}'::jsonb),
('spark-sort-2027-02-10-season-ready-for-service-5','spark_sort','2027-02-10','{"id":"season-ready-for-service-5","difficulty":"medium","groups":[{"category":"Actions with a knife","items":["Slice","Dice","Mince","Trim"]},{"category":"Actions with liquid","items":["Pour","Strain","Ladle","Drizzle"]},{"category":"Service supplies","items":["Straw","Tray","Cup","Fork"]},{"category":"Schedule words","items":["Noon","Evening","Weekday","Weekend"]}],"puzzleId":"spark-sort-2027-02-10-season-ready-for-service-5"}'::jsonb),
('word-2027-02-11-season-bagel','word','2027-02-11','{"id":"season-bagel","answer":"BAGEL","category":"Breakfast","hint":"A ring-shaped bread often sliced and toasted.","puzzleId":"word-2027-02-11-season-bagel"}'::jsonb),
('spark-sort-2027-02-11-season-food-or-something-else-5','spark_sort','2027-02-11','{"id":"season-food-or-something-else-5","difficulty":"hard","groups":[{"category":"Foods also used as colors","items":["Peach","Olive","Plum","Cream"]},{"category":"Can come before BREAK","items":["Coffee","Lunch","Day","Spring"]},{"category":"Menu headings","items":["Entrees","Side Dishes","Beverages","Desserts"]},{"category":"Parts of a recipe","items":["Ingredients","Yield","Prep Time","Cook Time"]}],"puzzleId":"spark-sort-2027-02-11-season-food-or-something-else-5"}'::jsonb),
('word-2027-02-12-grain','word','2027-02-12','{"id":"grain","answer":"GRAIN","category":"Nutrition","hint":"Rice, oats, and wheat are examples.","puzzleId":"word-2027-02-12-grain"}'::jsonb),
('spark-sort-2027-02-12-season-menu-map-5','spark_sort','2027-02-12','{"id":"season-menu-map-5","difficulty":"medium","groups":[{"category":"Leaf herbs","items":["Basil","Parsley","Mint","Sage"]},{"category":"Noodle shapes","items":["Spaghetti","Fettuccine","Vermicelli","Capellini"]},{"category":"Winter squash","items":["Acorn","Spaghetti Squash","Delicata","Kabocha"]},{"category":"Fruit with a stone or pit","items":["Plum","Cherry","Nectarine","Mango"]}],"puzzleId":"spark-sort-2027-02-12-season-menu-map-5"}'::jsonb),
('word-2027-02-15-season-teach','word','2027-02-15','{"id":"season-teach","answer":"TEACH","category":"Teamwork","hint":"Help someone learn a skill.","puzzleId":"word-2027-02-15-season-teach"}'::jsonb),
('spark-sort-2027-02-15-season-market-basket-6','spark_sort','2027-02-15','{"id":"season-market-basket-6","difficulty":"easy","groups":[{"category":"Orchard fruit","items":["Apple","Pear","Apricot","Cherry"]},{"category":"Eating utensils","items":["Fork","Chopsticks","Teaspoon","Dessert Fork"]},{"category":"Kitchen appliances","items":["Mixer","Blender","Toaster","Freezer"]},{"category":"Herbs","items":["Parsley","Dill","Thyme","Rosemary"]}],"puzzleId":"spark-sort-2027-02-15-season-market-basket-6"}'::jsonb),
('word-2027-02-16-season-store','word','2027-02-16','{"id":"season-store","answer":"STORE","category":"Inventory","hint":"Keep supplies for later use.","puzzleId":"word-2027-02-16-season-store"}'::jsonb),
('spark-sort-2027-02-16-season-rainbow-produce-6','spark_sort','2027-02-16','{"id":"season-rainbow-produce-6","difficulty":"easy","groups":[{"category":"Citrus fruit","items":["Lemon","Lime","Tangerine","Mandarin"]},{"category":"Leafy greens","items":["Spinach","Lettuce","Arugula","Collards"]},{"category":"Root vegetables","items":["Beet","Turnip","Radish","Rutabaga"]},{"category":"Berries","items":["Raspberry","Blackberry","Cranberry","Gooseberry"]}],"puzzleId":"spark-sort-2027-02-16-season-rainbow-produce-6"}'::jsonb),
('word-2027-02-17-season-thick','word','2027-02-17','{"id":"season-thick","answer":"THICK","category":"Texture","hint":"Not thin.","puzzleId":"word-2027-02-17-season-thick"}'::jsonb),
('spark-sort-2027-02-17-season-kitchen-stations-6','spark_sort','2027-02-17','{"id":"season-kitchen-stations-6","difficulty":"medium","groups":[{"category":"Measuring tools","items":["Measuring Cup","Measuring Spoon","Ruler","Graduated Pitcher"]},{"category":"Cutting tools","items":["Chef Knife","Bread Knife","Pizza Cutter","Peeler"]},{"category":"Cleaning tools","items":["Broom","Scrub Brush","Squeegee","Cleaning Cloth"]},{"category":"Cooking methods","items":["Steam","Simmer","Grill","Braise"]}],"puzzleId":"spark-sort-2027-02-17-season-kitchen-stations-6"}'::jsonb),
('word-2027-02-18-season-pound','word','2027-02-18','{"id":"season-pound","answer":"POUND","category":"Measuring","hint":"A unit equal to sixteen ounces.","puzzleId":"word-2027-02-18-season-pound"}'::jsonb),
('spark-sort-2027-02-18-season-word-menu-6','spark_sort','2027-02-18','{"id":"season-word-menu-6","difficulty":"hard","groups":[{"category":"Can come before CAKE","items":["Pan","Cup","Fruit","Carrot"]},{"category":"Can come before CORN","items":["Pop","Candy","Baby","Flint"]},{"category":"Can come before BOARD","items":["Chopping","Serving","Menu","White"]},{"category":"Can come before ROOM","items":["Break","Store","Rest","Lunch"]}],"puzzleId":"spark-sort-2027-02-18-season-word-menu-6"}'::jsonb),
('word-2027-02-19-season-brush','word','2027-02-19','{"id":"season-brush","answer":"BRUSH","category":"Cleaning","hint":"A tool with bristles.","puzzleId":"word-2027-02-19-season-brush"}'::jsonb),
('spark-sort-2027-02-19-season-pantry-labels-6','spark_sort','2027-02-19','{"id":"season-pantry-labels-6","difficulty":"easy","groups":[{"category":"Pasta shapes","items":["Penne","Rotini","Macaroni","Rigatoni"]},{"category":"Dried seasonings","items":["Cinnamon","Cumin","Nutmeg","Ginger"]},{"category":"Beans","items":["Pinto Beans","Kidney Beans","Navy Beans","Cannellini Beans"]},{"category":"Container types","items":["Bottle","Carton","Pouch","Tin"]}],"puzzleId":"spark-sort-2027-02-19-season-pantry-labels-6"}'::jsonb),
('word-2027-02-22-season-order','word','2027-02-22','{"id":"season-order","answer":"ORDER","category":"Inventory","hint":"Request supplies for delivery.","puzzleId":"word-2027-02-22-season-order"}'::jsonb),
('spark-sort-2027-02-22-season-bakery-counter-6','spark_sort','2027-02-22','{"id":"season-bakery-counter-6","difficulty":"medium","groups":[{"category":"Bread shapes","items":["Loaf","Baguette","Breadstick","Bagel"]},{"category":"Baking ingredients","items":["Flour","Baking Powder","Sugar","Shortening"]},{"category":"Baking tools","items":["Dough Scraper","Pastry Brush","Cooling Rack","Pastry Bag"]},{"category":"Bakery treats","items":["Cupcake","Doughnut","Eclair","Tart"]}],"puzzleId":"spark-sort-2027-02-22-season-bakery-counter-6"}'::jsonb),
('word-2027-02-23-trays','word','2027-02-23','{"id":"trays","answer":"TRAYS","category":"Meal service","hint":"Students carry meals on these.","puzzleId":"word-2027-02-23-trays"}'::jsonb),
('spark-sort-2027-02-23-season-food-word-endings-6','spark_sort','2027-02-23','{"id":"season-food-word-endings-6","difficulty":"hard","groups":[{"category":"End in BERRY","items":["Strawberry","Blueberry","Cranberry","Gooseberry"]},{"category":"End in NUT","items":["Walnut","Chestnut","Peanut","Butternut"]},{"category":"End in MELON","items":["Honeydew Melon","Winter Melon","Bitter Melon","Canary Melon"]},{"category":"End in PEPPER","items":["White Pepper","Cayenne Pepper","Banana Pepper","Cherry Pepper"]}],"puzzleId":"spark-sort-2027-02-23-season-food-word-endings-6"}'::jsonb),
('word-2027-02-24-season-forks','word','2027-02-24','{"id":"season-forks","answer":"FORKS","category":"Utensils","hint":"Tools with prongs used for eating.","puzzleId":"word-2027-02-24-season-forks"}'::jsonb),
('spark-sort-2027-02-24-season-soup-and-salad-6','spark_sort','2027-02-24','{"id":"season-soup-and-salad-6","difficulty":"easy","groups":[{"category":"Salad greens","items":["Romaine","Iceberg","Butter Lettuce","Spring Mix"]},{"category":"Salad dressings","items":["Ranch","Caesar","French","Thousand Island"]},{"category":"Soup varieties","items":["Tomato Soup","Chicken Noodle","Lentil Soup","Vegetable Soup"]},{"category":"Serving dishes","items":["Platter","Tureen","Ramekin","Serving Tray"]}],"puzzleId":"spark-sort-2027-02-24-season-soup-and-salad-6"}'::jsonb),
('word-2027-02-25-serve','word','2027-02-25','{"id":"serve","answer":"SERVE","category":"Meal service","hint":"The action at the heart of the cafeteria line.","puzzleId":"word-2027-02-25-serve"}'::jsonb),
('spark-sort-2027-02-25-season-school-day-6','spark_sort','2027-02-25','{"id":"season-school-day-6","difficulty":"medium","groups":[{"category":"Places at school","items":["Cafeteria","Library","Office","Playground"]},{"category":"School supplies","items":["Pencil","Eraser","Marker","Glue Stick"]},{"category":"Ways to travel","items":["Bike","Bus","Car","Scooter"]},{"category":"Meal times or occasions","items":["Lunch","Supper","Snack","Picnic"]}],"puzzleId":"spark-sort-2027-02-25-season-school-day-6"}'::jsonb),
('word-2027-02-26-season-fruit','word','2027-02-26','{"id":"season-fruit","answer":"FRUIT","category":"Nutrition","hint":"Apples and oranges belong to this group.","puzzleId":"word-2027-02-26-season-fruit"}'::jsonb),
('spark-sort-2027-02-26-season-small-and-large-6','spark_sort','2027-02-26','{"id":"season-small-and-large-6","difficulty":"hard","groups":[{"category":"Small amount words","items":["Pinch","Dash","Touch","Trace"]},{"category":"Groups or quantities","items":["Batch","Dozen","Trio","Quartet"]},{"category":"Words for reducing size","items":["Dice","Mince","Grate","Crush"]},{"category":"Words for combining","items":["Stir","Fold","Toss","Whisk"]}],"puzzleId":"spark-sort-2027-02-26-season-small-and-large-6"}'::jsonb),
('word-2027-03-01-season-crust','word','2027-03-01','{"id":"season-crust","answer":"CRUST","category":"Baking","hint":"The outer layer of bread or a pizza base.","puzzleId":"word-2027-03-01-season-crust"}'::jsonb),
('spark-sort-2027-03-01-season-delivery-day-6','spark_sort','2027-03-01','{"id":"season-delivery-day-6","difficulty":"easy","groups":[{"category":"Wheeled transport","items":["Truck","Van","Hand Truck","Pallet Jack"]},{"category":"Packaging materials","items":["Cardboard","Packing Paper","Stretch Wrap","Packing Tape"]},{"category":"Delivery paperwork","items":["Packing Slip","Purchase Order","Receipt","Bill of Lading"]},{"category":"Count or measure units","items":["Dozen","Pound","Ounce","Gallon"]}],"puzzleId":"spark-sort-2027-03-01-season-delivery-day-6"}'::jsonb),
('word-2027-03-02-season-curds','word','2027-03-02','{"id":"season-curds","answer":"CURDS","category":"Dairy","hint":"Soft solids that form during cheesemaking.","puzzleId":"word-2027-03-02-season-curds"}'::jsonb),
('spark-sort-2027-03-02-season-menu-variety-6','spark_sort','2027-03-02','{"id":"season-menu-variety-6","difficulty":"medium","groups":[{"category":"Rice dishes","items":["Pilaf","Risotto","Rice Pudding","Jambalaya"]},{"category":"Pasta dishes","items":["Lasagna","Spaghetti Marinara","Baked Ziti","Pasta Salad"]},{"category":"Potato preparations","items":["Baked Potato","Potato Wedges","Hash Browns","Potato Salad"]},{"category":"Egg preparations","items":["Frittata","Poached Egg","Hard-Boiled Egg","Deviled Eggs"]}],"puzzleId":"spark-sort-2027-03-02-season-menu-variety-6"}'::jsonb),
('word-2027-03-03-season-knife','word','2027-03-03','{"id":"season-knife","answer":"KNIFE","category":"Tools","hint":"A tool with a blade for cutting.","puzzleId":"word-2027-03-03-season-knife"}'::jsonb),
('spark-sort-2027-03-03-season-can-follow-food-6','spark_sort','2027-03-03','{"id":"season-can-follow-food-6","difficulty":"hard","groups":[{"category":"Can come after FOOD","items":["Service","Safety","Bank","Chain"]},{"category":"Can come after LUNCH","items":["Box","Break","Hour","Lady"]},{"category":"Can come after TABLE","items":["Spoon","Top","Tennis","Setting"]},{"category":"Can come after WATER","items":["Fall","Proof","Color","Front"]}],"puzzleId":"spark-sort-2027-03-03-season-can-follow-food-6"}'::jsonb),
('word-2027-03-04-season-zesty','word','2027-03-04','{"id":"season-zesty","answer":"ZESTY","category":"Taste","hint":"Lively and full of flavor.","puzzleId":"word-2027-03-04-season-zesty"}'::jsonb),
('spark-sort-2027-03-04-season-breakfast-shelves-6','spark_sort','2027-03-04','{"id":"season-breakfast-shelves-6","difficulty":"easy","groups":[{"category":"Cereal grains","items":["Wheat","Oats","Barley","Rye"]},{"category":"Dairy foods","items":["Milk","Cheese","Cottage Cheese","Sour Cream"]},{"category":"Tropical fruit","items":["Mango","Pineapple","Papaya","Passion Fruit"]},{"category":"Fruit spreads","items":["Orange Marmalade","Apple Butter","Apricot Jam","Peach Preserves"]}],"puzzleId":"spark-sort-2027-03-04-season-breakfast-shelves-6"}'::jsonb),
('word-2027-03-05-season-early','word','2027-03-05','{"id":"season-early","answer":"EARLY","category":"Planning","hint":"Before the expected time.","puzzleId":"word-2027-03-05-season-early"}'::jsonb),
('spark-sort-2027-03-05-season-food-descriptions-6','spark_sort','2027-03-05','{"id":"season-food-descriptions-6","difficulty":"medium","groups":[{"category":"Taste words","items":["Sweet","Sour","Savory","Tangy"]},{"category":"Texture words","items":["Crunchy","Creamy","Crisp","Tender"]},{"category":"Shape words","items":["Square","Oval","Triangular","Cylindrical"]},{"category":"Color words","items":["Yellow","Orange","Purple","Brown"]}],"puzzleId":"spark-sort-2027-03-05-season-food-descriptions-6"}'::jsonb),
('word-2027-03-08-season-stack','word','2027-03-08','{"id":"season-stack","answer":"STACK","category":"Storage","hint":"Place items in a pile, one above another.","puzzleId":"word-2027-03-08-season-stack"}'::jsonb),
('spark-sort-2027-03-08-season-kitchen-phrases-6','spark_sort','2027-03-08','{"id":"season-kitchen-phrases-6","difficulty":"hard","groups":[{"category":"Can come before POT","items":["Coffee","Tea","Crack","Honey"]},{"category":"Can come before PAN","items":["Frying","Sheet","Loaf","Roasting"]},{"category":"Can come before BOWL","items":["Soup","Salad","Cereal","Punch"]},{"category":"Can come before SPOON","items":["Serving","Slotted","Wooden","Measuring"]}],"puzzleId":"spark-sort-2027-03-08-season-kitchen-phrases-6"}'::jsonb),
('word-2027-03-09-wheat','word','2027-03-09','{"id":"wheat","answer":"WHEAT","category":"Agriculture","hint":"A crop commonly milled into flour.","puzzleId":"word-2027-03-09-wheat"}'::jsonb),
('spark-sort-2027-03-09-season-garden-groups-6','spark_sort','2027-03-09','{"id":"season-garden-groups-6","difficulty":"easy","groups":[{"category":"Plant parts","items":["Root","Stem","Seed","Bud"]},{"category":"Garden tools","items":["Shovel","Hoe","Watering Can","Pruners"]},{"category":"Fruit trees","items":["Pear Tree","Peach Tree","Plum Tree","Apricot Tree"]},{"category":"Garden helpers","items":["Earthworm","Ladybug","Lacewing","Hoverfly"]}],"puzzleId":"spark-sort-2027-03-09-season-garden-groups-6"}'::jsonb),
('word-2027-03-10-season-mince','word','2027-03-10','{"id":"season-mince","answer":"MINCE","category":"Preparation","hint":"Cut into very small pieces.","puzzleId":"word-2027-03-10-season-mince"}'::jsonb),
('spark-sort-2027-03-10-season-ready-for-service-6','spark_sort','2027-03-10','{"id":"season-ready-for-service-6","difficulty":"medium","groups":[{"category":"Actions with a knife","items":["Slice","Dice","Julienne","Trim"]},{"category":"Actions with liquid","items":["Pour","Strain","Splash","Drizzle"]},{"category":"Service supplies","items":["Straw","Tray","Cup","Spoon"]},{"category":"Schedule words","items":["Afternoon","Evening","Weekday","Weekend"]}],"puzzleId":"spark-sort-2027-03-10-season-ready-for-service-6"}'::jsonb),
('word-2027-03-11-season-boxes','word','2027-03-11','{"id":"season-boxes","answer":"BOXES","category":"Deliveries","hint":"Cardboard containers that hold supplies.","puzzleId":"word-2027-03-11-season-boxes"}'::jsonb),
('spark-sort-2027-03-11-season-food-or-something-else-6','spark_sort','2027-03-11','{"id":"season-food-or-something-else-6","difficulty":"hard","groups":[{"category":"Foods also used as colors","items":["Peach","Olive","Chocolate","Cream"]},{"category":"Can come before BREAK","items":["Coffee","Lunch","Fast","Spring"]},{"category":"Menu headings","items":["Entrees","Side Dishes","Beverages","Specials"]},{"category":"Parts of a recipe","items":["Directions","Yield","Prep Time","Cook Time"]}],"puzzleId":"spark-sort-2027-03-11-season-food-or-something-else-6"}'::jsonb),
('word-2027-03-12-season-steps','word','2027-03-12','{"id":"season-steps","answer":"STEPS","category":"Planning","hint":"Actions followed in order.","puzzleId":"word-2027-03-12-season-steps"}'::jsonb),
('spark-sort-2027-03-12-season-menu-map-6','spark_sort','2027-03-12','{"id":"season-menu-map-6","difficulty":"medium","groups":[{"category":"Leaf herbs","items":["Basil","Parsley","Dill","Sage"]},{"category":"Noodle shapes","items":["Spaghetti","Fettuccine","Bucatini","Capellini"]},{"category":"Winter squash","items":["Acorn","Spaghetti Squash","Delicata","Hubbard"]},{"category":"Fruit with a stone or pit","items":["Apricot","Cherry","Nectarine","Mango"]}],"puzzleId":"spark-sort-2027-03-12-season-menu-map-6"}'::jsonb),
('word-2027-03-15-season-bites','word','2027-03-15','{"id":"season-bites","answer":"BITES","category":"Eating","hint":"Small mouthfuls of food.","puzzleId":"word-2027-03-15-season-bites"}'::jsonb),
('spark-sort-2027-03-15-season-market-basket-7','spark_sort','2027-03-15','{"id":"season-market-basket-7","difficulty":"easy","groups":[{"category":"Orchard fruit","items":["Apple","Peach","Plum","Apricot"]},{"category":"Eating utensils","items":["Fork","Soup Spoon","Teaspoon","Dessert Fork"]},{"category":"Kitchen appliances","items":["Mixer","Blender","Steamer","Freezer"]},{"category":"Herbs","items":["Basil","Mint","Parsley","Dill"]}],"puzzleId":"spark-sort-2027-03-15-season-market-basket-7"}'::jsonb),
('word-2027-03-16-season-pears','word','2027-03-16','{"id":"season-pears","answer":"PEARS","category":"Produce","hint":"Fruits often wider at the bottom than at the top.","puzzleId":"word-2027-03-16-season-pears"}'::jsonb),
('spark-sort-2027-03-16-season-rainbow-produce-7','spark_sort','2027-03-16','{"id":"season-rainbow-produce-7","difficulty":"easy","groups":[{"category":"Citrus fruit","items":["Lemon","Orange","Grapefruit","Tangerine"]},{"category":"Leafy greens","items":["Spinach","Chard","Arugula","Collards"]},{"category":"Root vegetables","items":["Beet","Turnip","Parsnip","Rutabaga"]},{"category":"Berries","items":["Strawberry","Blueberry","Raspberry","Blackberry"]}],"puzzleId":"spark-sort-2027-03-16-season-rainbow-produce-7"}'::jsonb),
('word-2027-03-17-season-batch','word','2027-03-17','{"id":"season-batch","answer":"BATCH","category":"Production","hint":"A group of portions prepared at one time.","puzzleId":"word-2027-03-17-season-batch"}'::jsonb),
('spark-sort-2027-03-17-season-kitchen-stations-7','spark_sort','2027-03-17','{"id":"season-kitchen-stations-7","difficulty":"medium","groups":[{"category":"Measuring tools","items":["Measuring Cup","Scale","Thermometer","Ruler"]},{"category":"Cutting tools","items":["Chef Knife","Kitchen Shears","Pizza Cutter","Peeler"]},{"category":"Cleaning tools","items":["Broom","Scrub Brush","Dustpan","Cleaning Cloth"]},{"category":"Cooking methods","items":["Bake","Roast","Steam","Simmer"]}],"puzzleId":"spark-sort-2027-03-17-season-kitchen-stations-7"}'::jsonb),
('word-2027-03-18-season-cools','word','2027-03-18','{"id":"season-cools","answer":"COOLS","category":"Temperature","hint":"Becomes less hot.","puzzleId":"word-2027-03-18-season-cools"}'::jsonb),
('spark-sort-2027-03-18-season-word-menu-7','spark_sort','2027-03-18','{"id":"season-word-menu-7","difficulty":"hard","groups":[{"category":"Can come before CAKE","items":["Pan","Cheese","Short","Fruit"]},{"category":"Can come before CORN","items":["Pop","Field","Baby","Flint"]},{"category":"Can come before BOARD","items":["Chopping","Serving","Bulletin","White"]},{"category":"Can come before ROOM","items":["Dining","Class","Break","Store"]}],"puzzleId":"spark-sort-2027-03-18-season-word-menu-7"}'::jsonb),
('word-2027-03-19-season-sheet','word','2027-03-19','{"id":"season-sheet","answer":"SHEET","category":"Equipment","hint":"A flat baking pan is often called this kind of pan.","puzzleId":"word-2027-03-19-season-sheet"}'::jsonb),
('spark-sort-2027-03-19-season-pantry-labels-7','spark_sort','2027-03-19','{"id":"season-pantry-labels-7","difficulty":"easy","groups":[{"category":"Pasta shapes","items":["Penne","Spaghetti","Farfalle","Macaroni"]},{"category":"Dried seasonings","items":["Cinnamon","Turmeric","Nutmeg","Ginger"]},{"category":"Beans","items":["Pinto Beans","Kidney Beans","Lima Beans","Cannellini Beans"]},{"category":"Container types","items":["Can","Jar","Bottle","Carton"]}],"puzzleId":"spark-sort-2027-03-19-season-pantry-labels-7"}'::jsonb),
('word-2027-03-22-season-ranch','word','2027-03-22','{"id":"season-ranch","answer":"RANCH","category":"Menu","hint":"A creamy dressing often served with vegetables.","puzzleId":"word-2027-03-22-season-ranch"}'::jsonb),
('spark-sort-2027-03-22-season-bakery-counter-7','spark_sort','2027-03-22','{"id":"season-bakery-counter-7","difficulty":"medium","groups":[{"category":"Bread shapes","items":["Loaf","Boule","Roll","Breadstick"]},{"category":"Baking ingredients","items":["Flour","Baking Soda","Sugar","Shortening"]},{"category":"Baking tools","items":["Dough Scraper","Pastry Brush","Muffin Tin","Pastry Bag"]},{"category":"Bakery treats","items":["Cookie","Brownie","Cupcake","Doughnut"]}],"puzzleId":"spark-sort-2027-03-22-season-bakery-counter-7"}'::jsonb),
('word-2027-03-23-season-cocoa','word','2027-03-23','{"id":"season-cocoa","answer":"COCOA","category":"Pantry","hint":"Powder made from cacao beans.","puzzleId":"word-2027-03-23-season-cocoa"}'::jsonb),
('spark-sort-2027-03-23-season-food-word-endings-7','spark_sort','2027-03-23','{"id":"season-food-word-endings-7","difficulty":"hard","groups":[{"category":"End in BERRY","items":["Strawberry","Blackberry","Raspberry","Cranberry"]},{"category":"End in NUT","items":["Walnut","Coconut","Peanut","Butternut"]},{"category":"End in MELON","items":["Honeydew Melon","Winter Melon","Horned Melon","Canary Melon"]},{"category":"End in PEPPER","items":["Bell Pepper","Black Pepper","White Pepper","Cayenne Pepper"]}],"puzzleId":"spark-sort-2027-03-23-season-food-word-endings-7"}'::jsonb),
('word-2027-03-24-season-scale','word','2027-03-24','{"id":"season-scale","answer":"SCALE","category":"Measuring","hint":"A device for finding weight.","puzzleId":"word-2027-03-24-season-scale"}'::jsonb),
('spark-sort-2027-03-24-season-soup-and-salad-7','spark_sort','2027-03-24','{"id":"season-soup-and-salad-7","difficulty":"easy","groups":[{"category":"Salad greens","items":["Romaine","Arugula","Spinach","Butter Lettuce"]},{"category":"Salad dressings","items":["Ranch","Balsamic Vinaigrette","French","Thousand Island"]},{"category":"Soup varieties","items":["Tomato Soup","Chicken Noodle","Split Pea","Vegetable Soup"]},{"category":"Serving dishes","items":["Soup Bowl","Salad Plate","Platter","Tureen"]}],"puzzleId":"spark-sort-2027-03-24-season-soup-and-salad-7"}'::jsonb),
('word-2027-03-25-season-saves','word','2027-03-25','{"id":"season-saves","answer":"SAVES","category":"Operations","hint":"Keeps resources from being wasted.","puzzleId":"word-2027-03-25-season-saves"}'::jsonb),
('spark-sort-2027-03-25-season-school-day-7','spark_sort','2027-03-25','{"id":"season-school-day-7","difficulty":"medium","groups":[{"category":"Places at school","items":["Cafeteria","Gym","Classroom","Office"]},{"category":"School supplies","items":["Pencil","Crayon","Marker","Glue Stick"]},{"category":"Ways to travel","items":["Bike","Bus","Train","Scooter"]},{"category":"Meal times or occasions","items":["Breakfast","Brunch","Lunch","Supper"]}],"puzzleId":"spark-sort-2027-03-25-season-school-day-7"}'::jsonb),
('word-2027-03-26-season-sauce','word','2027-03-26','{"id":"season-sauce","answer":"SAUCE","category":"Cooking","hint":"A liquid or creamy addition to a dish.","puzzleId":"word-2027-03-26-season-sauce"}'::jsonb),
('spark-sort-2027-03-26-season-small-and-large-7','spark_sort','2027-03-26','{"id":"season-small-and-large-7","difficulty":"hard","groups":[{"category":"Small amount words","items":["Pinch","Drop","Smidgen","Touch"]},{"category":"Groups or quantities","items":["Batch","Pair","Trio","Quartet"]},{"category":"Words for reducing size","items":["Dice","Mince","Shred","Crush"]},{"category":"Words for combining","items":["Mix","Blend","Stir","Fold"]}],"puzzleId":"spark-sort-2027-03-26-season-small-and-large-7"}'::jsonb),
('word-2027-03-29-season-curry','word','2027-03-29','{"id":"season-curry","answer":"CURRY","category":"Menu","hint":"A seasoned dish often served with rice.","puzzleId":"word-2027-03-29-season-curry"}'::jsonb),
('spark-sort-2027-03-29-season-delivery-day-7','spark_sort','2027-03-29','{"id":"season-delivery-day-7","difficulty":"easy","groups":[{"category":"Wheeled transport","items":["Truck","Cart","Dolly","Hand Truck"]},{"category":"Packaging materials","items":["Cardboard","Foam","Stretch Wrap","Packing Tape"]},{"category":"Delivery paperwork","items":["Packing Slip","Purchase Order","Delivery Note","Bill of Lading"]},{"category":"Count or measure units","items":["Each","Case","Dozen","Pound"]}],"puzzleId":"spark-sort-2027-03-29-season-delivery-day-7"}'::jsonb),
('word-2027-03-30-season-ready','word','2027-03-30','{"id":"season-ready","answer":"READY","category":"Service","hint":"Prepared for use.","puzzleId":"word-2027-03-30-season-ready"}'::jsonb),
('spark-sort-2027-03-30-season-menu-variety-7','spark_sort','2027-03-30','{"id":"season-menu-variety-7","difficulty":"medium","groups":[{"category":"Rice dishes","items":["Pilaf","Paella","Fried Rice","Rice Pudding"]},{"category":"Pasta dishes","items":["Lasagna","Pasta Primavera","Baked Ziti","Pasta Salad"]},{"category":"Potato preparations","items":["Baked Potato","Potato Wedges","Roasted Potatoes","Potato Salad"]},{"category":"Egg preparations","items":["Scrambled Eggs","Omelet","Frittata","Poached Egg"]}],"puzzleId":"spark-sort-2027-03-30-season-menu-variety-7"}'::jsonb),
('word-2027-03-31-dates','word','2027-03-31','{"id":"dates","answer":"DATES","category":"Produce","hint":"Naturally sweet fruit that grows on palms.","puzzleId":"word-2027-03-31-dates"}'::jsonb),
('spark-sort-2027-03-31-season-can-follow-food-7','spark_sort','2027-03-31','{"id":"season-can-follow-food-7","difficulty":"hard","groups":[{"category":"Can come after FOOD","items":["Service","Court","Truck","Bank"]},{"category":"Can come after LUNCH","items":["Box","Money","Hour","Lady"]},{"category":"Can come after TABLE","items":["Spoon","Top","Manners","Setting"]},{"category":"Can come after WATER","items":["Bottle","Melon","Fall","Proof"]}],"puzzleId":"spark-sort-2027-03-31-season-can-follow-food-7"}'::jsonb),
('word-2027-04-01-season-steel','word','2027-04-01','{"id":"season-steel","answer":"STEEL","category":"Equipment","hint":"A metal commonly used for kitchen work surfaces.","puzzleId":"word-2027-04-01-season-steel"}'::jsonb),
('spark-sort-2027-04-01-season-breakfast-shelves-7','spark_sort','2027-04-01','{"id":"season-breakfast-shelves-7","difficulty":"easy","groups":[{"category":"Cereal grains","items":["Wheat","Rice","Corn","Barley"]},{"category":"Dairy foods","items":["Milk","Butter","Cottage Cheese","Sour Cream"]},{"category":"Tropical fruit","items":["Mango","Pineapple","Guava","Passion Fruit"]},{"category":"Fruit spreads","items":["Strawberry Jam","Grape Jelly","Orange Marmalade","Apple Butter"]}],"puzzleId":"spark-sort-2027-04-01-season-breakfast-shelves-7"}'::jsonb),
('word-2027-04-02-season-swept','word','2027-04-02','{"id":"season-swept","answer":"SWEPT","category":"Cleaning","hint":"Cleaned a floor with a broom.","puzzleId":"word-2027-04-02-season-swept"}'::jsonb),
('spark-sort-2027-04-02-season-food-descriptions-7','spark_sort','2027-04-02','{"id":"season-food-descriptions-7","difficulty":"medium","groups":[{"category":"Taste words","items":["Sweet","Salty","Bitter","Savory"]},{"category":"Texture words","items":["Crunchy","Chewy","Crisp","Tender"]},{"category":"Shape words","items":["Square","Oval","Flat","Cylindrical"]},{"category":"Color words","items":["Red","Green","Yellow","Orange"]}],"puzzleId":"spark-sort-2027-04-02-season-food-descriptions-7"}'::jsonb),
('word-2027-04-05-season-menus','word','2027-04-05','{"id":"season-menus","answer":"MENUS","category":"Planning","hint":"Lists of foods being served.","puzzleId":"word-2027-04-05-season-menus"}'::jsonb),
('spark-sort-2027-04-05-season-kitchen-phrases-7','spark_sort','2027-04-05','{"id":"season-kitchen-phrases-7","difficulty":"hard","groups":[{"category":"Can come before POT","items":["Coffee","Stock","Flower","Crack"]},{"category":"Can come before PAN","items":["Frying","Cake","Loaf","Roasting"]},{"category":"Can come before BOWL","items":["Soup","Salad","Sugar","Punch"]},{"category":"Can come before SPOON","items":["Table","Dessert","Serving","Slotted"]}],"puzzleId":"spark-sort-2027-04-05-season-kitchen-phrases-7"}'::jsonb),
('word-2027-04-06-crate','word','2027-04-06','{"id":"crate","answer":"CRATE","category":"Inventory","hint":"Produce may arrive in one of these containers.","puzzleId":"word-2027-04-06-crate"}'::jsonb),
('spark-sort-2027-04-06-season-garden-groups-7','spark_sort','2027-04-06','{"id":"season-garden-groups-7","difficulty":"easy","groups":[{"category":"Plant parts","items":["Root","Leaf","Flower","Seed"]},{"category":"Garden tools","items":["Shovel","Trowel","Watering Can","Pruners"]},{"category":"Fruit trees","items":["Pear Tree","Peach Tree","Cherry Tree","Apricot Tree"]},{"category":"Garden helpers","items":["Bee","Butterfly","Earthworm","Ladybug"]}],"puzzleId":"spark-sort-2027-04-06-season-garden-groups-7"}'::jsonb),
('word-2027-04-07-season-dough','word','2027-04-07','{"id":"season-dough","answer":"DOUGH","category":"Baking","hint":"A mixture shaped before becoming bread.","puzzleId":"word-2027-04-07-season-dough"}'::jsonb),
('spark-sort-2027-04-07-season-ready-for-service-7','spark_sort','2027-04-07','{"id":"season-ready-for-service-7","difficulty":"medium","groups":[{"category":"Actions with a knife","items":["Slice","Chop","Mince","Julienne"]},{"category":"Actions with liquid","items":["Pour","Ladle","Splash","Drizzle"]},{"category":"Service supplies","items":["Straw","Tray","Fork","Spoon"]},{"category":"Schedule words","items":["Morning","Noon","Afternoon","Evening"]}],"puzzleId":"spark-sort-2027-04-07-season-ready-for-service-7"}'::jsonb),
('word-2027-04-08-onion','word','2027-04-08','{"id":"onion","answer":"ONION","category":"Produce","hint":"A layered vegetable that can make eyes water.","puzzleId":"word-2027-04-08-onion"}'::jsonb),
('spark-sort-2027-04-08-season-food-or-something-else-7','spark_sort','2027-04-08','{"id":"season-food-or-something-else-7","difficulty":"hard","groups":[{"category":"Foods also used as colors","items":["Peach","Salmon","Plum","Chocolate"]},{"category":"Can come before BREAK","items":["Coffee","Day","Fast","Spring"]},{"category":"Menu headings","items":["Entrees","Side Dishes","Desserts","Specials"]},{"category":"Parts of a recipe","items":["Title","Ingredients","Directions","Yield"]}],"puzzleId":"spark-sort-2027-04-08-season-food-or-something-else-7"}'::jsonb),
('word-2027-04-09-season-tacos','word','2027-04-09','{"id":"season-tacos","answer":"TACOS","category":"Menu","hint":"Folded tortillas filled with food.","puzzleId":"word-2027-04-09-season-tacos"}'::jsonb),
('spark-sort-2027-04-09-season-menu-map-7','spark_sort','2027-04-09','{"id":"season-menu-map-7","difficulty":"medium","groups":[{"category":"Leaf herbs","items":["Basil","Cilantro","Mint","Dill"]},{"category":"Noodle shapes","items":["Spaghetti","Vermicelli","Bucatini","Capellini"]},{"category":"Winter squash","items":["Acorn","Spaghetti Squash","Kabocha","Hubbard"]},{"category":"Fruit with a stone or pit","items":["Peach","Plum","Apricot","Cherry"]}],"puzzleId":"spark-sort-2027-04-09-season-menu-map-7"}'::jsonb),
('word-2027-04-12-plate','word','2027-04-12','{"id":"plate","answer":"PLATE","category":"Meal service","hint":"Food may be served on this reusable item.","puzzleId":"word-2027-04-12-plate"}'::jsonb),
('spark-sort-2027-04-12-season-market-basket-8','spark_sort','2027-04-12','{"id":"season-market-basket-8","difficulty":"easy","groups":[{"category":"Orchard fruit","items":["Apple","Peach","Plum","Cherry"]},{"category":"Eating utensils","items":["Spoon","Chopsticks","Soup Spoon","Teaspoon"]},{"category":"Kitchen appliances","items":["Mixer","Toaster","Steamer","Freezer"]},{"category":"Herbs","items":["Basil","Mint","Parsley","Thyme"]}],"puzzleId":"spark-sort-2027-04-12-season-market-basket-8"}'::jsonb),
('word-2027-04-13-season-basil','word','2027-04-13','{"id":"season-basil","answer":"BASIL","category":"Herbs","hint":"A fragrant green herb often paired with tomato.","puzzleId":"word-2027-04-13-season-basil"}'::jsonb),
('spark-sort-2027-04-13-season-rainbow-produce-8','spark_sort','2027-04-13','{"id":"season-rainbow-produce-8","difficulty":"easy","groups":[{"category":"Citrus fruit","items":["Lemon","Orange","Grapefruit","Mandarin"]},{"category":"Leafy greens","items":["Kale","Lettuce","Chard","Arugula"]},{"category":"Root vegetables","items":["Beet","Radish","Parsnip","Rutabaga"]},{"category":"Berries","items":["Strawberry","Blueberry","Raspberry","Cranberry"]}],"puzzleId":"spark-sort-2027-04-13-season-rainbow-produce-8"}'::jsonb),
('word-2027-04-14-season-sweet','word','2027-04-14','{"id":"season-sweet","answer":"SWEET","category":"Taste","hint":"The taste associated with sugar.","puzzleId":"word-2027-04-14-season-sweet"}'::jsonb),
('spark-sort-2027-04-14-season-kitchen-stations-8','spark_sort','2027-04-14','{"id":"season-kitchen-stations-8","difficulty":"medium","groups":[{"category":"Measuring tools","items":["Measuring Cup","Scale","Thermometer","Graduated Pitcher"]},{"category":"Cutting tools","items":["Paring Knife","Bread Knife","Kitchen Shears","Pizza Cutter"]},{"category":"Cleaning tools","items":["Broom","Squeegee","Dustpan","Cleaning Cloth"]},{"category":"Cooking methods","items":["Bake","Roast","Steam","Grill"]}],"puzzleId":"spark-sort-2027-04-14-season-kitchen-stations-8"}'::jsonb),
('word-2027-04-15-season-mango','word','2027-04-15','{"id":"season-mango","answer":"MANGO","category":"Produce","hint":"A tropical fruit with a large flat pit.","puzzleId":"word-2027-04-15-season-mango"}'::jsonb),
('spark-sort-2027-04-15-season-word-menu-8','spark_sort','2027-04-15','{"id":"season-word-menu-8","difficulty":"hard","groups":[{"category":"Can come before CAKE","items":["Pan","Cheese","Short","Carrot"]},{"category":"Can come before CORN","items":["Sweet","Candy","Field","Baby"]},{"category":"Can come before BOARD","items":["Chopping","Menu","Bulletin","White"]},{"category":"Can come before ROOM","items":["Dining","Class","Break","Rest"]}],"puzzleId":"spark-sort-2027-04-15-season-word-menu-8"}'::jsonb),
('word-2027-04-16-mixer','word','2027-04-16','{"id":"mixer","answer":"MIXER","category":"Equipment","hint":"Equipment that combines ingredients quickly.","puzzleId":"word-2027-04-16-mixer"}'::jsonb),
('spark-sort-2027-04-16-season-pantry-labels-8','spark_sort','2027-04-16','{"id":"season-pantry-labels-8","difficulty":"easy","groups":[{"category":"Pasta shapes","items":["Penne","Spaghetti","Farfalle","Rigatoni"]},{"category":"Dried seasonings","items":["Paprika","Cumin","Turmeric","Nutmeg"]},{"category":"Beans","items":["Pinto Beans","Navy Beans","Lima Beans","Cannellini Beans"]},{"category":"Container types","items":["Can","Jar","Bottle","Pouch"]}],"puzzleId":"spark-sort-2027-04-16-season-pantry-labels-8"}'::jsonb),
('word-2027-04-19-lemon','word','2027-04-19','{"id":"lemon","answer":"LEMON","category":"Produce","hint":"A bright yellow citrus fruit.","puzzleId":"word-2027-04-19-lemon"}'::jsonb),
('spark-sort-2027-04-19-season-bakery-counter-8','spark_sort','2027-04-19','{"id":"season-bakery-counter-8","difficulty":"medium","groups":[{"category":"Bread shapes","items":["Loaf","Boule","Roll","Bagel"]},{"category":"Baking ingredients","items":["Yeast","Baking Powder","Baking Soda","Sugar"]},{"category":"Baking tools","items":["Dough Scraper","Cooling Rack","Muffin Tin","Pastry Bag"]},{"category":"Bakery treats","items":["Cookie","Brownie","Cupcake","Eclair"]}],"puzzleId":"spark-sort-2027-04-19-season-bakery-counter-8"}'::jsonb),
('word-2027-04-20-season-empty','word','2027-04-20','{"id":"season-empty","answer":"EMPTY","category":"Inventory","hint":"Containing nothing.","puzzleId":"word-2027-04-20-season-empty"}'::jsonb),
('spark-sort-2027-04-20-season-food-word-endings-8','spark_sort','2027-04-20','{"id":"season-food-word-endings-8","difficulty":"hard","groups":[{"category":"End in BERRY","items":["Strawberry","Blackberry","Raspberry","Gooseberry"]},{"category":"End in NUT","items":["Hazelnut","Chestnut","Coconut","Peanut"]},{"category":"End in MELON","items":["Honeydew Melon","Bitter Melon","Horned Melon","Canary Melon"]},{"category":"End in PEPPER","items":["Bell Pepper","Black Pepper","White Pepper","Banana Pepper"]}],"puzzleId":"spark-sort-2027-04-20-season-food-word-endings-8"}'::jsonb),
('word-2027-04-21-season-crisp','word','2027-04-21','{"id":"season-crisp","answer":"CRISP","category":"Texture","hint":"Firm with a satisfying crunch.","puzzleId":"word-2027-04-21-season-crisp"}'::jsonb),
('spark-sort-2027-04-21-season-soup-and-salad-8','spark_sort','2027-04-21','{"id":"season-soup-and-salad-8","difficulty":"easy","groups":[{"category":"Salad greens","items":["Romaine","Arugula","Spinach","Spring Mix"]},{"category":"Salad dressings","items":["Italian","Caesar","Balsamic Vinaigrette","French"]},{"category":"Soup varieties","items":["Tomato Soup","Lentil Soup","Split Pea","Vegetable Soup"]},{"category":"Serving dishes","items":["Soup Bowl","Salad Plate","Platter","Ramekin"]}],"puzzleId":"spark-sort-2027-04-21-season-soup-and-salad-8"}'::jsonb),
('word-2027-04-22-season-prune','word','2027-04-22','{"id":"season-prune","answer":"PRUNE","category":"Produce","hint":"A dried plum.","puzzleId":"word-2027-04-22-season-prune"}'::jsonb),
('spark-sort-2027-04-22-season-school-day-8','spark_sort','2027-04-22','{"id":"season-school-day-8","difficulty":"medium","groups":[{"category":"Places at school","items":["Cafeteria","Gym","Classroom","Playground"]},{"category":"School supplies","items":["Notebook","Eraser","Crayon","Marker"]},{"category":"Ways to travel","items":["Bike","Car","Train","Scooter"]},{"category":"Meal times or occasions","items":["Breakfast","Brunch","Lunch","Snack"]}],"puzzleId":"spark-sort-2027-04-22-season-school-day-8"}'::jsonb),
('word-2027-04-23-season-staff','word','2027-04-23','{"id":"season-staff","answer":"STAFF","category":"Teamwork","hint":"The people working in an organization.","puzzleId":"word-2027-04-23-season-staff"}'::jsonb),
('spark-sort-2027-04-23-season-small-and-large-8','spark_sort','2027-04-23','{"id":"season-small-and-large-8","difficulty":"hard","groups":[{"category":"Small amount words","items":["Pinch","Drop","Smidgen","Trace"]},{"category":"Groups or quantities","items":["Bunch","Dozen","Pair","Trio"]},{"category":"Words for reducing size","items":["Dice","Grate","Shred","Crush"]},{"category":"Words for combining","items":["Mix","Blend","Stir","Toss"]}],"puzzleId":"spark-sort-2027-04-23-season-small-and-large-8"}'::jsonb),
('word-2027-04-26-season-shelf','word','2027-04-26','{"id":"season-shelf","answer":"SHELF","category":"Storage","hint":"A flat surface that holds supplies.","puzzleId":"word-2027-04-26-season-shelf"}'::jsonb),
('spark-sort-2027-04-26-season-delivery-day-8','spark_sort','2027-04-26','{"id":"season-delivery-day-8","difficulty":"easy","groups":[{"category":"Wheeled transport","items":["Truck","Cart","Dolly","Pallet Jack"]},{"category":"Packaging materials","items":["Bubble Wrap","Packing Paper","Foam","Stretch Wrap"]},{"category":"Delivery paperwork","items":["Packing Slip","Receipt","Delivery Note","Bill of Lading"]},{"category":"Count or measure units","items":["Each","Case","Dozen","Ounce"]}],"puzzleId":"spark-sort-2027-04-26-season-delivery-day-8"}'::jsonb),
('word-2027-04-27-season-pitch','word','2027-04-27','{"id":"season-pitch","answer":"PITCH","category":"Teamwork","hint":"A short presentation of an idea.","puzzleId":"word-2027-04-27-season-pitch"}'::jsonb),
('spark-sort-2027-04-27-season-menu-variety-8','spark_sort','2027-04-27','{"id":"season-menu-variety-8","difficulty":"medium","groups":[{"category":"Rice dishes","items":["Pilaf","Paella","Fried Rice","Jambalaya"]},{"category":"Pasta dishes","items":["Mac and Cheese","Spaghetti Marinara","Pasta Primavera","Baked Ziti"]},{"category":"Potato preparations","items":["Baked Potato","Hash Browns","Roasted Potatoes","Potato Salad"]},{"category":"Egg preparations","items":["Scrambled Eggs","Omelet","Frittata","Hard-Boiled Egg"]}],"puzzleId":"spark-sort-2027-04-27-season-menu-variety-8"}'::jsonb),
('word-2027-04-28-beans','word','2027-04-28','{"id":"beans","answer":"BEANS","category":"Nutrition","hint":"A food that brings both protein and fiber.","puzzleId":"word-2027-04-28-beans"}'::jsonb),
('spark-sort-2027-04-28-season-can-follow-food-8','spark_sort','2027-04-28','{"id":"season-can-follow-food-8","difficulty":"hard","groups":[{"category":"Can come after FOOD","items":["Service","Court","Truck","Chain"]},{"category":"Can come after LUNCH","items":["Bag","Break","Money","Hour"]},{"category":"Can come after TABLE","items":["Spoon","Tennis","Manners","Setting"]},{"category":"Can come after WATER","items":["Bottle","Melon","Fall","Color"]}],"puzzleId":"spark-sort-2027-04-28-season-can-follow-food-8"}'::jsonb),
('word-2027-04-29-season-greet','word','2027-04-29','{"id":"season-greet","answer":"GREET","category":"Service","hint":"Welcome someone when they arrive.","puzzleId":"word-2027-04-29-season-greet"}'::jsonb),
('spark-sort-2027-04-29-season-breakfast-shelves-8','spark_sort','2027-04-29','{"id":"season-breakfast-shelves-8","difficulty":"easy","groups":[{"category":"Cereal grains","items":["Wheat","Rice","Corn","Rye"]},{"category":"Dairy foods","items":["Yogurt","Cheese","Butter","Cottage Cheese"]},{"category":"Tropical fruit","items":["Mango","Papaya","Guava","Passion Fruit"]},{"category":"Fruit spreads","items":["Strawberry Jam","Grape Jelly","Orange Marmalade","Apricot Jam"]}],"puzzleId":"spark-sort-2027-04-29-season-breakfast-shelves-8"}'::jsonb),
('word-2027-04-30-season-blend','word','2027-04-30','{"id":"season-blend","answer":"BLEND","category":"Cooking","hint":"Combine ingredients until they mix together.","puzzleId":"word-2027-04-30-season-blend"}'::jsonb),
('spark-sort-2027-04-30-season-food-descriptions-8','spark_sort','2027-04-30','{"id":"season-food-descriptions-8","difficulty":"medium","groups":[{"category":"Taste words","items":["Sweet","Salty","Bitter","Tangy"]},{"category":"Texture words","items":["Smooth","Creamy","Chewy","Crisp"]},{"category":"Shape words","items":["Square","Triangular","Flat","Cylindrical"]},{"category":"Color words","items":["Red","Green","Yellow","Purple"]}],"puzzleId":"spark-sort-2027-04-30-season-food-descriptions-8"}'::jsonb),
('word-2027-05-03-season-truck','word','2027-05-03','{"id":"season-truck","answer":"TRUCK","category":"Delivery","hint":"A large vehicle used to move supplies.","puzzleId":"word-2027-05-03-season-truck"}'::jsonb),
('spark-sort-2027-05-03-season-kitchen-phrases-8','spark_sort','2027-05-03','{"id":"season-kitchen-phrases-8","difficulty":"hard","groups":[{"category":"Can come before POT","items":["Coffee","Stock","Flower","Honey"]},{"category":"Can come before PAN","items":["Sauce","Sheet","Cake","Loaf"]},{"category":"Can come before BOWL","items":["Soup","Cereal","Sugar","Punch"]},{"category":"Can come before SPOON","items":["Table","Dessert","Serving","Wooden"]}],"puzzleId":"spark-sort-2027-05-03-season-kitchen-phrases-8"}'::jsonb),
('word-2027-05-04-season-carts','word','2027-05-04','{"id":"season-carts","answer":"CARTS","category":"Equipment","hint":"Wheeled equipment used to move supplies.","puzzleId":"word-2027-05-04-season-carts"}'::jsonb),
('spark-sort-2027-05-04-season-garden-groups-8','spark_sort','2027-05-04','{"id":"season-garden-groups-8","difficulty":"easy","groups":[{"category":"Plant parts","items":["Root","Leaf","Flower","Bud"]},{"category":"Garden tools","items":["Rake","Hoe","Trowel","Watering Can"]},{"category":"Fruit trees","items":["Pear Tree","Plum Tree","Cherry Tree","Apricot Tree"]},{"category":"Garden helpers","items":["Bee","Butterfly","Earthworm","Lacewing"]}],"puzzleId":"spark-sort-2027-05-04-season-garden-groups-8"}'::jsonb),
('word-2027-05-05-whisk','word','2027-05-05','{"id":"whisk","answer":"WHISK","category":"Equipment","hint":"A looped tool used to blend or aerate.","puzzleId":"word-2027-05-05-whisk"}'::jsonb),
('spark-sort-2027-05-05-season-ready-for-service-8','spark_sort','2027-05-05','{"id":"season-ready-for-service-8","difficulty":"medium","groups":[{"category":"Actions with a knife","items":["Slice","Chop","Mince","Trim"]},{"category":"Actions with liquid","items":["Drain","Strain","Ladle","Splash"]},{"category":"Service supplies","items":["Straw","Cup","Fork","Spoon"]},{"category":"Schedule words","items":["Morning","Noon","Afternoon","Weekday"]}],"puzzleId":"spark-sort-2027-05-05-season-ready-for-service-8"}'::jsonb),
('word-2027-05-06-season-mints','word','2027-05-06','{"id":"season-mints","answer":"MINTS","category":"Herbs","hint":"Plants with a cool, refreshing flavor.","puzzleId":"word-2027-05-06-season-mints"}'::jsonb),
('spark-sort-2027-05-06-season-food-or-something-else-8','spark_sort','2027-05-06','{"id":"season-food-or-something-else-8","difficulty":"hard","groups":[{"category":"Foods also used as colors","items":["Peach","Salmon","Plum","Cream"]},{"category":"Can come before BREAK","items":["Tea","Lunch","Day","Fast"]},{"category":"Menu headings","items":["Entrees","Beverages","Desserts","Specials"]},{"category":"Parts of a recipe","items":["Title","Ingredients","Directions","Prep Time"]}],"puzzleId":"spark-sort-2027-05-06-season-food-or-something-else-8"}'::jsonb),
('word-2027-05-07-season-rolls','word','2027-05-07','{"id":"season-rolls","answer":"ROLLS","category":"Baking","hint":"Small individual breads.","puzzleId":"word-2027-05-07-season-rolls"}'::jsonb),
('spark-sort-2027-05-07-season-menu-map-8','spark_sort','2027-05-07','{"id":"season-menu-map-8","difficulty":"medium","groups":[{"category":"Leaf herbs","items":["Basil","Cilantro","Mint","Sage"]},{"category":"Noodle shapes","items":["Linguine","Fettuccine","Vermicelli","Bucatini"]},{"category":"Winter squash","items":["Acorn","Delicata","Kabocha","Hubbard"]},{"category":"Fruit with a stone or pit","items":["Peach","Plum","Apricot","Nectarine"]}],"puzzleId":"spark-sort-2027-05-07-season-menu-map-8"}'::jsonb),
('word-2027-05-10-season-dried','word','2027-05-10','{"id":"season-dried","answer":"DRIED","category":"Pantry","hint":"Having had moisture removed.","puzzleId":"word-2027-05-10-season-dried"}'::jsonb),
('spark-sort-2027-05-10-season-market-basket-9','spark_sort','2027-05-10','{"id":"season-market-basket-9","difficulty":"easy","groups":[{"category":"Orchard fruit","items":["Apple","Peach","Apricot","Cherry"]},{"category":"Eating utensils","items":["Spoon","Chopsticks","Soup Spoon","Dessert Fork"]},{"category":"Kitchen appliances","items":["Blender","Toaster","Steamer","Freezer"]},{"category":"Herbs","items":["Basil","Mint","Parsley","Rosemary"]}],"puzzleId":"spark-sort-2027-05-10-season-market-basket-9"}'::jsonb),
('word-2027-05-11-bread','word','2027-05-11','{"id":"bread","answer":"BREAD","category":"Meal service","hint":"Whole-grain varieties add fiber to a tray.","puzzleId":"word-2027-05-11-bread"}'::jsonb),
('spark-sort-2027-05-11-season-rainbow-produce-9','spark_sort','2027-05-11','{"id":"season-rainbow-produce-9","difficulty":"easy","groups":[{"category":"Citrus fruit","items":["Lemon","Orange","Tangerine","Mandarin"]},{"category":"Leafy greens","items":["Kale","Lettuce","Chard","Collards"]},{"category":"Root vegetables","items":["Turnip","Radish","Parsnip","Rutabaga"]},{"category":"Berries","items":["Strawberry","Blueberry","Raspberry","Gooseberry"]}],"puzzleId":"spark-sort-2027-05-11-season-rainbow-produce-9"}'::jsonb),
('word-2027-05-12-clean','word','2027-05-12','{"id":"clean","answer":"CLEAN","category":"Sanitation","hint":"A key condition for safe food-contact surfaces.","puzzleId":"word-2027-05-12-clean"}'::jsonb),
('spark-sort-2027-05-12-season-kitchen-stations-9','spark_sort','2027-05-12','{"id":"season-kitchen-stations-9","difficulty":"medium","groups":[{"category":"Measuring tools","items":["Measuring Cup","Scale","Ruler","Graduated Pitcher"]},{"category":"Cutting tools","items":["Paring Knife","Bread Knife","Kitchen Shears","Peeler"]},{"category":"Cleaning tools","items":["Scrub Brush","Squeegee","Dustpan","Cleaning Cloth"]},{"category":"Cooking methods","items":["Bake","Roast","Steam","Braise"]}],"puzzleId":"spark-sort-2027-05-12-season-kitchen-stations-9"}'::jsonb),
('word-2027-05-13-season-tools','word','2027-05-13','{"id":"season-tools","answer":"TOOLS","category":"Kitchen","hint":"Items used to perform tasks.","puzzleId":"word-2027-05-13-season-tools"}'::jsonb),
('spark-sort-2027-05-13-season-word-menu-9','spark_sort','2027-05-13','{"id":"season-word-menu-9","difficulty":"hard","groups":[{"category":"Can come before CAKE","items":["Pan","Cheese","Fruit","Carrot"]},{"category":"Can come before CORN","items":["Sweet","Candy","Field","Flint"]},{"category":"Can come before BOARD","items":["Serving","Menu","Bulletin","White"]},{"category":"Can come before ROOM","items":["Dining","Class","Break","Lunch"]}],"puzzleId":"spark-sort-2027-05-13-season-word-menu-9"}'::jsonb),
('word-2027-05-14-season-spoon','word','2027-05-14','{"id":"season-spoon","answer":"SPOON","category":"Utensils","hint":"A tool with a small bowl at its end.","puzzleId":"word-2027-05-14-season-spoon"}'::jsonb),
('spark-sort-2027-05-14-season-pantry-labels-9','spark_sort','2027-05-14','{"id":"season-pantry-labels-9","difficulty":"easy","groups":[{"category":"Pasta shapes","items":["Penne","Spaghetti","Macaroni","Rigatoni"]},{"category":"Dried seasonings","items":["Paprika","Cumin","Turmeric","Ginger"]},{"category":"Beans","items":["Kidney Beans","Navy Beans","Lima Beans","Cannellini Beans"]},{"category":"Container types","items":["Can","Jar","Bottle","Tin"]}],"puzzleId":"spark-sort-2027-05-14-season-pantry-labels-9"}'::jsonb),
('word-2027-05-17-season-pasta','word','2027-05-17','{"id":"season-pasta","answer":"PASTA","category":"Menu","hint":"Food shaped into noodles, tubes or other forms.","puzzleId":"word-2027-05-17-season-pasta"}'::jsonb),
('spark-sort-2027-05-17-season-bakery-counter-9','spark_sort','2027-05-17','{"id":"season-bakery-counter-9","difficulty":"medium","groups":[{"category":"Bread shapes","items":["Loaf","Boule","Breadstick","Bagel"]},{"category":"Baking ingredients","items":["Yeast","Baking Powder","Baking Soda","Shortening"]},{"category":"Baking tools","items":["Pastry Brush","Cooling Rack","Muffin Tin","Pastry Bag"]},{"category":"Bakery treats","items":["Cookie","Brownie","Cupcake","Tart"]}],"puzzleId":"spark-sort-2027-05-17-season-bakery-counter-9"}'::jsonb),
('word-2027-05-18-season-beets','word','2027-05-18','{"id":"season-beets","answer":"BEETS","category":"Produce","hint":"Root vegetables often dark red.","puzzleId":"word-2027-05-18-season-beets"}'::jsonb),
('spark-sort-2027-05-18-season-food-word-endings-9','spark_sort','2027-05-18','{"id":"season-food-word-endings-9","difficulty":"hard","groups":[{"category":"End in BERRY","items":["Strawberry","Blackberry","Cranberry","Gooseberry"]},{"category":"End in NUT","items":["Hazelnut","Chestnut","Coconut","Butternut"]},{"category":"End in MELON","items":["Winter Melon","Bitter Melon","Horned Melon","Canary Melon"]},{"category":"End in PEPPER","items":["Bell Pepper","Black Pepper","White Pepper","Cherry Pepper"]}],"puzzleId":"spark-sort-2027-05-18-season-food-word-endings-9"}'::jsonb),
('word-2027-05-19-season-paper','word','2027-05-19','{"id":"season-paper","answer":"PAPER","category":"Supplies","hint":"Material used for printed menus.","puzzleId":"word-2027-05-19-season-paper"}'::jsonb),
('spark-sort-2027-05-19-season-soup-and-salad-9','spark_sort','2027-05-19','{"id":"season-soup-and-salad-9","difficulty":"easy","groups":[{"category":"Salad greens","items":["Romaine","Arugula","Butter Lettuce","Spring Mix"]},{"category":"Salad dressings","items":["Italian","Caesar","Balsamic Vinaigrette","Thousand Island"]},{"category":"Soup varieties","items":["Chicken Noodle","Lentil Soup","Split Pea","Vegetable Soup"]},{"category":"Serving dishes","items":["Soup Bowl","Salad Plate","Platter","Serving Tray"]}],"puzzleId":"spark-sort-2027-05-19-season-soup-and-salad-9"}'::jsonb),
('word-2027-05-20-season-stove','word','2027-05-20','{"id":"season-stove","answer":"STOVE","category":"Equipment","hint":"An appliance used to cook food.","puzzleId":"word-2027-05-20-season-stove"}'::jsonb),
('spark-sort-2027-05-20-season-school-day-9','spark_sort','2027-05-20','{"id":"season-school-day-9","difficulty":"medium","groups":[{"category":"Places at school","items":["Cafeteria","Gym","Office","Playground"]},{"category":"School supplies","items":["Notebook","Eraser","Crayon","Glue Stick"]},{"category":"Ways to travel","items":["Bus","Car","Train","Scooter"]},{"category":"Meal times or occasions","items":["Breakfast","Brunch","Lunch","Picnic"]}],"puzzleId":"spark-sort-2027-05-20-season-school-day-9"}'::jsonb),
('word-2027-05-21-season-cores','word','2027-05-21','{"id":"season-cores","answer":"CORES","category":"Produce","hint":"The centers removed from apples.","puzzleId":"word-2027-05-21-season-cores"}'::jsonb),
('spark-sort-2027-05-21-season-small-and-large-9','spark_sort','2027-05-21','{"id":"season-small-and-large-9","difficulty":"hard","groups":[{"category":"Small amount words","items":["Pinch","Drop","Touch","Trace"]},{"category":"Groups or quantities","items":["Bunch","Dozen","Pair","Quartet"]},{"category":"Words for reducing size","items":["Mince","Grate","Shred","Crush"]},{"category":"Words for combining","items":["Mix","Blend","Stir","Whisk"]}],"puzzleId":"spark-sort-2027-05-21-season-small-and-large-9"}'::jsonb),
('word-2027-05-24-season-plans','word','2027-05-24','{"id":"season-plans","answer":"PLANS","category":"Planning","hint":"Decisions about what to do in the future.","puzzleId":"word-2027-05-24-season-plans"}'::jsonb),
('spark-sort-2027-05-24-season-delivery-day-9','spark_sort','2027-05-24','{"id":"season-delivery-day-9","difficulty":"easy","groups":[{"category":"Wheeled transport","items":["Truck","Cart","Hand Truck","Pallet Jack"]},{"category":"Packaging materials","items":["Bubble Wrap","Packing Paper","Foam","Packing Tape"]},{"category":"Delivery paperwork","items":["Purchase Order","Receipt","Delivery Note","Bill of Lading"]},{"category":"Count or measure units","items":["Each","Case","Dozen","Gallon"]}],"puzzleId":"spark-sort-2027-05-24-season-delivery-day-9"}'::jsonb),
('word-2027-05-25-season-sugar','word','2027-05-25','{"id":"season-sugar","answer":"SUGAR","category":"Baking","hint":"A sweet ingredient often used in desserts.","puzzleId":"word-2027-05-25-season-sugar"}'::jsonb),
('spark-sort-2027-05-25-season-menu-variety-9','spark_sort','2027-05-25','{"id":"season-menu-variety-9","difficulty":"medium","groups":[{"category":"Rice dishes","items":["Pilaf","Paella","Rice Pudding","Jambalaya"]},{"category":"Pasta dishes","items":["Mac and Cheese","Spaghetti Marinara","Pasta Primavera","Pasta Salad"]},{"category":"Potato preparations","items":["Potato Wedges","Hash Browns","Roasted Potatoes","Potato Salad"]},{"category":"Egg preparations","items":["Scrambled Eggs","Omelet","Frittata","Deviled Eggs"]}],"puzzleId":"spark-sort-2027-05-25-season-menu-variety-9"}'::jsonb),
('word-2027-05-26-season-gravy','word','2027-05-26','{"id":"season-gravy","answer":"GRAVY","category":"Menu","hint":"A sauce often served with potatoes.","puzzleId":"word-2027-05-26-season-gravy"}'::jsonb),
('spark-sort-2027-05-26-season-can-follow-food-9','spark_sort','2027-05-26','{"id":"season-can-follow-food-9","difficulty":"hard","groups":[{"category":"Can come after FOOD","items":["Service","Court","Bank","Chain"]},{"category":"Can come after LUNCH","items":["Bag","Break","Money","Lady"]},{"category":"Can come after TABLE","items":["Top","Tennis","Manners","Setting"]},{"category":"Can come after WATER","items":["Bottle","Melon","Fall","Front"]}],"puzzleId":"spark-sort-2027-05-26-season-can-follow-food-9"}'::jsonb),
('word-2027-05-27-season-teams','word','2027-05-27','{"id":"season-teams","answer":"TEAMS","category":"Work","hint":"Groups of people working together.","puzzleId":"word-2027-05-27-season-teams"}'::jsonb),
('spark-sort-2027-05-27-season-breakfast-shelves-9','spark_sort','2027-05-27','{"id":"season-breakfast-shelves-9","difficulty":"easy","groups":[{"category":"Cereal grains","items":["Wheat","Rice","Barley","Rye"]},{"category":"Dairy foods","items":["Yogurt","Cheese","Butter","Sour Cream"]},{"category":"Tropical fruit","items":["Pineapple","Papaya","Guava","Passion Fruit"]},{"category":"Fruit spreads","items":["Strawberry Jam","Grape Jelly","Orange Marmalade","Peach Preserves"]}],"puzzleId":"spark-sort-2027-05-27-season-breakfast-shelves-9"}'::jsonb),
('word-2027-05-28-season-snack','word','2027-05-28','{"id":"season-snack","answer":"SNACK","category":"Service","hint":"A small amount of food between meals.","puzzleId":"word-2027-05-28-season-snack"}'::jsonb),
('spark-sort-2027-05-28-season-food-descriptions-9','spark_sort','2027-05-28','{"id":"season-food-descriptions-9","difficulty":"medium","groups":[{"category":"Taste words","items":["Sweet","Salty","Savory","Tangy"]},{"category":"Texture words","items":["Smooth","Creamy","Chewy","Tender"]},{"category":"Shape words","items":["Oval","Triangular","Flat","Cylindrical"]},{"category":"Color words","items":["Red","Green","Yellow","Brown"]}],"puzzleId":"spark-sort-2027-05-28-season-food-descriptions-9"}'::jsonb),
('word-2027-05-31-season-towel','word','2027-05-31','{"id":"season-towel","answer":"TOWEL","category":"Supplies","hint":"A piece of cloth used for drying.","puzzleId":"word-2027-05-31-season-towel"}'::jsonb),
('spark-sort-2027-05-31-season-kitchen-phrases-9','spark_sort','2027-05-31','{"id":"season-kitchen-phrases-9","difficulty":"hard","groups":[{"category":"Can come before POT","items":["Coffee","Stock","Crack","Honey"]},{"category":"Can come before PAN","items":["Sauce","Sheet","Cake","Roasting"]},{"category":"Can come before BOWL","items":["Salad","Cereal","Sugar","Punch"]},{"category":"Can come before SPOON","items":["Table","Dessert","Serving","Measuring"]}],"puzzleId":"spark-sort-2027-05-31-season-kitchen-phrases-9"}'::jsonb),
('word-2027-06-01-season-shift','word','2027-06-01','{"id":"season-shift","answer":"SHIFT","category":"Work","hint":"A scheduled period of work.","puzzleId":"word-2027-06-01-season-shift"}'::jsonb),
('spark-sort-2027-06-01-season-garden-groups-9','spark_sort','2027-06-01','{"id":"season-garden-groups-9","difficulty":"easy","groups":[{"category":"Plant parts","items":["Root","Leaf","Seed","Bud"]},{"category":"Garden tools","items":["Rake","Hoe","Trowel","Pruners"]},{"category":"Fruit trees","items":["Peach Tree","Plum Tree","Cherry Tree","Apricot Tree"]},{"category":"Garden helpers","items":["Bee","Butterfly","Earthworm","Hoverfly"]}],"puzzleId":"spark-sort-2027-06-01-season-garden-groups-9"}'::jsonb),
('word-2027-06-02-season-bowls','word','2027-06-02','{"id":"season-bowls","answer":"BOWLS","category":"Service","hint":"Round dishes that can hold soup or cereal.","puzzleId":"word-2027-06-02-season-bowls"}'::jsonb),
('spark-sort-2027-06-02-season-ready-for-service-9','spark_sort','2027-06-02','{"id":"season-ready-for-service-9","difficulty":"medium","groups":[{"category":"Actions with a knife","items":["Slice","Chop","Julienne","Trim"]},{"category":"Actions with liquid","items":["Drain","Strain","Ladle","Drizzle"]},{"category":"Service supplies","items":["Tray","Cup","Fork","Spoon"]},{"category":"Schedule words","items":["Morning","Noon","Afternoon","Weekend"]}],"puzzleId":"spark-sort-2027-06-02-season-ready-for-service-9"}'::jsonb),
('word-2027-06-03-tongs','word','2027-06-03','{"id":"tongs","answer":"TONGS","category":"Equipment","hint":"A gripping utensil useful on a serving line.","puzzleId":"word-2027-06-03-tongs"}'::jsonb),
('spark-sort-2027-06-03-season-food-or-something-else-9','spark_sort','2027-06-03','{"id":"season-food-or-something-else-9","difficulty":"hard","groups":[{"category":"Foods also used as colors","items":["Peach","Salmon","Chocolate","Cream"]},{"category":"Can come before BREAK","items":["Tea","Lunch","Day","Spring"]},{"category":"Menu headings","items":["Side Dishes","Beverages","Desserts","Specials"]},{"category":"Parts of a recipe","items":["Title","Ingredients","Directions","Cook Time"]}],"puzzleId":"spark-sort-2027-06-03-season-food-or-something-else-9"}'::jsonb),
('word-2027-06-04-scoop','word','2027-06-04','{"id":"scoop","answer":"SCOOP","category":"Portioning","hint":"A tool that helps serve consistent portions.","puzzleId":"word-2027-06-04-scoop"}'::jsonb),
('spark-sort-2027-06-04-season-menu-map-9','spark_sort','2027-06-04','{"id":"season-menu-map-9","difficulty":"medium","groups":[{"category":"Leaf herbs","items":["Basil","Cilantro","Dill","Sage"]},{"category":"Noodle shapes","items":["Linguine","Fettuccine","Vermicelli","Capellini"]},{"category":"Winter squash","items":["Spaghetti Squash","Delicata","Kabocha","Hubbard"]},{"category":"Fruit with a stone or pit","items":["Peach","Plum","Apricot","Mango"]}],"puzzleId":"spark-sort-2027-06-04-season-menu-map-9"}'::jsonb);
INSERT INTO spark_private.word_guesses(word) VALUES ('ABOUT'),('ABOVE'),('ABUSE'),('ACTOR'),('ACUTE'),('ADMIT'),('ADOPT'),('ADULT'),('AFTER'),('AGAIN'),('AGENT'),('AGREE'),('AHEAD'),('ALARM'),('ALBUM'),('ALERT'),('ALIKE'),('ALIVE'),('ALLOW'),('ALONE'),('ALONG'),('ALTER'),('AMONG'),('ANGER'),('ANGLE'),('ANGRY'),('APART'),('APPLE'),('APPLY'),('APRON'),('ARENA'),('ARGUE'),('ARISE'),('ARMOR'),('AROMA'),('ARRAY'),('ASIDE'),('ASSET'),('ATLAS'),('AUDIO'),('AUDIT'),('AVOID'),('AWAKE'),('AWARD'),('AWARE'),('AWFUL'),('BACON'),('BADGE'),('BADLY'),('BAKER'),('BASES'),('BASIC'),('BASIN'),('BASIS'),('BEACH'),('BEADS'),('BEANS'),('BEARD'),('BEAST'),('BEGAN'),('BEGIN'),('BEGUN'),('BEING'),('BELOW'),('BENCH'),('BERRY'),('BIRTH'),('BLACK'),('BLADE'),('BLAME'),('BLANK'),('BLAST'),('BLEND'),('BLESS'),('BLIND'),('BLOCK'),('BLOOD'),('BLOOM'),('BLOWN'),('BLUES'),('BLUNT'),('BOARD'),('BOAST'),('BONUS'),('BOOKS'),('BOOST'),('BOOTH'),('BOUND'),('BOWEL'),('BRAIN'),('BRAKE'),('BRAND'),('BRASS'),('BRAVE'),('BREAD'),('BREAK'),('BREED'),('BRICK'),('BRIDE'),('BRIEF'),('BRING'),('BROAD'),('BROKE'),('BROWN'),('BRUSH'),('BUILD'),('BUILT'),('BUNCH'),('BURST'),('BUYER'),('CABIN'),('CABLE'),('CACAO'),('CACHE'),('CAFES'),('CAMEL'),('CANDY'),('CARGO'),('CARRY'),('CARVE'),('CASES'),('CATCH'),('CAUSE'),('CEDAR'),('CHAIN'),('CHAIR'),('CHALK'),('CHARM'),('CHART'),('CHASE'),('CHEAP'),('CHECK'),('CHEEK'),('CHEER'),('CHESS'),('CHEST'),('CHICK'),('CHIEF'),('CHILD'),('CHILI'),('CHILL'),('CHOIR'),('CHOSE'),('CIDER'),('CIVIL'),('CLAIM'),('CLASS'),('CLEAN'),('CLEAR'),('CLERK'),('CLICK'),('CLIMB'),('CLOCK'),('CLOSE'),('CLOTH'),('CLOUD'),('COACH'),('COAST'),('COCOA'),('COLON'),('COLOR'),('COMET'),('COMIC'),('CORAL'),('COULD'),('COUNT'),('COURT'),('COVER'),('CRANE'),('CRATE'),('CREAM'),('CRISP'),('CROPS'),('CROWD'),('CROWN'),('CRUDE'),('CRUSH'),('CRUST'),('CURLY'),('CURRY'),('CURVE'),('CYCLE'),('DAIRY'),('DANCE'),('DATES'),('DEALT'),('DEATH'),('DEBUT'),('DELAY'),('DEPTH'),('DIARY'),('DIRTY'),('DISCO'),('DITCH'),('DIZZY'),('DOUGH'),('DOZEN'),('DRAFT'),('DRAIN'),('DRAMA'),('DRANK'),('DREAM'),('DRESS'),('DRIED'),('DRINK'),('DRIVE'),('DROVE'),('DRYER'),('EAGER'),('EARLY'),('EARTH'),('EATEN'),('EIGHT'),('ELBOW'),('ELDER'),('ELECT'),('ELITE'),('EMPTY'),('ENACT'),('ENEMY'),('ENJOY'),('ENTER'),('ENTRY'),('EQUAL'),('ERROR'),('ESSAY'),('EVENT'),('EVERY'),('EXACT'),('EXIST'),('EXTRA'),('FACTS'),('FAINT'),('FAIRY'),('FAITH'),('FALSE'),('FANCY'),('FARMS'),('FAULT'),('FAVOR'),('FEAST'),('FIBER'),('FIELD'),('FIERY'),('FIFTH'),('FIFTY'),('FIGHT'),('FINAL'),('FIRST'),('FLAME'),('FLASH'),('FLEET'),('FLESH'),('FLOAT'),('FLOUR'),('FOCUS'),('FORCE'),('FORTY'),('FORUM'),('FOUND'),('FRAME'),('FRESH'),('FRIED'),('FRONT'),('FROST'),('FRUIT'),('FUNNY'),('GIANT'),('GIVEN'),('GLASS'),('GLAZE'),('GLOBE'),('GLOVE'),('GOALS'),('GRACE'),('GRADE'),('GRAIN'),('GRAND'),('GRANT'),('GRAPE'),('GRAPH'),('GRASP'),('GRASS'),('GRAVE'),('GREAT'),('GREEN'),('GREET'),('GRILL'),('GRIND'),('GROSS'),('GROUP'),('GROWN'),('GUARD'),('GUESS'),('GUEST'),('GUIDE'),('HABIT'),('HAPPY'),('HARDY'),('HEARD'),('HEART'),('HEAVY'),('HELLO'),('HERBS'),('HOBBY'),('HONEY'),('HONOR'),('HORSE'),('HOTEL'),('HOUSE'),('HUMAN'),('IDEAL'),('IMAGE'),('IMPLY'),('INBOX'),('INDEX'),('INERT'),('INPUT'),('ISSUE'),('ITEMS'),('JOINT'),('JUDGE'),('JUICE'),('KEBAB'),('KNIFE'),('KNOWN'),('LABEL'),('LABOR'),('LADLE'),('LARGE'),('LASER'),('LATER'),('LAUGH'),('LAYER'),('LEARN'),('LEASE'),('LEAST'),('LEAVE'),('LEMON'),('LIGHT'),('LIMIT'),('LINEN'),('LINER'),('LINKS'),('LIVER'),('LOCAL'),('LODGE'),('LOGIC'),('LOOSE'),('LUNCH'),('MAGIC'),('MAIZE'),('MAJOR'),('MAKER'),('MANGO'),('MAPLE'),('MARCH'),('MATCH'),('MEALS'),('MEDAL'),('MEDIA'),('MELON'),('MENUS'),('METAL'),('METER'),('MIGHT'),('MIXER'),('MODEL'),('MONEY'),('MONTH'),('MORAL'),('MOTOR'),('MOUNT'),('MOUSE'),('MOUTH'),('MOVIE'),('NACHO'),('NAMES'),('NERVE'),('NEVER'),('NIGHT'),('NINTH'),('NOISE'),('NORTH'),('NOTES'),('NOVEL'),('NURSE'),('OASIS'),('OCCUR'),('OCEAN'),('OFFER'),('OFTEN'),('OLIVE'),('ONION'),('OPERA'),('ORDER'),('OTHER'),('OUNCE'),('OVENS'),('OWNER'),('PACKS'),('PAINT'),('PANEL'),('PAPER'),('PASTA'),('PASTE'),('PATCH'),('PEACH'),('PEARS'),('PHASE'),('PHONE'),('PIECE'),('PILOT'),('PINCH'),('PIZZA'),('PLACE'),('PLAIN'),('PLANE'),('PLANT'),('PLATE'),('POINT'),('PORCH'),('POUND'),('POWER'),('PRESS'),('PRICE'),('PRIDE'),('PRIME'),('PRINT'),('PRIOR'),('PRIZE'),('PROBE'),('PROOF'),('PROUD'),('PULSE'),('PUREE'),('QUAIL'),('QUART'),('QUEEN'),('QUICK'),('QUIET'),('QUILT'),('QUOTA'),('RADAR'),('RADIO'),('RAISE'),('RANCH'),('RANGE'),('RAPID'),('RATIO'),('REACH'),('READY'),('REFER'),('RINSE'),('RISEN'),('ROAST'),('ROLLS'),('ROUGH'),('ROUND'),('ROUTE'),('ROYAL'),('RULER'),('RURAL'),('SALAD'),('SALSA'),('SAUCE'),('SCALE'),('SCENE'),('SCOOP'),('SCORE'),('SCRUB'),('SEEDS'),('SERVE'),('SEVEN'),('SHAKE'),('SHALL'),('SHAPE'),('SHARE'),('SHARP'),('SHEET'),('SHELF'),('SHIFT'),('SHINE'),('SHORT'),('SHOWN'),('SIDES'),('SKILL'),('SLICE'),('SMALL'),('SMART'),('SMELL'),('SMILE'),('SNACK'),('SOLAR'),('SOLID'),('SOLVE'),('SOUND'),('SOUPS'),('SOUTH'),('SPACE'),('SPARE'),('SPEAK'),('SPEED'),('SPICE'),('SPOON'),('SPORT'),('STAFF'),('STAGE'),('STAIN'),('STAND'),('START'),('STATE'),('STEAK'),('STEAM'),('STEEL'),('STEEP'),('STEPS'),('STILL'),('STOCK'),('STONE'),('STORE'),('STOVE'),('STRAW'),('STRIP'),('SUGAR'),('SUITE'),('SWEET'),('SYRUP'),('TABLE'),('TASTE'),('TEACH'),('TEAMS'),('THANK'),('THEIR'),('THEME'),('THERE'),('THESE'),('THICK'),('THING'),('THINK'),('THIRD'),('THOSE'),('THREE'),('TOAST'),('TODAY'),('TONGS'),('TOOLS'),('TOOTH'),('TOTAL'),('TOUCH'),('TOWEL'),('TOWER'),('TRACK'),('TRADE'),('TRAYS'),('TREAT'),('TREND'),('TRIAL'),('TRUCK'),('TRULY'),('TRUST'),('TWICE'),('TYPES'),('UNDER'),('UNION'),('UNITY'),('UPPER'),('URBAN'),('USAGE'),('USUAL'),('VALID'),('VALUE'),('VEGAN'),('VIDEO'),('VISIT'),('VITAL'),('WAGON'),('WASTE'),('WATCH'),('WATER'),('WHEAT'),('WHEEL'),('WHISK'),('WHITE'),('WHOLE'),('WOMAN'),('WORDS'),('WORLD'),('WORTH'),('WOULD'),('WOUND'),('WRITE'),('WRONG'),('YEAST'),('YIELD'),('YOUNG'),('YOUTH'),('ZESTY'),('MELTS'),('CRESS'),('TIMER'),('CLAMP'),('HEATS'),('LOADS'),('KEEPS'),('MUNCH'),('MOIST'),('PLUMS'),('SALTS'),('LIMES'),('CUBES'),('BAKES'),('COOKS'),('TANGY'),('DICED'),('CRUMB'),('PANES'),('LEAFY'),('DAILY'),('SIEVE'),('SKIMS'),('GRATE'),('CHARD'),('WIPES'),('THAWS'),('TRIMS'),('ZESTS'),('GUAVA'),('CHOPS'),('MEATS'),('WRAPS'),('BAGEL'),('FORKS'),('CURDS'),('STACK'),('MINCE'),('BOXES'),('BITES'),('BATCH'),('COOLS'),('SAVES'),('SWEPT'),('TACOS'),('BASIL'),('PRUNE'),('PITCH'),('CARTS'),('MINTS'),('BEETS'),('CORES'),('PLANS'),('GRAVY'),('BOWLS');
-- END GENERATED PRIVATE PUZZLE BANK
COMMIT;
