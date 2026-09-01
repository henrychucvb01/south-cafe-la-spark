import { supabase } from "../supabaseClient";

export const FEEDBACK_CATEGORIES = ["Bug", "Suggestion", "Question"];
export const FEEDBACK_STATUSES = ["New", "Reviewing", "Resolved"];

export async function submitFeedback({ location, employee, category, message, pageRoute }) {
  const { data, error } = await supabase.rpc("submit_spark_feedback", {
    p_location_id: location?.id || null,
    p_location_code: location?.location_code || null,
    p_school_name: location?.school_name || null,
    p_employee_id: employee?.id || null,
    p_employee_name: employee?.employee_name || null,
    p_category: category,
    p_message: message.trim(),
    p_page_route: pageRoute,
  });
  if (error) throw error;
  return data;
}

export async function loadSupervisorFeedback(supervisorPin, status = "All") {
  const { data, error } = await supabase.rpc("list_spark_feedback", { p_supervisor_pin: supervisorPin, p_status: status === "All" ? null : status });
  if (error) throw error;
  return data || [];
}

export async function changeFeedbackStatus(supervisorPin, feedbackId, status) {
  const { error } = await supabase.rpc("update_spark_feedback_status", { p_supervisor_pin: supervisorPin, p_feedback_id: feedbackId, p_status: status });
  if (error) throw error;
}
