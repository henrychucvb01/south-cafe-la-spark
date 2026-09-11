export const MPLH_TARGETS = {
  secondary: { label: "Secondary", min: 18, max: 20 },
  elementary_prep: { label: "Elementary Prep", min: 20, max: 22 },
  elementary_nnc: { label: "Elementary NNC", min: 24, max: 25 },
  special: { label: "Special Education", min: null, max: null },
  special_ed: { label: "Special Education", min: null, max: null },
};

const MEALS = ["breakfast", "lunch", "supper"];
const n = (value) => Number(value) || 0;
const inRange = (date, start, end) => {
  if (!date) return false;
  const d = String(date).slice(0, 10);
  return d >= start && d <= end;
};
const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = (value, digits = 1) =>
  value === null || value === undefined ? null : Number(value.toFixed(digits));

export function isWeekend(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  return day === 0 || day === 6;
}

const entreeExclusionPattern =
  /\b(milk|juice|apple|orange|banana|pear|peach|fruit|berries|strawberr|carrot|broccoli|potato|vegetable|salad|lettuce|corn|beans?\s+side|ketchup|mustard|mayonnaise|mayo|sauce|salsa|dressing|condiment|cracker|bread\s+stick)\b/i;

export function isLikelyEntree(row) {
  return n(row?.mma_oz_eq) >= 1 && !entreeExclusionPattern.test(String(row?.item_name || ""));
}

const LEFTOVER_EXCLUSION_PATTERN =
  /\b(milk|juice|beverage|drink|water|condiment|ketchup|mustard|mayo|mayonnaise|sauce|salsa|dressing|packet|packets|dip|syrup|butter|margarine|jelly|jam|cracker|crackers|cutlery|napkin|fork|spoon|straw)\b/i;

export function isMeaningfulLeftoverItem(itemName) {
  if (!itemName) return false;
  const name = String(itemName).trim();
  if (LEFTOVER_EXCLUSION_PATTERN.test(name)) return false;

  const lower = name.toLowerCase();
  if (
    lower.includes("1%") ||
    lower.includes("fat free") ||
    lower.includes("chocolate milk") ||
    lower.includes("white milk") ||
    lower.includes("ranch") ||
    lower.includes("bbq")
  ) {
    return false;
  }
  return true;
}

const leftoverFor = (prepared, served) => n(prepared) - n(served);
const leftoverPercent = (prepared, served) =>
  n(prepared) > 0 ? (leftoverFor(prepared, served) / n(prepared)) * 100 : null;

function deduplicateRowsByKey(rows, getKey) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = getKey(row);
    map.set(key, row);
  });
  return Array.from(map.values());
}

function laborCostForMonth(school, dataset, operatingDays, laborRows) {
  const staffing = (dataset?.staffing || []).filter(
    (row) => String(row.source_site_id) === String(school.source_site_id)
  );
  const rates = new Map(
    (dataset?.labor_rates || []).map((row) => [
      row.classification_key,
      n(row.hourly_rate),
    ])
  );
  if (!staffing.length || !rates.size)
    return {
      total: null,
      scheduled: null,
      adjustments: null,
      budgetedDailyHours: n(school.budget_labor_hours) || null,
    };
  const manager = staffing.find(
    (row) =>
      String(row.classification_key).startsWith("manager_") &&
      n(row.filled_count) > 0
  );
  const missingRate = staffing.some(
    (row) => n(row.filled_daily_hours) > 0 && !rates.has(row.classification_key)
  );
  if (!manager || missingRate)
    return {
      total: null,
      scheduled: null,
      adjustments: null,
      budgetedDailyHours: n(school.budget_labor_hours) || null,
    };

  const filledDailyHours = staffing.reduce(
    (sum, row) => sum + n(row.filled_daily_hours),
    0
  );
  const scheduledDailyCost = staffing.reduce(
    (sum, row) =>
      sum + n(row.filled_daily_hours) * n(rates.get(row.classification_key)),
    0
  );
  const scheduled = scheduledDailyCost * operatingDays;
  const extraWorkerHours = laborRows.reduce(
    (sum, row) => sum + n(row.additional_worker_hours),
    0
  );
  const managerExtraHours = laborRows.reduce(
    (sum, row) => sum + n(row.manager_overtime_hours),
    0
  );
  const adjustments =
    extraWorkerHours * n(rates.get("worker")) +
    managerExtraHours * n(rates.get(manager.classification_key));

  return {
    total: scheduled + adjustments,
    scheduled,
    adjustments,
    budgetedDailyHours:
      filledDailyHours || n(school.budget_labor_hours) || null,
  };
}

