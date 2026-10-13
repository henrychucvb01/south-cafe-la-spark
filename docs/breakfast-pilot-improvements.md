# Breakfast pilot release

Scope: Breakfast only, main. No monitoring-development merge, PIN changes, deleted records, QR replacements, or rollout changes.

## Release order
1. Apply `20261013220405_breakfast_pilot_improvements.sql` (nullable columns and compatible RPC additions). Existing UI remains operational during the deployment.
2. Apply `20261013222842_breakfast_pilot_teacher_return_review.sql` so manager review also accepts signed teacher returns. Publish and verify the application on main.
3. Apply `20261013222120_breakfast_pilot_require_signed_submissions.sql` to close legacy unsigned/free-text submission endpoints. Old open tabs must refresh.
4. Compare existing record, rollout and QR fingerprints and verify live RPC permissions.

## Data handling
Attendance is distinct from meals. Teacher returns are stored with the signature and immutable menu snapshot. Reports use teacher counts when available, otherwise historical worker counts; they never add both. Worker records remain intact. Missing delivery quantities do not produce percentages. CSV includes per-date totals and classroom breakdown. Historical records with no attendance/signature remain blank on the district form.

Preorders retain names and per-item quantities in a snapshot, while maintaining the existing manager summary. The existing maximum combined preorder quantity remains 1,000. The district form has three entree columns; a fourth special-diet option shares the final column, with matching quantities in the same order.

## Verification
- 383 React/unit tests passed before final polish; affected tests rerun afterward.
- Isolated native PostgreSQL tests: attendance, signature validation, returns, duplicate/stale requests, exact menu preorders, supervisor reports, school isolation, QR rollout gating, copy confirmation and closed legacy permissions.
- Local HTTP regression: regular/covering/supervisor authentication, packing/returns, adult meal, preorders, dashboard, Finish Line totals, rollout preservation and release recovery.
- Desktop and mobile browser checks, including actual touch input, signature invalidation and next-menu preorder.
- District PDF field assertions and rendered visual review; QR layout and page-count tests.
- Production build passed. No tests write to production school records.

## Recovery
Before activation, `breakfast-pilot-rollback.sql` restores the prior page/menu functions and legacy endpoint permissions without dropping any data or columns. It refuses to run if signed data or new item preorders exist. After activation, preserve the v2 application and repair forward; do not downgrade to a client that cannot preserve collected signatures. Additive schema may safely remain installed if application publishing fails.
