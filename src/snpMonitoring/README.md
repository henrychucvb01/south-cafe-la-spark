# SNP and EEC Snack Monitoring — Phases 1–2

Development-only delivery for Breakfast, Lunch, and EEC Snack.

## Entry and access

- Supervisor: Monitorings → SNP Monitoring → parent school → site.
- Manager/covering manager: Monitorings → SNP Monitoring → finalized results.
- Existing SPARK login and scoped monitoring sessions are reused. No new PIN process.
- Managers see finalized records for their assigned school; covering managers see their authorized covering school. Managers cannot create, change, finalize or complete follow-ups. Other SPARK helping workflows are unchanged.
- The SNP tables have RLS enabled and no anonymous/authenticated table grants. Token-authorized RPCs provide access. Finalization is a server-only transaction that stores the PDF and final status together.

## Sites

Main sites come from existing active schools. These four independently monitored sites inherit staff from the explicitly confirmed parent:

| Site | Parent |
| --- | --- |
| Dolores EEC | Dolores El |
| Wilmington Park EEC | Wilmington Park El |
| Avalon HS | Banning HS |
| Eagle Tree HS | Carson HS |

Hawthorne Academy and Peary MS are excluded. Existing monthly import mappings that incorrectly associate Dolores/Wilmington with Carson/Annalee are not used or changed. No existing school/employee assignments were modified.

## Form and persistence

- All 42 response-bearing questions/subquestions from SNP-23 are represented. Q1g, Q2 and Q3 retain their text/grade inputs. Only 1a–1f offer N/A, matching the supplied PDF.
- No compliance responses are preselected. Original triggering responses remain even for corrections completed onsite. Formal findings cannot be downgraded to minor observations.
- Follow-up dates must be within 45 calendar days. Completed onsite corrections require the action, completion date and verification. Finalizing a report does not mark open actions resolved.
- Draft writes are serialized, use revision checks, and safely retry the same UUID. Save failures retain onscreen edits and block navigation. A pending-save warning protects browser close/reload.
- Signatures bind to the canonical content hash. Editing report content clears signatures. Finalized content/PDF remain immutable; follow-up completions have separate, audited entries.
- The original four-page PDF is preserved. Malformed shared widget appearances are painted directly, avoiding generic flattening defects. Additional findings use copies of the original findings page before the district notice. Static signed PDFs have no editable form fields. The supplied original remains unchanged in `public/`.

## Verification

- `node scripts/test-snp-monitoring.mjs`: 42 trigger rules, N/A options, 45-day dates, onsite findings, signatures, PDF pages/overflow, API authorization and stale revisions.
- `scripts/test-snp-monitoring-local.sql`: transaction-rolled-back tests on **127.0.0.1:55432 / spark_security only**, including corrected parents, manager inheritance, anonymous restrictions, assigned/covering access, stale saves, retry idempotency, finalization and follow-up immutability.
- `node scripts/test-snp-browser.mjs`: synthetic backend, external requests blocked; desktop and 390px phone form completion, signatures, original PDF viewer, download, finalization and manager read-only view.
- Full application test suite and optimized build; existing Supper PDF tests.
- Physical iPhone keyboard dictation was not tested. Fields are ordinary textareas using the phone's native keyboard; no microphone permission or custom dictation feature is introduced.

## Release boundary

The migration was applied **only to the isolated local test database**. No hosted Supabase migration, main merge or production deployment is part of this phase. Hosted development still needs a separate Supabase database; existing environment guards continue to block production fallback.

For a future approved release, apply the additive migration to the target isolated database and deploy the matching application/API together. To roll back access, revert the application entry points while retaining the protected SNP tables and signed records; do not drop tables or delete monitoring history.

## Phase 2 — EEC Snack

- Dedicated EEC Snack Monitoring entry in supervisor and manager monitoring pages, using the existing login. Only supervisors edit; assigned and covering managers see finalized results.
- Uses the original two-page SNP-24 template supplied as EEC Snack Site Monitoring 2024-02-06.pdf. All 17 questions and the printed N/A choices (5, 6, 10, 11, 12) are represented. Attendance, children/adults served, capacity, area eligibility, non-area-eligible F/R/P counts, and two snack components are recorded.
- Questions 1–16 trigger findings on No. Question 17 asks whether training is necessary, so Yes requires a training plan and corrective action; No means no training is needed. This is a semantic exception to the form's blanket “any No” footnote, consistent with its actual question wording.
- The six-section editor, revision-checked autosave, signatures, follow-up audit and immutable final PDFs are shared with SNP. Snack signatures apply to pages 1 and 2, including continuation findings sheets.
- The immutable program discriminator keeps Snack and Breakfast/Lunch histories separate. EEC sites include the confirmed Dolores and Wilmington Park relationships and EECs registered under that parent through the existing Add Site / Program control. No import mappings are used or altered.
- The additive `20261013015646_eec_snack_monitoring.sql` migration was tested only on the isolated local database. No hosted project or production changes were made.
- `node scripts/test-snack-monitoring.mjs` tests form validation, findings, signatures, original PDF/overflow and API rendering. `node scripts/test-snack-browser.mjs` verifies desktop and phone-sized form completion, PDF preview, finalization and manager view. Shared local SQL tests verify permissions and separate histories.
- `node scripts/test-snack-browser.mjs --serve` starts a loopback-only synthetic preview at http://127.0.0.1:4179. It imports the actual form and PDF renderer but replaces database/login modules with sample adapters. This is a UI test preview, not a database integration test or hosted release. Entries reset when the preview restarts. It cannot access live SPARK records. Use only sample signatures and information.
- Rollback: remove the Snack entry points while retaining saved records, documents and events. Keep the additive column/functions to preserve existing history; never drop monitoring records to roll back the interface.
