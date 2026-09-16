import {
  buildMplhReportModel,
  findExtremeMealVariance,
  prepareMplhPdfData,
  resolveMplhExportRequest,
} from "./mplhReportModel";
import { createMplhReportPdfBytes } from "./mplhReportPdf";
import { PDFDocument } from "pdf-lib";

const school = { id: 1, school_name: "Alpha", location_code: "1001", labor_type: "elementary_prep", budget_labor_hours: 10 };
const meals = [
  { location_id: 1, service_date: "2026-09-01", breakfast_count: 100, lunch_count: 200, supper_count: null, supper_status: "pending" },
  { location_id: 1, service_date: "2026-09-02", breakfast_count: 120, lunch_count: 220, supper_count: null, supper_status: "pending" },
];
const labor = [{ location_id: 1, service_date: "2026-09-01", additional_worker_hours: 2, manager_overtime_hours: 1 }];
const build = (overrides = {}) => buildMplhReportModel({ schools: [school], mealRows: meals, laborRows: labor, excludedRows: [], startDate: "2026-09-01", endDate: "2026-09-02", ...overrides });

test("single-day behavior uses the existing daily formula", () => {
  const report = build({ endDate: "2026-09-01" }).schools[0];
  expect(report.summary.mealEquivalents).toBe(266);
  expect(report.summary.actual).toBe(13);
  expect(report.summary.mplh).toBeCloseTo(266 / 13);
});

test("multi-day averages breakfast and lunch independently", () => {
  const summary = build().schools[0].summary;
  expect(summary.breakfast).toBe(110);
  expect(summary.lunch).toBe(210);
});

test("supper is absent and not flagged when it does not apply", () => {
  const report = build().schools[0];
  expect(report.summary.supper).toBeNull();
  expect(report.daily.flatMap((day) => day.flags).some((flag) => flag.meal === "Supper")).toBe(false);
});

test("supper averages when applicable", () => {
  const report = build({ mealRows: meals.map((row, i) => ({ ...row, supper_count: i ? 40 : 20, supper_status: "complete" })) }).schools[0];
  expect(report.summary.supper).toBe(30);
});

test("averages daily meal equivalents", () => expect(build().schools[0].summary.mealEquivalents).toBe(282.6));
test("averages daily baseline", () => expect(build().schools[0].summary.baseline).toBe(10));
test("averages daily added hours", () => expect(build().schools[0].summary.added).toBe(1.5));
test("averages daily actual hours", () => expect(build().schools[0].summary.actual).toBe(11.5));

test("average MPLH is the average of daily MPLH values", () => {
  const expected = ((266 / 13) + (299.2 / 10)) / 2;
  expect(build().schools[0].summary.mplh).toBeCloseTo(expected);
});

test("target status uses average MPLH", () => expect(build().schools[0].summary.status).toBe("high"));

test("MPLH Report targets override Dolores and Willenberg without changing other NNC schools", () => {
  const schools = [
    { ...school, id: 1, school_name: "Dolores EL", location_code: "3452", labor_type: "elementary_nnc", mplhTarget: { min: 24, max: 25 } },
    { ...school, id: 2, school_name: "Willenberg Special Ed", location_code: "1957", labor_type: "special", mplhTarget: null },
    { ...school, id: 3, school_name: "Other NNC", location_code: "9999", labor_type: "elementary_nnc", mplhTarget: { min: 24, max: 25 } },
  ];
  const report = build({ schools, mealRows: [], laborRows: [] });
  expect(report.schools[0].summary.target).toEqual(expect.objectContaining({ min: 20, max: 22 }));
  expect(report.schools[1].summary.target).toEqual(expect.objectContaining({ min: 20, max: 22 }));
  expect(report.schools[2].summary.target).toEqual(expect.objectContaining({ min: 24, max: 25 }));
});

test("Dolores daily status uses the 20-22 MPLH report override", () => {
  const dolores = { ...school, location_code: "3452", labor_type: "elementary_nnc", mplhTarget: { min: 24, max: 25 } };
  const report = build({ schools: [dolores], mealRows: [{ ...meals[0], breakfast_count: 0, lunch_count: 210 }], endDate: "2026-09-01", laborRows: [] }).schools[0];
  expect(report.daily[0].mplh).toBe(21);
  expect(report.daily[0].status).toBe("target");
});

test("excluded and weekend dates are not operating days", () => {
  const report = build({ endDate: "2026-09-07", excludedRows: [{ location_id: 1, service_date: "2026-09-03" }] }).schools[0];
  expect(report.daily.map((day) => day.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-04", "2026-09-07"]);
});

test("missing breakfast is flagged", () => {
  const report = build({ mealRows: [{ ...meals[0], breakfast_count: null }] }).schools[0];
  expect(report.daily[0].flags.some((flag) => flag.message === "Missing Breakfast")).toBe(true);
});

test("missing lunch is flagged", () => {
  const report = build({ mealRows: [{ ...meals[0], lunch_count: null }] }).schools[0];
  expect(report.daily[0].flags.some((flag) => flag.message === "Missing Lunch")).toBe(true);
});

test("extreme variance helper is conservative and identifies only extreme values", () => {
  const rows = [100, 101, 99, 102, 98, 100, 500].map((value, index) => ({ date: `d${index}`, value }));
  expect([...findExtremeMealVariance(rows)]).toEqual(["d6"]);
  expect(findExtremeMealVariance(rows.slice(0, 6)).size).toBe(0);
});

test("school daily history retains one row per operating day", () => expect(build().schools[0].daily).toHaveLength(2));

test("coverage counts meal-data days and flags", () => {
  const report = build({ endDate: "2026-09-03" }).schools[0];
  expect(report.summary.operatingDays).toBe(3);
  expect(report.summary.daysWithMealData).toBe(2);
  expect(report.summary.dataFlags).toBe(2);
});

test("PDF preparation reuses selected report model", () => {
  const model = build();
  const pdf = prepareMplhPdfData(model, 1);
  expect(pdf.reports[0]).toBe(model.schools[0]);
  expect(pdf.startDate).toBe("2026-09-01");
});

test("polished all-school and school-history PDFs render from the shared model", async () => {
  const model = build();
  const allPdf = await PDFDocument.load(await createMplhReportPdfBytes(model));
  const schoolPdf = await PDFDocument.load(await createMplhReportPdfBytes(model, 1));
  expect(allPdf.getPageCount()).toBe(1);
  expect(schoolPdf.getPageCount()).toBeGreaterThanOrEqual(1);
});

test("export waits for the visible range and locks the selected school", () => {
  const model = build();
  expect(resolveMplhExportRequest(model, 1, "2026-09-01", "2026-09-02")).toEqual({ model, schoolId: 1 });
  expect(resolveMplhExportRequest(model, 1, "2026-09-01", "2026-09-15")).toBeNull();
  expect(resolveMplhExportRequest(model, 999, "2026-09-01", "2026-09-02")).toBeNull();
  expect(prepareMplhPdfData(model, 1).reports.map((report) => report.school.id)).toEqual([1]);
});
