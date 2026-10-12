# SNP Monitoring — Phase 1

Development-only delivery for Breakfast and Lunch. Snack is not implemented.

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
