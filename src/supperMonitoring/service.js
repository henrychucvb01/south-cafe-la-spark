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
  const response = await fetch("/api/monitoring", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, id: record?.id, revision: record?.revision, ...extra }) });
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
  const link = document.createElement("a"); link.href = url; link.download = `${record.monitoring_type || "supper"}-Monitoring-${record.monitoring_date || "draft"}.pdf`;
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
async function encodeUpload(selection) {
  const files = Array.isArray(selection) ? selection : selection ? [selection] : [];
  if (files.length < 1 || files.length > 2) throw Error("Select 1 or 2 PDFs.");
  if (files.some(file => !/\.pdf$/i.test(file.name)) || files.reduce((total,file)=>total+file.size,0)>2097152) throw Error("Select PDFs totaling no more than 2 MB.");
  const pdfs = await Promise.all(files.map(file => new Promise((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(reader.result.split(",")[1]); reader.onerror=()=>reject(Error("The PDF could not be read.")); reader.readAsDataURL(file); })));
  return pdfs;
}
export async function uploadPdf(token,record,metadata,selection) {
  const pdfs = await encodeUpload(selection);
  return (await (await reportRequest(token,record,"upload",{metadata,pdfs})).json()).record;
}
export async function previewUpload(token,selection) {
  const pdfs = await encodeUpload(selection);
  return new Uint8Array(await (await reportRequest(token,null,"upload-preview",{pdfs})).arrayBuffer());
}
export async function submitReviewedUpload(token,record,metadata,bytes) {
  return uploadPdf(token,record,metadata,new File([bytes],"monitoring.pdf",{type:"application/pdf"}));
}

export const schoolManagers = token => rpc("supper_school_managers", {p_token:token});
export const pdfReviews = (token,id) => rpc("supper_pdf_reviews_for_record", {p_token:token,p_id:id});
export async function reportBytes(token,record) {
  const response = await reportRequest(token,record,"download");
  return new Uint8Array(await response.arrayBuffer());
}
export async function savePdfReview(token,record,annotations,comment,reviewAction="save") {
  return (await (await reportRequest(token,record,"review",{version:record.document_version,annotations,comment,reviewAction})).json()).record;
}

export const monitoringSites = token => rpc("monitoring_sites_for_school", {p_token:token});
export const createMonitoringSite = (token,name,kind) => rpc("create_monitoring_site", {p_token:token,p_name:name,p_kind:kind});
export const restartMonitoring = (token,record) => rpc("restart_monitoring", {p_token:token,p_id:record.id,p_revision:record.revision});
export const deleteDraft = (token,record) => rpc("delete_monitoring_draft", {p_token:token,p_id:record.id,p_revision:record.revision});
export const saveSupperSchedule = (pin,setting) => rpc('save_supper_due_date', {p_pin:pin,p_year:setting.year,p_slot:setting.slot,p_due:setting.due,p_revision:setting.revision ?? null});
export const setMonitoringStar = (token,record,awarded) => rpc('set_monitoring_star', {p_token:token,p_id:record.id,p_revision:record.revision,p_awarded:awarded});

export async function previewReport(token, record) {
  const response = await reportRequest(token, record, "preview");
  return new Uint8Array(await response.arrayBuffer());
}
