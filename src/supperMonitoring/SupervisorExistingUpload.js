import PdfUploadPicker from '../monitoring/PdfUploadPicker';
import { usePageNavigation } from '../navigation/PageNavigation';
import React, { useEffect, useState } from 'react';
import { openSupervisorSession, closeSession, schoolManagers, monitoringSites, listMonitorings, uploadPdf } from './service';
import { schoolYear } from './model';
import { MONITORING_TYPES } from '../monitoring/types';
import { SLOTS } from './workflow';

export default function SupervisorExistingUpload({ schools, supervisorPin, initialYear, onBack, onUploaded }) {
  const [schoolId,setSchoolId]=useState('');
  const [token,setToken]=useState('');
  const [managers,setManagers]=useState([]);
  const [sites,setSites]=useState([]);
  const [records,setRecords]=useState([]);
  const [metadata,setMetadata]=useState({schoolYear:initialYear,monitoringSlot:'manager_1',monitoringDate:'',managerEmployeeId:'',monitorName:'',onBehalf:true,monitoringType:'supper',monitoringSiteId:'',monitoringNumber:'',performerRole:'manager'});
  const [files,setFiles]=useState([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  usePageNavigation({ level: 2, title: 'Upload Existing Monitoring', destination: 'Supervisor Monitoring', disabled: busy, onNavigate: () => { if (!files.length || window.confirm('Discard this unsubmitted upload?')) onBack(); } });
  const school=schools.find(s=>String(s.id)===schoolId);
  useEffect(()=>{
    let cancelled=false,session;
    setToken('');setManagers([]);setRecords([]);setSites([]);
    setMetadata(m=>({...m,managerEmployeeId:'',monitorName:''}));
    if(!school)return;
    setBusy(true);setError('');
    (async()=>{
      session=await openSupervisorSession(school,supervisorPin);
      const [people,history,schoolSites]=await Promise.all([schoolManagers(session),listMonitorings(session),monitoringSites(session)]);
      if(cancelled){await closeSession(session);return;}
      setToken(session);setManagers(people);setRecords(history);setSites(schoolSites);setMetadata(m=>({...m,monitoringSiteId:schoolSites[0]?.id || ""}));
    })().catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setBusy(false);});
    return()=>{cancelled=true;if(session)closeSession(session).catch(()=>{});};
  },[school,supervisorPin]);
  const occupied=slot=>metadata.monitoringType==='supper' && records.some(r=>r.status!=='deleted'&&r.monitoring_site_id===metadata.monitoringSiteId&&(r.monitoring_type||'supper')===metadata.monitoringType&&r.school_year===metadata.schoolYear&&r.monitoring_slot===slot);
  async function upload(){setBusy(true);setError('');try{const record=await uploadPdf(token,null,metadata,files);await onUploaded(record,school);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <section className="sm-card"><h2>Upload Existing Monitoring</h2>
    <p>Upload an already-completed monitoring on behalf of an authorized school. Supper uploads use the Manager sequence; use Start Supervisor Monitoring to conduct your own Supper visit. Your Supervisor sign-in authorizes the upload; no Manager PIN is needed.</p>
    {error&&<p className="sm-error" role="alert">{error}</p>}
    <fieldset className="sm-editor" disabled={busy}>
      <label>School<select aria-label="Upload school" value={schoolId} onChange={e=>setSchoolId(e.target.value)}><option value="">Choose an authorized school</option>{schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select></label>
      <label>Monitoring type<select value={metadata.monitoringType} onChange={e=>setMetadata({...metadata,monitoringType:e.target.value})}>{Object.entries(MONITORING_TYPES).map(([type,config])=><option key={type} value={type}>{config.label}</option>)}</select></label><label>Monitored site / program<select aria-label="Monitored site / program" value={metadata.monitoringSiteId} onChange={e=>setMetadata({...metadata,monitoringSiteId:e.target.value})}>{sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}</select></label><div className="sm-grid"><label>School year<input value={metadata.schoolYear} onChange={e=>setMetadata({...metadata,schoolYear:e.target.value})}/></label>
      {metadata.monitoringType==='supper' ? <label>Monitoring slot<select value={metadata.monitoringSlot} onChange={e=>setMetadata({...metadata,monitoringSlot:e.target.value})}>{['manager_1','manager_2'].map(slot=><option key={slot} value={slot} disabled={occupied(slot)}>{SLOTS[slot]}{occupied(slot)?' — already exists':''}</option>)}</select></label> : <><label>Monitoring number<input type="number" min="1" step="1" value={metadata.monitoringNumber} onChange={e=>setMetadata({...metadata,monitoringNumber:e.target.value})}/></label><label>Performed by<select value={metadata.performerRole} onChange={e=>setMetadata({...metadata,performerRole:e.target.value})}><option value="manager">Manager</option><option value="supervisor">Supervisor / AFSS</option></select></label></>}
      <label>Monitoring date<input type="date" value={metadata.monitoringDate} onChange={e=>setMetadata({...metadata,monitoringDate:e.target.value,schoolYear:schoolYear(e.target.value)||metadata.schoolYear})}/></label>
      <label>Manager responsible for corrections<select value={metadata.managerEmployeeId} onChange={e=>setMetadata({...metadata,managerEmployeeId:e.target.value,monitorName:managers.find(m=>String(m.id)===e.target.value)?.employee_name||metadata.monitorName})}><option value="">Any authorized Manager at this school</option>{managers.map(m=><option key={m.id} value={m.id}>{m.employee_name}</option>)}</select></label></div>
      <label>Manager / monitor printed name<input maxLength={160} value={metadata.monitorName} onChange={e=>setMetadata({...metadata,monitorName:e.target.value})}/></label>
      <PdfUploadPicker files={files} onChange={setFiles} disabled={busy}/>
      <p>The record identifies the school, monitor and Supervisor who submitted it. It enters Submitted for Review and can then be reviewed and accepted.</p>
      <div className="sm-actions"><button type="button" onClick={onBack}>Cancel Upload</button><button type="button" className="sm-primary" disabled={!token||!files.length||!metadata.monitoringDate||!metadata.monitorName.trim()||(metadata.monitoringType!=='supper'&&!/^[1-9][0-9]*$/.test(metadata.monitoringNumber))||occupied(metadata.monitoringSlot)} onClick={upload}>{metadata.monitoringType==='supper' ? 'Upload Manager Monitoring' : 'Upload Monitoring'}</button></div>
    </fieldset>
  </section>;
}
