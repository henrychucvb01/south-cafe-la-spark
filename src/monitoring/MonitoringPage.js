import React from "react";
import SupperMonitoringPage from "../supperMonitoring/SupperMonitoringPage";
// Register additional complete guided workflows here when they are ready.
const guidedWorkflows = { supper: SupperMonitoringPage };
export default function MonitoringPage({ monitoringType = "supper", ...props }) {
  const Page = guidedWorkflows[monitoringType];
  return Page ? <Page {...props} /> : <p>This monitoring type is not available yet.</p>;
}
