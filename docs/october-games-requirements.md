# CODEX — SPARK October Games

Build the October Games system in **SPARK Development only**. Do not deploy to production.

First inspect the existing Daily Bites, SPARK Spotlight, Supervisor Command Center, points system, school login, and Supabase structure. Reuse existing features wherever possible.

## Manager identity

Reuse the existing SPARK manager login and stable employee identity for voting and mystery guesses. Do not introduce another login. Display names are not identity keys. Report any uniqueness issue before implementing voting restrictions.

Regular managers have a permanent employee ID. Covering managers currently supply a free-text name with a shared PIN and have no employee ID. Voting and guesses require a registered manager identity through the existing login. Covering managers can submit photos for their school; do not use their typed name or a newly opened session as a unique person identifier.

## 1. Daily Bites Changes

- Remove the Comics feature from the interface.
- Add three game sections:
  - Side Quests
  - Halloween Door Decorating Contest
  - Mystery Photo Unlock
- Add a small **NEW CHALLENGE** notification on the corner of the Daily Bites menu button.
- Clear the notification when a manager views the new challenge.
- Make everything mobile-friendly.

## 2. October Side Quests

Create these 15 challenges, worth 10 points each:

1. **Picture Perfect Lunch:** Photograph a beautifully presented, complete school lunch tray.
2. **Team Spirit:** Take a creative group photo of your cafeteria team.
3. **Teacher Taste Test:** Photograph a teacher enjoying a school meal and include their written review.
4. **Rainbow Challenge:** Photograph a colorful fruit and vegetable display.
5. **Breakfast Champions:** Photograph your breakfast setup before service.
6. **School Pride:** Show school colors or mascot displayed in the cafeteria.
7. **Clean Machine:** Photograph your clean serving area after cleanup.
8. **Lunch Hero:** Photograph a cafeteria employee proudly serving lunch.
9. **The Admin Squad:** Take a group photo of the entire school administrative staff.
10. **Fruit Masterpiece:** Create and photograph a creative, food-safe fruit arrangement.
11. **Milk Mustache:** Photograph a consenting adult posing playfully with school milk.
12. **Behind the Scenes:** Photograph your cafeteria team preparing for meal service.
13. **BIC Bag Champions:** Photograph workers preparing Breakfast in the Classroom bags.
14. **Supper Spotlight:** Photograph your Supper Program meals or service.
15. **The Hidden SPARK:** Creatively hide the letters S-P-A-R-K in a cafeteria scene and photograph them.

### Side Quest Rules

- Each school can complete each quest once.
- Managers can complete as many available quests as they want.
- Require photographic proof.
- Allow phone camera capture or gallery/file uploads.
- Automatically compress photos to WebP, maximum 1200 pixels, approximately 70% quality, targeting 100–250 KB.
- Remove unnecessary image metadata.
- Provide photo preview and replacement before submission.
- Supervisor must approve every submission.
- Supervisor may approve, reject, or request a new photo.
- Rejected submissions can be resubmitted.
- Award 10 points only after approval.
- Prevent duplicate point awards.
- Automatically publish approved photos as trading cards on Daily Bites, including school name, quest name, photo, and points.
- Require appropriate permission for identifiable people shown in published photos.
- Only show BIC and Supper quests to eligible schools.

Display this disclaimer:

"All submissions are subject to Area Food Services Supervisor approval. Photographs must clearly demonstrate completion of the challenge and be well-composed, clear, creative, and appropriate. The Supervisor has final discretion in determining whether a submission qualifies. Uploading a photo does not guarantee points."

## 3. Halloween Door Decorating Contest

Create a separate contest inside Daily Bites.

- One entry per school.
- Manager uploads a photo of a decorated cafeteria or kitchen door.
- Supervisor reviews and approves the photo.
- Award **10 participation points** upon approval.
- Automatically apply a decorative Halloween border with the school's name.
- Publish approved entries to SPARK Spotlight.
- Each manager receives one vote.
- Managers cannot vote for their own school.
- Keep vote totals hidden until voting ends.
- Award **20 additional points** to the winning school.
- Automatically give the winning entry a special champion border.
- Supervisor controls submission dates, voting dates, and winner confirmation.
- Handle tied votes through supervisor review.
- Prevent duplicate votes and points.

