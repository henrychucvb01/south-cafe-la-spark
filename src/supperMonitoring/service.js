import { supabase } from "../supabaseClient";

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message || "SPARK could not connect. Please try again.");
  return data;
}
export async function openSession(location, employee, pin) {
  const token = await rpc("open_supper_monitoring_session", { p_location_id: location.id, p_employee_id: employee.covering ? null : employee.id, p_pin: pin, p_covering_name: employee.covering ? employee.employee_name : null });
  if (!token) throw new Error("The PIN or school assignment could not be verified. After repeated attempts, wait 15 minutes before trying again.");
  return token;
}
export const closeSession = token => rpc("close_supper_monitoring_session", { p_token: token });
export const listMonitorings = token => rpc("list_supper_monitorings", { p_token: token });
export const getMonitoring = (token, id) => rpc("get_supper_monitoring", { p_token: token, p_id: id });
export const saveDraft = (token, record, payload, section) => rpc("save_supper_monitoring_draft", { p_token: token, p_id: record?.id || null, p_revision: record?.revision || null, p_section: section, p_payload: payload });
