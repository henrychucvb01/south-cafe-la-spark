# Monitoring guided workflow fixes — 2026-09-24

Scope: spark-development only. No migration required. No push or deployment performed for this change.

## Signature root cause and fix

The UI correctly stored both Manager and Supervisor/AFSS monitor signatures in `signatures.monitor`. The actual loss of state occurred in the generic change handler: entering the second signer's printed name erased BOTH accepted signatures. The report hash also included both names, so simply retaining the first signature would still fail server validation. The validator's hard-coded Manager label made that state loss look like a role mismatch.

Guided version 3 gives each signer independent printed-name validation. Each accepted signature remains bound to the common report content; the signer's own printed name is checked against their signature. Changing one printed name clears only that signer's signature. Changing substantive report content still clears both. Supervisor errors now identify Supervisor / AFSS, with no additional Manager signature required. The server continues checking strokes, date, acceptance, consent to both pages, printed name, and the content digest. Existing role-specific PDF locations are unchanged.

Signature date defaults to today, remains editable before acceptance, and persists with the signature. One Accept Signature action records the signature and explicit consent for both pages; a Signature Complete status appears afterward. No repeated confirmation is needed after navigation or resume.

Editable older drafts upgrade to the new service-time and signature-binding rules and require renewed signatures, with an explanatory notice. Submitted, accepted and completed records and stored historical PDFs are not rewritten.

## Service times and history

Every service row calculates and stores end = start + 30 minutes. End is read-only and immediately recalculates. Server validation rejects inconsistent ends and independently uses the calculated end for strict arrival-before/departure-after checks on all services selected for the monitoring day. Each coverage error identifies the program and required time. Overnight service windows remain unsupported by the existing same-day workflow.

Repeated-count warning: a complete, positive five-day history is flagged when at least four values in either column are identical, or both columns vary by at most one. The user may explicitly confirm I Verified These Numbers and continue. Confirmation is tied to the five dates and both count columns, so changed values require another review. Zero meals, attendance below meals, and the independent equal-attendance confirmation remain enforced.

The shared average function uses Math.round. Both the UI and official PDF use that same whole number without decimals.

## Step 10

Step 10 fetches the official PDF from the server for the current saved record revision. It uses the existing PDF.js viewer with page navigation, zoom and internal scrolling on desktop/mobile. Missing requirements appear as a deduplicated list of links back to their sections. Submit remains disabled until requirements pass and the PDF renders. Old requests are cancelled logically when a newer revision is requested; failed requests can be retried. The separate Preview Official PDF download action is removed; completed/history downloads remain available.

The renderer uses stable template metadata so generating the same saved report produces exactly the same bytes for preview and submission. The authorized site name is included in the existing page-two comments area. The original template and signature locations are preserved. Revision checks prevent submitting a draft changed by another session.

## Files changed

- api/supper-monitoring.js — pass authorized site identity to the report renderer.
- src/supperMonitoring/model.js — calculated end, repeated-history verification, integer average, independent signature invalidation, role-aware validation, draft upgrade.
- src/supperMonitoring/officialForm.js — versioned report digest excluding independently validated signer names.
- src/supperMonitoring/GuidedSections.js — read-only calculated end and history verification warning.
- src/supperMonitoring/SignaturePad.js — default signature date and complete status.
- src/supperMonitoring/SupperMonitoringPage.js — independent signatures and embedded final review with linked validation and submit gating.
- src/supperMonitoring/FinalPdfReview.js — current-revision PDF loading, stale-response protection and retry.
- src/supperMonitoring/PdfMarkupViewer.js — render-ready notification for submit gating.
- src/supperMonitoring/service.js — fetch preview bytes without a download.
- src/supperMonitoring/pdf.js — stable PDF metadata, integer average, school/site identification.
- src/supperMonitoring/model.test.js — service, history, rounding and signer regression tests.
- src/supperMonitoring/FinalPdfReview.test.js — delayed response, newer revision and failure/retry checks.
- scripts/supper-monitoring-fixture.mjs — updated valid 30-minute/verified-history fixtures.
- scripts/test-supper-monitoring-report.mjs — exact preview/submission bytes, site/average mapping and independent signature validation.
- scripts/test-supper-monitoring-browser.mjs — desktop/mobile service/history/signature and embedded final-review checks.
- scripts/test-supper-monitoring-review-browser.mjs — real isolated SQL Supervisor signing, resume, PDF review and completed/locked submission, plus existing review/upload/site/restart checks.
- MONITORING_GUIDED_FIXES.md — this report.

## Validation

- Existing unit suite: 25 suites / 119 tests passed.
- Additional final-review regression: 1 suite / 1 test passed (26 suites / 120 tests total).
- Official report/API tests passed, including byte-identical preview/submission, both monitoring roles, site identity, whole-number average and submission rules.
- Database/security suite passed.
- All five migrations and review/API regression suite passed in isolated PGlite.
- Desktop/mobile guided browser regression passed, with mouse and touch signatures and both PDF pages.
- Supervisor/Manager browser regression using isolated real SQL passed: independent AFSS signing, save/resume, successful AFSS completion/lock, zero Manager authentication calls for Supervisor, annotation, return/replace/resubmit/accept, upload-on-behalf, multiple sites and restart.
- Build passed. Existing bundle-size advisory remains.
- Desktop AFSS and mobile final-review screenshots visually inspected.

All automated database and browser writes used isolated test data, not the live database. Live development and production were not changed during this implementation.
