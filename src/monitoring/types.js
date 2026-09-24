export const MONITORING_TYPES = Object.freeze({
  breakfast: { label: "Breakfast", enabled: false },
  lunch: { label: "Lunch", enabled: false },
  supper: { label: "Supper", enabled: true },
  snack: { label: "Snack", enabled: false },
});
export const typeLabel = type => MONITORING_TYPES[type || "supper"]?.label || type;
export const siteLabel = record => record?.monitoring_site_name || "Main Site";
export const hasCurrentPdf = record => record?.document_version > 0 && record.current_pdf_available !== false;
export function sameAssignment(record, siteId, type = "supper") {
  return (record.monitoring_type || "supper") === type && (siteId ? record.monitoring_site_id === siteId : !record.monitoring_site_id);
}

export const SUPPER_SEQUENCE = Object.freeze({manager_1:1, supervisor:2, manager_2:3});
export function recordLabel(record) {
  const number = record.monitoring_number || (record.monitoring_type === 'supper' || !record.monitoring_type ? SUPPER_SEQUENCE[record.monitoring_slot] : null);
  return `${typeLabel(record.monitoring_type)}${number ? ` ${number}` : ''} - ${siteLabel(record)}`;
}
