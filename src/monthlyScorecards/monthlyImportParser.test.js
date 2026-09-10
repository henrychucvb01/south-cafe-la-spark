import { detectReportType, parseCsv, parseMonthlyReport } from "./monthlyImportParser";

test("parses quoted CSV fields", () => {
  expect(parseCsv('Name,Value\n"Soup, tomato",12')[1]).toEqual(["Soup, tomato", "12"]);
});

test("detects repeated daily production cost and excludes extra sales", () => {
  const csv = "Daily Production Cost,,,,,,,,,,,,,\nProduced by (1195701) WILLENBERG SP ED,,,,,,,,Lunch,,,Service Date: 8/12/2026,,\nItem Description,,,Case / Unit Description,,,,Quantity Used,,,,Cost of Goods,,Donated Value\nTotal Used For Lunch,,,,,Plate Count: 128,,,,,,$188.80,,$0.00\n,,,,For Meals,,Per Plate,,,For Extra Sales,,,,\n,Cost of Food Used,,,$188.80,,$1.475,,,$12.00,,,,";
  expect(detectReportType(parseCsv(csv))).toBe("cost");
  expect(parseMonthlyReport(csv,"cost","2026-08-01").normalizedRows[0]).toMatchObject({ source_site_id:"1195701",meal_type:"lunch",food_cost:188.8 });
});

test("parses repeated production report sections", () => {
  const csv = "LAUSD DAILY MEAL PRODUCTION REPORT,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\nMenu Plan Date:,,,8/12/2026,Program:,NSLP,,Site:,(1195701) WILLENBERG SP ED,,,,,,,,,,,,,,,,,,Meal:,Lunch\nItemID / Recipe Number,,Menu Item,,,,,,,,,,,,Servings Planned,,,,,,Number of Portions Prepared,,,Portions Served,,,Number of Portions Leftover\nR10,,Bean Bowl,,,,,,,,,,,,100,,,,,,105,,,98,,,7";
  const result = parseMonthlyReport(csv,"production","2026-08-01");
  expect(result.normalizedRows[0]).toMatchObject({ source_site_id:"1195701", item_name:"Bean Bowl", served:98 });
});

test("rejects an unexpected format before producing rows", () => {
  expect(() => parseMonthlyReport("a,b\n1,2","cost","2026-09-01")).toThrow(/format|match/i);
});
