# Supper Monitoring

Development-only expansion of the existing guided tool. Manager Hub still places School Dashboard and Daily Bites first; Supper Monitoring remains a tool and opens with the existing sign-in, without another PIN prompt. Command Center now links to Supervisor Supper Monitoring. No unrelated scoring, analytics, games, staffing or scorecard logic is changed.

## Manager and Supervisor workflows

The school home combines uploaded and SPARK-generated monitorings in Drafts / In Progress, Submitted / Awaiting Review, Corrections Requested, Completed / Accepted, and Previous Monitorings. A selected school year tracks two Manager slots and one Supervisor/AFSS slot. A database unique index prevents duplicate active slots, including concurrent creation. Deleted records release their slots; their documents and audit remain available to supervisors. Legacy records beyond the three slots remain in history with “Slot needs assignment.”

**Temporary upload:** Allow Manager PDF Uploads defaults ON. Managers can pick or drop an existing PDF and supply monitoring date, school year, slot and monitor name. School is fixed by authorization and the name is prefilled from sign-in. Only unencrypted PDFs of 1–20 pages and at most 2 MB are accepted. The server validates format and bounds, not document correctness; supervisors review content manually. The original bytes are preserved.

**Review:** Manager uploads and guided submissions enter Submitted for Review. Supervisors can download the PDF, comment, Return for Correction (comment required), or Accept. A returned uploaded document can be replaced on the same record, then explicitly resubmitted. Replacement before acceptance also returns the upload to the correction state until resubmitted. Comments appear prominently in manager history and the record. Accept sets Accepted / Locked. Managers cannot edit, delete, unlock or replace accepted records. Manager edit rights are restricted to their own records; same-school historical viewing is allowed.

**Supervisor controls:** Accept, comments, Return, Unlock for Correction, Replace PDF, Delete Monitoring, View Audit History, download old document versions, and Allow Manager PDF Uploads. Unlock returns the record to Corrections Requested. Replacing an accepted PDF as Supervisor preserves its lock and previous versions. Delete is a soft deletion requiring a reason, never permanent loss of the audit or PDFs. The overview filters authorized school, school year, status and performed-by role.

**Upload OFF:** Prevents only NEW manager uploads, both in the UI and server. Existing history, accepted records, PDF downloads and replacements/resubmissions of existing uploaded monitorings remain available. Guided Start New Monitoring remains available when a manager slot is free. The server rechecks the setting even if a browser has a stale screen.

**Supervisor monitoring:** Select a school in the overview, then Start Supervisor Monitoring. It uses the SAME ten-section guided component as managers, including the five-day history, questions, corrective actions, signatures and official PDF renderer. Role comes from the verified session, not client metadata. Supervisor submission becomes Completed / Locked immediately, with no self-approval. The official page 2 monitor checkbox marks AFSS instead of FSM. Supervisors can unlock their own generated report for correction and submit it again.

## Preserved guided behavior and official PDF

Explicit saves preserve section and question position across devices. Revision checks prevent silent overwrites; failed saves preserve local work. Monday–Friday dates are generated from one selected week. Every day requires attendance greater than meals; missing/invalid/repeated dates, count errors and overlap with monitoring date are rejected. Five-day average is calculated on the same screen.

All seven menu categories and official questions 1–20 remain, including conditional 18b, 18a/19 exceptions, repeated findings, corrective action and 20 guidance. Follow-up requires a date, 1–60 operating days and school-calendar confirmation; SPARK does not yet calculate district operating days. No scheduling matrix is introduced.

Sign with Finger opens the existing mouse/touch canvas with Clear/Accept and explicit consent for both pages. The accepted signature is bound to a content hash; report edits and a return/unlock of a generated report clear signatures. Resubmission requires both people to sign the revised content. No QR workflow is present.

`public/supper-monitoring-2022-09-08.pdf` is the exact supplied template, SHA-256 `46a38e329dde0f31e3d70d5e66ebeb161062be5f0fa2da3f1de789b65359e876`, template version `lausd-supper-2022-09-08`. It prints revision 9-5-2019. Reports stay two pages. The renderer preserves original appearances, overlays measured content/signatures and removes interactive fields. Text overflow and unsupported characters cause a correction message, not truncation. The bottom AFSS-only corrective-review area remains blank; supervisor workflow comments are stored in SPARK rather than silently modifying an uploaded original.

## Supervisor PDF review workspace and upload on behalf

Supervisor Command Center → Supper Monitoring contains a Submitted for Review queue with school, slot, monitoring date, submitted-by name, submission date, status and Review. The queue uses the selected school/year. Review opens a dedicated Supervisor PDF Review workspace directly from the Command Center. Every action uses the existing Supervisor PIN/session; no Manager PIN, Manager sign-in, account switching or impersonation is used.

