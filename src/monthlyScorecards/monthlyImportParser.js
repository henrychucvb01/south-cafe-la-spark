export const MONTHLY_PARSER_VERSION = "1.0.0";
export const REPORT_TYPES = {
  production: "LAUSD Production Report",
  cost: "Daily Production Cost",
  official_meal_count: "Official Meal Count",
};

const normalize = (value) => String(value ?? "").replace(/^\uFEFF/, "").trim();
const key = (value) => normalize(value).toLowerCase().replace(/[^a-z0-9]/g, "");
const numberValue = (value) => {
  const cleaned = normalize(value).replace(/[$,%()]/g, (mark) => (mark === "(" ? "-" : ""));
  if (!cleaned) return null;
  const parsed = Number(cleaned.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const isoDate = (value) => {
  const text = normalize(value);
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return `${year}-${String(match[1]).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
};
const mealType = (value) => {
  const text = normalize(value).toLowerCase();
  if (text.includes("breakfast")) return "breakfast";
  if (text.includes("lunch")) return "lunch";
  if (text.includes("supper") || text.includes("dinner")) return "supper";
  return null;
};

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if (char === "\n" && !quoted) { row.push(field); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => normalize(cell)));
}

function headerMap(row) {
  return row.reduce((result, value, index) => ({ ...result, [key(value)]: index }), {});
}
function findColumn(map, aliases) {
  const found = aliases.find((alias) => map[key(alias)] !== undefined);
  return found ? map[key(found)] : -1;
}
function valueAt(row, map, aliases) {
  const index = findColumn(map, aliases);
  return index >= 0 ? normalize(row[index]) : "";
}
function findHeader(rows, requiredAliasGroups) {
  return rows.findIndex((row) => {
    const map = headerMap(row);
    return requiredAliasGroups.every((aliases) => findColumn(map, aliases) >= 0);
  });
}
function monthMatches(date, reportingMonth) {
  return Boolean(date && date.slice(0, 7) === reportingMonth.slice(0, 7));
}

export function detectReportType(rows) {
  const sample = rows.slice(0, 100).flat().map(key);
  const has = (...terms) => terms.some((term) => sample.includes(key(term)));
  if (has("Main Site ID") && (has("Meal", "Meal Type", "Program") && has("Count", "Meal Count", "Total Meals") || has("Breakfast", "Lunch", "Supper"))) return "official_meal_count";
  if (has("Food Cost", "Production Cost", "Total Cost") && has("Production Date", "Date")) return "cost";
  if (has("Planned", "Planned Qty") && has("Prepared", "Prepared Qty") && has("Served", "Quantity Served")) return "production";
  return null;
}

function rawRows(rows) {
  return rows.map((row, index) => ({ source_row_number: index + 1, row_data: row }));
}

function parseFlat(rows, reportType, reportingMonth) {
  const configs = {
    cost: {
      required: [["Production Date", "Date"], ["Meal", "Meal Type", "Program"], ["Food Cost", "Production Cost", "Total Cost"]],
      build(row, map, line) {
        return { source_site_id: valueAt(row,map,["Site ID","Location","Location Code","School ID"]), production_date: isoDate(valueAt(row,map,["Production Date","Date"])), meal_type: mealType(valueAt(row,map,["Meal","Meal Type","Program"])), food_cost: numberValue(valueAt(row,map,["Food Cost","Production Cost","Total Cost"])), source_row_number: line };
      },
    },
    official_meal_count: {
      required: [["Main Site ID"], ["Date", "Service Date"], ["Meal", "Meal Type", "Program"], ["Count", "Meal Count", "Total Meals"]],
      build(row, map, line) {
        const main = valueAt(row,map,["Main Site ID"]);
        return { source_site_id: valueAt(row,map,["Site ID","Location ID","Serving Site ID"]) || main, main_site_id: main, service_date: isoDate(valueAt(row,map,["Service Date","Date"])), meal_type: mealType(valueAt(row,map,["Meal","Meal Type","Program"])), official_count: numberValue(valueAt(row,map,["Count","Meal Count","Total Meals"])), source_row_number: line };
      },
    },
  };
  if (reportType === "official_meal_count") {
    const wideHeader = findHeader(rows, [["Main Site ID"],["Date","Service Date"],["Breakfast","Lunch","Supper"]]);
    if (wideHeader >= 0) {
      const map = headerMap(rows[wideHeader]), normalized = [], rejected = [];
      rows.slice(wideHeader + 1).forEach((row, offset) => {
        const line = wideHeader + offset + 2;
        const main = valueAt(row,map,["Main Site ID"]), date = isoDate(valueAt(row,map,["Service Date","Date"]));
        const source = valueAt(row,map,["Site ID","Location ID","Serving Site ID"]) || main;
        ["breakfast","lunch","supper"].forEach((meal) => {
          const count = numberValue(valueAt(row,map,[meal]));
          if (count === null) return;
          if (!main || !date || !Number.isInteger(count) || count < 0 || !monthMatches(date,reportingMonth)) rejected.push(line);
          else normalized.push({ source_site_id:source,main_site_id:main,service_date:date,meal_type:meal,official_count:count,source_row_number:line });
        });
      });
      return { normalized, rejected:[...new Set(rejected)] };
    }
  }
  const config = configs[reportType];
  const headerIndex = findHeader(rows, config.required);
  if (headerIndex < 0) throw new Error("Report format has changed. Import stopped before data was written.");
  const map = headerMap(rows[headerIndex]);
  const normalized = [], rejected = [];
  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const line = headerIndex + offset + 2;
    const item = config.build(row, map, line);
    const date = item.production_date || item.service_date;
    if (!mealType(valueAt(row,map,["Meal","Meal Type","Program"]))) return;
    const valid = reportType === "cost"
      ? item.source_site_id && item.production_date && item.food_cost !== null
      : item.main_site_id && item.service_date && Number.isInteger(item.official_count) && item.official_count >= 0;
    if (!valid || !monthMatches(date, reportingMonth)) rejected.push(line); else normalized.push(item);
  });
  return { normalized, rejected };
}

function parseProduction(rows, reportingMonth) {
  let context = { source_site_id: "", production_date: "", meal_type: "" };
  let map = null;
  const normalized = [], rejected = [];
  rows.forEach((row, index) => {
    const joined = row.map(normalize).join(" | ");
    const site = joined.match(/(?:site|location)(?:\s+id|\s+code)?\s*[:#-]?\s*(\d{3,8})/i);
    const date = joined.match(/(?:production\s+date|date)\s*[:#-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{2}-\d{2})/i);
    const meal = joined.match(/(?:meal|program)\s*[:#-]?\s*(breakfast|lunch|supper|dinner)/i);
    if (site) context.source_site_id = site[1];
    if (date) context.production_date = isoDate(date[1]);
    if (meal) context.meal_type = mealType(meal[1]);
    const candidate = headerMap(row);
    if (findColumn(candidate,["Planned","Planned Qty"]) >= 0 && findColumn(candidate,["Prepared","Prepared Qty"]) >= 0 && findColumn(candidate,["Served","Quantity Served"]) >= 0) { map = candidate; return; }
    if (!map) return;
    const itemName = valueAt(row,map,["Item","Item Name","Menu Item","Recipe Name","Description"]);
    if (!itemName) return;
    const item = { ...context, item_name:itemName, item_code:valueAt(row,map,["Item Code","Recipe Number","Recipe No"]), planned:numberValue(valueAt(row,map,["Planned","Planned Qty"])), prepared:numberValue(valueAt(row,map,["Prepared","Prepared Qty"])), served:numberValue(valueAt(row,map,["Served","Quantity Served"])), leftover:numberValue(valueAt(row,map,["Leftover","Leftovers","Remaining"])), source_row_number:index+1 };
    if (!item.source_site_id || !item.production_date || !item.meal_type || !monthMatches(item.production_date, reportingMonth)) rejected.push(index+1); else normalized.push(item);
  });
  if (!map) throw new Error("Report format has changed. Import stopped before data was written.");
  return { normalized, rejected };
}

export function parseMonthlyReport(csvText, expectedType, reportingMonth) {
  const rows = parseCsv(csvText);
  const detectedType = detectReportType(rows);
  if (!detectedType || detectedType !== expectedType) throw new Error("The selected file does not match the expected report type. Import stopped before data was written.");
  const parsed = expectedType === "production" ? parseProduction(rows, reportingMonth) : parseFlat(rows, expectedType, reportingMonth);
  if (!parsed.normalized.length) throw new Error("No valid Breakfast, Lunch, or Supper rows were found for the selected month. Import stopped before data was written.");
  return { reportType:detectedType, sourceRowCount:rows.length, rawRows:rawRows(rows), normalizedRows:parsed.normalized, rejectedRows:parsed.rejected,
    warnings:parsed.rejected.length ? [`${parsed.rejected.length} rows were rejected because required values were missing or outside the selected month.`] : [] };
}
