import React, { useEffect, useState } from 'react';
import { openSupervisorSession, closeSession, schoolManagers, listMonitorings, uploadPdf } from './service';
import { schoolYear } from './model';
import { SLOTS } from './workflow';

export default function SupervisorExistingUpload({ schools, supervisorPin, initialYear, onBack, onUploaded }) {
  const [schoolId,setSchoolId]=useState('');
  const [token,setToken]=useState('');
  const [managers,setManagers]=useState([]);
  const [records,setRecords]=useState([]);
  const [metadata,setMetadata]=useState({schoolYear:initialYear,monitoringSlot:'manager_1',monitoringDate:'',managerEmployeeId:'',monitorName:'',onBehalf:true});
  const [file,setFile]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const school=schools.find(s=>String(s.id)===schoolId);
  useEffect(()=>{
    let cancelled=false,session;
    setToken('');setManagers([]);setRecords([]);
    setMetadata(m=>({...m,managerEmployeeId:'',monitorName:''}));
    if(!school)return;
    setBusy(true);setError('');
    (async()=>{
      session=await openSupervisorSession(school,supervisorPin);
      const [people,history]=await Promise.all([schoolManagers(session),listMonitorings(session)]);
      if(cancelled){await closeSession(session);return;}
      setToken(session);setManagers(people);setRecords(history);
    })().catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setBusy(false);});
    return()=>{cancelled=true;if(session)closeSession(session).catch(()=>{});};
  },[school,supervisorPin]);
  const occupied=slot=>records.some(r=>r.status!=='deleted'&&r.school_year===metadata.schoolYear&&r.monitoring_slot===slot);
  async function upload(){setBusy(true);setError('');try{const record=await uploadPdf(token,null,metadata,file);await onUploaded(record,school);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <section className="sm-card"><h2>Upload Existing Monitoring</h2>
    <p>Upload an already-completed <strong>Manager monitoring</strong> on behalf of an authorized school. This does not count as your Supervisor / AFSS monitoring. Your Supervisor sign-in authorizes the upload; no Manager PIN is needed.</p>
    {error&&<p className="sm-error" role="alert">{error}</p>}
    <fieldset className="sm-editor" disabled={busy}>
      <label>School<select aria-label="Upload school" value={schoolId} onChange={e=>setSchoolId(e.target.value)}><option value="">Choose an authorized school</option>{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select></label>
      <div className="sm-grid"><label>School year<input value={metadata.schoolYear} onChange={e=>setMetadata({...metadata,schoolYear:e.target.value})}/></label>
      <label>Monitoring slot<select value={metadata.monitoringSlot} onChange={e=>setMetadata({...metadata,monitoringSlot:e.target.value})}>{['manager_1','manager_2'].map(slot=><option key={slot} value={slot} disabled={occupied(slot)}>{SLOTS[slot]}{occupied(slot)?' — already exists':''}</option>)}</select></label>
      <label>Monitoring date<input type="date" value={metadata.monitoringDate} onChange={e=>setMetadata({...metadata,monitoringDate:e.target.value,schoolYear:schoolYear(e.target.value)||metadata.schoolYear})}/></label>
      <label>Manager responsible for corrections<select value={metadata.managerEmployeeId} onChange={e=>setMetadata({...metadata,managerEmployeeId:e.target.value,monitorName:managers.find(m=>String(m.id)===e.target.value)?.employee_name||metadata.monitorName})}><option value="">Any authorized Manager at this school</option>{managers.map(m=><option key={m.id} value={m.id}>{m.employee_name}</option>)}</select></label></div>
      <label>Manager / monitor printed name<input maxLength={160} value={metadata.monitorName} onChange={e=>setMetadata({...metadata,monitorName:e.target.value})}/></label>
      <div className="sm-dropzone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();setFile(e.dataTransfer.files[0]||null);}}><label>Choose PDF<input type="file" accept="application/pdf,.pdf" onChange={e=>setFile(e.target.files[0]||null)}/></label><p>Or drag and drop a PDF here. Up to 2 MB and 20 pages.</p>{file&&<p>{file.name}</p>}</div>
      <p>The audit history will identify this as uploaded by the Supervisor on behalf of the school/Manager. It enters Submitted for Review and can then be reviewed and accepted.</p>
      <div className="sm-actions"><button type="button" onClick={onBack}>Cancel Upload</button><button type="button" className="sm-primary" disabled={!token||!file||!metadata.monitoringDate||!metadata.monitorName.trim()||occupied(metadata.monitoringSlot)} onClick={upload}>Upload Manager Monitoring</button></div>
    </fieldset>
  </section>;
}
