# Mystery Pull and monthly leaderboard highlight

## Entry and roles

Enter `1234` in the SPARK welcome location-code field to open Mystery Pull's school selector. There is no visible welcome shortcut. Direct `/#mystery-pull` access remains available. The supervisor access code opens the separate Control Room; it is verified on the server and is not embedded in the browser bundle. School sessions expire after 12 hours and survive refresh. Failed access-code attempts are throttled.

Only existing active SPARK locations are used. This side quest uses the existing location code rather than an employee login. Managers cannot access supervisor controls, other schools' prizes, inventory quantities, or the eligible prize pool.

## Rewards

The supervisor controls stock and school token balances. Each active in-stock prize entry has equal chances; stock quantity does not weight the draw. No stock or tokens are granted automatically by operational events. All original stock, tokens, and history are preserved.

Regular prizes and automatic SPARK-points prizes can include one extra pull. Legacy standalone Extra Pull prizes remain supported. A manual bundled prize stays Waiting until fulfilled; its extra token is delivered immediately. Automatic points prizes are Received immediately. Prize names, descriptions, icons, points and bonus tokens are stored with each win.

A SPARK-points prize specifies a positive whole-number amount. The server inserts `mystery_pull_prize` into the winning school's `spark_points` ledger in the same transaction as the win, inventory decrement, and token adjustment. Existing leaderboard totals include this credit. No other operational tables or scoring rules are changed.

## Integrity and recovery

The server validates the session and school balance revision under a shared prize-pool lock. One successful pull consumes one token, selects the prize, decrements stock, stores the win and delivers any automatic rewards atomically. Insufficient tokens, no stock, stale balances or ledger errors cannot consume a reward. Direct access to Mystery Pull tables is revoked; public RPCs enforce session role and school scope.

Request UUIDs prevent duplicate draws and points credits. Retrying a successful request returns its original win. A lost response or page refresh recovers the saved request rather than generating a new draw. Supervisor edits use the same deduplication and revision checks. Permanent history remains after fulfillment.

## Experience

The physical slider supports touch, pointer and keyboard controls. Partial or cancelled slides do not spend a token. The lighter main card reveals the server-selected reward after 1.8 seconds (0.3 with reduced motion). Only the center icon spins around its Z axis with a fixed perspective tilt. The prize editor uses two columns on desktop and one on phones; school-token and history layouts are unchanged.

The monthly leaderboard highlights the latest completed month and provides View results. Current-month standings remain In progress. No leaderboard rankings or scoring rules are changed by this UI.

## Database and validation

Apply `202609250010_mystery_pull.sql` before `202609260001_mystery_pull_prize_bundles.sql`. Both are already applied to SPARK's Supabase database; the second was applied and its reward columns verified on September 26, 2026. It adds no retroactive token or points awards. These latest frontend changes have not yet been deployed.

Validation commands:

- `npm test -- --watchAll=false --runInBand --testMatch '**/*.test.js'`
- `node scripts/test-mystery-pull-db.mjs`
- `node scripts/test-mystery-bundles-db.mjs`
- `npm run build`
- `node scripts/test-mystery-pull-browser.mjs`

Database and browser tests use an isolated database and fictional schools, never live reward balances. Tests cover school isolation, random selection, stock contention, atomic rollback, duplicate-request recovery, bundled tokens, school points, fulfillment, mobile entry and the desktop prize editor.
