import React from "react";
import MonitoringWorkspace from "../supperMonitoring/SupperMonitoringPage";
// The shared record workspace handles every monitoring type. Only Supper has a
// guided editor; other types can use existing PDFs without invented form rules.
export default function MonitoringPage({ monitoringType = "supper", ...props }) {
  return <MonitoringWorkspace monitoringType={monitoringType} {...props} />;
}
