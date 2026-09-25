# Supper scheduling, progression and recognition

Supervisor Command Center → Monitorings → Supper Scheduling / Matrix now publishes one schedule per school year and Supper number across all schools/sites. The site selector is only for the matrix. New sites inherit schedules automatically.

## Migration

Apply `supabase/migrations/202609250004_global_supper_sequence_recognition.sql` after migration 003 and before deploying this application change. This task does not apply it to the live database.

- `supper_schedules` now uses `(school_year, monitoring_slot)` as its key. Site/location columns are removed. Dates and revision conflict protection remain.
- Identical prior schedules consolidate. Conflicting dates for a year/number stop and roll back the migration. Align those schedules in the existing screen and retry; the migration does not choose a site's dates arbitrarily.
- `save_global_supper_schedule` verifies the existing Supervisor PIN. The old site publishing RPC is removed. Manager context and Supervisor overview return shared schedules. Direct table access remains denied.
- `monitoring_records.had_correction_requested` is unknown/null for old records, true for existing corrections-requested records, and false for new records. A database trigger prevents resetting it after a correction, unlock, replacement, resubmission or restart.
- No audit logs or PDF version history are added. Existing PDFs, completed records, dates, roles and site information are preserved.

## Sequence and dates

Supper 2 requires locked accepted/completed Supper 1. Supper 3 requires both earlier monitorings locked and accepted/completed. Draft, submitted and returned records do not qualify. Each site's and school year's progression is independent.

The UI displays lock explanations, hides premature available dates, disables premature starts/uploads, and shows Resume Draft on Manager draft cards. The database checks creation, changed work, uploads and submission/acceptance to prevent direct-API bypasses. Prior records are held stable during a dependent write. An earlier unlock blocks new later work without deleting completed records.

The existing matrix remains Monday–Friday by Weeks 1–5. Week ranges remain 1–7, 8–14, 15–21, 22–28 and 29–31. Completed/accepted structured dates exclude entire weekday columns and week rows in light red. Each site has independent restrictions under the shared window.

Every eligible weekday in the inclusive window appears after sequence unlock. No three-date cap, six-month rule or invented holiday rule. Due date is displayed separately from the window. July–June validation and guided-date enforcement remain. Uploaded PDFs retain historical dates but creation follows the sequence.

## Recognition and UX

Perfect Monitoring requires a locked accepted Manager record with `had_correction_requested === false`. Uploaded and guided Manager records qualify. Supervisor Supper 2, unknown old records, and corrected records do not. Unlocking for correction permanently removes eligibility.

Stars appear on Manager cards, completed/accepted rows, record details and Supervisor overview cells. Completed/accepted overview cells are light green with dark text. Submitted is pale blue; corrections requested is pale amber. Red matrix restrictions are unchanged.

## Files changed

- Shared rules: `src/monitoring/supperSchedule.js`.
- Settings and overview: `src/monitoring/SupperScheduling.js`.
- Dates: `src/monitoring/SupperScheduleDetails.js`, `ScheduledMonitoringDate.js`.
- Manager UX: `src/supperMonitoring/MonitoringHome.js`.
- Guided entry and Supervisor uploads: `SupperMonitoringPage.js`, `SupervisorExistingUpload.js`.
- RPC and styling: `src/supperMonitoring/service.js`, `supperMonitoring.css`.
- Migration: `supabase/migrations/202609250004_global_supper_sequence_recognition.sql`.
- Tests: `src/monitoring/supperProgression.test.js`, `MonitoringRecognition.test.js`, `supperSchedule.test.js`, `src/supperMonitoring/SupperMonitoringPage.test.js`, `scripts/test-supper-global-workflow.mjs`, `test-supper-scheduling.mjs`, `test-supper-monitoring-review-browser.mjs`.

## Verification

Tests use isolated databases and synthetic records. Run:

```
npm test -- --watchAll=false --runInBand --testMatch '**/*.test.js'
node scripts/test-supper-scheduling.mjs
npm run build
node scripts/test-supper-monitoring-review-browser.mjs
node scripts/test-supper-monitoring-browser.mjs
```

Database tests cover migration consolidation/rollback, authorization, shared visibility, immutable correction state, legacy unknown, generated/uploaded stars, direct-API sequence checks, merged replacement/download/lock, and SQL/UI date parity. Browser tests cover actual Manager and Supervisor screens, guided signatures/PDFs, merge/preview/annotations, covering corrections, site/year switching, stars, and 31-site overview layouts.