### Pre-designed school frames

- Create a frame for each of the 28 participating schools using the existing school database, not a hard-coded list.
- Show the school name and an “Awaiting Entry” placeholder before an entry is approved.
- Reuse a lightweight festive Halloween CSS or SVG border; do not store 28 separate border images.
- Automatically place each approved school photo inside its frame in the SPARK Spotlight contest gallery.
- Preserve the entire photo with a contain layout; do not crop important content.
- Show “Submitted — Pending Approval” privately to that school's manager and the supervisor. Other schools continue to see the blank placeholder until approval.
- Voting is available only for approved entries and never for the manager's own school.
- After voting ends and the supervisor confirms the winner (including resolving ties), show a special gold champion border.
- Approval awards 10 participation points once. The winner receives 20 additional points once.

## 4. Mystery Photo Unlock Game

Create a Halloween-themed shared mystery photo game.

### Five rounds

1. Jack-o'-lantern
2. Ursula — The Little Mermaid
3. Maleficent — Sleeping Beauty
4. Wicked Witch — The Wizard of Oz
5. Scarlet Witch — Marvel

**Important:** Do not generate or download character images. I will supply the artwork.

Supervisor must be able to upload and replace each mystery image and enter its accepted answer.

### Puzzle mechanics

- Each mystery photo is covered by **30–40 randomly arranged irregular geometric triangular pieces**.
- Use a modern polygon design, not square tiles or traditional jigsaw pieces.
- Each photo must have more than 25 triangles of varying sizes and a different randomized arrangement.
- Persist each round’s arrangement so every school sees the same puzzle.
- The pieces must collectively cover the entire image without gaps.
- All schools see the same shared puzzle.
- Each approved Side Quest completion unlocks **5 pieces**.
- Each Side Quest completion can trigger its unlock reward only once.
- Reveal pieces using a short animation.
- Managers can guess at any time.
- Each manager receives **one guess per mystery photo**.
- A wrong guess uses that manager's guess for that round.
- The first correct guess wins **25 SPARK points** for their school.
- The same school may win multiple rounds, up to 125 mystery points across all five rounds.
- Once solved, reveal the full photo and announce the winning school.
- Automatically begin the next mystery with a fully covered image and reset guesses.
- After all five mysteries are solved, display the winners and completed collection.

If all pieces have been unlocked without a correct guess, leave the image visible until someone solves it.

Only approved Side Quest completions count toward puzzle unlocks. Door Decorating Contest entries do not unlock puzzle pieces.

Prevent duplicate unlocks, race-condition errors, and duplicate winner awards.

### Guessing and answer validation

- Accepted answers are configured by the supervisor.
- Ignore capitalization and extra spaces.
- Support supervisor-configured alternative correct spellings.
- Never expose the answers to manager accounts before a round is solved.
- Record the server-side submission time to determine the first correct answer.

## 5. Supervisor Command Center

Create a **Games & Challenges** management section.

Supervisor can:

- Activate, pause, or end each game independently.
- Manage quests and eligibility.
- Review submitted photos.
- Approve, reject, or request replacement photos.
- Manage Halloween Door Contest entries and voting.
- Upload the five mystery images.
- Configure accepted mystery answers.
- View guesses and winners.
- Monitor quest completion and puzzle progress.
- Review all awarded points.
- Correct mistakes without creating duplicate rewards.

Use existing supervisor authentication and permissions.

## 6. Database and Storage

Reuse existing Supabase infrastructure.

- Store compressed images in Supabase Storage.
- Store submission metadata, approvals, votes, guesses, and unlock events in database tables.
- Enforce school-level access and supervisor permissions.
- Ensure one approved completion per school per quest.
- Ensure one door entry per school and one vote per manager.
- Ensure one mystery guess per manager per round.
- Use secure, server-side operations for awarding points and determining winners.
- Integrate all rewards with the existing SPARK leaderboard and monthly scoring.
- Avoid unnecessary image copies or excessive database writes.

