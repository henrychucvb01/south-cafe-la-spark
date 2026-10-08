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

  const { error } = await supabase.rpc("spark_claim_school_points", {
    p_location_id: locationId,
    p_service_date: serviceDate,
    p_kind: pointType,
  });

  if (error) {
    // 23505 = duplicate unique key.
    // This means the points were already awarded,
    // so we intentionally do nothing.
    if (error.code === "23505") {
      return true;
    }

    throw new Error(error.message || "SPARK could not save the reward. Please retry the saved activity.");
  }

  return true;
}
