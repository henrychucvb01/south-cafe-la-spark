# Finish Line bonus correction — September 25, 2026

Normal timing starts September 3. All school weekdays through September 2 receive rollout credit. Preserve prior August awards, including overlapping rollout grants, and all unrelated adjustments.

Migration `202609250008_finish_line_bonus_reconciliation.sql` was applied to SPARK project `kkrcxqhfzepifhkryodd`. It added nine missing +25 weekly bonuses (225 points total): 232nd Pl, Broadacres, Carnegie, Carson El, Curtiss, Leapwood, Willenberg (September 4), and Harry Bridges (September 4 and 25). Banning HS already had its earned bonuses.

The database now awards eligible +25 full Monday–Friday weeks and +100 completed months when checklists or exclusions are saved. An hourly job also reconciles all active schools, including month ends without dashboard visits. This configuration covers the 2026–27 school year, August 12 through June 4; the opening partial week is not a full weekly period. June's partial school month is evaluated after June ends. Future school-year dates must be configured separately.

The database compares legacy and current award types by period, serializes awards per school, and inserts only a positive shortfall. Existing points are never removed. Private functions are unavailable to anonymous/authenticated API callers. The dashboard reads the latest credited bonus instead of awarding points on page load.

Validation:

- All 28 real schools: zero checklist or bonus shortages after correction; no September duplicate bonus points.
- Live reconciliation rerun: zero inserted rows.
- Actual scheduled job: succeeded September 26 at 03:26 UTC, then restored to hourly at minute 5.
- Isolated PostgreSQL tests: snapshot replay, exact 9/225 correction, preservation, repeated migration, duplicate legacy keys, Pacific timing, late checks, checklist/exclusion triggers, monthly eligibility, private functions.
- 191 application tests passed; production build passed.
- Mobile browser test: total and credited bonus visible, no client bonus writes, no runtime errors.

Repeat local checks with `node scripts/test-finish-line-bonus-db.mjs` and, after a build, `node scripts/test-finish-line-bonus-browser.mjs`. An optional read-only audit snapshot path can be passed to the database test. `node scripts/audit-finish-line-rollout.mjs` reads live data without changing points.
