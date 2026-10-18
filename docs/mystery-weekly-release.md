# Monthly Mystery Photo Releases

## Supervisor Controls

SPARK Games > Games & Challenges > Settings > Monthly Mystery Collections.
Each collection has twenty slots in four collapsed weekly groups of five.
Existing activated photos remain released and unchanged. New slots are blank
drafts; no photographs or answers are invented or reused automatically.

Finish the five photos, answers, and puzzle layouts in a group, choose the
Los Angeles release date/time, and confirm Schedule 5 photos. Unschedule a
group before changing its date or content. Released layouts retain the existing
lock; the existing question-only editor remains available for active mysteries.

The private scheduler checks every minute and releases only complete, explicitly
scheduled groups in chronological order. Draft months activate on their first
eligible weekly release, preserving the existing monthly archive/refund behavior.
No login is needed. No incomplete or unconfirmed group publishes.

## Pricing

Each month has its own first extra-guess price, second extra-guess price, and
multiplier for each later purchase. Defaults remain 10, 25, then doubling.
Purchase ordinals count the school's existing purchases across every photo in
that collection, including refunded purchases; weekly releases never reset them.
Changing prices affects future purchases only. Confirmations use the current
server price, and the existing transaction locks, debit history, request IDs,
refunds, daily free guesses, and credit awards remain in place.

Single unlock and five-credit bundle prices are independent; defaults remain
5 and 20 points. The minimum changes to the old ledger constraint retain its
package sizes, positive prices, and other event validation.

## Release Checks

Run `node scripts/test-mystery-weekly-local.cjs` against the isolated loopback
fixture (all test writes roll back), the full application tests, the production
build, and `node scripts/test-mystery-weekly-browser.cjs`. Browser requests are
intercepted and cannot touch live data.

The additive migration requires the existing automatic scheduler and aborts
if it is absent. It verifies exact preservation of existing photo rounds,
guess purchases, and unlock events while adding blank slots and draft weeks.
No production migration or publication has been performed during local work.
