# October AR cap and Carson school-calendar correction

Effective October 1, 2026, AR Training awards at most five base points per school per Los Angeles date (2, 2, then 1). Incorrect/repeated answers and further practice award zero. Daily Bites, including AR, remains eligible on weekends and holidays. The existing Double Daily Bites prize still doubles base points. September AR awards are unchanged.

Migration `202610010001_ar_cap_and_carson_calendar.sql` reconciles any October awards earned before deployment, including the attempt/progress records, while retaining existing double-point multipliers. Row locks and the existing per-school cycle/progress locks serialize concurrent answers.

School-day point types are guarded on insert/update against weekends and school-specific excluded dates beginning with the September 3 rollout. Daily Bites and weekly/monthly bonuses are excluded from this guard. Finish Line uses its original submitted timestamp when recovering an award after an edit.

Carson El (2836) had six five-point meal awards and two two-point late Finish Line awards on September 4 and 7. They are set to zero with their unique keys retained, so retries cannot restore them. Source checklist/meal records and the 25-point week-ending bonus are preserved. September changes from 1,026 to 992. The closed Cup snapshot is corrected and reranked; issued tokens are untouched. The transaction aborts if a reward tier would change.

Leaderboard pagination now orders tied service dates by unique row ID.

Validation: `node scripts/test-ar-cap-calendar.mjs`; focused Jest tests for AR Training, leaderboard pagination and scoring policy. Database migration is forward-only; apply once.
