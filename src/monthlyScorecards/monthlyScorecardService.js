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

export async function saveMonthlyImport({ supervisorPin, reportType, schoolYear, reportingMonth, filename, parsed, checksum }) {
  const normalizedRows=dedupeMonthlyRows(reportType,parsed.normalizedRows);
  const { data, error } = await supabase.rpc("import_monthly_scorecard_report", {
    p_supervisor_pin: supervisorPin,
    p_report_type: reportType,
    p_school_year: schoolYear,
    p_reporting_month: reportingMonth,
    p_original_filename: filename,
    p_uploaded_by: "Supervisor",
    p_parser_version: "1.0.0",
    p_source_checksum: checksum,
    p_source_row_count: parsed.sourceRowCount,
    p_rejected_row_count: parsed.rejectedRows.length,
    p_ignored_row_count: parsed.ignoredRows.length,
    p_out_of_area_row_count: parsed.ignoredOutOfAreaRows.length,
    p_raw_rows: parsed.rawRows,
    p_normalized_rows: normalizedRows,
    p_warnings: parsed.warnings,
  });
  if (error) throw error;
  return data;
}

export async function loadMonthlyScorecardDataset(supervisorPin,schoolYear,reportingMonth) {
  const { data,error } = await supabase.rpc("get_monthly_scorecard_dataset",{
    p_supervisor_pin:supervisorPin,p_school_year:schoolYear,p_reporting_month:reportingMonth,
  });
  if (error) throw error;
  return data || {};
}

export async function loadMonthlyScorecardDatasetWithRetry(...args) {
  try{return await loadMonthlyScorecardDataset(...args);}
  catch(error){if(!/timeout|canceling statement/i.test(error?.message||""))throw error;return loadMonthlyScorecardDataset(...args);}
}