The workspace embeds Mozilla PDF.js, served locally by SPARK (no external PDF viewer). It supports page selection/previous/next, scrolling, zoom, general Supervisor comments, numbered location comments, mouse/touch freehand drawing, undo/remove marks, Save Comments & Markup, Return for Correction, and Accept & Lock. Return requires a general explanation. Saving markup and a return/accept transition is one database transaction; stale record/PDF revisions are rejected and unsaved work remains visible after a failed request. Locked records/review markup are read-only until unlocked. The official uploaded or generated PDF bytes are never altered by review marks.

Managers have View PDF & Supervisor Markup in their school's history. They can navigate/zoom and read comments/drawings but cannot author or change Supervisor markup. Every review is tied to an immutable document version. After replacement, prior markup stays available with the previous reviewed PDF through the version selector; it is never moved onto a different PDF. Reviews are append-only snapshots, and audit events identify when markup was saved. This task does not export a flattened annotated PDF; original/corrected documents and their markup remain separate and are viewed together in SPARK.

Upload Existing Monitoring on the Supervisor overview is a separate action from Start Supervisor Monitoring. It asks for an authorized school, year, Manager #1/#2 slot, date, Manager/monitor name, optional responsible Manager and PDF. The school-scoped Supervisor session creates a Manager-role record in Submitted for Review, with Supervisor uploader identity and an explicit uploaded-on-behalf audit event. It cannot occupy the Supervisor/AFSS slot. Start Supervisor Monitoring continues to use the guided AFSS workflow and completes without self-approval.

Selecting a responsible Manager permits that assigned Manager to replace/resubmit corrections. Leaving the assignment as “Any authorized Manager at this school” permits school-authorized Managers, including covering access under SPARK's existing rules, to correct the upload. Other-school access is always rejected. Printed monitor identity is distinct from the Supervisor uploader identity. Upload OFF continues to block only new Manager uploads; authorized Supervisor uploads on behalf remain available.

## Schema, storage and permissions

The first three Supper migrations establish the guided/upload/review workflow. The additional `202609240002_supper_pdf_review_workspace.sql` adds the PDF review workspace:

- Extends `supper_monitorings` with source, structured slot, lock state, review comments, acceptance/deletion timestamps and current document version. Existing school ID (`location_id`), date, year, monitor role, creator, submission time and revision remain. Status supports draft, submitted, corrections_requested, accepted, completed and deleted. Legacy manager completions become submitted for review; legacy supervisor completions stay completed/locked. Available legacy slots are backfilled without dropping excess records.
- Extends the existing short-lived monitoring sessions with verified actor role.
- Adds singleton `supper_monitoring_settings`, default uploads ON.
- Extends private database PDF storage with `supper_monitoring_document_versions`, preserving every original/replacement and SHA-256. `supper_monitoring_documents` continues to hold the current bytes; there is no public bucket/link. PDF and record transitions commit atomically.
- Adds `supper_monitoring_events` for uploads, submissions/resubmissions, returns, comments, acceptance, unlock, replacement, soft deletion and upload-setting changes. Events hold time, actor name/role/employee ID, old/new status, comment, document version and structured metadata snapshot. Record audit is visible to supervisors; setting-change events are retained administratively.
- Adds Supervisor overview/session, setting, context, review, upload and version-retrieval RPCs. Direct anonymous/authenticated table access is revoked with RLS enabled. Upload, PDF finalization and PDF retrieval require the server service role. Public RPCs independently validate session, school, creator, role, lock, revision and applicable state transitions.

The fourth migration adds `uploaded_on_behalf`, optional `manager_employee_id`, `submitted_by_name` and `submitted_by_role` to existing monitoring records. It adds private `supper_pdf_reviews` with immutable review snapshots, normalized page coordinates, page count, comments, actor and document-version foreign key. New school-manager lookup and scoped review-read RPCs reuse existing authorization. Only the server service role can execute the review-write RPC, and it independently checks Supervisor role, school, lock state, revision, annotation types/pages/coordinates and size. The report API derives page count from the stored PDF, never a browser claim. Markup is limited to 200 marks, 1000 points per stroke and 500 KB; individual location comments are limited to 2000 characters. Managers can read historical PDFs only when those versions have Supervisor reviews; Supervisor audit access to all versions is unchanged.

SPARK currently verifies supervisors using a shared Supervisor PIN with global active-school authorization. This feature follows that existing Command Center pattern; it does not invent school assignments or a parallel account system. Supervisor audit identity is therefore the shared “Supervisor / AFSS” role, not a proven individual identity. Printed monitor name is independently required for reports. Individual supervisor identities/school scopes would require an existing-auth upgrade outside this task. Manager/covering sessions follow existing PIN/assignment rules and expire after two hours. Tokens stay in component memory and only hashes are stored; PINs are not put in persistent browser storage. Session operations recheck active school and manager assignment; supervisor PIN rotation does not revoke an already issued two-hour session.

## Development setup and deployment

No live database migration or production deployment is performed by these changes. Before using the expansion in a live development environment:

