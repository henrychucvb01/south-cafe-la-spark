# Supervisor-Only Rewards Release

This release preparation supersedes the development-only deployment notes in
the earlier Rewards reports. It has not been applied to production yet.

## Production Boundary

- `/api/rewards` is enabled only for the production deployment of `main`.
- Availability fails closed until the Supervisor migration is installed.
- Catalog reads, saves, duplication, and settings require the existing
  Supervisor authorization helper. Manager credentials are not accepted.
- The private `spark_rewards` schema contains settings, catalog, and audit
  tables only. Anonymous and authenticated database roles have no access.
- Manager activation remains constrained to false in the database. Claims,
  contributions, bids, real spins, point awards, and pull awards are unavailable.
- School previews read the existing season balance helper without changing it.
- Workflow rehearsals are in memory and cannot change school records.

## Database Preparation

`supabase/migrations/20261017150105_rewards_supervisor_only.sql` adds eleven
inactive, unpriced draft rewards and the service-role-only Supervisor RPC.
It does not import local preview configuration or alter existing school,
points, pull bank, game, authentication, or storage records. Local preview
settings remain preserved separately.

The development-only schema fixture now lives under `supabase/local/`, outside
the production migration queue. Never apply it to production.

## Release Gate

Run application regression tests, API authorization checks, both development
database checks, the Supervisor database check, browser checks, and the build.
Before production application, review database advisors and verify the private
schema does not already exist. Use the tested additive migration only; do not
run an unreviewed bulk migration push. Integrate onto the real `origin/main`
history, preserving unrelated work and avoiding snapshot line-ending churn.

After deployment, verify Supervisor navigation and the availability response,
confirm manager routes remain blocked, and compare existing school/game/points
records. Do not enable manager participation as part of this release.
