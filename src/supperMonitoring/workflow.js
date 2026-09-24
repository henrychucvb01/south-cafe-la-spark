import { MONITORING_TYPES, sameAssignment } from "../monitoring/types.js";
export const SLOTS = { manager_1: "Supper 1 · Manager", supervisor: "Supper 2 · Supervisor / AFSS", manager_2: "Supper 3 · Manager" };
export const STATUSES = { draft: "Draft", submitted: "Submitted for Review", corrections_requested: "Corrections Requested", accepted: "Accepted / Locked", completed: "Completed / Locked" };
export function canEdit(record, context) {
  if (!record) return true;
  if (record.status === "deleted") return false;
  if (record.locked || ["accepted","completed"].includes(record.status)) return false;
  if (!["draft","corrections_requested"].includes(record.status)) return false;
  if (context?.actor_role === "supervisor") return true;
  if (record.uploaded_on_behalf) return record.monitor_role === "manager" && !record.locked && !["accepted","completed"].includes(record.status) && (!record.manager_employee_id || record.manager_employee_id === context?.employee_id);
  return record.monitor_role !== "supervisor" && !record.locked && !["accepted","completed"].includes(record.status) && (context?.employee_id ? record.created_by_employee_id === context.employee_id : record.created_by_employee_id == null && record.created_by_name === context?.monitor_name);
}
export function editableGuided(record, context) { return record?.source !== "uploaded" && MONITORING_TYPES[record?.monitoring_type || "supper"]?.enabled && canEdit(record,context) && (!record || ["draft","corrections_requested"].includes(record.status)); }
export function slotProgress(records, year, siteId, type = "supper") {
  if (type !== "supper") return records.filter(r=>r.school_year===year && (siteId===undefined || sameAssignment(r,siteId,type)) && r.monitoring_type===type).map(record=>({slot:record.monitoring_number,label:`${MONITORING_TYPES[type]?.label} ${record.monitoring_number || ""}`,record}));
  return Object.entries(SLOTS).map(([slot,label]) => ({slot,label,record:records.find(r=>r.school_year===year && (siteId === undefined || sameAssignment(r,siteId,type)) && r.monitoring_slot===slot && r.status!=="deleted")}));
}

export function canRestart(record, context) { return context?.actor_role === "manager" && record?.source === "generated" && record.monitor_role === "manager" && editableGuided(record, context); }