Do not disrupt existing SPARK functionality.

## 7. Testing and Delivery

Test the complete workflow on desktop and mobile.

Verify:
- Camera uploads work on phones.
- Photos are automatically compressed.
- Supervisor approval controls points.
- Trading cards publish correctly.
- Door contest voting restrictions work.
- Each approved quest unlocks exactly five puzzle pieces.
- Mystery guesses reset each round.
- Winner points are awarded only once.
- School isolation and supervisor permissions work.
- Existing Daily Bites and leaderboard features still function.

Run relevant tests, lint, and build checks.

**Development only. Do not merge or deploy to production.**

### Implementation order

1. Inspect existing SPARK systems and report findings.
2. Build Side Quests, photo uploads, and approval.
3. Build automatic trading cards.
4. Build the Halloween Door Contest and voting.
5. Build the Mystery Photo Unlock game.
6. Add notifications and finish Daily Bites integration.
7. Test everything.

Work in manageable stages to conserve Codex usage. Preserve existing functionality. Report completed changes and outstanding issues after each stage.

## Development isolation

- Work on the development branch only; do not merge or deploy to production.
- The current browser client uses the same Supabase project in development and production. A development branch alone does not isolate data or points.
- Build and test new database operations locally before applying anything remotely.
- Development game records, storage objects, and rewards must be isolated from live SPARK records and Cup standings. Test rewards must never be inserted into the live points ledger.
- Reuse existing login/session verification, storage upload conventions, and scoring semantics; do not change existing production functions to make a development game work.
- Verify isolation at the server/database layer, not only by hiding development UI.

## Stage 1 inspection — October 7, 2026

Inspection completed before implementation. See `october-games.md` for the implemented behavior and setup.

| Area | Existing implementation / reuse |
| --- | --- |
| Manager login | `src/pages/EmployeeSelectPage.js`, `src/pages/ManagerPinPage.js`; regular managers use employee ID plus PIN; covering managers use typed name plus shared PIN. |
| School-scoped sessions | `src/supperMonitoring/service.js`, `open_supper_monitoring_session` and `require_supper_monitoring_session`; derive school and employee from verified session rather than caller-supplied IDs. |
| Daily Bites | `src/pages/DailyBitesPage.js`; existing Spotlight feed, Comics and Bingo. Remove only Comics interface when game integration is ready. |
| Supervisor navigation | `src/pages/CommandCenterLegacy.js` via `src/pages/CommandCenter.js`; reuse existing supervisor authentication and management navigation. |
| Spotlight / photos | `src/spotlight/service.js`, `api/spotlight.js`, migration `202610010004_spotlight.sql`; private storage, signed image URLs and supervisor publication. Existing Spotlight compression is JPEG; Games needs a separate WebP preparation helper to preserve existing behavior. |
| Points | `src/sparkPoints.js`; existing unique-key ledger convention. Games awards and winner selection must be server-controlled, atomic and idempotent. |
| Existing reaction restriction | Spotlight reactions are per location, not per employee. Do not copy this restriction for one-vote-per-manager rules. |
| Development route gating | `api/ask-spark-import.js` already uses a Preview-only server gate. Reuse the approach alongside actual data isolation. |
| School directory | Reuse active school records and established real-school filtering. Do not assume every active record belongs in the 28-school contest: the directory also contains a test school. |

Inspection decisions carried into implementation:

1. Registered employee identities vote and guess using the existing login. Covering managers retain photo submissions and viewing.
2. Validate the participating school set and BIC/Supper eligibility from existing school settings; do not infer eligibility solely from a school name or the Breakfast pilot rollout toggle.
3. Implement development data/reward isolation before running game mutations against the shared Supabase project.
4. Mystery artwork is supplied by the user through the supervisor upload; no character images will be generated or downloaded.

Implementation and validation are recorded in `october-games.md`. No production deployment is authorized.
