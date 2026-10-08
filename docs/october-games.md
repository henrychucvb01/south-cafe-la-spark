# October Games — live and development

## Production launch (October 8, 2026)
The user authorized promotion to main and real SPARK rewards for new production approvals and correct guesses. Migration `202610080007_october_games_production.sql` copies the saved setup into the private `october_live` schema once, including mystery photos/answers/pieces, quest edits/rewards, school selections, schedules, and existing progress. Imported test rewards are excluded from live scoring. Both copies keep references to immutable private images in the existing bucket; replaced images are retained to avoid deleting an image still used by the other environment.

Production on main uses the service-role-only `october_games_live()` function. Development previews continue to use `october_games_dev()` and cannot award real points. New live rewards synchronize into `public.spark_points` through unique event keys; retries do not duplicate points. Voiding/restoring a live award updates its existing ledger row and any saved monthly standings, without issuing Pull tokens. The development leaderboard overlay is disabled in production to prevent counting rewards twice.

Use **Daily Bites → October Games**. Supervisors manage games in **Command Center → Games & Challenges**. The existing active/paused states and dates remain in effect; deployment does not automatically activate games. Saved development changes made after launch do not automatically update the live copy.

## Start testing

1. Open SPARK and sign in as Supervisor (or SPARK Development for isolated testing).
2. Open **Games & Challenges** in the Command Center, then its **Games & Challenges** tab.
3. Expand **Participating schools**. The 28 real schools are selected from the existing directory. Test High School is available but initially excluded; select it if needed, then Apply schools.
4. Review quest instructions and rewards. Overall school participation is managed in Participating schools; existing per-program eligibility remains preserved.
5. Set Door Contest submission/voting dates. Upload all five supplied mystery images and review their answers/aliases. All games start paused; activate each independently when ready.
6. Managers open the **October Games** shortcut in Daily Bites. The Door gallery is also in **View All Spotlights**. Covering managers can submit photos; registered managers can also vote and guess.

No images have been downloaded or generated for the mysteries. The five round answers are seeded; artwork must be supplied by the supervisor. Dates use the device time zone when entered, are stored as timestamps, and are enforced on the server.

## Implemented behavior

- 15 supervisor-editable quests. The first approved school earns the quest’s single 10-point award; the quest then locks to other schools. Only that completion reveals five pieces. Photo preview, replace/remove, optional camera capture, permission confirmation, teacher review, rejection/replacement and resubmission.
- Browser WebP compression: longest edge 1200px, approximately 70% quality, target <=250KB. Simple images may be smaller than 100KB. Server re-encodes and strips metadata again.
- Approved trading cards include school, quest, photograph, review, and any earned points. Pending photos remain private to the submitting school and supervisor.
- 28 reusable Halloween frames, uncropped approved photographs, private pending status, one vote per registered manager, no own-school voting, hidden totals until close, supervisor tie handling and champion confirmation (+20 after +10 participation).
- Five shared mysteries, 32 persisted irregular triangles each, randomized sizes, diagonals and reveal order. Each approved quest contributes one five-piece event; overflow stops at the full current image and does not reveal the next round prematurely.
- Approvals while mysteries are paused queue their unlocks; withdrawn queued approvals do not reveal pieces. Once pieces have been shown, withdrawing an approval voids the points but does not erase managers’ knowledge of the image. Reapproval never adds another unlock event.
- One guess per employee per round; aliases ignore case and repeated whitespace. A serialized transaction chooses one winner, awards 25 points exactly once, and immediately advances. Maximum mystery winnings per school: 125.
- No full unsolved photo is sent to managers. Hidden pixels are removed server-side and the masked image is flattened so changing transparency cannot recover them. Future originals and accepted answers remain private.
- New-challenge corner badge, per-employee viewed state, manager/supervisor refresh and periodic updates.
- Development reward standings and a labeled test overlay in the existing Monthly Cup/season leaderboard, using earning dates. Voided awards are excluded; restoration reuses the original award.

## Isolation and authentication

