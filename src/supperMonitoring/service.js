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

async function reportRequest(token, record, action, extra = {}) {
  const response = await fetch("/api/supper-monitoring", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, id: record?.id, revision: record?.revision, ...extra }) });
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

export async function openSupervisorSession(location, pin) {
  const token = await rpc("open_supper_supervisor_session",{p_location_id:location.id,p_pin:pin});
  if (!token) throw Error("Supervisor access could not be verified. Return to Command Center and sign in again.");
  return token;
}
export const getContext = token => rpc("supper_context",{p_token:token});
export const supervisorOverview = pin => rpc("supper_supervisor_overview",{p_pin:pin});
export const setUploads = (pin,enabled) => rpc("set_supper_uploads",{p_pin:pin,p_enabled:enabled});
export const reviewAction = (token,record,action,comment) => rpc("supper_review_action",{p_token:token,p_id:record.id,p_revision:record.revision,p_action:action,p_comment:comment});
export const auditHistory = (token,id) => rpc("supper_audit_history",{p_token:token,p_id:id});
export async function uploadPdf(token,record,metadata,file) {
  if (!file || file.size > 2097152 || !/\.pdf$/i.test(file.name)) throw Error("Select a PDF no larger than 2 MB.");
  const pdfBase64 = await new Promise((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(reader.result.split(",")[1]); reader.onerror=()=>reject(Error("The PDF could not be read.")); reader.readAsDataURL(file); });
  return (await (await reportRequest(token,record,"upload",{metadata,pdfBase64})).json()).record;
}
export async function downloadVersion(token,record,version) {
  const response=await reportRequest(token,record,"version",{version});
  const url=URL.createObjectURL(await response.blob()); const link=document.createElement("a");
  link.href=url;link.download=`Supper-Monitoring-version-${version}.pdf`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
