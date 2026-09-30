# Mystery Pull and monthly leaderboard highlight

## Entry and roles

Enter `1234` in the SPARK welcome location-code field to open Mystery Pull's school selector. There is no visible welcome shortcut. Direct `/#mystery-pull` access remains available. The supervisor access code opens the separate Control Room; it is verified on the server and is not embedded in the browser bundle. School sessions expire after 12 hours and survive refresh. Failed access-code attempts are throttled.

Only existing active SPARK locations are used. This side quest uses the existing location code rather than an employee login. Managers cannot access supervisor controls, other schools' prizes, inventory quantities, or the eligible prize pool.

## Rewards

The active pool contains exactly seven fixed prizes: +5 SPARK Points + Extra Pull, Make-Up Late Checklist, Change a Bingo Square, Bingo Free Space, Double Daily Bites for 1 Month, Streak Shield, and Candy Bar. The September 30 replacement removes the old catalog and all test wins at the user's request. Existing school token balances and previously posted points are unchanged.

The six digital prizes remain available while enabled. Candy Bars require supervisor stock (initially zero). Selection is uniform among available prize types; quantities never weight a draw. Supervisors retain token controls, descriptions, icons, availability, Candy Bar inventory and delivery management. Prize names/effects are fixed to this approved pool.

Five school points and one token are credited immediately and atomically. Double Daily Bites activates when won, for one calendar month in Los Angeles time. It doubles newly earned same-day visit, Word, Connections and AR Training points; it does not change past awards, operational bonuses, Bingo rewards or Pull points. Overlapping wins never multiply beyond 2×; the latest end date governs.

Other digital rewards remain in My Prizes until used. A manager chooses a submitted late checklist, an incomplete Bingo square (and an eligible replacement for Change a Bingo Square), or one past missed qualifying Finish Line day. Redemptions are school-scoped, durable and applied once. A network retry with the same win and selection returns the saved redemption; a different selection is rejected after use.

Checklist make-up preserves the original submission timestamp, tops that date's credit up to five points, and makes a completed checklist qualify for streak bonuses. A shield preserves continuity without inventing a submitted checklist or adding a completed day. Bingo prizes immediately refresh line/blackout rewards; a prize repick does not spend the ordinary monthly repick. Completed squares cannot be replaced. Candy Bars stay waiting until the supervisor marks them received.

## Integrity and recovery

The server validates the session and school balance revision under a shared prize-pool lock. One successful pull consumes one token, selects the prize, decrements stock, stores the win and delivers any automatic rewards atomically. Insufficient tokens, no stock, stale balances or ledger errors cannot consume a reward. Direct access to Mystery Pull tables is revoked; public RPCs enforce session role and school scope.

Request UUIDs prevent duplicate draws and points credits. Retrying a successful request returns its original win. A lost response or page refresh recovers the saved request rather than generating a new draw. Supervisor edits use the same deduplication and revision checks. Permanent history remains after fulfillment.

## Experience

The physical slider supports touch, pointer and keyboard controls. Partial or cancelled slides do not spend a token. The lighter main card reveals the server-selected reward after 1.8 seconds (0.3 with reduced motion). The center star and its frame spin around their Z axes with a fixed perspective tilt. Three dark elliptical orbital paths surround a smaller center icon with a clear gap. All five fruits orbit together, spaced evenly around the outside. The prize grows from the center through a single radial burst and settles into the card. Reduced-motion settings disable these effects. The prize editor uses two columns on desktop and one on phones; school-token controls are unchanged. Manager prizes use one horizontally scrolling row. Supervisor history uses compact expandable records in a bounded scrolling area; full details, pull IDs, dates, automatic rewards, fulfillment controls and older-record pagination are preserved.

The monthly leaderboard highlights the latest completed month and provides View results. Current-month standings remain In progress. No leaderboard rankings or scoring rules are changed by this UI.

## Database and validation

Apply `202609250010_mystery_pull.sql` before `202609260001_mystery_pull_prize_bundles.sql`. Both are already applied to SPARK's Supabase database; the second was applied and its reward columns verified on September 26, 2026. It adds no retroactive token or points awards. Frontend releases are deployed separately through the spark-development preview.

`202609300001_digital_pull_rewards.sql` was applied to SPARK on September 30, 2026. Verified exactly seven prizes, zero old test wins, and the new redemption functions.

Validation commands:

- `npm test -- --watchAll=false --runInBand --testMatch '**/*.test.js'`
- `node scripts/test-digital-pull-rewards.mjs`
- `node scripts/test-mystery-pull-db.mjs`
- `node scripts/test-mystery-bundles-db.mjs`
- `npm run build`
- `node scripts/test-mystery-pull-browser.mjs`

Database and browser tests use an isolated database and fictional schools, never live reward balances. Tests cover school isolation, random selection, stock contention, atomic rollback, duplicate-request recovery, bundled tokens, school points, fulfillment, mobile entry and the desktop prize editor.

Contention regression: 40 queued school requests compete for 10 points prizes, verifying 10 wins, 30 unspent tokens, zero stock and exactly 70 awarded points. PGlite serializes these transactions; this is a consistency test, not a live Supabase throughput benchmark.
