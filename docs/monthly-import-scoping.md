# Monthly import storage

Districtwide production/cost CSVs remain the input. Each upload reads the current
authorized mapping scope; the server independently enforces active mappings and
explicit exclusions. Main/offsite/EEC/CSPP mappings use the same directory IDs as
existing calculations. Official meal-count imports already filter by their mappings.

The browser sends only scoped, deduplicated normalized records, retains every date,
and offers a normalized SPARK-only CSV with original filename/checksum/source row.
It no longer creates a second in-memory copy of every raw CSV row.

Identical raw evidence is reused by exact JSON comparison (the hash is only an
index accelerator). Corrected values retain distinct evidence; reverting a value
reuses its previous evidence. New evidence stores source filename/checksum.
The obsolete full-file RPC is no longer executable by client roles. Authorization,
school calculations, PINs, and school-helping workflows are unchanged.

## Historical cleanup and recovery

`scripts/prepare-monthly-archive-cleanup.cjs` is offline/local only. It requires a
complete paginated raw-row backup, before-state fingerprints and referenced-row
IDs. It restores the backup to loopback PostgreSQL and checks the exact database
fingerprint, then verifies a compressed backup round trip. It emits guarded SQL
only; it never applies a hosted cleanup itself.

Candidates are complete legacy array sections for unmapped sites, or byte-identical
duplicate sections. Ambiguous headers, any section with referenced evidence, all
mapped unique sections, and all normalized-object evidence are retained. No
production/cost calculation rows are deleted. The transaction verifies before-state
fingerprints, candidate counts and unchanged normalized tables, aborting on drift.

Recovery: verify `manifest.json`'s SHA-256 against `raw-archive.json.gz`; decompress
the JSON. Stage using `jsonb_populate_recordset` with the original five columns
(`id,batch_id,source_row_number,row_data,created_at`). Restore missing IDs with
`INSERT ... OVERRIDING SYSTEM VALUE ... ON CONFLICT(id) DO NOTHING`, never replacing
newer rows. Check conflicts on `(batch_id,source_row_number)` before restoration;
abort rather than overwrite. Existing IDs and sequence high-water marks remain valid.

## Deployment / rollback

Apply `20261008201844_monthly_scoped_imports.sql` before deploying the application;
the existing incremental client remains compatible. Local SQL tests cover repeated
and corrected uploads, all-month routing, excluded/inactive/unknown sites, offsite
and EEC inclusion, authorization and transaction rollback. UI tests cover the
download and safe CSV values. Existing application tests remain required.

Prefer application-only rollback; keep the filtering database function. If database
rollback is necessary, restore the merger definition from
`202610020002_monthly_incremental_import.sql`, leaving the new columns/index and
scope getter in place. Keep the obsolete full-file RPC revoked. This rollback
changes no school rows but temporarily restores old raw-duplication behavior.

## Verified release — 2026-10-08

- Full application suite: 341 tests passed; four additional scope/download/upload tests passed.
- Isolated PostgreSQL migration/import/recovery/compaction and API authorization checks passed.
- Manager, self-enrollment, covering-manager and supervisor browser login checks passed.
- Production build succeeded (existing bundle-size advisory remains).
- Archive backup: 145,769 rows; local restore fingerprint matched exactly; deletion and recovery exercised.
- Removed 1,480 unrelated legacy rows and 28,585 exact duplicate legacy rows.
- Retained all 36,599 production and 2,783 cost rows with unchanged fingerprints.
- Database: 199,077,011 bytes before; 149,818,515 bytes after cleanup and bounded archive compaction.
- Raw archive: 103,088,128 bytes before; 53,813,248 bytes after, including the new lookup index.
- Recoverable compressed backup and manifest are outside Git in the workspace's
  `backups/monthly-imports-2026-10-08` directory. No private report contents are committed.
