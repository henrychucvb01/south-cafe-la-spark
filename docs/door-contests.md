# Decoration contest seasons

Supervisor → Games & Challenges → Games & Challenges → Next decoration contest.

A confirmed contest is read-only. Prepare the next theme, title, opening, closing times, colors and rewards separately. All three date inputs in the next-contest form are interpreted as America/Los_Angeles, regardless of the device timezone.

Check automatic start and save to schedule; uncheck to save a draft. Start saved contest now requires explicit confirmation. Remove next contest plan cancels only the queued plan. Edits use the settings revision to reject stale changes. Changing an unsaved form does not alter the saved plan.

A private database cron checks every minute. Authorized Games requests also check whether a scheduled opening is due. An unfinished current contest with entries blocks replacement until its champion is confirmed. Expired submission deadlines block activation and must be updated. The next plan stays visible for correction. An empty current contest may be replaced. Activation is serialized on the settings row and idempotent.

Each contest has separate entries, votes and champion reward keys. Historical UUIDs, original photo paths, vote rows, rewards and ledger entries remain in place. Migration assertions compare all original settings, entry, vote and reward values before and after conversion. The legacy champion key remains unchanged for contest 1. New contests use a unique contest key for their champion; participation retains the unique entry key. Existing voting rules and award amounts are preserved.

The Door Contest tab offers on-demand past results. Approval/publishing visibility is enforced server-side before URLs are signed. Historical photos cannot be reviewed or rotated. Old tabs must refresh before submitting, voting or confirming a champion in a later contest. API responses remain private/no-store; the existing bounded photo-link cache remains in use. No paid service is added.

Validation: `node scripts/test-door-contest-cycles.mjs` tests real legacy engines for development and production using fictional school data. React/API tests cover completed settings, scheduling, timezone conversion, confirmation, history, and contest identity. `scripts/test-door-contest-browser.mjs` drives the production UI against isolated Postgres and the actual API handler; set SPARK_BROWSER_EXECUTABLE when Chromium is installed elsewhere. The current environment blocks Chromium's process-singleton socket, so browser verification must be rerun in a browser-enabled environment.
