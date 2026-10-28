# Reducing background data transfers

Daily Bites no longer mounts the announcement banner or new-challenge badges.
Home Base no longer mounts a new-challenge badge. Photos and game features remain.

The Side Quest photo slideshow is now an explicit **View Side Quest photos**
gallery. It requests a signed list only when opened or manually refreshed. Images
use lazy loading, and closing the gallery clears its photos. Private authorization,
photo consent rules and original uploads remain intact.

Games load a full context on entry, explicit Refresh and successful actions.
During active voting they request small vote-state updates every 30 seconds and
reload full context only if structure/revision changes. Idle and hidden pages do
not repeatedly download game snapshots. Existing full-context mutation results
are retained for consistency. A page left idle will need Refresh to discover
changes made by another school.

The monitoring correction reminder calls `supper_correction_count` instead of
downloading all records. It checks every five minutes while visible and on
focus/visibility changes. The count endpoint delegates to existing token validation
and school filtering with no new privileged table access. It returns only a count.

Breakfast availability checks on entry/focus/visibility, with no interval polling
or hidden-tab requests. Each actual Breakfast operation still enforces database
authorization; display checks do not replace those protections.

Connection readiness checks use the previously tested 60-second interval, hidden
tab pause and five-minute quota cooldown. An existing form stays mounted during
transport failures. Explicit release/version checks still control availability.

Deployment order: install the count endpoint and Showdown rules, then publish the
frontend and API together. No existing photos, votes or awards are rewritten.
Regression tests run against synthetic in-memory databases and mocked clients.

Validation: all 99 application suites / 537 tests passed; the production build
compiled successfully. Isolated PostgreSQL tests cover both Showdown environments
and the count endpoint. The browser regression intercepts all network traffic and
checks photo gallery opening, automatic submission, small vote updates, Supervisor
removal, manual winner selection and desktop/mobile layout. On production,
weekday boundary/private-helper checks pass, invalid count-endpoint sessions are
denied, migration preservation assertions passed, and security advisors report no
new findings. Repository migration versions match the applied migration history.

After deployment, compare several normal school days in the Supabase Usage page,
including per-project Database and Storage egress. Request-rate reductions are
not measured byte savings. Do not downgrade based only on fewer requests: the
organization must fit all Free allowances with headroom. A working uncached-egress
budget below 100 MB/day leaves room within a 5 GB month. No automatic downgrade
or paid resource change is included.
