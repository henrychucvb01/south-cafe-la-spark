# Phase 2: Finish Line and development isolation

Phase 1 already protects identity, original submission time, PINs, and unique reward claims. Those protections are retained.

The remaining split-save path is replaced by `spark_submit_finish_line`: required answers, No/N/A explanations, closing confirmations, meal counts, server-derived audit changes, and existing daily/bonus rewards commit together. An error rolls everything back. Request identifiers make response-loss retries safe; locked version checks reject stale edits. No new login step or home-school restriction is introduced.

Read-only preflight on October 8, 2026 checked 505 submissions since September 3: none lacked required meals or daily answers. All 498 operating-day submissions had Finish Line, breakfast and lunch awards. No historical records were rewritten. Explanations that the old UI never saved cannot be recovered automatically.

## Development

The owner selected **local development only**. No hosted Supabase project was created or billed. Browser clients outside the canonical production hostname require explicit `REACT_APP_DEVELOPMENT_SUPABASE_URL` and `REACT_APP_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY`. API routes outside main/production require `DEVELOPMENT_SUPABASE_URL` and `DEVELOPMENT_SUPABASE_SERVICE_ROLE_KEY`. Both reject the live database URL. Generic production settings are never used as development defaults. Development QR links stay in development. A hosted preview without its own database shows a setup message and makes no database requests.

Use the existing disposable PostgreSQL fixture at 127.0.0.1:55432/spark_security and PostgREST at 127.0.0.1:55433. `node scripts/security-local-rebuild.cjs` destroys/recreates **only that fixed local fixture**, applies both phases, and preserves no real school data. Run the local auth/enrollment tests to seed synthetic users. `node scripts/start-local-development.cjs` runs the browser app and a loopback gateway at 55434. It overrides inherited cloud settings. Storage and external hosted services remain simulated in tests; a complete hosted development site requires a separate Supabase project later.

## Verification

- Application suite: 69 suites / 338 tests, plus three new Finish Line interaction tests; production build passed.
- Native PostgreSQL tests injected failures at answer, meal, audit, and reward inserts: all rolled back completely.
- Repeated requests, concurrent requests, stale edits, explanation changes, meal audit changes, original submission time, and cross-school covering-manager corrections passed.
- Full isolated security/workflow regressions passed: all login roles/self-enrollment, manual positive/negative points, games, Breakfast, monitoring, imports, scorecards, Spotlight, October Games and Digital Pull.
- Independent browser tests passed existing/new/covering/supervisor login against local authorization.
- Built development browser and all five database-backed API handlers made zero outbound database calls when only production credentials were configured.
- Live verification must remain read-only: do not submit synthetic records or guess employee PINs in production.

## Deployment and recovery

1. Apply `20261008195304_finish_line_atomic_submission.sql` first. It only adds the private request ledger and authorized RPC; existing screens remain compatible.
2. Deploy the tested application to main and verify the production asset and login screens.
3. Apply `20261008200140_finish_line_require_atomic_save.sql` to close legacy split writes after the new application is live. Older open tabs must refresh before submitting.
4. Verify function definition/permissions, anonymous denials, readiness, production routes and development isolation.

Before step 3, the prior application can be restored without removing any new database objects. After step 3, prefer a forward correction or the existing security pause/resume procedure. Do not restore unrestricted anonymous access, delete request/audit records, reset PINs, or roll back school submissions. Both migrations are transactional and use bounded lock waits. Existing point rules and scheduled bonus reconciliation are unchanged.
