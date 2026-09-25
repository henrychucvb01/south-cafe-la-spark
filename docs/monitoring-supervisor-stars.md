# Supervisor review priority and star controls

Submitted for Review is immediately after the first controls/filter card and before Supper Scheduling / Matrix.

In School / Site Overview, an accepted, locked Manager monitoring has Award Star or Remove Star. The Supervisor uses their own school-authorized session, without a Manager PIN. The decision appears on Manager cards, completed rows, details, and Supervisor overview after refresh. Supper 2 has no star control.

Existing automatic awards remain the default. An explicit Supervisor decision overrides that result, including for legacy records whose correction history is unknown. No named school's record is changed merely by installing this update. The Supervisor chooses each award/removal.

## Migration

Apply `supabase/migrations/202609250005_supervisor_monitoring_stars.sql` after migration 004, before deploying this update. It adds only `monitoring_records.perfect_monitoring_override` (nullable boolean) and a school-authorized, revision-checked `set_monitoring_star` RPC. Null retains the automatic result; true awards; false removes.

The RPC requires an accepted, locked Manager record. It changes only the recognition decision, normal revision and update timestamp. It does not unlock the record, replace its PDF, alter its date, or rewrite correction facts. A new correction/unlock clears a prior explicit award so that the Supervisor can reassess the corrected final record; a deliberate removal stays false. No audit/version-history storage is added.

## Files

- `src/monitoring/SupervisorMonitoringPage.js`: queue order.
- `src/monitoring/MonitoringStarButton.js`: Supervisor control, errors, duplicate-click protection, session cleanup.
- `src/monitoring/SupperScheduling.js`: buttons on eligible overview cells.
- `src/monitoring/supperSchedule.js`: effective recognition calculation.
- `src/supperMonitoring/service.js`, `supperMonitoring.css`: RPC client and compact styling.
- Migration 005 and the updated scheduling documentation.
- `SupervisorReviewPriority.test.js`, `MonitoringStarButton.test.js`, `scripts/test-supper-global-workflow.mjs`, and `scripts/test-supper-monitoring-review-browser.mjs` verify the change.

## Verification

Unit tests check queue order, automatic/override precedence, eligible controls, Supervisor session use, errors and refresh. The isolated database/API suite checks Manager and wrong-school denial, stale revisions, old-record awards, removal, correction reset, and unchanged locked PDF bytes/metadata. The browser suite exercises actual award/removal buttons and Manager refresh, alongside the existing PDF and scheduling regressions.
