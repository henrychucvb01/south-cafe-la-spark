# BIC classroom menu groups

School Breakfast Menu retains its date picker and Monday–Friday controls. Standard BIC is a virtual default, not a new set of classroom assignments. The migration does not create groups or change Carson's roster, QR tokens, menus, records, orders, or events.

## Manager workflow

1. Open **Manage Groups**, create a named group, choose **Main menu** or **Milk only**, and check its classrooms. Classrooms can belong to multiple groups. Group type remains fixed to prevent silently reinterpreting saved menus; names and membership can be edited. Deleting a group requires confirmation and preserves submitted order/service snapshots and audit history.
2. Choose a service date and a compact group tab. Main groups save a complete menu, including deliberate omissions. **Copy Menu From** stages another group's menu so items can be unchecked or changed before saving. Milk groups copy only milk keys. Existing saved menus require confirmation to replace; a school configuration revision rejects stale writes.
3. **Copy Menu to another date** copies the selected group's saved menu to another service date, with confirmation before replacing a saved destination.
4. **Preview Classroom Menu** uses the same resolver as teacher QR and worker packing. Select a classroom to see the final items. Missing group menus and disagreeing main/milk groups block new preorders and show warnings. **Resolve / customize this classroom** saves an explicit complete menu for that classroom and date after a confirmation checkbox. It is not available after an order or service record protects that menu. **Use group menus again** explicitly removes an unsnapshotted resolution.

## Resolution and accommodations

- Standard BIC supplies the default menu.
- One main group's menu replaces the default completely. Multiple identical main menus agree; different menus require explicit classroom resolution.
- Milk groups replace only `milk1`, `milkNonfat`, `milkLactaid`, and `milkSpecial`. They never restore food removed from Kindergarten or another main menu. Different milk group menus conflict.
- `milkSpecial` is an explicit field for authorized non-dairy/special milk; it is never inherited from Standard BIC. Once groups exist, unassigned classrooms also do not inherit vegan, Other/special-diet, or Lactaid fields from the default. Put accommodations in an assigned group or explicit classroom resolution. Existing submitted accommodations retain their original snapshots.
- Submitted preorders freeze their item names and quantities. Packed or signed/current submitted records retain their service menu. Configuration changes apply to records that have not been protected; old orders are not rewritten.

## Teacher QR, packing and history

QR tokens and PIN/session checks are unchanged. Teachers use the same attendance, count, signature, confirmation and preorder flow. The resolved preorder includes only appropriate items and supports each item's actual quantity, including zero. Old saved entree-only preorders remain unchanged. An older already-open teacher client remains compatible while its school has no groups/resolution; configured group menus require the current page.

Worker packing starts from submitted quantities where present; missing quantities remain unknown in reports. Packed records always take precedence over preorders. New grouped Lactaid/special-milk packing cannot exceed the saved order. Corrections to pre-existing legacy packed records retain their old workflow.

The original district packing PDF is reused. Different menu, campus or quantity-source combinations print on separate sheets, with each sheet's correct menu headings. Special milk uses the existing Other column with its name in a note; when an approved Other item is also present their quantities share that column. Preorder versus packed quantities are labeled. Conflicting menus block printing rather than producing a misleading report. Original returned-item tracking and packed names remain intact.

## Storage and verification

Additive private tables: `breakfast_menu_group_settings`, `breakfast_menu_groups`, `breakfast_menu_group_members`, `breakfast_group_daily_menus`, `breakfast_classroom_daily_menus`, `breakfast_menu_group_audit`. All use RLS with direct client access revoked. A PIN-session-checked workspace RPC scopes operations to the manager's school. Private menu helpers cannot be called by clients. A school transaction lock serializes menu configuration, preorders and packing, and the configuration revision prevents stale manager saves. Migration checksums assert original classroom/QR, record, menu and event rows are unchanged.

Checks use fictional data only:

- `CI=true npm test -- --watch=false --runInBand src/breakfast`
- `node scripts/test-bic-menu-groups.mjs`
- `node scripts/test-breakfast-day-corrections.mjs`
- `node scripts/test-breakfast-packing-form.mjs`
- `BIC_BROWSER_EXECUTABLE=/path/to/chromium node scripts/test-bic-menu-groups-browser.mjs` (omit variable with a normal Playwright Chromium install)
- `CI=false npm run build`

The browser test intercepts every network request and sends BIC RPCs to isolated in-memory PostgreSQL. It covers the production manager UI, real group SQL, copy/uncheck/save, overlapping memberships, classroom preview, signed teacher count and preorder through the unchanged QR, and desktop/390px/320px layouts. PDF checks retain district fields, zero/unknown semantics, historical labels and blank signatures.
