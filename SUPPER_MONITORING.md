# Supper Monitoring

Implemented on `spark-development` using the supplied official two-page LAUSD PDF. No live migration, deployment, push, or merge to main has been performed.

## Workflow

School Dashboard and Daily Bites are the first two Manager Hub choices. The Supper Monitoring tile opens school-scoped drafts, current-year completed monitorings, and previous-year history. Ten sections cover visit information, Monday–Friday history, today's service, menu, official questions, findings/actions, comments, signatures, review, and submission. Explicit saves preserve the section and question position across sessions/devices; there is no background autosave. Revision checks prevent silent overwrites. Failed saves preserve local work and prevent navigation.

History dates are generated for the selected week. Every day requires attendance greater than meals; monitoring-date overlap, missing/invalid/duplicate dates and counts are rejected. The average is calculated. Menu fields cover all seven official categories. Questions 1–20 include 18a/18b, the form's N/A restrictions, conditional 18b, and corrective-action rules. No requires action except 18a/19; Yes to 19 requires action. Repeated findings apply to 18b No. Question 20 Yes with other findings prompts review without inventing a new prohibition.

Comments, printed names, signature dates, and both signatures are required. Each signer opens the drawing pad with Sign with Finger. Mouse/touch signatures scale for phone rotation and include explicit consent to apply to both pages. Signatures bind to a SHA-256 digest of report content; content edits clear them and the server independently checks the digest. Navigating questions does not invalidate signatures.

Preview and submission render the actual supplied template, with answers, history, menu, comments/actions, and both signatures. Submission validates saved data on the server, verifies the template hash, renders successfully, then atomically saves private PDF bytes and locks the record. Completed and previous records are read-only and download the stored original bytes. Interrupted submission responses can safely be retried.

## Official template and rendering

`public/supper-monitoring-2022-09-08.pdf` is byte-for-byte the user-supplied file; SHA-256:
`46a38e329dde0f31e3d70d5e66ebeb161062be5f0fa2da3f1de789b65359e876`.

The file name is dated 2022-09-08; its printed revision is 9-5-2019. Template version: `lausd-supper-2022-09-08`. Official wording/options are in `officialForm.js`; coordinate mappings are in `pdf.js`. The source has ambiguous duplicate widget names, so rendering preserves blank widget appearances and places measured content at verified coordinates, then removes interactive fields. It does not substitute a new report design. The AFSS-only area remains blank.

Reports remain two pages. Excess text produces a section-specific correction message instead of truncation or extra pages. Standard PDF font encoding supports Latin text; unsupported characters produce an explicit correction message. Long noncompliance/actions and comments must fit the official space. Preview before submission is available.

## Authorization and storage

Existing SPARK login does not create a Supabase Auth session. This tool reuses the existing in-memory SPARK sign-in without a second PIN prompt, verifies the active employee-school assignment, and issues a random two-hour token held in component memory. Only its hash is stored. Covering access follows the existing temporary-PIN model, scoped to the selected school. Every record operation rechecks expiry and assignment. Ten attempts per school/identity per 15 minutes are allowed; old attempts/sessions are pruned.

`202609230001_supper_monitoring.sql` adds:
- `supper_monitorings`: school, creator/role, versioned payload, year/date, section, revision, draft/completed state, timestamps, template/PDF metadata, optional replacement relationship.
- `supper_monitoring_sessions` and `supper_monitoring_attempts`.
- Session, list, get, save RPCs with school authorization and optimistic revisions. Direct anonymous/authenticated table access is revoked and RLS enabled.

`202609230002_supper_monitoring_reports.sql` adds:
- `supper_monitoring_documents`: private PDF bytes/hash, linked to the monitoring record.
- Service-role-only finalization and retrieval RPCs. Finalization checks scope, revision, template, PDF integrity and size, and commits document plus completed status together. Direct client submission is rejected.

Private database byte storage deliberately provides transactional completion without public links or orphaned uploads. A later storage-bucket implementation must preserve these guarantees. The server accepts a saved record ID/revision, never a client-supplied report payload or PDF.

## Deployment steps and assumptions

1. Verify the development project's bigint `locations`/`employees` IDs, active/assignment columns, and existing `verify_manager_pin(text,text)` and `verify_covering_pin(text)` functions. Repository patterns informed these assumptions; the live schema was not changed.
2. Apply both migrations in order to the intended development project.
3. Configure server-only `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL`. Never expose the service key through a `REACT_APP_` variable. Missing credentials keep drafts available and return a clear setup error on report operations.
4. Deploy the React build with `api/supper-monitoring.js` as a Node server function. `vercel.json` bundles the exact PDF template. Static-only hosting needs an equivalent server route at `/api/supper-monitoring`.
5. Verify real PIN identities, school separation, two-device resumption, submission and PDF retrieval in development before production rollout.

School year is July–June. Follow-up requires a selected date, a count of 1–60 operating days, and explicit confirmation against the school's operating calendar. SPARK does not yet calculate that count from a district calendar. This is an attested check, not an automated calendar calculation.

Phone-signature QR handoff is not part of the requested workflow. There is no QR or separate-phone option; signing takes place directly on the device running SPARK. Supervisor dashboards, scheduling rules, corrections/replacements UI, combined exports and template administration remain outside this implementation; role/year/version/replacement fields support later work.

## Files

- Integration: `src/App.js`, `src/pages/HomeBase.js` (Manager Hub, not Manager Resources).
- Feature: `src/supperMonitoring/` UI, model, official wording, signatures, persistence, PDF rendering, styles and tests.
- Server: `api/supper-monitoring.js`, `vercel.json`, official PDF under `public/`.
- Schema: the two `supabase/migrations/20260923000*_supper_monitoring*.sql` files.
- Verification: `scripts/test-supper-monitoring-{db,browser,report}.mjs`, `scripts/supper-monitoring-fixture.mjs`.
- Dependencies/scripts: `package.json`, `package-lock.json`; `.gitignore` excludes local QA artifacts.

## Verification

```sh
npm run build
npm test -- --watchAll=false --runInBand --testMatch '**/src/**/*.test.js'
npm run test:supper-db
npm run test:supper-report
npm run test:supper-browser
npm run test:ask-spark-route
npm run test:ar-training-bank
```

The explicit Jest pattern works around Windows path separators. Browser checks require installed Chrome (or `SPARK_TEST_BROWSER=msedge`) and a production build. They block live backend traffic and use synthetic records with the real report handler. Database checks use ephemeral PGlite, two synthetic schools and test PIN verifiers. Report checks cover both findings/no-findings PDFs, two-page/static output, signatures, overflow, altered-content rejection, revision/auth failures, preview, submission retries and byte-identical retrieval. Rendered PDF pages and desktop/phone screenshots are inspected locally under ignored `test-results/`.

Live deployment, real multi-device persistence and the district operating calendar remain rollout checks, not claimed test results.
