# Breakfast Accountability rollout

Implemented on development only. No main merge or production deployment.

Supervisor Command Center > Breakfast lists active locations using the same supervisor PIN authorization and school scope as the existing Command Center. Every school defaults OFF, including locations added later. Apply Changes sends only changed schools, checks previous values to reject stale edits, and commits the batch atomically.

The rollout table denies direct anonymous/authenticated access. RPCs authorize supervisor changes. Manager availability derives the school from its verified session, never a client-provided school ID. Central manager/QR guards check the setting for all Breakfast operations; existing worker sessions also pass through the QR guard. Disabling does not delete or alter classrooms, tokens, records, notes, or history. Public QR checks use the existing anonymous Supabase client, with no SPARK login. Open pages recheck on focus and every 30 seconds; database access is checked on every request.

## Finish Line inspection

Use BIC total copies the sum of certified, submitted student counts for the selected school/date into the breakfast input. It waits for all included classrooms to submit. Adult meals, packing quantities, returns, and pre-orders do not increase the total. Clicking it does not save, submit, award points, or advance a streak. The normal Finish Line submission still saves meal counts and applies the existing meal-entry and checklist points and streak eligibility rules.

The count-copy behavior is intentionally unchanged, including for schools subsequently disabled. A dedicated, school-scoped read-only RPC returns only the total and submission status used by the existing control, so restricting the full Breakfast dashboard does not disable Finish Line. No scoring, streak, or Finish Line submission code changed. Gating/graying the Finish Line control is deferred as requested.

## Deployment prerequisites / concerns

- Apply 202610070006_breakfast_rollout.sql after the existing Breakfast migrations. The pre-order migration 202610070005 was reported applied by the user.
- SPARK development and production share one database. This migration immediately gates Breakfast requests from older builds too; coordinate the development frontend deployment with the migration. Old builds using breakfast_daily_dashboard for Finish Line cannot use the new compatibility RPC until updated. No production or main changes were made.
- All schools start OFF. The supervisor must select pilot schools; no automatic pilot selection.
- Current connected Supabase tool targets a different project from SPARK, so the migration has not been applied by this task. A user-run SQL wrapper also records the migration in Supabase migration history.
- Vercel deployment protection is outside application authorization. A protected preview URL still asks for Vercel login before SPARK runs. QR links inherit the origin where generated: use an unprotected deployment for teacher testing. No hosting protection settings were changed.

## Validation

The SQL operations harness tests populated data through default OFF, enable/disable/re-enable, school isolation for manager and public QR access, supervisor authorization, denied direct table writes, stale edits, invalid schools, existing worker sessions, identical saved data/QRs, and unchanged Finish Line counts.

React tests cover the rollout form, save failures, Manager Hub visibility, manager/QR access refresh and fail-closed errors, and existing Finish Line count-copy behavior.