The user explicitly approved isolated development setup in shared Supabase after automatic approval review identified the shared project. Migrations `202610080001`, `202610080002` and `202610080003` and `202610080004` add only `october_dev` records, a private `october-games-dev` photo bucket, and `october_games_dev()`.

The API uses development data on Preview deployments of `spark-development` or `development`, and live data only on production `main`. Existing Supabase service credentials are used on the server. The new function is executable only by the service role, and it additionally verifies the existing supervisor PIN or school-scoped manager session. Browser roles cannot read the new schema or call the function directly.

Regular managers use permanent employee IDs. Covering managers have a typed name and shared PIN, so votes/guesses require switching to their existing registered manager login. No additional login system was added.

No production points, Cup snapshots, Pull tokens, original Spotlight records, or existing functions are modified. Test rewards are in `october_dev.rewards`. The production promotion is explicitly authorized above; imported test rewards never become real awards.

## Validation

- `node scripts/test-october-games-db.mjs`: permissions, school privacy, approval/resubmission, duplicate rewards/unlocks, hidden answers/future images, 5 rounds/125 points, dates, votes, champion, corrections, viewed state and unchanged live ledger fixture.
- `node scripts/test-october-games-api.mjs`: Preview gate, upload authorization, raster re-encoding, randomized complete triangle coverage, hidden RGB removal and private storage paths.
- `node scripts/test-october-games-browser.mjs`: real built UI in isolated Chrome, existing manager login, phone/desktop layouts, JPEG-to-WebP compression and preview, consent, pending submission, approval/trading card, shared reveal, wrong-guess restriction and 28 frames. Uses local database/storage fixtures only.
- Component regression suites: October Games, Manager Hub, Spotlight and existing leaderboard, including month-based development points overlay.
- ESLint and optimized application build.

Physical phone-camera hardware has not been tested; capture/file controls and mobile responsive behavior are covered in Chrome. All test artwork and submissions used by automated checks are local fixtures, never uploaded to shared Supabase.

## October 8 UX update

- Orange-and-black Games theme; dedicated Manager Hub page with a Daily Bites shortcut. Visiting Daily Bites no longer marks Games viewed. Badges refresh on window focus and every 30 seconds, including at nonparticipating schools.
- Per-quest eligibility remains editable without an all-schools checkbox. Participating schools remains the overall gate.
- Drag/drop and file selection on every photo picker; mystery artwork has no camera control. Manager submissions retain mobile camera capture.
- Nonparticipating schools have **Preview manager experience**. Forms use local preview files and simulated confirmations; no image is uploaded, no guess/vote/submission is sent, and no points or puzzle pieces change.
- First-school claims are permanent and serialized. Pending submissions from other schools close when the first school is approved. Completed quests reject further uploads and competing approvals. Existing development quest awards are reconciled to the first-school rule; live points are untouched.

With 15 one-time quest completions, at most 75 pieces can be unlocked across five 32-piece photos. Guesses are allowed before full reveal; the five-piece reward has not been increased.

### Additional quests and completed cards
Supervisors can use **Add quest** to create more quests beyond the initial 15. New quests are available to participating schools when enabled and Side Quests is active. Each keeps the single-school lock, 10-point reward, and five-piece reveal. Creation checks the settings revision to prevent accidental duplicate retries. Apply migration `202610080005_october_custom_quests.sql` for this option.

Completed cards are gray with a diagonal COMPLETED stamp and the winning school's name. Click or press Enter/Space to flip between the task and its approved photo. Photos fit without cropping; reduced-motion preferences disable the animation. Nonparticipating manager preview includes a local happy-face example without creating a completion, award, or upload.

### Configurable SPARK Points rewards
Migration `202610080006_october_quest_rewards.sql` adds a per-quest reward (default 10). Supervisors can set 1–1,000 whole SPARK Points when creating or editing an uncompleted quest. Cards show the configured reward at the bottom. Approval uses that stored amount; manager requests cannot choose a reward. Completed rewards are locked and reapproval restores the original award without duplicating it. Door and mystery rewards are unchanged. These remain isolated development rewards until production rollout.
