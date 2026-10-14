# SPARK Games upgrade

## Release status

All three stages are implemented and locally verified. The user explicitly approved the production release. All three migrations applied successfully to SPARK on October 14, 2026. Before/after fingerprints match for original quest fields, submissions, rewards, unlock-credit events, Mystery unlocks, guesses, rounds and winner claims. The installed legacy game function body is preserved. All ten new private tables have RLS and deny direct anonymous/authenticated reads. Anonymous RPC execution remains disabled, invalid sessions are rejected, and two actual automatic cron runs succeeded without browser activity. Code publication follows these checks.

## Stages

1. SPARK Games navigation, supervisor challenge planning, compact approval rows, edit/reject/alternative suggestions, bulk approval, manager preview, and four/five-Monday scheduling. Each wave accepts at most ten approved challenges. Default release is 07:00 America/Los_Angeles.
2. Database cron reconciliation every minute releases approved waves without a browser. Unfinished challenges carry forward within the monthly cycle. A new cycle begins at its first approved scheduled release, archiving the previous cycle without deleting records. Missing approvals retain the current competition. Awards are serialized and capped at two per school per wave; submissions remain allowed. Historical October awards are not retroactively capped. Winning photos reuse existing authorized storage and slideshow behavior.
3. Completed winning-photo collection, enlargement, a 2.6-second forward/reverse 3D cascade, simultaneous reveal and 112% burst. Up to six cards animate at once. Skip and reduced motion finish immediately. Reveals persist per manager; photographs remain visible.

## Limits

The generator uses a finite curated library of 60 challenges, with seasonal filtering and recent-title/library-ID avoidance. An exhausted library can return fewer than requested; supervisors can add original challenges. No paid AI dependency is added. Once an award is recorded, its wave allowance remains consumed, preventing review changes from granting extra winning awards.

## Local review

From the main checkout, run `node scripts/preview-spark-games.cjs` and open http://localhost:4315/. This standalone synthetic preview has supervisor and manager views and a replay control. It connects to no account, uploads no photos, and changes no real points. It refuses production mode and is not imported into the production application. Restart it after source changes.

## Validation

- `node scripts/test-spark-games-library.mjs`: 50 unique suggestions, seasonal priority, repeat avoidance, four/five Mondays.
- `node scripts/test-spark-games-db.mjs`: all three stages, authorization, capacity, automatic releases, within-month carryover, two-win cap, missing approvals, monthly transitions, historical photos and reveal persistence.
- `node scripts/test-spark-games-local.cjs`: a fresh dedicated loopback PostgreSQL fixture only; verifies installed Mystery engine preservation, scoped authentication, cron registration and three simultaneous approvals yielding exactly two awards. It deliberately refuses an already migrated fixture.
- `npm test -- --watchAll=false --runInBand --testMatch="**/src/**/*.test.js" --testPathPattern="octoberGames|sparkGames|sideQuest|BingoPanel"`: the final release, combined with the latest published Mystery Photo changes, passes 69 tests across ten suites, including Bingo regressions.
- `npm run build`: passed; the existing large-bundle warning remains.
- Browser review: supervisor rows and approval, desktop manager collection, mobile two-column layout without horizontal page overflow, Skip and photo enlargement verified. Fixture pictures are synthetic, not actual school photos.

## Production release

Verified SPARK project: `kkrcxqhfzepifhkryodd` (Manager Checklist).

Apply only these migrations in this order after production approval:

1. `20261014171038_spark_games_planning.sql`
2. `20261014171054_spark_games_automatic_cycles.sql`
3. `20261014171058_spark_games_photo_reveals.sql`

The first migration preserves the installed October Games implementation in private `games_legacy` functions. New private tables have RLS enabled and no direct anonymous/authenticated access. Public wrappers retain the existing scoped authorization and service-role-only execution. No competition is generated or approved by installation itself.

Before release, record historical row fingerprints. After migration, compare original quest columns, submissions, rewards and credit events; verify the preserved function body, private-table RLS/ACLs and the single `spark-games-weekly-releases` cron job. Verify invalid sessions remain rejected. Check cron registration and subsequent execution without manufacturing production challenges or awards. Commit and push only SPARK Games files after successful verification. Other agents' Bingo and monthly scorecard changes are outside this release.

Coin Pusher and Breakroom branches are unchanged by this upgrade.
