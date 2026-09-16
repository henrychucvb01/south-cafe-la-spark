const TARGETS = {
  secondary: { min: 18, max: 20 },
  elementary_prep: { min: 20, max: 22 },
  elementary_nnc: { min: 24, max: 25 },
};

const numberOrNull = (value) =>
  value === null || value === undefined || value === "" || Number.isNaN(Number(value))
    ? null
    : Number(value);

const average = (values) => {
  const valid = values.filter((value) => Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
};

export function dateKeysBetween(startDate, endDate) {
  const dates = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor <= end) {
    if (cursor.getDay() >= 1 && cursor.getDay() <= 5) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function getMplhStatus(mplh, target) {
  if (!Number.isFinite(mplh) || !target) return "no-data";
  if (mplh < target.min) return "below";
  if (mplh <= target.max) return "target";
  return "high";
}

// A conservative, distribution-based extreme-outlier rule. It requires at least
// seven observations and uses the outer Tukey fence (3 x IQR), so ordinary daily
// movement is not flagged. A flat range deliberately produces no variance flags.
export function findExtremeMealVariance(valuesByDate) {
  const rows = valuesByDate.filter((row) => Number.isFinite(row.value));
  if (rows.length < 7) return new Set();
  const sorted = rows.map((row) => row.value).sort((a, b) => a - b);
  const quantile = (p) => {
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  };
  const q1 = quantile(0.25);
  const q3 = quantile(0.75);
  const iqr = q3 - q1;
  if (iqr <= 0) return new Set();
  const lowFence = q1 - 3 * iqr;
  const highFence = q3 + 3 * iqr;
  return new Set(
    rows
      .filter((row) => row.value < lowFence || row.value > highFence)
      .map((row) => row.date)
  );
}

function getTarget(school) {
  if (school.mplhTarget) return school.mplhTarget;
  if (String(school.location_code) === "1957") return TARGETS.special;
  return TARGETS[school.labor_type] || null;
}

export function buildMplhReportModel({
  schools,
  mealRows,
  laborRows,
  excludedRows,
  startDate,
  endDate,
}) {
  const weekdays = dateKeysBetween(startDate, endDate);
  const meals = new Map((mealRows || []).map((row) => [`${row.location_id}|${row.service_date}`, row]));
  const labor = new Map((laborRows || []).map((row) => [`${row.location_id}|${row.service_date}`, row]));
  const excluded = new Set((excludedRows || []).map((row) => `${row.location_id}|${row.service_date}`));

  const schoolReports = (schools || []).map((school) => {
    const target = getTarget(school);
    const operatingDates = weekdays.filter((date) => !excluded.has(`${school.id}|${date}`));
    const schoolMealRows = operatingDates.map((date) => meals.get(`${school.id}|${date}`)).filter(Boolean);
    const supperApplies = schoolMealRows.some(
      (row) => row.supper_status === "complete" || numberOrNull(row.supper_count) !== null
    );

    const daily = operatingDates.map((date) => {
      const meal = meals.get(`${school.id}|${date}`) || null;
      const laborRow = labor.get(`${school.id}|${date}`) || null;
      const breakfast = numberOrNull(meal?.breakfast_count);
      const lunch = numberOrNull(meal?.lunch_count);
      const rawSupper = numberOrNull(meal?.supper_count);
      const supper = meal?.supper_status === "pending" ? 0 : rawSupper;
      const hasMealData = Boolean(meal && (breakfast !== null || lunch !== null || rawSupper !== null));
      const mealEquivalents = meal
        ? (breakfast || 0) * 0.66 + (lunch || 0) + (supper || 0)
        : null;
      const baseline = Number(school.budget_labor_hours) || 0;
      const added =
        (Number(laborRow?.additional_worker_hours) || 0) +
        (Number(laborRow?.manager_overtime_hours) || 0);
      const actual = baseline + added;
      const mplh = meal && actual > 0 ? mealEquivalents / actual : null;
      const flags = [];
      if (!meal || breakfast === null) flags.push({ type: "missing", meal: "Breakfast", message: "Missing Breakfast" });
      if (!meal || lunch === null) flags.push({ type: "missing", meal: "Lunch", message: "Missing Lunch" });
      if (supperApplies && (!meal || rawSupper === null || meal.supper_status === "pending")) {
        flags.push({ type: "missing", meal: "Supper", message: "Missing Supper" });
      }
      return {
        date,
        breakfast,
        lunch,
        supper: supperApplies ? supper : null,
        mealEquivalents,
        baseline,
        added,
        actual,
        mplh,
        target,
        status: getMplhStatus(mplh, target),
        hasMealData,
        flags,
      };
    });

    ["breakfast", "lunch", "supper"].forEach((mealKey) => {
      const outliers = findExtremeMealVariance(
        daily.map((day) => ({ date: day.date, value: day[mealKey] }))
      );
      daily.forEach((day) => {
        if (outliers.has(day.date)) {
          const label = mealKey[0].toUpperCase() + mealKey.slice(1);
          day.flags.push({
            type: "variance",
            meal: label,
            message: `${label} ${day[mealKey]}, unusually outside selected-range pattern`,
          });
        }
      });
    });

    const summary = {
      operatingDays: daily.length,
      daysWithMealData: daily.filter((day) => day.hasMealData).length,
      dataFlags: daily.reduce((sum, day) => sum + day.flags.length, 0),
      breakfast: average(daily.map((day) => day.breakfast)),
      lunch: average(daily.map((day) => day.lunch)),
      supper: supperApplies ? average(daily.map((day) => day.supper)) : null,
      mealEquivalents: average(daily.map((day) => day.mealEquivalents)),
      baseline: average(daily.map((day) => day.baseline)),
      added: average(daily.map((day) => day.added)),
      actual: average(daily.map((day) => day.actual)),
      mplh: average(daily.map((day) => day.mplh)),
      target,
    };
    summary.status = getMplhStatus(summary.mplh, target);

    return { school, supperApplies, daily, summary };
  });

  return {
    startDate,
    endDate,
    isSingleDay: startDate === endDate,
    schools: schoolReports,
    coverage: {
      operatingDays: Math.max(0, ...schoolReports.map((report) => report.summary.operatingDays)),
      daysWithMealData: schoolReports.reduce((sum, report) => sum + report.summary.daysWithMealData, 0),
      dataFlags: schoolReports.reduce((sum, report) => sum + report.summary.dataFlags, 0),
    },
  };
}

export function prepareMplhPdfData(model, schoolId = null) {
  const reports = schoolId
    ? model.schools.filter((report) => String(report.school.id) === String(schoolId))
    : model.schools;
  return {
    title: schoolId ? "MPLH History" : "South Café LA MPLH Report",
    startDate: model.startDate,
    endDate: model.endDate,
    isSingleDay: model.isSingleDay,
    reports,
  };
}
