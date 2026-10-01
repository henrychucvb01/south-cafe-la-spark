import { getLocalDateString, SCHOOL_YEAR_START } from "./sparkPolicy";

export function adjustmentMonths(today = getLocalDateString()) {
  const months = [];
  const end = today.slice(0, 7);
  let year = Number(SCHOOL_YEAR_START.slice(0, 4));
  let month = Number(SCHOOL_YEAR_START.slice(5, 7));
  while (`${year}-${String(month).padStart(2, "0")}` <= end) {
    const value = `${year}-${String(month).padStart(2, "0")}`;
    months.push({ value, label: new Date(`${value}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/Los_Angeles" }) });
    if (++month > 12) { month = 1; year++; }
  }
  return months.reverse();
}

export function adjustmentServiceDate(month, today = getLocalDateString()) {
  if (!adjustmentMonths(today).some(option => option.value === month)) {
    throw new Error("Choose a points month from the list.");
  }
  if (month === today.slice(0, 7)) return today;
  return `${month}-01` < SCHOOL_YEAR_START ? SCHOOL_YEAR_START : `${month}-01`;
}
