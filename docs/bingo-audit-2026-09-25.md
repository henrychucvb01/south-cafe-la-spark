# Bingo audit — September 25, 2026

**Historical snapshot, superseded by the Bingo card-cycle update.** The amounts and rollout instructions below describe the earlier fixed card. Do not apply its old 650-point backfill. The new migration removes labor squares and calculates any unpaid rewards from current evidence while preserving paid keys. See `bingo-card-cycles.md` for current rollout instructions.

All 29 schools checked, including Test High School. Live data was read only. The after column uses the corrected rules; no new rewards have been inserted by this audit.

Fall monitoring completion means accepted, locked Manager Supper 1. Supper 3 is the later-year requirement. School card positions are unchanged except Willenberg, whose Supper goals were removed at the Supervisor’s request. Its existing rewards are preserved. Stars follow the current Supervisor recognition decision. Previously earned points are preserved.

| School | Completed squares: before → corrected | Lines: before → corrected | Unpaid reward points |
|---|---:|---:|---:|
| 186th St El | 18 → 22 | 3 → 8 | 90 |
| 232nd Pl El | 20 → 21 | 5 → 6 | 0 |
| Ambler El | 18 → 19 | 2 → 3 | 30 |
| Annalee El | 16 → 16 | 1 → 1 | 10 |
| Banning HS | 22 → 23 | 7 → 8 | 0 |
| Bonita El | 15 → 19 | 0 → 3 | 60 |
| Harry Bridges El | 16 → 19 | 1 → 4 | 70 |
| Broad El | 19 → 20 | 3 → 4 | 40 |
| Broadacres El | 14 → 15 | 0 → 1 | 10 |
| Carnegie MS | 18 → 23 | 3 → 8 | 90 |
| Caroldale LC | 16 → 18 | 1 → 2 | 30 |
| Carson El | 20 → 22 | 4 → 6 | 50 |
| Carson HS | 11 → 12 | 0 → 0 | 0 |
| Catskill El | 8 → 8 | 0 → 0 | 0 |
| Curtiss MS | 17 → 17 | 2 → 2 | 0 |
| De La Torre El | 12 → 13 | 0 → 1 | 10 |
| Del Amo El | 7 → 7 | 0 → 0 | 0 |
| Dolores El | 13 → 15 | 0 → 1 | 10 |
| Dominguez El | 15 → 16 | 1 → 1 | 0 |
| Fries El | 6 → 6 | 0 → 0 | 0 |
| Gardena El | 10 → 10 | 0 → 0 | 0 |
| Leapwood El | 15 → 18 | 1 → 2 | 20 |
| Rancho Dominguez Prep HS | 18 → 18 | 2 → 2 | 20 |
| Towne El | 15 → 15 | 1 → 1 | 0 |
| Van Deene El | 8 → 8 | 0 → 0 | 0 |
| White MS | 20 → 21 | 1 → 2 | 0 |
| Willenberg Special Ed | 17 → 19 | 2 → 3 | 60 |
| Wilmington Park El | 15 → 16 | 2 → 2 | 0 |
| Test High School | 20 → 23 | 1 → 8 | 50 |

Total unpaid rewards under corrected rules: **650 points**.

## Findings

- Monitoring records were disconnected from the old point-entry trigger.
- The fall card incorrectly required Breakfast/Lunch and three Supper monitorings.
- Streak squares used the latest streak instead of an achieved streak and did not skip approved excluded days.
- Daily visit writes raced the Bingo read.
- Failed reward writes were shown as successful.
- Reads were not paginated; corrected reads include all records.
- Monday completion now requires both tasks on the same checklist.
- MPLH uses the shared school-specific targets.

## Test High School

The accepted Supper 1 is now recognized. Both previously achieved streak squares remain complete. The corrected card has 23 of 25 squares, eight completed lines (rewards stop after five lines), and 50 unpaid points. The remaining squares are Perfect BIC and Perfect Lunch, which require separate verified evidence.

## Validation and rollout status

Changes are prepared on spark-development, not deployed. No Bingo points were changed in the live database. No schema migration is needed. The additive point correction is prepared in scripts/sql/bingo-fall-2026-backfill.sql; it must be reviewed against a fresh snapshot before live execution.

The full application suite passed (208 tests), followed by the added Willenberg and every-goal coverage tests. The final production build passed. The mobile browser test verified Test High School at 23/25, failure handling, retry, no duplicate +50 reward, and no runtime errors. An isolated PostgreSQL test added exactly 650 points and zero on a second run, preserving prior points.

Bingo evaluates and retries rewards when Daily Bites opens, regains focus, or refreshes in the foreground every minute. It is not a database background award job. The current card is the fall card ending December 31; the later-year card must use Supper 3 when introduced. No Breakfast, Lunch, or Snack monitoring frequency was invented.
