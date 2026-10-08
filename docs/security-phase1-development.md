# SPARK Phase 1 security release

Status: **Deployed and verified in production on October 8, 2026.**

Supabase OAuth authorization was renewed. Release 0dc920e1affca16e99c589a1b0a2a57b7976e6c4 restored the exact tested application to main and spark-development after the earlier connection failure. Production was confirmed serving main.3336fb75.js before the atomic spark_security_phase1 migration was successfully applied. Production readiness reports version 1, ready true.

Read-only live checks confirmed anonymous employee/PIN-hash access is denied, direct points/game-progress insert privileges and the legacy arbitrary-reward function are denied, legacy raw-PIN verification returns false, and protected school records are hidden from anonymous requests. Independent browser checks passed the manager and supervisor login entry screens with no application errors; live school writes and employee PIN attempts were not used for testing. Full authenticated workflows were verified against the isolated synthetic database. Existing PINs, self-service enrollment, cross-school assistance and school records are preserved. Previously open tabs should refresh and sign in again.

The initial connection-failure recovery commit 31b3bc27dcda59b9267467346e22c69faf84f380 is superseded. After the successful database migration, do not deploy that old application or restore anonymous permissions. Use the pause/resume recovery procedure below if needed.

## Preserved workflows and accepted risk

The owner explicitly chose self-service first-time PIN creation. New managers select their names and create their own PIN without supervisor approval. Existing PIN hashes are retained. Supervisor resets reopen the same self-service flow. No employee PIN was reset as part of this release.

Managers and covering employees may help other active schools. There are no new job-title or home-school restrictions. Supervisor point additions/deductions, Breakfast worker PINs, account-free teacher QR pages and Digital Pull entry remain available.

Self-enrollment does not prove identity: someone who knows an unclaimed employee name could claim it first, including after a supervisor reset. The owner explicitly accepted this risk. Enrollment cannot overwrite an existing PIN, and concurrent enrollment permits only one winner.

Blocking hash exposure now cannot establish whether previously exposed hashes were copied. No historical compromise has been established and no automatic PIN reset was performed.

## Security changes

- Existing login screens exchange a PIN for a random, two-hour, memory-only session. Attempts are serialized and limited per credential. Logout, expiration, deactivation and PIN changes invalidate sessions and their school-scoped child sessions.
- Legacy verification functions validate sessions instead of providing additional raw-PIN guessing endpoints. Public clients cannot read employee tables or PIN hashes; login gets a limited name directory.
- Protected meal, checklist, labor and game records require verified access. Calendar changes and manual adjustments require a supervisor. Clients cannot directly insert points or game progress.
- Daily Bites actions are validated and scored on the server. Concurrent retries cannot duplicate rewards. School rewards use fixed server amounts and saved evidence. Existing scoring, triggers and unique reward keys are retained.
- Verified identity and submission timestamps are set on the server. Finish Line edits retain the original submission time used by streak calculations.

## Verification

- 68 application suites / 327 tests passed; production build passed.
- Native PostgreSQL/PostgREST tests passed for regular/covering/supervisor authorization, throttling, legacy bypass denial, anonymous secret/write denial, self-enrollment, concurrent enrollment, supervisor reset and session revocation.
- Cross-school meal entry, supervisor additions/deductions, concurrent retries, Word/Sort scoring, AR caps and Finish Line corrections passed.
- Breakfast rollout isolation, worker packing/returns, teacher submissions/adult meals/preorders, reports, dashboard and Finish Line totals passed. Disabling and re-enabling retained QR codes and records.
- Official meal imports, cross-school scorecards, monitoring drafts, Spotlight publishing, October quest approvals/rewards/unlocks and Digital Pull login passed with real local authorization.
- Independent headless-browser checks passed for existing managers, new self-enrollment, covering managers and supervisors, including their database requests. A missing database release safely gates the new build and automatically recovers.
- October photo/API checks (133 assertions) and Spotlight upload/API checks passed with isolated mocks.
- Forced migration failure rolled back completely. Successful migration retained synthetic existing PIN hashes, meal records and classroom QR codes. Release pause/resume retained records and restored valid sessions.

Tests used only synthetic records at 127.0.0.1:55432/spark_security, through PostgREST on port 55433. Browser traffic was redirected there; other external requests were blocked. The user's browser was not used. No live school records were used for write tests.

The ignored .security-runtime directory contains local tools, credentials and schema-only metadata. The fixture reconstructs 88 tables, 151 functions and two public views with client/server grants. Storage and external hosted services are mocked rather than copied. Live preflight confirmed unchanged definitions for the business functions being replaced and support for the session request header.

## Coordinated deployment and recovery

1. Retain the prior application revision and schema-only metadata. Confirm main has not changed underneath the tested candidate.
2. Publish the tested session-aware build. It waits for spark_security_ready version 1 before opening core manager/supervisor screens. Public Breakfast QR pages retain their existing authorization.
3. Confirm that exact application deployment succeeded, then apply 20261008173201_spark_security_phase1.sql transactionally. Bounded lock/statement timeouts prevent indefinite blocking. SQL failure rolls back rather than leaving a partial permission change.
4. Verify readiness, denied anonymous access, legacy PIN closure, public app delivery and provider deployment status. Do not create synthetic records in live schools. Previously open tabs need a refresh/sign-in because raw PINs no longer authorize feature calls.
5. If the application deployment fails before the database change, leave the database unchanged and restore the prior application build.
6. If recovery is needed after migration, run scripts/security-pause-release.sql through an authorized database connection. This disables core sessions and protected writes while retaining hardened permissions and all records. Restore this tested compatible build or a verified forward correction, then set the private release flag back to true. Pause/resume was rehearsed locally.

Never restore unrestricted anonymous grants or serve an old anonymous-write application against the secured database. Neither school records nor new security tables should be deleted during recovery.

## Remaining maintenance

The private puzzle schedule covers existing 2026–27 content through June 4, 2027; extend it when the school-year content changes. Client presentation still includes puzzle content, so answer secrecy is not claimed; server scoring is enforced.

Existing Supabase advisor notices include deliberately denied direct-table access, authorized security-definer RPCs and a read-only aggregate leaderboard view. This release does not redesign those features. The existing large application bundle warning remains a separate performance improvement.

## Reproduce isolated checks

With the local schema-only fixture and loopback servers prepared:

```text
node scripts/security-local-rebuild.cjs
node scripts/test-security-auth-local.cjs
node scripts/test-security-enrollment-local.cjs
node scripts/test-security-writes-local.cjs
node scripts/test-security-games-local.cjs
node scripts/test-security-finish-line-local.cjs
node scripts/test-security-breakfast-local.cjs
node scripts/test-security-features-local.mjs
node scripts/test-security-login-browser.mjs
```
