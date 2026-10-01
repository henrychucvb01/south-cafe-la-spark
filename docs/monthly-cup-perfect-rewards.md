# Monthly Cup and Perfect monitoring rewards

Monthly Cup reward rules are private server configuration. Do not add Pull amounts or reward explanations to manager-facing leaderboard text.

- Beginning September 2026, positive-score schools ranked 1–5 receive two Pull tokens; ranks 6–17 receive one. Competition ranking preserves ties, including the higher reward at a boundary. Test High School and inactive schools are excluded, matching the leaderboard.
- `spark-monthly-cup-rewards` runs hourly at minute 35. The first run after a Los Angeles calendar month closes is 00:35 local time. This follows the existing Finish Line bonus reconciliation at minute 5. Missed runs catch up automatically.
- A single transaction saves all final standings and credits balances. The shared Mystery Pull lock serializes balance changes with pulls and supervisor adjustments. A closed month cannot pay again. A failed transaction leaves neither partial awards nor a finalized month.
- The existing season remains August through June 7; June awards wait for the calendar month to finish, and July has no Cup. No pre-September 2026 payouts are created.
- Closed Monthly Cup standings are frozen. Later points corrections still affect season totals but cannot silently change an already-paid month's results. The public standings RPC omits token amounts; private tables and payout functions are inaccessible to anonymous/authenticated app clients.

Accepted, locked Manager monitorings recognized by the existing Perfect-star rule receive exactly 20 points. The key is the monitoring ID; edits do not create another award. Removing the star, unlocking, or deleting the record removes its automatic credit. Reinstating eligibility restores one 20-point credit. Other monitoring statuses/roles receive no automatic credit. No new passing awards are permitted, including from old browser tabs.

The migration adopts unambiguous legacy manual Perfect credits without changing their dates or totals, then backfills missing awards. New awards use the monitoring date; existing award dates are preserved. Historical passing credits are not deleted. Monitoring records and PDFs are unchanged.

Validation: `node scripts/test-monthly-cup-perfect-rewards.mjs`; focused React tests for `SupervisorLeaderboard` and `MonitoringStarButton`.

Live migration verification on September 30, 2026: 12 Perfect records, 12 credits totaling 240 points, zero missing awards, zero prematurely closed months, and the scheduled job active. Two existing Perfect credits were adopted and ten missing credits added.
