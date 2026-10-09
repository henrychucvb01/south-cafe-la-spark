BEGIN;
SET LOCAL lock_timeout='5s';
ALTER TABLE public.spark_feedback ADD COLUMN read_at timestamptz;
-- Preserve already reviewed feedback as read; new submissions remain unread.
UPDATE public.spark_feedback SET read_at=updated_at WHERE status<>'New';
CREATE INDEX spark_feedback_unread_idx ON public.spark_feedback(submitted_at DESC) WHERE read_at IS NULL;
CREATE INDEX monitoring_notifications_idx ON public.monitoring_records(id) WHERE status='submitted';
CREATE INDEX quest_notifications_idx ON october_live.entries(id) WHERE quest>0 AND state='pending';
CREATE OR REPLACE FUNCTION public.update_spark_feedback_status(p_supervisor_pin text,p_feedback_id uuid,p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF public.verify_supervisor_pin(p_supervisor_pin) IS NOT TRUE THEN RAISE EXCEPTION 'Supervisor authorization failed'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('New','Reviewing','Resolved') THEN RAISE EXCEPTION 'Invalid feedback status'; END IF;
 UPDATE public.spark_feedback SET status=p_status,updated_at=now(),read_at=CASE WHEN p_status='New' THEN NULL ELSE coalesce(read_at,now()) END WHERE id=p_feedback_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Feedback not found'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.list_spark_feedback(p_supervisor_pin text,p_status text DEFAULT NULL)
RETURNS SETOF public.spark_feedback LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF public.verify_supervisor_pin(p_supervisor_pin) IS NOT TRUE THEN RAISE EXCEPTION 'Supervisor authorization failed'; END IF;
 IF p_status IS NOT NULL AND p_status NOT IN ('Unread','New','Reviewing','Resolved') THEN RAISE EXCEPTION 'Invalid feedback status'; END IF;
 RETURN QUERY SELECT * FROM public.spark_feedback WHERE p_status IS NULL OR (p_status='Unread' AND read_at IS NULL) OR status=p_status ORDER BY submitted_at DESC LIMIT 500;
END $$;

CREATE TABLE spark_private.notification_state(id boolean PRIMARY KEY DEFAULT true CHECK(id),version bigint NOT NULL DEFAULT 1);
INSERT INTO spark_private.notification_state VALUES(true,1);
CREATE TABLE spark_private.push_config(id boolean PRIMARY KEY DEFAULT true CHECK(id), config jsonb NOT NULL);
CREATE TABLE spark_private.push_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), device_hash text UNIQUE NOT NULL,
 subscription jsonb NOT NULL, endpoint text UNIQUE NOT NULL,
 delivered_version bigint NOT NULL DEFAULT 0, lease_until timestamptz, lease_id uuid,
 retry_at timestamptz NOT NULL DEFAULT now(), failures integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE spark_private.notification_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE spark_private.push_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE spark_private.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON spark_private.notification_state,spark_private.push_config,spark_private.push_subscriptions FROM PUBLIC,anon,authenticated;

CREATE FUNCTION spark_private.notification_counts() RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('quests',q,'monitoring',m,'feedback',f,'total',q+m+f,'version',s.version)
 FROM (SELECT count(*) q FROM october_live.entries WHERE quest>0 AND state='pending') a,
 (SELECT count(*) m FROM public.monitoring_records WHERE status='submitted') b,
 (SELECT count(*) f FROM public.spark_feedback WHERE read_at IS NULL) c,
 spark_private.notification_state s;
