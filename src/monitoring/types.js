export const MONITORING_TYPES = Object.freeze({
  supper: { label: "Supper", enabled: true },
  breakfast: { label: "Breakfast", enabled: false },
  lunch: { label: "Lunch", enabled: false },
});
export const typeLabel = type => MONITORING_TYPES[type || "supper"]?.label || type;
export const siteLabel = record => record?.monitoring_site_name || "Main Site";
export const hasCurrentPdf = record => record?.document_version > 0 && record.current_pdf_available !== false;
export function sameAssignment(record, siteId, type = "supper") {
  return (record.monitoring_type || "supper") === type && (siteId ? record.monitoring_site_id === siteId : !record.monitoring_site_id);
}
