# Supper due dates and automatic ranges

The Supervisor enters only a due date for Supper 1, Supper 2 and Supper 3. These are shared across schools for the selected school year. Available Start/End inputs have been removed.

SPARK derives a separate range for every site:

- Supper 1: July 1 of the selected school year through the Supper 1 due date.
- Supper 2: the day after the accepted/completed Supper 1 monitoring date through the Supper 2 due date.
- Supper 3: the day after the completed/accepted Supper 2 monitoring date through the Supper 3 due date, as confirmed by the user.

Only weekdays are listed. Each completed prior monitoring excludes its weekday column and week-of-month row. Strict Supper sequence locks remain. Main sites, offsites, EECs and other programs calculate independently. Due dates are inclusive cutoffs for guided date selection. Historical uploaded PDFs and existing completed records retain their dates and PDFs.

Missing due dates produce a clear message. A due date before the preceding completion, or a range containing only excluded patterns, produces no eligible dates and asks the Supervisor to review the due date. SPARK does not invent dates beyond the deadline. Weeks remain days 1–7, 8–14, 15–21, 22–28 and 29–31; no holiday calendar or six-month rule was added.

## Migration

Apply `supabase/migrations/202609250006_supper_due_dates.sql` after migration 005, which the user reported successful. Do not rerun 005 for this change.

Migration 006 preserves the existing due dates and revisions, removes obsolete `available_start`/`available_end` columns, and replaces the publishing RPC with `save_supper_due_date`. It updates the private database eligibility calculation to match the browser. Supervisor authorization, revision checks and July–June year validation remain. It does not modify monitoring records, correction facts, stars, PDFs or unrelated tables.

## Files and verification

Changed application files: `SupperScheduling.js`, `supperSchedule.js`, `SupperScheduleDetails.js`, `ScheduledMonitoringDate.js`, and `src/supperMonitoring/service.js`. Tests: `supperSchedule.test.js`, `supperProgression.test.js`, `test-supper-global-workflow.mjs`, and `test-supper-monitoring-review-browser.mjs`.

The isolated database test applies migration 006 over existing schedules, checks preservation and due-only publication, verifies before/after-range rejection and exhausted ranges, and compares SQL/JS date lists. Unit tests cover derived starts, inclusive deadlines, leap-day arithmetic, site/year isolation and sequence gating. Browser tests publish all three due dates without start/end inputs and exercise the existing PDF, review, star and matrix workflows.