function serviceCounts(school, rawProductionRows, rawMealRows, startDate, endDate) {
  const prodRows = deduplicateRowsByKey(
    rawProductionRows,
    (r) => `${r.location_id}|${r.production_date}|${r.meal_type}|${r.item_name}`
  );
  const mealRows = deduplicateRowsByKey(
    rawMealRows,
    (r) => `${r.location_id}|${r.service_date}`
  );

  const byDay = new Map();
  prodRows
    .filter(
      (row) =>
        String(row.location_id) === String(school.directory_id) &&
        inRange(row.production_date, startDate, endDate) &&
        row.meals_served !== null
    )
    .forEach((row) => {
      const k = `${row.production_date}|${row.meal_type}`;
      if (!byDay.has(k)) byDay.set(k, n(row.meals_served));
    });

  if (!byDay.size && school.location_id) {
    mealRows
      .filter(
        (row) =>
          String(row.location_id) === String(school.location_id) &&
          inRange(row.service_date, startDate, endDate)
      )
      .forEach((row) => {
        byDay.set(`${row.service_date}|breakfast`, n(row.breakfast_count));
        byDay.set(`${row.service_date}|lunch`, n(row.lunch_count));
        if (row.supper_status !== "pending")
          byDay.set(`${row.service_date}|supper`, n(row.supper_count));
      });
  }

  return [...byDay].map(([key, count]) => {
    const [date, meal] = key.split("|");
    return { date, meal, count };
  });
}

