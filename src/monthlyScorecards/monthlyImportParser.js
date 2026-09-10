export const MONTHLY_PARSER_VERSION = "1.0.0";
export const REPORT_TYPES = {
  production: "LAUSD Production Report",
  cost: "Daily Production Cost",
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
  if (has("Daily Production Cost") && has("Cost of Goods", "Cost of Food Used")) return "cost";
  if (has("LAUSD Daily Meal Production Report") && has("Servings Planned") && has("Number of Portions Prepared") && has("Portions Served")) return "production";
  return null;
}

function rawRows(rows) {
  return rows.map((row, index) => ({ source_row_number: index + 1, row_data: row }));
}

function labeledValue(row, label) {
  const index = row.findIndex((cell) => key(cell) === key(label));
  if (index < 0) return "";
  return normalize(row.slice(index + 1).find((cell) => normalize(cell)));
}

function parseCost(rows, reportingMonth) {
  let context = null;
  const normalized = [], rejected = [], ignored = [];
  rows.forEach((row,index) => {
    const first = normalize(row[0]);
    if (/^Produced by\s+/i.test(first)) {
      const site = first.match(/\((\d+)\)/);
      const serviceDateCell = row.find((cell) => /Service Date:/i.test(normalize(cell)));
      const date = isoDate(normalize(serviceDateCell).replace(/^.*Service Date:\s*/i,""));
      const meal = row.map(mealType).find(Boolean) || null;
      context = { source_site_id:site?.[1] || "",production_date:date,meal_type:meal };
      return;
    }
    const foodCostIndex = row.findIndex((cell) => key(cell) === "costoffoodused");
    if (foodCostIndex < 0 || !context) return;
    const cost = row.slice(foodCostIndex + 1).map(numberValue).find((value) => value !== null);
    const item = { ...context,food_cost:cost,source_row_number:index+1 };
    if (!item.source_site_id || !item.production_date || !item.meal_type || item.food_cost === null) rejected.push(index+1);
    else if (!monthMatches(item.production_date,reportingMonth)) ignored.push(index+1);
    else normalized.push(item);
  });
  if (!normalized.length && !rejected.length) throw new Error("Report format has changed. Import stopped before data was written.");
  return { normalized,rejected,ignored };
}

function parseProduction(rows, reportingMonth) {
  let context = { source_site_id: "", production_date: "", meal_type: "" };
  let map = null;
  const normalized = [], rejected = [], ignored = [];
  rows.forEach((row, index) => {
    const siteValue = labeledValue(row,"Site:");
    const dateValue = labeledValue(row,"Menu Plan Date:");
    const mealValue = labeledValue(row,"Meal:");
    const site = siteValue.match(/\((\d+)\)/) || siteValue.match(/\b(\d{3,8})\b/);
    if (site) context.source_site_id = site[1];
    if (dateValue) context.production_date = isoDate(dateValue);
    if (mealValue) context.meal_type = mealType(mealValue);
    const candidate = headerMap(row);
    if (findColumn(candidate,["Servings Planned"]) >= 0 && findColumn(candidate,["Number of Portions Prepared"]) >= 0 && findColumn(candidate,["Portions Served"]) >= 0) { map = candidate; return; }
    if (!map) return;
    const itemName = valueAt(row,map,["Item","Item Name","Menu Item","Recipe Name","Description"]);
    if (!itemName) return;
    if (/^total$/i.test(itemName)) return;
    const item = { ...context, item_name:itemName, item_code:valueAt(row,map,["ItemID / Recipe Number","Item Code","Recipe Number","Recipe No"]), planned:numberValue(valueAt(row,map,["Servings Planned"])), prepared:numberValue(valueAt(row,map,["Number of Portions Prepared"])), served:numberValue(valueAt(row,map,["Portions Served"])), leftover:numberValue(valueAt(row,map,["Number of Portions Leftover"])), source_row_number:index+1 };
    if (!item.source_site_id || !item.production_date || !item.meal_type) rejected.push(index+1);
    else if (!monthMatches(item.production_date, reportingMonth)) ignored.push(index+1);
    else normalized.push(item);
  });
  if (!map) throw new Error("Report format has changed. Import stopped before data was written.");
  return { normalized, rejected, ignored };
}

export function parseMonthlyReport(csvText, expectedType, reportingMonth) {
  const rows = parseCsv(csvText);
  const detectedType = detectReportType(rows);
  if (!detectedType || detectedType !== expectedType) throw new Error("The selected file does not match the expected report type. Import stopped before data was written.");
  const parsed = expectedType === "production" ? parseProduction(rows, reportingMonth) : parseCost(rows, reportingMonth);
  if (!parsed.normalized.length) throw new Error("No valid Breakfast, Lunch, or Supper rows were found for the selected month. Import stopped before data was written.");
  return { reportType:detectedType, sourceRowCount:rows.length, rawRows:rawRows(rows), normalizedRows:parsed.normalized, rejectedRows:parsed.rejected, ignoredRows:parsed.ignored || [],
    warnings:parsed.rejected.length ? [`${parsed.rejected.length} rows were rejected because required values were missing or outside the selected month.`] : [] };
}
