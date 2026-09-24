import React, { useState } from "react";
export default function RestartMonitoringButton({ disabled, onRestart }) {
  const [confirming,setConfirming]=useState(false);
  if (!confirming) return <button type="button" disabled={disabled} onClick={()=>setConfirming(true)}>Redo Monitoring</button>;
  return <div className="sm-notice" role="alertdialog" aria-labelledby="restart-title" aria-describedby="restart-description"><h3 id="restart-title">Start this monitoring over?</h3><p id="restart-description">Your current answers and signatures, including unsaved changes, will be cleared. This cannot be undone. The school, site, type, school year and slot stay assigned to this same record. Any prior PDF remains historical, not the current official report.</p><div className="sm-actions"><button type="button" disabled={disabled} onClick={()=>setConfirming(false)}>Cancel</button><button type="button" className="sm-primary" disabled={disabled} onClick={async()=>{await onRestart();setConfirming(false);}}>Start Over</button></div></div>;
}
