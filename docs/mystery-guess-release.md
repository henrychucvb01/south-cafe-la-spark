# Mystery guesses: release and recovery

New Side Quest approvals grant **3 unlock credits**. `20261009172016_mystery_three_unlock_credits.sql` reuses the existing `unlocks.pieces` history field for each approval's credit value. Existing five-credit approvals and current round progress are preserved, including queued approvals. `scripts/test-three-unlocks-local.cjs` verifies both schemas, immediate/queued approvals and replay protection. Recovery must continue summing each event's stored value; never restore a constant-five queued calculation after three-credit events exist.

The October 9 update uses a school-wide daily limit in America/Los_Angeles, one free guess per photo, and next-day purchased guesses. Prices are 10, 25, 50, 100, 200, 400, then double. The balance is the existing August 1–June 7 season ledger through today, including supervisor adjustments and prior purchases/refunds. Purchases are closed during the championship freeze after June 7 until August 1.

The existing registered-manager and helping-other-schools login rules remain. School identity comes from the verified session, never the purchase payload. Covering-manager eligibility is unchanged. Purchase, attempt, solve, configured award and refund operations share the existing game settings transaction lock. Unique request IDs prevent replay charges and awards. Clients cannot execute either the public Games RPC or its private engine directly; only the existing server API has permission.

Supervisor acceptance refers to a recorded attempt. It preserves the original answer/result and adds an override record. It cannot replace an existing winner. Solving starts the next photo and refunds the original price of every unconsumed purchase for that photo, including purchases by other schools. Prize guesses are consumed only when actually submitted, and obey the same school/day limit.

## Release checks

- Run `scripts/test-mystery-paid-guesses-local.cjs` and `scripts/test-custom-prizes-local.cjs` against the fixed loopback fixture. Both roll back synthetic test records.
- Run the React tests and production build, then `scripts/test-mystery-guess-browser.cjs`. Browser requests are intercepted to local files/fixtures; no live guesses or points are created.
- Run `scripts/test-october-games-api.mjs` to verify private image masking and existing API permissions.
- Save the current production function definitions privately before applying `20261009164942_mystery_paid_guesses.sql`. Verify service-role-only permissions, private-table RLS, and unchanged legacy record counts.
- Publish the coordinated application. An older open page attempting a guess receives a refresh instruction; the server never falls back to the old per-manager limit.

## Recovery

This migration does not delete or rewrite existing guesses, photos, winners, points or school records. The original engine is retained privately in each October schema; pre-release function definitions are also saved outside Git in `.security-runtime/pre-paid-guesses-production.sql`.

If no new purchase, attempt or override exists, restore the backed-up public function definitions and service-role-only grants, and revert the application deployment. Keep the additive tables for investigation; do not drop history.

After any new activity, do not restore the old guessing engine: it does not understand the new daily attempts or refund obligations. Temporarily pause Mystery Photos using the existing supervisor status setting, preserve all ledgers, and deploy a tested forward correction. Reconcile each purchase to its unique debit, consumption or full refund before reopening. Supervisor point correction tools remain available; never delete original charges or awards as a recovery shortcut.