function mondayFor(value) {
  const date = new Date(`${value}T12:00:00`),
    day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function shortDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function rankEntrees(production, meal) {
  const totals = new Map();
  production
    .filter((row) => row.meal_type === meal && isLikelyEntree(row))
    .forEach((row) => {
      const item = totals.get(row.item_name) || {
        name: row.item_name,
        served: 0,
        weeks: new Map(),
      };
      const served = n(row.served),
        week = mondayFor(row.production_date);
      item.served += served;
      item.weeks.set(week, (item.weeks.get(week) || 0) + served);
      totals.set(row.item_name, item);
    });
  return [...totals.values()]
    .sort((a, b) => b.served - a.served)
    .slice(0, 3)
    .map((item, index) => {
      const strongest = [...item.weeks].sort((a, b) => b[1] - a[1])[0];
      return {
        rank: index + 1,
        name: item.name,
        served: item.served,
        strongestWeek: strongest?.[0] || null,
        strongestWeekServed: strongest?.[1] || 0,
        strongestWeekLabel: strongest
          ? `Week of ${shortDate(strongest[0])}`
          : null,
      };
    });
}

function worstLeftovers(production, totalPrepared) {
  const items = new Map();
  production
    .filter(
      (row) =>
        row.item_name &&
        row.prepared !== null &&
        row.served !== null &&
        isMeaningfulLeftoverItem(row.item_name)
    )
    .forEach((row) => {
      const item = items.get(row.item_name) || {
        name: row.item_name,
        prepared: 0,
        served: 0,
        dates: new Set(),
      };
      item.prepared += n(row.prepared);
      item.served += n(row.served);
      item.dates.add(row.production_date);
      items.set(row.item_name, item);
    });

  const minimumPrepared = Math.max(10, Math.round(n(totalPrepared) * 0.002));
  return [...items.values()]
    .filter((item) => item.dates.size >= 2 && item.prepared >= minimumPrepared)
    .map((item) => ({
      name: item.name,
      prepared: item.prepared,
      served: item.served,
      leftover: leftoverFor(item.prepared, item.served),
      leftoverPercentage: leftoverPercent(item.prepared, item.served),
      serviceDays: item.dates.size,
    }))
    .filter((item) => item.leftover > 0)
    .sort((a, b) => b.leftoverPercentage - a.leftoverPercentage || b.leftover - a.leftover)
    .slice(0, 3);
}

function normalize(value, values, higherIsBetter = true) {
  const usable = values.filter((item) => item !== null && item !== undefined);
  if (!usable.length || value === null || value === undefined) return null;
  const min = Math.min(...usable),
    max = Math.max(...usable);
  if (max === min) return 0.5;
  const result = (value - min) / (max - min);
  return higherIsBetter ? result : 1 - result;
}

function weeklyPerformance({ dates, services, production, dailyMplh, enrollment, target }) {
  const groups = new Map();
  dates.forEach((date) => {
    const key = mondayFor(date),
      week = groups.get(key) || { weekStart: key, dates: [] };
    week.dates.push(date);
    groups.set(key, week);
  });
  const weeks = [...groups.values()]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((week) => {
      const rows = production.filter((row) => week.dates.includes(row.production_date)),
        prepared = rows.reduce((sum, row) => sum + n(row.prepared), 0),
        served = rows.reduce((sum, row) => sum + n(row.served), 0),
        lunch = services
          .filter((row) => week.dates.includes(row.date) && row.meal === "lunch")
          .reduce((sum, row) => sum + row.count, 0),
        labor = dailyMplh.filter((row) => week.dates.includes(row.date)),
        hours = labor.reduce((sum, row) => sum + row.hours, 0),
        equivalents = labor.reduce((sum, row) => sum + row.equivalents, 0);
      return {
        weekStart: week.weekStart,
        startDate: week.dates[0],
        endDate: week.dates.at(-1),
        label: `${shortDate(week.dates[0])}–${shortDate(week.dates.at(-1))}`,
        operatingDays: week.dates.length,
        prepared,
        served,
        leftover: leftoverFor(prepared, served),
        leftoverPercentage: leftoverPercent(prepared, served),
        lunchParticipation:
          enrollment && week.dates.length
            ? (lunch / (enrollment * week.dates.length)) * 100
            : null,
        mplh: hours > 0 ? equivalents / hours : null,
      };
    });
  const maxDays = Math.max(0, ...weeks.map((week) => week.operatingDays)),
    eligible = weeks.filter(
      (week) =>
        week.operatingDays >= (maxDays >= 3 ? 3 : 1) &&
        week.leftoverPercentage !== null &&
        week.lunchParticipation !== null &&
        week.mplh !== null
    ),
    participations = eligible.map((week) => week.lunchParticipation),
    leftovers = eligible.map((week) => week.leftoverPercentage);

  eligible.forEach((week) => {
    const participationScore = normalize(week.lunchParticipation, participations),
      leftoverScore = normalize(week.leftoverPercentage, leftovers, false),
      mplhScore = target.min === null ? null : Math.min(1, week.mplh / target.min),
      parts = [participationScore, mplhScore, leftoverScore].filter(
        (value) => value !== null
      );
    week.performanceScore = parts.length ? mean(parts) : null;
  });
  const ranked = eligible
    .filter((week) => week.performanceScore !== null)
    .sort((a, b) => b.performanceScore - a.performanceScore);
  return {
    weeks,
    bestWeek: ranked.length > 1 ? ranked[0] : null,
    watchWeek: ranked.length > 1 ? ranked.at(-1) : null,
  };
}

export function calculateDateRange(school, dataset, startDate, endDate, excludedDates = []) {
  const excludedSet = new Set(excludedDates);

  const services = serviceCounts(
    school,
    dataset?.production_rows || [],
    dataset?.meal_counts || [],
    startDate,
    endDate
  ).filter((row) => !excludedSet.has(row.date) && !isWeekend(row.date));

  const rangeDates = [];
  const curr = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);

  while (curr <= end) {
    const dStr = curr.toISOString().slice(0, 10);
    if (!isWeekend(dStr) && !excludedSet.has(dStr)) {
      rangeDates.push(dStr);
    }
    curr.setDate(curr.getDate() + 1);
  }

  const operatingDaysCount = rangeDates.length;

  const totals = { breakfast: 0, lunch: 0, supper: 0 };
  services.forEach((row) => {
    totals[row.meal] += row.count;
  });

  const averages = Object.fromEntries(
    MEALS.map((meal) => [
      meal,
      operatingDaysCount ? totals[meal] / operatingDaysCount : 0,
    ])
  );
  const enrollment = n(school.enrollment) || null;
  const participation = {
    breakfast: enrollment ? (averages.breakfast / enrollment) * 100 : null,
    lunch: enrollment ? (averages.lunch / enrollment) * 100 : null,
    supper: enrollment ? (averages.supper / enrollment) * 100 : null,
  };

  const participationTrend = rangeDates.map((date) => {
    const lunchRow = services.find(
      (row) => row.date === date && row.meal === "lunch"
    );
    const breakfastRow = services.find(
      (row) => row.date === date && row.meal === "breakfast"
    );

    const lunchCount = lunchRow ? lunchRow.count : null;
    const breakfastCount = breakfastRow ? breakfastRow.count : null;

    return {
      date,
      lunch: lunchCount,
      lunchParticipation:
        enrollment && lunchCount !== null ? (lunchCount / enrollment) * 100 : null,
      breakfast: breakfastCount,
      breakfastParticipation:
        enrollment && breakfastCount !== null
          ? (breakfastCount / enrollment) * 100
          : null,
      participation:
        enrollment && lunchCount !== null ? (lunchCount / enrollment) * 100 : null,
    };
  });

  const rawLabor = dataset?.labor_hours || [];
  const dedupedLabor = deduplicateRowsByKey(
    rawLabor,
    (r) => `${r.location_id}|${r.service_date}`
  );
  const rangeLaborRows = dedupedLabor.filter(
    (row) =>
      String(row.location_id) === String(school.location_id) &&
      inRange(row.service_date, startDate, endDate) &&
      !excludedSet.has(row.service_date) &&
      !isWeekend(row.service_date)
  );
  const laborByDate = new Map(rangeLaborRows.map((row) => [row.service_date, row]));

  const dailyMplh = rangeDates
    .map((date) => {
      const rows = services.filter((row) => row.date === date);
      const counts = Object.fromEntries(rows.map((row) => [row.meal, row.count]));
      const adjustment = laborByDate.get(date);
      const hours =
        n(school.budget_labor_hours) +
        n(adjustment?.additional_worker_hours) +
        n(adjustment?.manager_overtime_hours);
      const equivalents =
        n(counts.breakfast) * 0.66 + n(counts.lunch) + n(counts.supper);
      return {
        date,
        hours,
        equivalents,
        mplh: hours > 0 ? equivalents / hours : null,
      };
    })
    .filter((row) => row.mplh !== null);

  const target = MPLH_TARGETS[school.labor_type] || {
    label: "Not Classified",
    min: null,
    max: null,
  };

  const rawCosts = dataset?.cost_rows || [];
  const dedupedCosts = deduplicateRowsByKey(
    rawCosts,
    (r) => `${r.location_id}|${r.production_date}|${r.meal_type}`
  );

  const costs = { breakfast: 0, lunch: 0, supper: 0 };
  const costRowCounts = { breakfast: 0, lunch: 0, supper: 0 };
  dedupedCosts
    .filter(
      (row) =>
        String(row.location_id) === String(school.directory_id) &&
        inRange(row.production_date, startDate, endDate) &&
        !excludedSet.has(row.production_date) &&
        !isWeekend(row.production_date)
    )
    .forEach((row) => {
      costs[row.meal_type] += n(row.food_cost);
      costRowCounts[row.meal_type] += 1;
    });

  const costAvailable = Object.fromEntries(
    MEALS.map((meal) => [
      meal,
      costRowCounts[meal] > 0 && (totals[meal] === 0 || costs[meal] > 0),
    ])
  );

  let validTotalCost = 0;
  let hasAnyCost = false;
  if (costAvailable.breakfast && totals.breakfast > 0) {
    validTotalCost += costs.breakfast;
    hasAnyCost = true;
  }
  if (costAvailable.lunch && totals.lunch > 0) {
    validTotalCost += costs.lunch;
    hasAnyCost = true;
  }
  if (costAvailable.supper && totals.supper > 0) {
    validTotalCost += costs.supper;
    hasAnyCost = true;
  }
  const totalCost = hasAnyCost ? validTotalCost : null;

  const breakfastCostPerMeal =
    costAvailable.breakfast && totals.breakfast > 0
      ? costs.breakfast / totals.breakfast
      : null;

  const lunchCostPerMeal =
    costAvailable.lunch && totals.lunch > 0
      ? costs.lunch / totals.lunch
      : null;

  const supperCostPerMeal =
    costAvailable.supper && totals.supper > 0
      ? costs.supper / totals.supper
      : null;

  const rates = Object.fromEntries(
    (dataset?.rates || []).map((row) => [row.meal_type, n(row.rate)])
  );
  const revenues = {
    breakfast: totals.breakfast * n(rates.breakfast),
    lunch: totals.lunch * n(rates.lunch),
    supper: totals.supper * n(rates.supper),
  };
  const revenue = Object.values(revenues).reduce((a, b) => a + b, 0);

  const rawProd = dataset?.production_rows || [];
  const dedupedProd = deduplicateRowsByKey(
    rawProd,
    (r) => `${r.location_id}|${r.production_date}|${r.meal_type}|${r.item_name}`
  );
  const production = dedupedProd.filter(
    (row) =>
      String(row.location_id) === String(school.directory_id) &&
      inRange(row.production_date, startDate, endDate) &&
      !excludedSet.has(row.production_date) &&
      !isWeekend(row.production_date)
  );

  const productionTotals = production.reduce(
    (acc, row) => ({
      planned: acc.planned + n(row.planned),
      prepared: acc.prepared + n(row.prepared),
      served: acc.served + n(row.served),
    }),
    { planned: 0, prepared: 0, served: 0 }
  );
  productionTotals.leftover = leftoverFor(
    productionTotals.prepared,
    productionTotals.served
  );
  productionTotals.leftoverPercentage = leftoverPercent(
    productionTotals.prepared,
    productionTotals.served
  );

  const menuRankings = {
    breakfast: rankEntrees(production, "breakfast"),
    lunch: rankEntrees(production, "lunch"),
  };
  const worstItems = worstLeftovers(production, productionTotals.prepared);
  const forecastObservation = worstItems[0]
    ? `${worstItems[0].name} averaged ${round(worstItems[0].leftoverPercentage)}% leftover across ${worstItems[0].serviceDays} service days. Review its planned quantity before the next service.`
    : null;

  const weekly = weeklyPerformance({
    dates: rangeDates,
    services,
    production,
    dailyMplh,
    enrollment,
    target,
  });

  const laborCost = laborCostForMonth(
    school,
    dataset,
    operatingDaysCount,
    rangeLaborRows
  );

  return {
    month: startDate,
    startDate,
    endDate,
    operatingDays: operatingDaysCount,
    totals,
    averages,
    participation,
    lunchTrend: participationTrend,
    participationTrend,
    lunchAverage: participation.lunch,
    breakfastAverage: participation.breakfast,
    laborHours: dailyMplh.reduce((sum, row) => sum + row.hours, 0),
    laborCost: laborCost.total,
    budgetedLaborHours: laborCost.budgetedDailyHours,
    averageMplh: mean(dailyMplh.map((row) => row.mplh)),
    daysMeetingTarget:
      target.min === null
        ? null
        : dailyMplh.filter((row) => row.mplh >= target.min).length,
    daysBelowTarget:
      target.min === null
        ? null
        : dailyMplh.filter((row) => row.mplh < target.min).length,
    target,
    dataThrough: rangeDates.at(-1) || null,
    costs,
    costAvailable,
    totalCost,
    breakfastCostPerMeal,
    lunchCostPerMeal,
    supperCostPerMeal,
    revenues,
    revenue,
    productionTotals,
    menuRankings,
    worstItems,
    forecastObservation,
    weekly: weekly.weeks,
    bestWeek: weekly.bestWeek,
    watchWeek: weekly.watchWeek,
    hasProduction: production.length > 0,
    hasCost: hasAnyCost,
    hasMeals: services.length > 0,
  };
}

