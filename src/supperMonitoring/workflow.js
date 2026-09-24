export const SLOTS = { manager_1: "Manager Monitoring #1", manager_2: "Manager Monitoring #2", supervisor: "Supervisor Monitoring" };
export const STATUSES = { draft: "Draft", submitted: "Submitted for Review", corrections_requested: "Corrections Requested", accepted: "Accepted / Locked", completed: "Completed / Locked", deleted: "Deleted by Supervisor" };
export function canEdit(record, context) {
  if (!record) return true;
  if (record.status === "deleted") return false;
  if (context?.actor_role === "supervisor") return true;
  return record.monitor_role !== "supervisor" && !record.locked && !["accepted","completed"].includes(record.status) && (context?.employee_id ? record.created_by_employee_id === context.employee_id : record.created_by_employee_id == null && record.created_by_name === context?.monitor_name);
}
export function editableGuided(record, context) { return record?.source !== "uploaded" && canEdit(record,context) && (!record || ["draft","corrections_requested"].includes(record.status)); }
export function slotProgress(records, year) {
  return Object.entries(SLOTS).map(([slot,label]) => ({slot,label,record:records.find(r=>r.school_year===year && r.monitoring_slot===slot && r.status!=="deleted")}));
}
