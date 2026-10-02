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
  const rows = dedupeMonthlyRows(reportType, parsed.normalizedRows);
  let saved = 0;
  const months = new Set();
  for (let offset = 0; offset < rows.length; offset += 250) {
    const chunk = rows.slice(offset, offset + 250);
    const { error } = await supabase.rpc("merge_monthly_scorecard_rows", {
      p_supervisor_pin: supervisorPin, p_report_type: reportType,
      p_filename: filename, p_checksum: checksum,
      p_source_count: parsed.sourceRowCount, p_rejected_count: parsed.rejectedRows.length,
      p_rows: chunk,
    });
    if (error) throw new Error(`${error.message || "Upload connection failed"}. ${saved} records confirmed saved. Retry the same file safely; existing records will not be duplicated.`);
    saved += chunk.length;
    chunk.forEach(row => months.add(row.production_date.slice(0, 7)));
    onProgress?.(saved, rows.length);
  }
  return { saved, months: [...months].sort() };
}

async function attachExcludedDays(dataset, reportingMonth) {
  const ids = [...new Set((dataset.schools || []).map(s => s.location_id).filter(Boolean))];
  if (!ids.length) return { ...dataset, excluded_days: [] };
  const start = new Date(`${reportingMonth.slice(0, 7)}-01T12:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() - 1);
  const end = new Date(`${reportingMonth.slice(0, 7)}-01T12:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const rows = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.from("spark_excluded_days")
      .select("location_id, service_date").in("location_id", ids)
      .gte("service_date", start.toISOString().slice(0, 10))
      .lt("service_date", end.toISOString().slice(0, 10))
      .order("location_id").order("service_date").range(offset, offset + 99);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 100) break;
  }
  return { ...dataset, excluded_days: rows };
}

export async function loadMonthlyScorecardDataset(supervisorPin,schoolYear,reportingMonth) {
  const { data,error } = await supabase.rpc("get_monthly_scorecard_dataset",{
    p_supervisor_pin:supervisorPin,p_school_year:schoolYear,p_reporting_month:reportingMonth,
  });
  if (error) throw error;
  return attachExcludedDays(data || {}, reportingMonth);
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
