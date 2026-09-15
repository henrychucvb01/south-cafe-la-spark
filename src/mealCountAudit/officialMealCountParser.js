import { parseCsv } from "../monthlyScorecards/monthlyImportParser";

const clean = (value) => String(value ?? "").replace(/^\uFEFF/, "").trim();
const key = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const numberValue = (value) => {
  const text = clean(value).replace(/,/g, "");
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
};

const aliases = {
  site: ["location code", "location", "loc", "site id", "site", "school code", "serving site id", "cost center"],
  date: ["service date", "meal date", "date", "calendar date"],
  breakfast: ["breakfast", "breakfast count", "breakfast meals", "breakfast served"],
  lunch: ["lunch", "lunch count", "lunch meals", "lunch served"],
  supper: ["supper", "supper count", "supper meals", "supper served", "dinner"],
  meal: ["meal", "meal type", "meal service", "service"],
  count: ["official count", "meal count", "meals served", "count", "total meals"],
};

function indexFor(map, names) {
  const match = names.find((name) => map.has(key(name)));
  return match ? map.get(key(match)) : -1;
}

function isoDate(value) {
  const text = clean(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return `${year}-${String(match[1]).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`;
  }
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return date.toISOString().slice(0, 10);
  }
  return null;
}

function mealName(value) {
  const text = clean(value).toLowerCase();
  if (text.includes("breakfast")) return "breakfast";
  if (text.includes("lunch")) return "lunch";
  if (text.includes("supper") || text.includes("dinner")) return "supper";
  return null;
}

function schoolLookup(schools) {
  const lookup = new Map();
  schools.forEach((school) => {
    [school.location_code, school.source_site_id, school.id]
      .map((value) => key(value))
      .filter(Boolean)
      .forEach((value) => lookup.set(value, school));
  });
  return lookup;
}

export function parseOfficialMealCountCsv(csvText, schools) {
  const rows = parseCsv(csvText);
  const lookup = schoolLookup(schools || []);
  const headerIndex = rows.findIndex((row) => {
    const map = new Map(row.map((cell, index) => [key(cell), index]));
    const hasIdentity = indexFor(map, aliases.site) >= 0;
    const hasDate = indexFor(map, aliases.date) >= 0;
    const wide = indexFor(map, aliases.breakfast) >= 0 || indexFor(map, aliases.lunch) >= 0;
    const long = indexFor(map, aliases.meal) >= 0 && indexFor(map, aliases.count) >= 0;
    return hasIdentity && hasDate && (wide || long);
  });
  if (headerIndex < 0) {
    throw new Error("This does not look like an Official Meal Count CSV. Required school, date, and meal-count columns were not found.");
  }

  const headers = new Map(rows[headerIndex].map((cell, index) => [key(cell), index]));
  const siteIndex = indexFor(headers, aliases.site);
  const dateIndex = indexFor(headers, aliases.date);
  const breakfastIndex = indexFor(headers, aliases.breakfast);
  const lunchIndex = indexFor(headers, aliases.lunch);
  const supperIndex = indexFor(headers, aliases.supper);
  const mealIndex = indexFor(headers, aliases.meal);
  const countIndex = indexFor(headers, aliases.count);
  const isLong = breakfastIndex < 0 && lunchIndex < 0 && mealIndex >= 0 && countIndex >= 0;
  const records = new Map();
  const rejected = [];
  const outOfArea = [];

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    if (!row.some((cell) => clean(cell))) return;
    const sourceRow = headerIndex + offset + 2;
    const rawSite = clean(row[siteIndex]);
    const school = lookup.get(key(rawSite));
    const serviceDate = isoDate(row[dateIndex]);
    if (!school) {
      outOfArea.push({ row: sourceRow, site: rawSite || "blank" });
      return;
    }
    if (!serviceDate) {
      rejected.push({ row: sourceRow, reason: "invalid service date" });
      return;
    }
    const recordKey = `${school.id}|${serviceDate}`;
    const current = records.get(recordKey) || {
      location_id: Number(school.id),
      service_date: serviceDate,
      breakfast_count: null,
      lunch_count: null,
      supper_count: null,
    };

    if (isLong) {
      const meal = mealName(row[mealIndex]);
      const count = numberValue(row[countIndex]);
      if (!meal || count === null) {
        rejected.push({ row: sourceRow, reason: "invalid meal type or count" });
        return;
      }
      current[`${meal}_count`] = count;
    } else {
      if (breakfastIndex >= 0) current.breakfast_count = numberValue(row[breakfastIndex]);
      if (lunchIndex >= 0) current.lunch_count = numberValue(row[lunchIndex]);
      if (supperIndex >= 0) current.supper_count = numberValue(row[supperIndex]);
      if ([current.breakfast_count, current.lunch_count, current.supper_count].every((value) => value === null)) {
        rejected.push({ row: sourceRow, reason: "no valid meal counts" });
        return;
      }
    }
    records.set(recordKey, current);
  });

  if (!records.size) throw new Error("No valid in-area Official Meal Count records were found. Nothing was uploaded.");
  return { records: [...records.values()], rejected, outOfArea, sourceRowCount: rows.length };
}
