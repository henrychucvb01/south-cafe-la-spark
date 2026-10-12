import React, {useState} from "react";
import SnpMonitoringPage from '../snpMonitoring/SnpMonitoringPage';
import MonitoringWorkspace from "../supperMonitoring/SupperMonitoringPage";
// The shared record workspace handles every monitoring type. Only Supper has a
// guided editor; other types can use existing PDFs without invented form rules.
export default function MonitoringPage({ monitoringType = "supper", ...props }) {
  const [snp,setSnp]=useState(false);
  if(snp)return <SnpMonitoringPage {...props} onBack={()=>setSnp(false)}/>;
  return <MonitoringWorkspace monitoringType={monitoringType} {...props} onOpenSnp={()=>setSnp(true)} />;
}
