# Supper Monitoring — implementation status

## Release status: draft preparation only

The requested official blank two-page LAUSD Supper Program Monitoring Report was not present in the attachment, project sources, or repository. The attachment contained the specification only. The exact questions, permitted N/A responses, question 18b's condition, question 20 guidance, page-2 fields, PDF coordinates, and signature locations therefore remain unverified.

**This is not a complete operational submission system.** The Manager Hub entry and draft preparation are implemented; final questions, PDF generation, and submission remain blocked on the official form. Both the UI and database refuse submission. Do not enable submission by merely setting `OFFICIAL_FORM.ready`: server validation and official PDF persistence must be implemented first.

The migration is committed for review and tested locally. It has **not** been applied to a live database. No deployment or merge to main was performed.

## Architecture inspected

- `src/pages/HomeBase.js` provides the Manager Tools hub. The new tile is here, not in Manager Resources.
- `src/App.js` uses state-based navigation. Only the new import, callback, and route are added.
- Existing manager login calls `has_manager_pin`, `verify_manager_pin`, and `verify_covering_pin`. It does not establish a Supabase Auth session. The feature therefore performs its own PIN re-verification and exchanges it for an opaque, school-scoped, two-hour token held only in component memory.
- Existing pages select employees through `employees.location_id`. Normal manager access checks both an active employee-school assignment and the existing PIN verifier. Covering managers use SPARK's existing temporary-PIN permission model, scoped to the selected school in the issued token.
- Existing migrations use security-definer RPCs and revoke direct table access. The new migration follows that pattern without changing existing permissions.
- The application has `pdf-lib` and a field-based Incident Record generator. That PDF and its mappings are unrelated to this report and are not reused as a substitute template.
- No reusable saved-draft, signature, or QR session component was found. The new component stores normalized signature strokes that preserve their shape across resize and rotation.

## Implemented

- Manager Hub tile and Supper Monitoring home with separate drafts, current-school-year completed monitorings, and previous-school-year monitorings.
- School-authorized server reads and writes; completed records are read-only. No public table access or school selection within the feature.
- Ten-section responsive interview shell, progress navigation, explicit Save Draft, Save & Continue, and Save & Return. Saves preserve the current section for another session/device. There is no background autosave.
- Optimistic revision checks prevent silent overwrites between sessions. Failed saves retain the in-memory draft and prevent navigation. PIN expiry can be recovered in place. The user can explicitly discard unsaved changes and reload a saved record after a conflict.
- One-screen Monday–Friday history, automatic dates, count average, invalid/duplicate/date-overlap checks, missing-value checks, and strict daily attendance greater than meal count. Counts are never silently adjusted. Changing weeks retains values only for matching dates.
- Monitoring/service information, seven specified menu categories with applicability, and required item/serving fields.
- Questionnaire renderer contract supporting official wording, allowed answer choices, tips, and conditional questions. The production questionnaire is intentionally empty pending the form.
- Corrective-action logic from the supplied specification: No requires action except 18a/19; Yes to 19 requires action. Conditional 18b details use a form-defined condition, not an assumed compliance rule. The synthetic test questionnaire is **not** official content.
- Corrective-action, training/communication, action date, follow-up plan/due date, and completed follow-up fields. The 60-operating-day rule is displayed; no inaccurate calendar-day conversion is used.
- Required comments and an optional “No Findings” shortcut; required printed names, dates, accepted signatures, and explicit both-page signature consent.
- Reusable mouse/touch signature pad, Clear/Accept, landscape expansion, normalized strokes, and acceptance metadata. Changing report content invalidates accepted signatures. No signature-only public link is issued.
- Clickable final-review sections and a hard submission gate while the official form is unavailable.

## Database changes

`supabase/migrations/202609230001_supper_monitoring.sql` adds:

- `supper_monitorings`: school/creator, manager-or-supervisor role, school year/date, draft/completed status, resumable section, JSON versioned payload, revision, timestamps, template version, reserved PDF storage path/hash, and optional replacement relationship.
- `supper_monitoring_sessions`: hashed random tokens scoped to one school and signer identity, with a two-hour expiry. Raw tokens and PINs are not stored.
- `supper_monitoring_attempts`: per-school/identity rate limiting (ten attempts per 15 minutes). Expired sessions and attempts older than one day are pruned during session opening.
- RPCs for opening/closing a session, listing/loading records, revision-checked draft saving, and fail-closed submission. Internal session validation is not publicly executable. Access is rechecked on every request, including active employee assignment.
- Draft shape/size checks protect resumability. Completion validation is intentionally **not** presented as implemented: the submission RPC always rejects until the official form work is done.

