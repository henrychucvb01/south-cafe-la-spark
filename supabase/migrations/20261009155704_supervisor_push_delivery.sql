BEGIN;
-- On native local PostgreSQL these optional Supabase extensions are unavailable.
-- The queue and delivery handler remain testable without sending any external requests.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_net') THEN
  CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  REVOKE USAGE ON SCHEMA net FROM PUBLIC,anon,authenticated;
  REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA net FROM PUBLIC,anon,authenticated;
 END IF;
END $$;
CREATE FUNCTION spark_private.dispatch_supervisor_notifications() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE config jsonb;
BEGIN
 SELECT c.config INTO config FROM spark_private.push_config c WHERE id;
 IF config IS NULL OR NOT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_net') THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM spark_private.push_subscriptions s,spark_private.notification_state n
   WHERE s.delivered_version<n.version AND s.retry_at<=now() AND (s.lease_until IS NULL OR s.lease_until<now())) THEN RETURN; END IF;
 -- Fixed destination: never use a client-supplied webhook URL or production URL in a clone.
 IF current_setting('app.settings.notification_delivery',true) IS DISTINCT FROM 'production' THEN RETURN; END IF;
 PERFORM net.http_post(url:='https://spark.cafelalistens.org/api/supervisor-notifications',
  body:=jsonb_build_object('action','dispatch','secret',config->>'secret'),timeout_milliseconds:=10000);
END $$;
REVOKE ALL ON FUNCTION spark_private.dispatch_supervisor_notifications() FROM PUBLIC,anon,authenticated;
-- Activation is a separate, explicit production-only deployment step after the API is live.
COMMIT;
