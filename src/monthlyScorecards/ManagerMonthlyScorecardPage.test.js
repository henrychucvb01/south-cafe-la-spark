import { getManagerMonthRange } from "./ManagerMonthlyScorecardPage";

test("uses month-to-date for the current month", () => {
  const range=getManagerMonthRange("2026-09",{meal_counts:[{service_date:"2026-09-02"}]},new Date(2026,8,15));
  expect(range).toEqual({startDate:"2026-09-02",endDate:"2026-09-15"});
});

test("uses the available data period for a completed month", () => {
  const dataset={meal_counts:[{service_date:"2026-08-12"}],production_rows:[{production_date:"2026-08-31"}]};
  expect(getManagerMonthRange("2026-08",dataset,new Date(2026,8,15))).toEqual({startDate:"2026-08-12",endDate:"2026-08-31"});
});
