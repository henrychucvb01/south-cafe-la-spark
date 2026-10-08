# Database storage follow-up — 2026-10-08

The earlier archive cleanup was already deployed. Its 30,065 deleted redundant/
unrelated legacy rows were not deleted again. The raw archive remains 53,813,248
bytes (51.3 MiB); the original audit's 98.3 MiB measurement is outdated.

## Changes

- Identical imports now keep normalized row IDs and avoid delete/reinsert churn.
- Existing raw evidence no longer attempts another insert or consumes sequence IDs.
- Corrected values, externally repaired values and changed school mappings still
  apply correctly; distinct historical evidence remains intact.
- Added two indexes matching the actual batch/site/date/meal correction lookups.
  Existing indexes were retained. No schema objects or school records were removed.
- Reclaimed unused physical space in the two calculation tables using bounded,
  transactional compaction. Before/after fingerprints matched exactly.

## Verification and recovery

- Isolated SQL tests cover stable IDs/sequence values on repeat, corrections,
  remapping, cross-month/year routing, mapping exclusions, authorization and rollback.
- 40 monthly scorecard tests across 9 suites passed. The production app bundle is
  unchanged; live manager/supervisor entry and anonymous-access checks passed.
- All 36,599 production and 2,783 cost records were backed up outside Git in
  `../backups/storage-optimization-2026-10-08`. Restoring into local PostgreSQL
  reproduced exact fingerprints. Local compaction and compressed-backup round trips
  passed; SHA-256 values are in `verified-manifest.json`.
- No inbound foreign keys or noninternal triggers depend on these calculation rows.
  Query dependencies and existing indexes were inspected before adding indexes.
- A representative production lookup uses the new index: 13 matching rows, 2 shared
  hit blocks versus 325 before; observed execution 3.591 ms versus 230.089 ms.
  These are individual observations, not a throughput guarantee.
- Security advisor findings were unchanged; no permissions or policies changed.

## Data deliberately preserved

All remaining archive evidence; all monitoring PDFs (28 distinct hashes, no orphaned
documents); all 1,415 knowledge chunks (no duplicate document/locator/sequence/version
keys); all employee, meal-count, points, history, and school records. Advisory
"unused index" flags were not treated as permission to remove seasonal/report indexes.

## Size

Database: **149,818,515 → 144,968,851 bytes** including the new indexes.
Production table: 16,957,440 → 12,304,384 bytes.
Cost table: 983,040 → 745,472 bytes.
No additional historical records were deleted in this follow-up.

Rollback: restore only the merger function definition from
`20261008201844_monthly_scoped_imports.sql`; retain the harmless new indexes.
Compaction requires no data rollback because every row and ID is unchanged.
Backups can be decompressed and staged using the original table types before any
recovery; never overwrite later imports. `verify-monthly-storage-backup.cjs` is fixed
to the isolated local database and does not connect to production.
