# School Bingo cards

Prepared on spark-development. Not yet applied or deployed.

- A school can start a new card only after blackout AND the one-calendar-month anniversary of its current card's start. For example, September 25 → October 25; January 31 → February 28. Blackout earned early must wait. An unfinished card does not reset automatically.
- Each school gets one optional incomplete-square replacement per calendar month, shared by all managers and devices. Free/completed squares cannot be replaced. The user chooses from eligible tasks that are not already on their card or already achieved. Cancel does not consume the allowance; renewing does not replenish it.
- Existing fall cards retain their August 1, 2026 start and positions, except removed labor-adjustment squares. Previously paid rewards remain credited. A previously paid blackout remains completed.
- New cards prioritize tasks absent from the previous card, retain the free center, and count fresh activity after their start. The pool adds 24 choices covering Wordle, Connections, AR training, and existing checklist confirmations. Labor adjustments are excluded entirely. New cards/repicks do not draw Perfect Monitoring goals, which depend on Supervisor recognition, or duplicate Supper-completion aliases.
- Supper goals mean accepted/locked Manager Supper 1 for July–December card starts and Manager Supper 3 for January–June starts. An already accepted required slot is not drawn again. Willenberg's Special Education category excludes Supper. No Breakfast/Lunch/Snack requirements are invented.
- Rewards remain +10/+20/+30/+40/+50 for the first five lines and +100 for blackout, once per card. Card state, quota checks, and awards execute together under a school lock; duplicate or stale actions are rejected. Old cycle-one award keys remain unchanged.
- Feedback stays at the bottom-right on desktop and mobile, above the device safe area.

## Database setup before deployment

Run `supabase/migrations/202609250009_bingo_card_cycles.sql` after the existing migrations. It creates school-scoped card/quota tables and authenticated RPCs; direct browser table writes are disabled. The existing Manager session validates school assignment, including covering managers. A Supervisor PIN is never required for Bingo.

It also schedules hourly reconciliation at minute 15 using the already-enabled pg_cron extension. The job awards eligible unpaid rewards for existing cards without browser visits. It never starts a new card or spends a repick. The app refreshes after saved game/training activity, on focus, and every minute while visible. A failed database call is shown as an error; rewards are not shown as earned until committed.

Do not run the historical `scripts/sql/bingo-fall-2026-backfill.sql`. It is deliberately blocked because its fixed amounts predate the labor-square removal. The new reconciler computes current eligibility and preserves previous payments.

Validation: `node scripts/test-bingo-cycles.mjs` executes the migration and business rules in isolated PostgreSQL. Browser checks use mocked accounts/data and never modify real schools.

Verified locally: 210 application tests passed; production build compiled successfully; database tests passed for all 29 seeded layouts, preserved prior awards, monitoring acceptance, monthly quota, school isolation, and month-end renewal. Mobile/desktop browser tests passed for replacement, cancel/failure, reload persistence, renewal, and Feedback positioning, with no browser runtime errors. These are local checks; the migration and app are not live yet.
