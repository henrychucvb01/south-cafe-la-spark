# SPARK Rewards manager launch

The original Phase 1 setup RPC remains for compatibility. Production now uses the service-role-only `spark_rewards_live` protocol 2 RPC. Supervisor activation controls the Daily Bites Rewards button and all new point spending. Supervisor previews and Test Workflows remain read-only simulations.

Managers enter through Daily Bites → SPARK Rewards. Their verified school session stays open until they leave. School identity is derived from that session, including covering managers, never from a payload location ID. Each spend needs confirmation, a current reward revision and a UUID request ID. Identical retries return the existing outcome; reused IDs with changed details fail.

Fixed redemptions debit the configured price, enforce available quantity and the school's claim cap (both default to one). Community pools and wheel goals accept positive contributions only up to the remaining goal. Public contributor names appear only when enabled by the Supervisor.

Auctions reserve the full leading bid in the existing season points ledger. Raising a leading bid refunds its previous reservation in the same transaction before reserving the new amount. An outbid school receives its previous points back immediately. Reserve prices and other bidders' identities are absent from manager responses. Enabled anti-sniping extends the actual closing time. A database cron and authorized context loads settle expired auctions: the winning reservation becomes the purchase without a second debit; bids below reserve are refunded. Refunds use the original transaction service date. Auction extensions remain visible beyond the original deadline.

Spends share the existing October Games/Mystery/Bingo spending lock and the prize-pool lock before checking the authoritative season balance. Catalog terms become immutable once points have been committed; duplicate the reward to change price, goal, type, rules or dates. Pausing does not confiscate reservations. Cancellation refunds unfulfilled commitments once; fulfilled rewards, used wheel sessions and configured no-refund/review policies require separate review. Supervisor fulfillment is recorded separately from point spending.

Wheel goals unlock one Supervisor-led server-controlled session. Approved segments are snapshotted, spin requests are idempotent, outcomes are selected server-side, and extra spins stay within the configured session cap. Prize/activity outcomes require Supervisor follow-up; they do not create unrelated Mystery Pull tokens or bonus point awards. Closing the session discards unused spins. Test wheels remain simulations.

Manager activity shows the latest 40 entries; Supervisor activity shows the latest 200. Full audit/transaction records remain stored. Auction cards refresh every 30 seconds only while visible and an auction is open. Other Rewards pages use manual refresh; hidden tabs do not poll.

Migration preserves all configured rewards and leaves activation unchanged until the explicitly requested launch is applied. No manager points are spent by deployment or activation.

Checks: `scripts/test-rewards-live-db.mjs`, `scripts/test-rewards-live-api.mjs`, existing Phase 1 API regression tests, React Rewards tests, full interface suite and production build. Tests use fictional schools and rewards. This environment cannot launch Chromium, so visual browser QA remains unavailable.
