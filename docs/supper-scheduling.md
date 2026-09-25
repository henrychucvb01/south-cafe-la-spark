# Supper scheduling

Supervisor Command Center → Monitorings → Supper Scheduling / Matrix publishes
one current schedule per monitored site, school year and Supper slot. Select a
school/site and Supper number, enter Available Start Date, Available End Date and
Due Date, then Publish Schedule. The overview shows all sites, their three
statuses/completed dates/due dates and the next outstanding due date. School
filtering and Open Matrix make the overview usable across many locations.

Managers see due dates and completed dates on their existing boxes. Supper 1 and
Supper 3 expose every eligible date through View available dates. The guided form
uses an eligible-date select instead of a free-form date input. Its questions,
service-time logic, signatures and PDF generation are unchanged. Supervisors see
the same calculation for Supper 2 when opening a school/site.

## Exact calculation and assumptions

- School year uses SPARK's existing July 1–June 30 definition.
- Week of month is `floor((day_of_month - 1) / 7) + 1`: days 1–7, 8–14,
  15–21, 22–28, and 29–31. This is **not** the row in a calendar grid. This
  definition was stated during implementation; the user has not yet confirmed it.
- Supper 1 has no prior slots. Supper 2 uses Supper 1. Supper 3 uses Supper 1
  and Supper 2. Only `accepted` or `completed` Supper records at the same site
  and in the same school year contribute restrictions.
- The source is the record's structured `monitoring_date`, regardless of whether
  its document was uploaded or generated. PDF contents and filenames are unused.
- Each prior date excludes its entire weekday column and week-of-month row.
  Calendar dates are enumerated inclusively from start through end; only Monday
  through Friday outside all excluded rows/columns are returned. There is no
  three-date cap or six-month rule. UTC/calendar-only arithmetic avoids DST shifts.
- Due dates are displayed deadlines, not an extra cutoff on the available window.
  All three dates must be within the selected school year; start must not exceed
  end. No holiday, closure, frequency or additional chronological-spacing rule
  was invented. Supervisors control the window.
- Missing prior completions do not create inferred restrictions or an extra
  prerequisite gate. Later acceptance/completion updates the next matrix on
  opening/refreshing the page. Returning/unlocking a prior record removes it from
  completed-date calculations until it is accepted/completed again.
- No schedule means no invented dates; the control explains that dates have not
  been scheduled. Blank drafts can still be saved. A saved date that becomes
  unavailable is shown as unavailable and must be corrected before submission.
- Existing-PDF uploads keep their historical monitoring dates and existing
  upload/review behavior. Scheduling enforcement applies to guided dates and
  submission, not retrospective PDF entry.

## Data and authorization

Apply `supabase/migrations/202609250003_supper_scheduling.sql` after the existing
migrations, including `202609250002_covering_monitoring_corrections.sql`.
No live database changes are part of the scheduling implementation.

`supper_schedules` is keyed by `(monitoring_site_id, school_year, monitoring_slot)`
and has a composite school/site foreign key. Main Site, Offsite, EEC and other
programs cannot share settings or prior dates accidentally. It stores current
start/end/due values and a revision for concurrent-edit protection, not history.

`save_supper_schedule` requires a valid Supervisor school session and a site at
that school. Managers can read their school's schedules in `supper_context` but
cannot publish or read the table directly. `supper_supervisor_overview` includes
schedules within the existing Command Center authorization scope (active schools).
This work does not introduce a new Supervisor assignment model.

The private SQL `supper_eligible_dates` calculation matches the browser engine.
A record trigger runs after the existing identity trigger and rejects new/changed
guided dates outside the published schedule, and checks eligibility again at
guided submission. Existing accepted/completed records are not rewritten.

The separately committed covering-Manager fix permits an authenticated covering
Manager to replace and resubmit an unlocked, returned, uploaded **Supper** PDF at
the same school. It does not grant edits to other schools, guided drafts or locked
records. Its migration returns the verified `covering` flag to the UI.

## Verification commands

- `npm test -- --watchAll=false --runInBand --testMatch '**/*.test.js'`
- `node scripts/test-supper-scheduling.mjs`
- `node scripts/test-supper-monitoring-db.mjs`
- `node scripts/test-supper-monitoring-report.mjs`
- `node scripts/test-supper-monitoring-review.mjs`
- `npm run build`
- `node scripts/test-supper-monitoring-review-browser.mjs`
- `node scripts/test-supper-monitoring-browser.mjs`

Tests use isolated databases and synthetic schools/PDFs. They do not change live
monitoring records. The scheduling browser suite publishes all three settings,
checks Manager dates and matrix progression, switches years/sites, and exercises
a 31-site overview at desktop/tablet widths alongside upload, correction, review,
signature, lock and draft regressions.

## Files changed

Scheduling UI/calculation:
`src/monitoring/SupperScheduling.js`, `SupperScheduleDetails.js`,
`ScheduledMonitoringDate.js`, `supperSchedule.js`, `SupervisorMonitoringPage.js`.

Integration:
`src/App.js`, `src/pages/CommandCenterLegacy.js`,
`src/supperMonitoring/MonitoringHome.js`, `SupperMonitoringPage.js`,
`GuidedSections.js`, `service.js`, `supperMonitoring.css`.

Scheduling schema:
`supabase/migrations/202609250003_supper_scheduling.sql`.

Verification:
`src/monitoring/supperSchedule.test.js`,
`src/supperMonitoring/SupperMonitoringPage.test.js`,
`scripts/test-supper-scheduling.mjs`,
`scripts/test-supper-monitoring-browser.mjs`,
`scripts/test-supper-monitoring-review-browser.mjs`, and this document.

The isolated covering-Manager fix additionally changes
`src/supperMonitoring/workflow.js`, `src/monitoring/CoveringCorrections.test.js`,
`scripts/test-supper-monitoring-review.mjs`, and
`supabase/migrations/202609250002_covering_monitoring_corrections.sql`, with its
button text in `MonitoringHome.js` and browser regression in the shared review
browser script.