export function buildSchoolScorecard(school, dataset, dateRangeOrMonth, excludedDates = []) {
  let startDate, endDate;
  if (typeof dateRangeOrMonth === "string") {
    startDate = `${dateRangeOrMonth.slice(0, 7)}-01`;
    const y = Number(dateRangeOrMonth.slice(0, 4));
    const m = Number(dateRangeOrMonth.slice(5, 7));
    const lastDay = new Date(y, m, 0).getDate();
    endDate = `${dateRangeOrMonth.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  } else {
    startDate = dateRangeOrMonth.startDate;
    endDate = dateRangeOrMonth.endDate;
  }

  const current = calculateDateRange(school, dataset, startDate, endDate, excludedDates);

  const startDt = new Date(`${startDate}T12:00:00`);
  const prevMonthStart = new Date(startDt);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
  const prevMonthStr = prevMonthStart.toISOString().slice(0, 7);
  const pY = Number(prevMonthStr.slice(0, 4));
  const pM = Number(prevMonthStr.slice(5, 7));
  const pLast = new Date(pY, pM, 0).getDate();
  const prevStart = `${prevMonthStr}-01`;
  const prevEnd = `${prevMonthStr}-${String(pLast).padStart(2, "0")}`;

  const previous = calculateDateRange(school, dataset, prevStart, prevEnd, []);
  const previousExists =
    previous.hasMeals || previous.hasProduction || previous.hasCost;

  const changes = {
    breakfastParticipation:
      current.participation.breakfast !== null &&
      previous.participation.breakfast !== null
        ? current.participation.breakfast - previous.participation.breakfast
        : null,
    lunchParticipation:
      current.participation.lunch !== null && previous.participation.lunch !== null
        ? current.participation.lunch - previous.participation.lunch
        : null,
    supperParticipation:
      current.participation.supper !== null &&
      previous.participation.supper !== null
        ? current.participation.supper - previous.participation.supper
        : null,
    mplh:
      current.averageMplh !== null && previous.averageMplh !== null
        ? current.averageMplh - previous.averageMplh
        : null,
    laborCost:
      current.laborCost !== null && previous.laborCost !== null
        ? current.laborCost - previous.laborCost
        : null,
    foodCost:
      current.totalCost !== null && previous.totalCost !== null
        ? current.totalCost - previous.totalCost
        : null,
    leftoverPercentage:
      current.productionTotals.leftoverPercentage !== null &&
      previous.productionTotals.leftoverPercentage !== null
        ? current.productionTotals.leftoverPercentage -
          previous.productionTotals.leftoverPercentage
        : null,
    revenue: previous.hasMeals ? current.revenue - previous.revenue : null,
  };

  return {
    school,
    current,
    previous: previousExists ? previous : null,
    changes,
    summary: managerSummary(current, previousExists ? previous : null),
  };
}
