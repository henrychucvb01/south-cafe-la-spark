import { detectReportType, parseCsv, parseMonthlyReport } from "./monthlyImportParser";

test("parses quoted CSV fields", () => {
  expect(parseCsv('Name,Value\n"Soup, tomato",12')[1]).toEqual(["Soup, tomato", "12"]);
});

test("detects and filters official meal counts", () => {
  const csv = "Main Site ID,Site ID,Service Date,Meal Type,Meal Count\n8575,9901,09/03/2026,Breakfast,100\n8575,9901,09/03/2026,Snack,10";
  const result = parseMonthlyReport(csv, "official_meal_count", "2026-09-01");
  expect(result.normalizedRows).toHaveLength(1);
  expect(result.normalizedRows[0]).toMatchObject({ main_site_id:"8575", meal_type:"breakfast", official_count:100 });
});

test("expands wide official meal count rows", () => {
  const csv = "Main Site ID,Site ID,Service Date,Breakfast,Lunch,Supper,Snack\n8575,8575,09/03/2026,80,200,25,10";
  const result = parseMonthlyReport(csv,"official_meal_count","2026-09-01");
  expect(result.normalizedRows.map((row)=>row.meal_type)).toEqual(["breakfast","lunch","supper"]);
});

test("detects daily production cost and excludes Extra Sales", () => {
  const csv = "Location Code,Production Date,Program,Food Cost\n8575,09/03/2026,Lunch,$250.25\n8575,09/03/2026,Extra Sales,$4";
  expect(detectReportType(parseCsv(csv))).toBe("cost");
  expect(parseMonthlyReport(csv,"cost","2026-09-01").normalizedRows).toHaveLength(1);
});

test("parses repeated production report sections", () => {
  const csv = "LAUSD Daily Meal Production Report\nLocation ID: 8575\nProduction Date: 09/03/2026\nMeal: Lunch\nItem Code,Item Name,Planned,Prepared,Served,Leftover\n10,Bean Bowl,100,105,98,7";
  const result = parseMonthlyReport(csv,"production","2026-09-01");
  expect(result.normalizedRows[0]).toMatchObject({ source_site_id:"8575", item_name:"Bean Bowl", served:98 });
});

test("rejects an unexpected format before producing rows", () => {
  expect(() => parseMonthlyReport("a,b\n1,2","cost","2026-09-01")).toThrow(/format|match/i);
});
