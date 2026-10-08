import { scopeMonthlyRows } from "./monthlyImportScope";
import { supabase } from "../supabaseClient";

export async function checksumText(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2,"0")).join("");
}

export async function loadMonthlyImports(supervisorPin, schoolYear, reportingMonth) {
  const { data, error } = await supabase.rpc("list_monthly_scorecard_imports", {
    p_supervisor_pin: supervisorPin,
    p_school_year: schoolYear,
    p_reporting_month: reportingMonth,
  });
  if (error) throw error;
  return data || [];
}

export function dedupeMonthlyRows(reportType,rows) {
  const normalizedByKey=new Map();
  rows.forEach((row)=>{
    const recordKey=reportType==="cost"
      ? `${row.source_site_id}|${row.production_date}|${row.meal_type}`
      : `${row.source_site_id}|${row.production_date}|${row.meal_type}|${row.item_code||row.item_name}`;
    normalizedByKey.set(recordKey,row);
  });
  return [...normalizedByKey.values()];
}

export async function saveMonthlyImport({ supervisorPin, reportType, filename, parsed, checksum, onProgress }) {
  const {data: mappings, error: scopeError} = await supabase.rpc("get_monthly_import_scope", {p_supervisor_pin: supervisorPin});
  if (scopeError) throw scopeError;
  const selected = scopeMonthlyRows(parsed.normalizedRows, mappings);
  const rows = dedupeMonthlyRows(reportType, selected);
  if (!rows.length) throw new Error("This report contains no rows for SPARK's mapped schools. Nothing was imported.");
  let saved = 0;
  const months = new Set();
  for (let offset = 0; offset < rows.length; offset += 250) {
    const chunk = rows.slice(offset, offset + 250);
    const { data, error } = await supabase.rpc("merge_monthly_scorecard_rows", {
      p_supervisor_pin: supervisorPin, p_report_type: reportType,
      p_filename: filename, p_checksum: checksum,
      p_source_count: parsed.sourceRowCount, p_rejected_count: parsed.rejectedRows.length,
      p_rows: chunk,
    });
    if (error) throw new Error(`${error.message || "Upload connection failed"}. ${saved} records confirmed saved. Retry the same file safely; existing records will not be duplicated.`);
    if (!Number.isInteger(data?.saved) || data.saved !== chunk.length) {
      throw new Error("School mappings changed during upload. Refresh and retry the original file safely.");
    }
    saved += data.saved;
    chunk.forEach(row => months.add(row.production_date.slice(0, 7)));
    onProgress?.(saved, rows.length);
  }
  return { saved, months: [...months].sort(), rows, excluded: parsed.normalizedRows.length - selected.length };
}

export async function loadMonthlyScorecardDataset(supervisorPin,schoolYear,reportingMonth) {
  const { data,error } = await supabase.rpc("get_monthly_scorecard_dataset",{
    p_supervisor_pin:supervisorPin,p_school_year:schoolYear,p_reporting_month:reportingMonth,
  });
  if (error) throw error;
  return data || {};
}

export async function loadManagerMonthlyScorecardDataset({ managerPin, employeeId, locationId, schoolYear, reportingMonth }) {
  const { data, error } = await supabase.rpc("get_manager_monthly_scorecard_dataset", {
    p_manager_pin: managerPin,
    p_employee_id: employeeId || null,
    p_location_id: locationId,
    p_school_year: schoolYear,
    p_reporting_month: reportingMonth,
  });
  if (error) throw error;
  return data || {};
}

export async function loadOfficialMealCounts(supervisorPin, startDate, endDate) {
  const { data, error } = await supabase.rpc("get_official_meal_counts", {
    p_supervisor_pin: supervisorPin,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw error;
  return data || [];
}

export async function importOfficialMealCounts(supervisorPin, filename, records) {
  const { data, error } = await supabase.rpc("import_official_meal_counts", {
    p_supervisor_pin: supervisorPin,
    p_source_filename: filename,
    p_rows: records,
  });
  if (error) throw error;
  return data || {};
}

export async function loadOfficialMealCountMappings(supervisorPin) {
  const { data, error } = await supabase.rpc("get_official_meal_count_mappings", { p_supervisor_pin: supervisorPin });
  if (error) throw error;
  return data || [];
}

export async function loadMonthlyScorecardDatasetWithRetry(...args) {
  try{return await loadMonthlyScorecardDataset(...args);}
  catch(error){if(!/timeout|canceling statement/i.test(error?.message||""))throw error;return loadMonthlyScorecardDataset(...args);}
}

// The monthly RPC includes the requested month and its previous month.
// Fetch every selected month, retaining that comparison data without counting overlaps twice.
export async function loadScorecardRange(supervisorPin, startDate, endDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) throw new Error("Choose a valid reporting date range.");
  const merged = {}, tables = new Map();
  let month = startDate.slice(0, 7);
  while (month <= endDate.slice(0, 7)) {
    const [year, number] = month.split('-').map(Number);
    const firstYear = number >= 7 ? year : year - 1;
    const dataset = await loadMonthlyScorecardDatasetWithRetry(supervisorPin, `${firstYear}-${String(firstYear + 1).slice(-2)}`, `${month}-01`);
    for (const [key, value] of Object.entries(dataset)) {
      if (!Array.isArray(value)) { merged[key] = value; continue; }
      if (!tables.has(key)) tables.set(key, new Map());
      for (const row of value) {
        const identity = row?.id ?? row?.directory_id ?? JSON.stringify(row);
        tables.get(key).set(String(identity), row);
      }
    }
    month = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, '0')}`;
  }
  for (const [key, rows] of tables) merged[key] = [...rows.values()];
  return merged;
}
