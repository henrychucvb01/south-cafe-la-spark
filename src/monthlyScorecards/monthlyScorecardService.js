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

export async function saveMonthlyImport({ supervisorPin, reportType, schoolYear, reportingMonth, filename, parsed, checksum }) {
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
    p_raw_rows: parsed.rawRows,
    p_normalized_rows: parsed.normalizedRows,
    p_warnings: parsed.warnings,
  });
  if (error) throw error;
  return data;
}
