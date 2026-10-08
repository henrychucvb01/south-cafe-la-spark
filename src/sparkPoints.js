import { supabase } from "./supabaseClient";

export async function awardSparkPoints({
  locationId,
  points,
  pointType,
  description,
  serviceDate,
  employeeId = null,
  employeeName = null,
  uniqueKey,
}) {
  if (!locationId || !points || !pointType || !serviceDate || !uniqueKey) {
    console.error("SPARK Points: missing required information.");
    return false;
  }

  const { error } = await supabase.from("spark_points").insert({
    location_id: locationId,
    points,
    point_type: pointType,
    description,
    service_date: serviceDate,
    source: "automatic",
    employee_id: employeeId || null,
    employee_name: employeeName || null,
    unique_key: uniqueKey,
  });

  if (error) {
    // 23505 = duplicate unique key.
    // This means the points were already awarded,
    // so we intentionally do nothing.
    if (error.code === "23505") {
      return true;
    }

    console.error("SPARK Points award error:", error);
    return false;
  }

  return true;
}
