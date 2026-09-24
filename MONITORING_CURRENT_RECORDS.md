# Monitoring: current records and shared types

Work is restricted to spark-development. No live migration, push or deployment is performed in this implementation step.

## Required migration

Apply `supabase/migrations/202609240004_monitoring_current_records.sql` after migrations 1–5 and before deploying these application changes.

This migration intentionally removes Monitoring-only change events, previous PDF copies/reviews, and records already marked deleted. It retains all current records, dates, identities, current PDFs, final accepted/completed records from past school years, and the latest markup for the current PDF. It leaves unrelated application audit storage untouched.

The migration renames the shared physical tables to `monitoring_records`, `monitoring_documents`, `monitoring_pdf_review`, and `monitoring_settings`. Existing permission-scoped RPC names are retained as compatibility adapters; none of those shared storage tables imposes a Supper-only record type. Supper draft validation and official PDF generation remain Supper-specific by design.

## Current record behavior

- One current PDF per monitoring; replacement overwrites the stored PDF atomically and clears obsolete location markup. Current correction instructions remain available.
- One current review/markup row per record; saving comments replaces that row instead of appending events.
- Authorized Supervisor deletion removes the record, PDF and markup with cascading foreign keys. No deleted archive or change log remains.
- Accepted/Completed records remain locked. Even a Supervisor must intentionally unlock before replacing their PDF or editing comments.
- Supper draft restart retains the record identity, clears its answers/signatures, and removes the abandoned PDF/markup.
- Completed/Accepted records from other school years remain available under Previous Monitorings. Drafts from other years remain accessible by selecting their school year.
- `revision` and `document_version` remain concurrency tokens to reject stale saves and markup. They do not retain prior data or offer version browsing.

## Monitoring types and sites

Structured types are breakfast, lunch, supper and snack. All can store existing PDFs and use the shared status, review, lock, school/site and numbering architecture. Only Supper's guided workflow is enabled; no questions or frequency rules were invented for the other types.

Supper sequence:
1. Supper 1 - [Site]: Manager
2. Supper 2 - [Site]: Supervisor / AFSS
3. Supper 3 - [Site]: Manager

Other types have a structured positive monitoring number, without a three-monitoring limit, prescribed frequency or assigned sequence. Supervisor existing-PDF entry records the actual performer role. The unique assignment is school + site + type + school year + monitoring number. Main Site, Offsite, EEC and other programs all use the same scoped site model.

The shared endpoint is `/api/monitoring`; the old URL remains a compatibility adapter. Both Vercel function routes package the Supper template for the existing guided renderer. The Supervisor route now uses `src/monitoring/SupervisorMonitoringPage.js`.

## Validation

- PASS: 26 unit suites / 121 tests, including the additional Supper-only sequence test.
- PASS: final build (`main.c30bb5e2.js`); existing bundle-size advisory remains.
- PASS: isolated migration retention test verifies exact current PDF bytes, previous-year accepted/completed records, latest current markup, cleanup of deleted records/obsolete copies, and an unrelated audit-table sentinel.
- PASS: real API + isolated SQL review suite verifies all four types, multiple sites, numbers beyond three for non-Supper types, current-only replacement, delete cascade, permissions, status transitions and locked-record protection.
- PASS: existing official PDF/API and database/security regression checks.
- PASS: desktop/mobile and Supervisor browser tests cover Manager and Supervisor workflows, markup/return/replace/accept, disabled unbuilt guided types, Snack upload/review, and existing Supper signing/final review.

## Files

- New migration: `supabase/migrations/202609240004_monitoring_current_records.sql`.
- Shared API: `api/monitoring.js`, compatibility `api/supper-monitoring.js`, `vercel.json`.
- Shared routing/type UI: `src/App.js`, `src/monitoring/MonitoringPage.js`, `SupervisorMonitoringPage.js`, `types.js`; old Supper-specific Supervisor page path removed.
- Record/review/upload screens: `src/supperMonitoring/MonitoringHome.js`, `PdfReviewWorkspace.js`, `SupervisorExistingUpload.js`, `SupperMonitoringPage.js`, `workflow.js`, `service.js`.
- Tests: monitoring type tests, Supper review/API and browser suites, `scripts/test-monitoring-retention-migration.mjs`.
- Documentation: this file and the supersession note in `SUPPER_MONITORING.md`.
