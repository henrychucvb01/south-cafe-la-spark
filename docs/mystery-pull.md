# Mystery Pull and monthly leaderboard highlight

Prepared on `spark-development`. Requires migration `202609250010_mystery_pull.sql` before deployment. No production changes or live prize draws were performed during development.

## Entry and roles

Mystery Pull is a separate entry on the SPARK sign-in page, also reachable at `/#mystery-pull`. It does not appear in operational tools or the leaderboard. Enter the manager access code supplied in the request, then the existing location code. The supervisor code supplied in the request opens the isolated Control Room directly; manager screens have no supervisor controls. Codes are verified on the server and are not embedded in the browser bundle. Sessions are school-scoped, expire after 12 hours, and survive a tab refresh. Code failures are throttled.

Only existing active SPARK locations are used. School code is the manager/school identifier because this side quest intentionally does not require an employee login. No duplicate school directory is created.

## Set up before allowing pulls

All schools begin with zero tokens. The five initial prizes begin active with zero inventory. In the Mystery Pull Supervisor area, add the stock actually available and grant school tokens. Extra Mystery Pull also has finite stock; when won, it decrements its stock and immediately returns one token to the school. Other prizes wait for manual fulfillment. There are no automatic token grants from scores, rank, Bingo, monitoring, or any operational event.

The initial prize types are $5 Gift Card, Candy Bag, +2 Passport Stamps, Extra Mystery Pull, and Stamp Booster. Custom manual prizes can be added. Prize names, descriptions, icons, and fulfillment type are copied into each winning record, so later edits do not rewrite past wins.

## Integrity and recovery

The server transaction checks the session, school balance revision, positive token balance, and active in-stock prize pool. It chooses uniformly among eligible prize types using PostgreSQL `random()` under a shared prize-pool lock, consumes one token, decreases stock, and stores one winning record. Extra Pull credits its additional token in that same transaction. A single lock order also protects supervisor adjustments and the final available prize. No token is consumed when there is no stock.

Every request carries an idempotency UUID. The same successful request always returns its original prize. Distinct requests based on a stale balance revision are rejected, preventing two devices from spending the same displayed balance. The UI also prevents overlapping requests and saves the request before sending. A lost response or page refresh resolves the saved request from the winning history; it never generates a replacement request for an uncertain draw.

Supervisor token/stock edits use the same request deduplication plus revisions, with a safe retry for connection failures. Token and stock counts cannot become negative. Direct anonymous/authenticated table access is revoked and RLS is enabled. Public RPCs enforce the game session's role and school. Managers cannot fulfill rewards or read other schools' wins, inventory quantities, or the eligible prize pool.

Winning records remain after fulfillment; supervisor history and manager My Prizes are paginated. Physical rewards have Waiting and Received statuses, with fulfillment date. Extra Pull is marked received automatically. No operational tables are written.

## Experience

The main interaction is a vertical pointer/touch slider, not a button. Partial slides, bottom taps, and cancelled gestures do not start a pull. The control must reach the bottom and be released. Keyboard users can use Down/Up/Home/End. The reveal waits for the actual server result and adds anticipation, large prize artwork, and celebration. Reduced-motion preferences shorten the animation and remove movement.

The monthly leaderboard highlights the latest completed month's results and provides a View results shortcut. Current-month standings remain labeled In progress. The highlight is remembered per school in that browser. No ranking, scoring, passport rules, or Mystery Pull details were added to the leaderboard.

## Verification

- `npm test -- --watchAll=false --runInBand --testMatch '**/*.test.js'`
- `node scripts/test-mystery-pull-db.mjs`
- `npm run build`
- `node scripts/test-mystery-pull-browser.mjs`

Database and browser scripts use an isolated PostgreSQL database with fictional schools. They do not connect to or spend real school tokens. The browser test routes Mystery Pull requests through the actual SQL functions, checks the physical slide, manager/supervisor isolation, fulfillment, Extra Pull, and lost-response recovery.

Validation completed locally: 214 tests passed across 44 suites; the production build compiled successfully; isolated database tests and the full browser-to-database workflow passed. Phone and desktop screenshots were inspected. No production deployment or migration execution was performed.
