-- Local synthetic fixture ONLY. This is deliberately not a production migration.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'spark_security' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55432 THEN
  RAISE EXCEPTION 'This notification helper is only for the isolated loopback test database';
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS quest_notification_preview_idx ON october_dev.entries(id) WHERE quest>0 AND state='pending';
CREATE OR REPLACE FUNCTION public.supervisor_notification_preview_counts(p_pin text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb; quests bigint;
BEGIN
 IF public.verify_supervisor_pin(p_pin) IS NOT TRUE THEN RAISE EXCEPTION 'Supervisor authorization required'; END IF;
 result:=spark_private.notification_counts();
 SELECT count(*) INTO quests FROM october_dev.entries WHERE quest>0 AND state='pending';
 RETURN result||jsonb_build_object('quests',quests,'total',quests+(result->>'monitoring')::bigint+(result->>'feedback')::bigint);
END $$;
REVOKE ALL ON FUNCTION public.supervisor_notification_preview_counts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisor_notification_preview_counts(text) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