Before applying to SPARK, verify the target project's `locations` and `employees` bigint key types and existing verifier signatures against the migration. The repository's client calls and migrations informed these assumptions; the live database was not changed.

## Required next work

1. Obtain the exact blank official PDF, verify both pages, and version the template. Transcribe questions 1–20 exactly, including 18a/18b/19/20 guidance, N/A eligibility, and the precise 18b condition.
2. Reconcile every collected field and applicability requirement with that revision, including page-2 follow-up/signature requirements. Verify school-year boundaries and the operating-day calendar with the program owner.
3. Implement server-side final validation, including operating-day follow-up deadlines and accepted signatures bound to the final record revision.
4. Use the existing `pdf-lib` dependency to populate the actual official form. Visually verify both pages with long comments, corrective actions, all answer options, signatures, and overflow cases. Never generate a replacement SPARK layout.
5. Add private PDF storage and authorized retrieval. Generate/store the PDF before atomically marking a record completed; preserve its template version and hash. Prevent orphaned/partial completions and duplicate submissions on retry.
6. Apply and verify the migration in a development database, then test real multi-device draft resumption under SPARK's actual PIN and school assignments.
7. Optional next phase: separate phone-signature sessions with hashed high-entropy random tokens, short expiry, one monitoring/signer/content-revision scope, minimal public context, atomic single-use consumption, and desktop completion polling. Do not reuse manager-session tokens or expose complete records. The current disabled phone option creates no public link.

Supervisor dashboards, three-monitoring scheduling, prohibited date combinations, uploads/review, correction workflows, combined exports, archives, and template management remain out of scope.

## Assumptions

- School year is July 1–June 30, formatted `YYYY-YY`; confirm against SPARK's program reporting convention.
- Any selected date chooses its surrounding Monday–Friday week, with generated dates shown for confirmation. No count is reassigned to another date.
- An active employee's existing school assignment authorizes that school's drafts/history. Covering access follows the existing shared temporary-PIN model.
- Blank/incomplete drafts are allowed. Final submission must not be allowed until the exact form and completion checks are verified.

## Files changed

- Integration: `src/App.js`, `src/pages/HomeBase.js`.
- Feature: `src/supperMonitoring/SupperMonitoringPage.js`, `SignaturePad.js`, `model.js`, `service.js`, `supperMonitoring.css`.
- Unit/component tests: `src/supperMonitoring/model.test.js`, `service.test.js`, `SupperMonitoringPage.test.js`.
- Database: `supabase/migrations/202609230001_supper_monitoring.sql`.
- Test tooling: `scripts/test-supper-monitoring-db.mjs`, `scripts/test-supper-monitoring-browser.mjs`, `package.json`, `package-lock.json`, `.gitignore`.
- Handoff: this file.

## Verification

Commands:

```sh
npm run build
npm test -- --watchAll=false --runInBand --testMatch '**/src/**/*.test.js'
npm run test:supper-db
npm run test:supper-browser
npm run test:ask-spark-route
npm run test:ar-training-bank
```

The explicit Jest pattern works around mixed path separators in this Windows workspace. The browser check requires a local Chrome installation (or `SPARK_TEST_BROWSER=msedge`) and an existing production build. It mocks every backend call, blocks other external requests, and writes screenshots under ignored `test-results/supper-monitoring/`. Database tests run in temporary PGlite PostgreSQL with synthetic PIN verifiers and two schools; no live data is read or written.

Verified: build; unit/component suite; SQL migration and access denial; PIN throttling; expiry/revocation; school isolation; saved-section resumption; failed-save retention; revision conflicts; completed-record immutability; official-template submission gate; existing Ask SPARK and 500-question training-bank checks; browser login and Manager Hub navigation; desktop/mobile layout and history validation; mouse/touch signatures and landscape resizing; final-review navigation. Mobile screenshots are also inspected for overlap, beyond the automated overflow check.

Not verified: real database deployment, real cross-device persistence, actual official question wording/mapping, operating-day calendar calculations, final submission/PDF creation or storage, or phone handoff. These are remaining work, not passed checks.
