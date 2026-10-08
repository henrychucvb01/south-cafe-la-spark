BEGIN;
SET LOCAL lock_timeout='5s';
-- Old screens must refresh; they cannot resume the partial multi-request save.
REVOKE INSERT,UPDATE,DELETE ON public.finish_line_checks,public.finish_line_items,public.finish_line_audit_log FROM anon,authenticated;
COMMIT;
