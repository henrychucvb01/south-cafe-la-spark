# Side Quest Showdown

## Workflow

Completed cards offer Challenge to eligible signed-in, participating school managers,
including authorized temporary managers.
The current champion cannot challenge itself. New challenge submissions start
voting automatically. The Supervisor can withdraw a challenger through **Remove
challenge** in Side Quest Challenges; historical pending submissions retain their
review controls. Standard Side Quest photo approval is unchanged.

New starts and second-challenger admissions are allowed only Monday–Thursday in
America/Los_Angeles time. Friday, Saturday and Sunday starts are rejected by the
database. Existing voting can finish on Friday. Schools share five started
challenges per calendar month; named and temporary managers share this budget.
Each school can challenge a prompt only once, even after losing, canceling or
Supervisor removal. Historical started challenges count. Other prompts remain
independent, and the monthly budget resets without resetting prompt attempts.

The first submission starts a 24-hour round with the defending photo and one
challenger. A second submission admits a third photo, increments the voting
generation, and restarts the server deadline. Old votes are retained for audit
but excluded from current totals. Pending submissions never restart voting.
There is at most one active round per quest and three photographs per round.

One mutable vote is keyed by school, round and generation, never manager.
Self-voting and cross-round photo IDs are rejected. Current counts are public
to authorized managers; vote-level activity and private review notes are not.
Lightweight polling updates counts every 30 seconds during voting without
re-signing/downloading photographs. Structural changes, explicit Refresh and
successful actions load the full context. Idle pages do not repeatedly fetch it.
Hidden tabs pause polling. Server timestamps and the private scheduled deadline
job close voting without requiring a browser session.

The Supervisor selects any participating photo after voting, regardless of
community ranking. Confirmation is mandatory. The existing Games interface
has a Side Quest Challenges tab with a pending-review/decision badge.

## Manager cancellation

A manager signed in to the challenging school, including its authorized temporary
manager, can use **Cancel My Challenge** while their
submission is pending or the approved round is voting/awaiting a decision.
Confirmation is required. Managers at other schools, supervisor sessions, and finalized rounds
cannot use cancellation. The server checks school ownership and current submission and
round revisions; retries are idempotent.

Pending cancellation removes the submission from review. Approved cancellation
withdraws only that photograph and voids its current ballot selections. Remaining
photographs keep their votes, generation, and deadline. If no challengers remain,
the round closes as canceled and the current champion remains unchanged. The
school's challenge attempt remains consumed. No points,
rewards, or unlock credits change. Photos, all voting generations, and a cancellation
audit entry remain stored; canceled rounds appear in history. Polling reloads the
comparison when a round revision changes, including withdrawals with no restart.

Validation: `node scripts/test-sidequest-cancel-db.mjs` uses in-memory PostgreSQL
with the real Showdown migrations and synthetic legacy authorization/list helpers.
It covers both dev/live engines without touching real school data.

## Approved Zero-Floor Policy

The user superseded the original no-net-new-points rule with a zero-floor
reversal. For a challenger victory:

- Recover the lesser of the original reward and the previous champion's
  nonnegative current season balance. Never make that balance negative.
- Award the full original reward to the selected challenger.
- Record the requested reward, actual recovery and unrecovered shortfall on
  the immutable decision audit. A shortfall increases net points by that
  amount; it is explicitly recorded, not silently hidden or treated as debt.
- Keep the original award transaction. Post separate, uniquely keyed negative
  and positive events through the existing rewards/points synchronization.
- Attribute both adjustments to the original Side Quest award date so saved
  monthly standings use the existing accounting correction logic.
- Keep all previous champion unlock credits, including credits already used.
  Award three new credits once, keyed uniquely to the finalized showdown.

A defending champion retaining the title causes no points or credit changes.
Decisions serialize on the existing Games settings row and the showdown row;
the existing spending paths share that settings lock. Finalized state, unique
ledger event keys, unique decision request IDs, and unique credit round IDs
prevent duplicate financial effects. Old regular approval/reward corrections
are blocked for a challenged quest so they cannot invalidate its transfer
audit; normal, unchallenged quest approvals are unchanged.

## Records And Closing

Original entries, quest claims, regular weekly win counters, awards and storage
objects remain unchanged. A separate current-champion record drives completed
cards and the Daily Bites slideshow. Round participants snapshot photographs;
rounds snapshot quest requirements. Prior photographs remain reviewable in
history. New challenges stop when the existing monthly competition closes;
its existing cycle and next-approved-release boundaries remain unchanged.
An active vote may finish afterward, and Supervisor
finalization remains available after closing. No finalized round reopens.

## Migration And Verification

`20261020153852_sidequest_showdown.sql` adds private RLS-protected tables,
server actions, a uniquely keyed unlock award kind, and a private deadline
scheduler. It verifies exact preservation of existing entries, regular claims,
and rewards in both environments. No live winners or transfers are seeded.
Anonymous/authenticated roles cannot access these tables or helpers directly.

Verification includes:

- `test-sidequest-showdown-local.cjs`: rolled-back real PostgreSQL workflow,
  approvals, eligibility, rejection correction, voting reset/deadlines,
  independent quests, discretionary finalization, zero-floor accounting,
  original records/credits, duplicate effects and month-close behavior.
- `test-sidequest-showdown-concurrency.cjs`: disposable synthetic PostgreSQL
  database; simultaneous approvals enforce three-photo capacity, separate
  managers share one school vote, simultaneous decisions post one financial
  pair and one credit award. Only that newly created test database is removed.
- `test-sidequest-showdown-browser.cjs`: intercepted normal manager/Supervisor
  navigation, upload/confirmation, vote changes, enlargement/keyboard close,
  review, discretionary decision, champion refresh, desktop/mobile layouts.
- Full React regression suite, API/photo privacy tests and production build.

No SSS, Coin Pusher, Breakroom, Bingo, authentication or operational schema is
changed. Production publication occurs only after the whole feature passes.

## Temporary-manager game access

An authorized temporary manager session participates for its selected school:
Side Quest and door photo uploads, Showdown submission/voting/cancellation, door
voting, mystery guessing, credit purchases/reveals, completed-card tracking and
new-challenge badges. Temporary game records use a stable school actor key; changing
covering names or opening another session does not create a new game identity.
Existing named-manager identities remain unchanged. Participation, school ownership,
self-vote restrictions, approval, deadlines and school-level attempt/reward limits
continue to apply. Daily Bites games and Bingo already use the school's shared records.

October 28 validation: `node scripts/test-showdown-automatic-rules.mjs` exercises
both rule environments in isolated PostgreSQL, including weekday/DST boundaries,
automatic starts, idempotent retries, limits shared by named/temporary managers,
withdrawal, month reset, private helpers and preserved awards. Supervisor winner
selection remains manual; expiration never automatically awards a winner.

Validation: `node scripts/test-temporary-manager-games-db.mjs` exercises temporary
uploads/voting/guesses with the real legacy dev/live engines. The Showdown database
suite also exercises temporary challenge submission, voting and cancellation.
