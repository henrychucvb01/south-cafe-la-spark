import { supabase } from "../supabaseClient";
import { loadOfficialMealCounts } from "../monthlyScorecards/monthlyScorecardService";

// Fetch every school/date, rather than silently accepting the server's row cap.
async function loadRange(table, columns, ids, startDate, endDate) {
  const rows = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table).select(columns)
      .in("location_id", ids).gte("service_date", startDate).lte("service_date", endDate)
      .order("location_id").order("service_date").range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function loadMplhReportData(supervisorPin, ids, startDate, endDate) {
  const [officialMealRows, mealRows, laborRows, excludedRows] = await Promise.all([
    loadOfficialMealCounts(supervisorPin, startDate, endDate),
    loadRange("meal_counts", "location_id, service_date, breakfast_count, lunch_count, supper_count, supper_status", ids, startDate, endDate),
    loadRange("labor_hours", "location_id, service_date, additional_worker_hours, manager_overtime_hours", ids, startDate, endDate),
    loadRange("spark_excluded_days", "location_id, service_date", ids, startDate, endDate),
  ]);
  return { officialMealRows, mealRows, laborRows, excludedRows };
}
