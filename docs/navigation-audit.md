# Authenticated navigation audit

All authenticated screens use the shared `PageNavigationProvider` in App. The
fixed 56px bar has a named logical destination and a separate Back to Top action.
No navigation uses browser history. Sign-in and location/PIN selection are outside
this shell. Manager Hub and Command Center are roots and omit the parent button.

| Screen | Parent |
| --- | --- |
| School Dashboard (SchoolHub), Daily Bites, Incident Record Helper, Manager Resources, Manager Monthly Scorecard, Monitoring | Manager Hub |
| Ask SPARK, Operations Help, Location Information, How to Earn Points | Manager Resources |
| Manager Meal Analytics, new Finish Line | School Dashboard |
| Finish Line History (SchoolDashboard) | School Dashboard |
| Editing an existing Finish Line | Finish Line History |
| Supervisor school Meal Analytics, Finish Line preview, Monitoring overview | Command Center |
| Supervisor Finish Line, Recent Changes, Meal Analytics, MPLH Report, Monthly Scorecards, Meal Audit, Labor Optimization, Staffing, SPARK Points, Leaderboard, Location Directory, Feedback, Manager PIN Reset | Command Center dashboard |
| School monthly scorecard | Monthly Scorecards |
| Labor school scorecard | Labor Optimization |
| School MPLH report | MPLH Report |
| Supervisor school monitoring list | Supervisor Monitoring |
| Guided monitoring | Monitoring (save draft before leaving) |
| Monitoring record detail / upload entry | Monitoring |
| Manager upload preview | Upload Existing Monitoring (preserves selected files) |
| Supervisor upload on behalf | Supervisor Monitoring |
| Supervisor queue PDF review | Supervisor Monitoring (unsaved-markup confirmation) |
| PDF opened from a monitoring detail | Monitoring Details (unsaved-markup confirmation) |

Daily Bites games/training, Incident Helper steps, school detail side panels,
directory selection, audit filters, and staffing editor dialogs are contained
within their parent feature rather than separate App routes. Their existing
section/close controls remain; the shared feature destination stays available.
Blocking dialogs retain their own cancel/close action.

The navigation registry uses level 0 for App routes, 1 for feature containers,
2 for record/detail views, 3 for upload preview, and 4 for PDF review. Unmounting a
child restores the parent registration; callback refs always use current state.
Future App screens must define their destination in App's route map; nested full
page workspaces register a specific destination with `usePageNavigation`.

Supervisor school analytics previously returned to a Manager route and rendered
Manager feedback. Both now use the Supervisor context. Exit Supervisor remains a
separate explicit action and is never used by a normal navigation callback.

No database changes or migrations.
