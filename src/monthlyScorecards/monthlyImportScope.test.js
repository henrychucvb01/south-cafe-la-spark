import { monthlyCopyCsv, scopeMonthlyRows } from './monthlyImportScope';
import { parseCsv } from './monthlyImportParser';

test('scope retains mapped main, offsite and EEC records across dates without altering metrics', () => {
  const rows = ['MAIN', 'OFFSITE', 'EEC', 'OTHER'].map(source_site_id => ({source_site_id, production_date: '2026-09-01', food_cost: 123.45, wasted: 2}));
  expect(scopeMonthlyRows(rows, rows.slice(0, 3))).toEqual(rows.slice(0, 3));
  expect(() => scopeMonthlyRows(rows, [])).toThrow(/Nothing was imported/);
});

test('download retains all imported fields and provenance, escaping CSV and spreadsheet formulas', () => {
  const rows = [{source_site_id:'10001', item_name:'Soup, "tomato"', served:0, food_cost:-10, menu_name:'=HYPERLINK("unsafe")', source_row_number:18}];
  const csv = parseCsv(monthlyCopyCsv(rows, 'district.csv', 'hash'));
  expect(csv[0]).toContain('source_row_number');
  expect(csv[1]).toEqual(['10001', 'Soup, "tomato"', '0', '-10', "'" + rows[0].menu_name, '18', 'district.csv', 'hash']);
});
