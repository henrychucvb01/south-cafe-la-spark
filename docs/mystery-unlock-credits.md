# Mystery Photo school unlock credits

Each active school receives one credit per eligible day, starting with deployment. SPARK uses its existing America/Los_Angeles district timezone and `spark_excluded_days` records; absent exclusions, only Monday through Friday qualifies. New locations receive no credits for dates before their creation. Credits accumulate without expiring.

The private `october_live.award_daily_unlocks()` function runs from the `spark-mystery-daily-unlocks` database job every five minutes. It does not require a login, API call, or open browser. Its school/date unique index prevents duplicate awards, including simultaneous runs. Missed eligible days after activation are reconciled on the next run; nothing before activation is awarded. The private development equivalent uses an isolated ledger and is not scheduled against production.

`unlock_credit_events` records daily awards, purchases, and reveal debits. A school owns the balance; a verified school-scoped manager session supplies its identity. The browser cannot choose a different school or access the table directly. RLS is enabled and direct permissions are revoked. The existing server API remains the only client-facing path.

The new packages cost 5 season SPARK Points for one credit or 20 for five. Confirmation and unique request IDs are required. Successful retries return the current balance without charging again; failed responses reuse the same ID. Separate successful purchases use fresh IDs. The existing season accounting and summer purchase freeze remain in effect. Charges are append-only `spark_points` transactions with type `mystery_unlock_purchase` and a unique purchase key. The development game debits only its test ledger.

Purchases, reveals, extra-guess purchases, and quest approvals share the existing game settings row lock. The prior public game functions are retained privately as `credit_game_engine`; all previous actions delegate to them. No old points, quest rewards, credit values, guesses, winners, or puzzle pieces are rewritten by the migration.

Managers spend banked credits using **Reveal next piece**. The server validates the observed round, revealed-piece count, and remaining piece cost before deducting credits. It uses the existing sequential cost calculation, including partly funded hard pieces. Side Quests continue their original automatic shared-puzzle reveal behavior. Unspent school credits carry over after a mystery is solved; they are not extra guesses and do not change guessing limits or refunds.

## Verification

- `node scripts/test-mystery-unlocks-local.cjs` uses only `127.0.0.1:55432`, database `spark_unlock_credit_tests`. This dedicated database is a copy of the existing synthetic fixture; never point it at cloud data. `--recreate` replaces only this disposable test copy, not the template.
- The test verifies migration record preservation, weekday/calendar eligibility, timezone boundaries, accumulation, deployment start, request replay, exact prices, insufficient funds, tenant isolation, reveals, and real simultaneous purchases and daily awards.
- Existing paid-guess, three-credit Side Quest, and prize regression SQL runs on that copy with rolled-back test records.
- `node scripts/test-mystery-unlocks-browser.cjs` tests the built application through the normal manager navigation with every request intercepted to local fixtures. It verifies confirmation/cancel, lost-response retry, both packages, reveal, guessing availability, and mobile/desktop layouts.
- Run the application tests, build, October Games API masking tests, and development-isolation tests before release.

Windows fixtures use a SQL stub for cron registration because the local PostgreSQL distribution has no pg_cron binary. Production verification must additionally confirm the real job is active, its command targets the private award function, and its runs succeed.

## Operations

Inspect `cron.job` by job name and its `cron.job_run_details` entries. The migration seeds the first eligible daily award immediately. Re-running the scheduled function is safe and must not change existing point transactions or puzzle progress.

For a deployment problem, disable only this job and temporarily hide new purchase/reveal controls while preparing a forward correction. Preserve the event ledger and all point transactions. Do not delete credits, restore old balances, or remove purchased-credit history. The original game engine definitions are saved privately outside Git before migration.
