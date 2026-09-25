# Manager correction alert and PDF rotation

Manager Hub checks the signed-in school's monitoring records. An unlocked Manager monitoring with Corrections Requested turns the Monitoring card light red and displays a count plus a resubmission message. This includes covering Managers and all monitoring types/sites in the school. The check refreshes on entering the Hub, regaining focus and every minute while visible, reusing its authenticated session. Leaving closes that session. Resubmitted/accepted records no longer count. Failed refreshes preserve an existing warning and an initial failure displays a status-check message.

Upload review provides Rotate Page Left and Rotate Page Right for the selected page. Rotation applies to the combined document before submission, with the review confirmation reset. Only page rotation metadata changes; content is not rasterized. Corrected uploads use the same path.

Supervisor review offers the same controls on unlocked submitted/returned records. Save PDF & Comments, Return for Correction and Accept & Lock persist the rotated PDF and transformed location comments/drawings together. Manager viewing and downloads use the stored orientation. Accepted records require an intentional unlock before rotation. No audit/version archive is created.

## Deployment dependency

Apply `supabase/migrations/202609250007_monitoring_pdf_rotation.sql` before deploying this change. It adds one service-only transaction function using existing school/session permissions, revision checks, current-PDF storage, annotation validation and review state transitions. Previous migrations do not need to be rerun. No tables/columns or backfill are added. The Manager alert and upload rotation do not themselves require schema changes.

## Verification

- HomeBase tests: regular/covering Managers, count/status filtering, refresh clears alert, failure retains warning and session reuse.
- PDF rotation tests: forward/inverse annotation coordinates and validation.
- `node scripts/test-supper-global-workflow.mjs`: stored rotation and download, transformed markup, authorization, stale revisions, rollback on invalid markup, accepted lock, current-only storage.
- `node scripts/test-supper-monitoring-review-browser.mjs`: mobile upload rotation/confirmation/page retention, Supervisor rotation with comments/drawing, Manager correction Hub highlight, combined PDFs and existing review workflow.
- Full unit suite and production build.
