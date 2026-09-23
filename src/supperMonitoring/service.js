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

async function reportRequest(token, record, action) {
  const response = await fetch("/api/supper-monitoring", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, id: record.id, revision: record.revision }) });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || "The official report could not be saved. Your draft is preserved.");
    error.errors = body.errors || []; throw error;
  }
  return response;
}
export async function submitMonitoring(token, record) { return (await (await reportRequest(token, record, "submit")).json()).record; }
export async function downloadReport(token, record, action = "download") {
  const response = await reportRequest(token, record, action);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a"); link.href = url; link.download = `Supper-Monitoring-${record.monitoring_date || "draft"}.pdf`;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
