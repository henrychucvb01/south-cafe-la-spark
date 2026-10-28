BEGIN;
-- Reuse the existing token validation and school filtering. No new privileged
-- data access: the invoker must already be able to execute the original list.
CREATE FUNCTION public.supper_correction_count(p_token text) RETURNS bigint
LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT count(*) FROM public.list_supper_monitorings(p_token)
 WHERE monitor_role='manager' AND status='corrections_requested' AND NOT coalesce(locked,false)
$$;
REVOKE ALL ON FUNCTION public.supper_correction_count(text) FROM PUBLIC,anon,authenticated,service_role;
DO $$DECLARE r text;BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(r,'public.list_supper_monitorings(text)','EXECUTE') THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION public.supper_correction_count(text) TO %I',r);
  END IF;
 END LOOP;
END$$;
NOTIFY pgrst,'reload schema';
COMMIT;
