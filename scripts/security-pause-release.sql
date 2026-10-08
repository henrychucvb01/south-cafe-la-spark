-- Recovery switch. Keeps all permissions hardened and retains all school data.
-- Execute only if an already-applied Phase 1 release needs maintenance.
BEGIN;
UPDATE spark_private.security_release SET available=false WHERE id;
COMMIT;
-- Resume only after verifying the compatible application:
-- UPDATE spark_private.security_release SET available=true WHERE id;