1. Confirm `locations` and `employees` bigint IDs/active fields and existing `verify_manager_pin(text,text)`, `verify_covering_pin(text)`, and `verify_supervisor_pin(text)` functions in the intended development database.
2. Apply all four Supper Monitoring migrations in chronological order. If the first three are already installed, apply ONLY `202609240002_supper_pdf_review_workspace.sql`; do not rerun the earlier migrations.
3. Configure server-only `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL`. Never use a `REACT_APP_` service key. Deploy React plus `/api/supper-monitoring` as the existing Vercel Node function; `vercel.json` includes the verified template. The UI alone cannot persist without the migrations.
4. Verify real development identities, school scope, original PDF download, mobile signing and two-device draft resumption before any later production rollout.

No AI/OCR, combined export, OneDrive integration, district upload or future-date scheduling matrix is included.

## Files and verification

Integration: `src/App.js`, `src/pages/CommandCenterLegacy.js`. Existing Manager Hub ordering is unchanged. Shared editor and services: `src/supperMonitoring/`; new `MonitoringHome.js`, `SupervisorSupperMonitoringPage.js`, `workflow.js`. Server: `api/supper-monitoring.js`. Schema: the new review migration above. Tests/scripts: `scripts/test-supper-monitoring-{db,report,browser,review,review-browser}.mjs` and feature unit tests. PDF.js is pinned to `pdfjs-dist@6.3.289`. The prebuild/prestart step copies its viewer, worker, font, CMap and WASM assets into ignored `public/pdfjs/`, then the normal React build serves them locally. Use Node 22.13+ or 24+ when installing/building. Original PDF rendering remains on the existing pdf-lib implementation.

Run:

```sh
npm test -- --watchAll=false --runInBand --testMatch '**/src/**/*.test.js'
npm run build
npm run test:supper-db
npm run test:supper-report
npm run test:supper-review
npm run test:supper-browser
npm run test:supper-review-browser
npm run test:ar-training-bank
npm run test:ask-spark-route
```

The review integration test runs all migrations in isolated PGlite and uses the real report handler with real authorization RPCs. It checks the correction/lock cycle, revisions, cross-school/creator/role denial, OFF behavior, exact original download, preserved versions, audit, deletion, duplicate slots, guided manager resubmission and Supervisor immediate completion. The review browser test drives the built app through Manager Hub and Command Center using the same isolated SQL backend, never live credentials. Existing browser coverage checks desktop/mobile history, save/resume, mouse/touch signatures, PDF submission/download and preserved Manager Hub routes. QA screenshots/PDFs are stored under ignored `test-results/`.

## Earlier expansion verification results

- All 24 unit-test suites passed: 109 tests, including existing SPARK regression coverage.
- The application build passed; it retains the existing bundle-size advisory.
- Original Supper database and official-report checks passed.
- New real SQL/API workflow checks passed, including upgrading legacy completed records/PDFs without losing extra records.
- Existing desktop/mobile browser checks passed: Manager Hub order/routes, five-day history, save/resume, mouse/touch signatures, landscape signing, preview, stored download and read-only history.
- The AR Training bank passed all 500-question checks.
- The unrelated Ask SPARK route test still fails because its mock does not handle Gemini model discovery. Its API and test files are identical to current `origin/main`; this inherited failure was not changed as part of Supper Monitoring.
- Final review browser checks passed against real isolated SQL/API: manager upload, Supervisor PDF download/comments/return, OFF switch, replacement and resubmission while OFF, acceptance/locked manager controls, audit, unlock, authorized-school selection, and shared Supervisor draft save/resume with Supervisor-only controls.
- Both pages of the generated Supervisor official PDF were visually inspected; AFSS is selected on page 2 and the accepted signatures appear in their original signature areas.


## Workspace upgrade verification

The real SQL/API test additionally checks Supervisor upload attribution, Manager-slot enforcement, assigned-Manager and cross-school restrictions, Supervisor upload while Manager uploads are OFF, version-bound review storage, normalized drawing/comment validation against actual PDF page count, atomic return/accept, stale revisions, immutable locks, and read-only Manager markup access. The browser check opens the review queue directly from Command Center and explicitly rejects any Manager authentication RPC on the Supervisor path. It exercises PDF rendering/navigation/zoom, location comments, drawing, Manager read-only review, replacement/previous-version markup, acceptance, upload on behalf and the separate guided Supervisor form.

Deployment of this upgrade requires the fourth migration before the new application build. The three migrations the user already applied remain unchanged. No live migration or production deployment is performed by this code update.

Final workspace upgrade results: all 24 unit suites (109 tests), the production build, the real isolated SQL/API review checks, official report checks, existing desktop/mobile browser checks, and the expanded review browser checks passed. The parent-page review navigation guard also passed its four targeted tests. Browser coverage verified actual PDF canvas rendering, mouse and touch drawing, version-bound markup, Supervisor upload attribution, and zero Manager authentication calls from the Supervisor session. Supervisor and mobile Manager review screenshots were visually inspected. The existing build bundle-size advisory remains.
