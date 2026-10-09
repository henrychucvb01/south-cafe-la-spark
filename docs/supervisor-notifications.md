# Supervisor notifications

The bell reads one supervisor-authorized aggregate: pending `october_live.entries` with quest > 0, submitted `monitoring_records`, and unread `spark_feedback`. Door contest, Incident Helper, and monitoring round activation are excluded. Feedback read state is shared by supervisors, separate from its New/Reviewing/Resolved workflow. Changing status to Reviewing/Resolved marks it read atomically; New marks it unread. Existing reviewed feedback is initially read.

Visible pages refresh every 30 seconds, on focus, after local review events, and after a push. Hidden pages stop polling; failures back off to five minutes and show unavailable counts. Counts are indexed and do not download submission content. Isolated development uses the preview count RPC and `october_dev.entries`, matching the existing Games environment switch; it never connects to the production database. The preview count RPC is protected by the same supervisor authorization.

## Push and privacy

Only verified supervisor sessions can register a device or obtain the public application key. VAPID keys are generated once on first opt-in and held in a private database table, available only through a service-role RPC. The API uses the existing environment isolation guard: preview/local servers cannot select the live database. Push subscriptions and device revocation hashes are private. Endpoints are restricted to known browser push services to block SSRF. Do not log subscription endpoints, keys, sessions, or the dispatch secret.

The production-only operational script schedules one check per minute. It issues no HTTP request without eligible pending deliveries. A singleton revision tracks meaningful pending-state changes without accumulating an event log. The worker leases up to 20 devices, encrypts payloads containing only count/revision, acknowledges per device, backs off failures, and removes expired endpoints. A five-minute TTL and one topic/tag coalesce obsolete updates. Network delivery is at least once: a crash after sending but before acknowledgement can retry; the service worker replaces the same visible notification and does not regress a newer badge. Push-service acceptance is not proof of receipt on a physical iPhone.

Sign-out and entering a manager session disable local push, unsubscribe, clear badges and remove the server subscription. A failed server revocation is retried next time; the local worker suppresses notifications immediately. A lost/stolen unlocked device can still display a generic count until notifications are disabled in device settings, as with other opted-in notification apps.

## iPhone

In Safari, Share → Add to Home Screen. Open that icon, sign in as supervisor, then Supervisor Settings → Enable Notifications → Allow. Requires iOS 16.4+. Enable badges in iOS Settings. No Apple Developer account is needed. iOS requires a visible notification for every background push, so silent badge-only delivery is not promised. We request quiet delivery, but Focus, notification settings, battery/network conditions and iOS decide timing/presentation. Foreground counts work without push permission. A real iPhone must confirm device delivery after opting in.

## Deployment / recovery

1. Apply `20261009155316_supervisor_notifications.sql` and `20261009155704_supervisor_push_delivery.sql`. These are additive and compatible with the previous app. The second enables Supabase pg_net if available; local native PostgreSQL does not require it. No production scheduler is installed by ordinary migrations. Supabase owns the extension's internal permissions; its `net` schema must remain outside the Data API exposed schemas (verified with an anonymous schema request). The preview helper is **not deployed to production**: `supabase/local/supervisor-notification-preview-counts.sql` rejects any connection except the fixed loopback fixture and is installed by the local startup/test scripts.
2. Deploy the application, worker and API together; check supervisor denial for anonymous/manager requests and the live assets.
3. Only on the authorized production project, apply `supabase/operations/activate-supervisor-notifications.sql`. Verify its cron execution and extension permissions. The job remains dormant until a supervisor opts in and pending counts change. Do not copy cron jobs or production push configuration into development.
4. To pause delivery, unschedule only `spark-supervisor-notifications`. For rollback, restore the two old feedback function definitions captured before migration and revert the application commit. Remove the three `notification_changed` triggers if rolling back the database behavior. Keep additive read flags, subscriptions and configuration for recovery; do not delete school records. The bell can operate even when background delivery is paused.

## Validation

- Full Jest suite, notification component/API tests, native loopback PostgreSQL category/security/queue tests.
- `scripts/test-notifications-browser.cjs`: actual built Command Center, local-only network, desktop/mobile, feedback read/unread persistence, denied permission, PWA assets.
- `scripts/test-notification-worker.cjs`: real VAPID/encryption, push events, quiet grouping, stale payloads, badges and sign-out (no external push sent).
- Existing local authentication and atomic Finish Line suites check cross-school regular/covering workflows and points preservation.
- Production verification is read-only for school records. Physical-device delivery requires supervisor opt-in; no permission prompt is triggered automatically.