$$;
CREATE FUNCTION public.supervisor_notification_counts(p_pin text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF public.verify_supervisor_pin(p_pin) IS NOT TRUE THEN RAISE EXCEPTION 'Supervisor authorization required'; END IF;
 RETURN spark_private.notification_counts();
END $$;
CREATE FUNCTION public.mark_spark_feedback_read(p_pin text,p_id uuid,p_read boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF public.verify_supervisor_pin(p_pin) IS NOT TRUE THEN RAISE EXCEPTION 'Supervisor authorization required'; END IF;
 IF p_read IS NULL THEN RAISE EXCEPTION 'Choose read or unread'; END IF;
 UPDATE public.spark_feedback SET read_at=CASE WHEN p_read THEN coalesce(read_at,now()) END WHERE id=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Feedback not found'; END IF;
END $$;

-- Only membership/status transitions change the version. No photos or personal data in push.
CREATE FUNCTION spark_private.notification_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE before_pending boolean:=false; after_pending boolean:=false;
BEGIN
 IF TG_TABLE_NAME='entries' THEN
  IF TG_OP<>'INSERT' THEN before_pending:=OLD.quest>0 AND OLD.state='pending'; END IF;
  IF TG_OP<>'DELETE' THEN after_pending:=NEW.quest>0 AND NEW.state='pending'; END IF;
 ELSIF TG_TABLE_NAME='monitoring_records' THEN
  IF TG_OP<>'INSERT' THEN before_pending:=OLD.status='submitted'; END IF;
  IF TG_OP<>'DELETE' THEN after_pending:=NEW.status='submitted'; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN before_pending:=OLD.read_at IS NULL; END IF;
  IF TG_OP<>'DELETE' THEN after_pending:=NEW.read_at IS NULL; END IF;
 END IF;
 IF before_pending IS DISTINCT FROM after_pending THEN
  UPDATE spark_private.notification_state SET version=version+1 WHERE id;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER notification_changed AFTER INSERT OR UPDATE OR DELETE ON october_live.entries FOR EACH ROW EXECUTE FUNCTION spark_private.notification_changed();
CREATE TRIGGER notification_changed AFTER INSERT OR UPDATE OR DELETE ON public.monitoring_records FOR EACH ROW EXECUTE FUNCTION spark_private.notification_changed();
CREATE TRIGGER notification_changed AFTER INSERT OR UPDATE OR DELETE ON public.spark_feedback FOR EACH ROW EXECUTE FUNCTION spark_private.notification_changed();

-- Server-only gateway. Secrets and subscription endpoints never reach ordinary database clients.
CREATE FUNCTION public.supervisor_push_service(p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c jsonb; result jsonb; v bigint; lease uuid:=gen_random_uuid();
BEGIN
 IF p_action='config' THEN
  IF p_data ? 'privateKey' THEN INSERT INTO spark_private.push_config VALUES(true,p_data) ON CONFLICT(id) DO NOTHING; END IF;
  SELECT config INTO c FROM spark_private.push_config WHERE id; RETURN c;
 ELSIF p_action='subscribe' THEN
  IF public.verify_supervisor_pin(p_data->>'pin') IS NOT TRUE THEN RAISE EXCEPTION 'Supervisor authorization required'; END IF;
  SELECT version INTO v FROM spark_private.notification_state WHERE id;
  DELETE FROM spark_private.push_subscriptions WHERE endpoint=p_data->'subscription'->>'endpoint' AND device_hash<>p_data->>'device_hash';
  INSERT INTO spark_private.push_subscriptions(device_hash,subscription,endpoint,delivered_version)
  VALUES(p_data->>'device_hash',p_data->'subscription',p_data->'subscription'->>'endpoint',v)
  ON CONFLICT(device_hash) DO UPDATE SET endpoint=excluded.endpoint,subscription=excluded.subscription,delivered_version=v,updated_at=now(),failures=0,retry_at=now();
  RETURN jsonb_build_object('ok',true);
 ELSIF p_action='unsubscribe' THEN
  DELETE FROM spark_private.push_subscriptions WHERE device_hash=p_data->>'device_hash'; RETURN jsonb_build_object('ok',true);
 ELSIF p_action='claim' THEN
  c:=spark_private.notification_counts();
  WITH targets AS (SELECT id FROM spark_private.push_subscriptions WHERE delivered_version<(c->>'version')::bigint
   AND retry_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY updated_at LIMIT 20 FOR UPDATE SKIP LOCKED),
  claimed AS (UPDATE spark_private.push_subscriptions s SET lease_until=now()+interval '2 minutes',lease_id=lease FROM targets t WHERE s.id=t.id RETURNING s.id,s.subscription)
  SELECT coalesce(jsonb_agg(to_jsonb(claimed)),'[]') INTO result FROM claimed;
  RETURN jsonb_build_object('counts',c,'lease',lease,'subscriptions',result);
 ELSIF p_action='ack' THEN
  IF p_data->>'status'='gone' THEN
   DELETE FROM spark_private.push_subscriptions WHERE id=(p_data->>'id')::uuid AND lease_id=(p_data->>'lease')::uuid;
  ELSE
   UPDATE spark_private.push_subscriptions SET
    delivered_version=CASE WHEN p_data->>'status'='sent' THEN greatest(delivered_version,(p_data->>'version')::bigint) ELSE delivered_version END,
    failures=CASE WHEN p_data->>'status'='sent' THEN 0 ELSE failures+1 END,
    retry_at=CASE WHEN p_data->>'status'='sent' THEN now() ELSE now()+least(60,power(2,least(failures,6))::integer)*interval '1 minute' END,
    lease_until=NULL,lease_id=NULL
   WHERE id=(p_data->>'id')::uuid AND lease_id=(p_data->>'lease')::uuid;
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION 'Invalid notification action';
END $$;
REVOKE ALL ON FUNCTION spark_private.notification_counts(),spark_private.notification_changed() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.supervisor_push_service(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.supervisor_push_service(text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.supervisor_notification_counts(text),public.mark_spark_feedback_read(text,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisor_notification_counts(text),public.mark_spark_feedback_read(text,uuid,boolean) TO anon,authenticated,service_role;
COMMIT;
