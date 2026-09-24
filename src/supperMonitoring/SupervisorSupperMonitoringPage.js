import React, { useEffect, useState } from 'react';
import SupperMonitoringPage from './SupperMonitoringPage';
import PdfReviewWorkspace from './PdfReviewWorkspace';
import SupervisorExistingUpload from './SupervisorExistingUpload';
import { supervisorOverview, setUploads, openSupervisorSession, closeSession, getMonitoring } from './service';
import { SLOTS, STATUSES, slotProgress } from './workflow';
import { schoolYear, localDate } from './model';
import './supperMonitoring.css';

export default function SupervisorSupperMonitoringPage({ supervisorPin, onBack }) {
  const [overview,setOverview]=useState({schools:[],records:[]});
  const [school,setSchool]=useState(null);
  const [workspace,setWorkspace]=useState(null);
  const [upload,setUpload]=useState(false);
  const [year,setYear]=useState(schoolYear(localDate()));
  const [schoolFilter,setSchoolFilter]=useState('');
  const [status,setStatus]=useState('');
  const [role,setRole]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  async function load(){setBusy(true);setError('');try{setOverview(await supervisorOverview(supervisorPin));}catch(e){setError(e.message);}finally{setBusy(false);}}
  useEffect(()=>{load();},[supervisorPin]); // Existing Supervisor sign-in, never a Manager PIN.
  async function openReview(item,selectedSchool=overview.schools.find(s=>s.id===item.location_id)){
    setBusy(true);setError('');let token;
    try {
      token=await openSupervisorSession(selectedSchool,supervisorPin);
      const record=await getMonitoring(token,item.id);
      setWorkspace({token,record,school:selectedSchool});setUpload(false);
    }catch(e){if(token)await closeSession(token).catch(()=>{});setError(e.message);}finally{setBusy(false);}
  }
  async function closeReview(){await closeSession(workspace.token).catch(()=>{});setWorkspace(null);await load();}
  if(workspace) return <div className="login-app sm-app"><main className="sm-main"><PdfReviewWorkspace token={workspace.token} initialRecord={workspace.record} school={workspace.school} supervisor onBack={closeReview}/></main></div>;
  if(upload) return <div className="login-app sm-app"><main className="sm-main"><SupervisorExistingUpload schools={overview.schools} supervisorPin={supervisorPin} initialYear={year} onBack={()=>setUpload(false)} onUploaded={async(record,school)=>{await openReview(record,school);}}/>{error&&<p role="alert" className="sm-error">{error}</p>}</main></div>;
  if(school) return <SupperMonitoringPage key={school.id} location={school} employee={{employee_name:'Supervisor / AFSS'}} supervisorPin={supervisorPin} onBack={()=>{setSchool(null);load();}}/>;
  const rows=overview.schools.filter(s=>!schoolFilter||String(s.id)===schoolFilter).map(s=>({...s,slots:slotProgress(overview.records.filter(r=>r.location_id===s.id),year)})).filter(s=>s.slots.some(p=>(!role||(p.slot==='supervisor'?'supervisor':'manager')===role)&&(!status||(p.record?.status||'not_started')===status)));
  const queue=overview.records.filter(r=>r.status==='submitted'&&r.monitor_role==='manager'&&r.school_year===year&&(!schoolFilter||String(r.location_id)===schoolFilter)).sort((a,b)=>String(a.submitted_at).localeCompare(String(b.submitted_at)));
  return <div className="login-app sm-app"><main className="sm-main">
    <button type="button" onClick={onBack}>← Command Center</button><h1>Supervisor Supper Monitoring</h1>
    {error&&<p role="alert" className="sm-error">{error}</p>}
    <section className="sm-card">
      <div className="sm-actions"><button type="button" className="sm-primary" disabled={busy||!overview.schools.length} onClick={()=>setUpload(true)}>Upload Existing Monitoring</button></div>
      <p>Upload a completed Manager monitoring on behalf of a school. To personally conduct your required AFSS monitoring, open a school below and choose Start Supervisor Monitoring.</p>
      <label className="sm-check"><input type="checkbox" checked={!!overview.allow_manager_uploads} disabled={busy} onChange={async e=>{setBusy(true);try{await setUploads(supervisorPin,e.target.checked);await load();}catch(err){setError(err.message);}finally{setBusy(false);}}}/>Allow Manager PDF Uploads</label>
      <p>Turning this off prevents new manager uploads. Existing PDFs, corrections, and Supervisor uploads on behalf of schools remain available.</p>
      <div className="sm-grid"><label>School<select value={schoolFilter} onChange={e=>setSchoolFilter(e.target.value)}><option value="">All authorized schools</option>{overview.schools.map(s=><option key={s.id} value={s.id}>{s.school_name}</option>)}</select></label>
      <label>School year<input value={year} onChange={e=>setYear(e.target.value)}/></label>
      <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option><option value="not_started">Not Started</option>{Object.entries(STATUSES).filter(([k])=>k!=='deleted').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Performed by<select value={role} onChange={e=>setRole(e.target.value)}><option value="">Manager and Supervisor</option><option value="manager">Manager</option><option value="supervisor">Supervisor / AFSS</option></select></label></div>
      <button type="button" disabled={busy} onClick={load}>Refresh Overview</button>
    </section>
    <section className="sm-card"><h2>Submitted for Review</h2><p>Manager monitorings awaiting your review for the selected school and school year.</p>
      {!queue.length?<p>No submitted monitorings awaiting review.</p>:<div className="sm-queue-scroll"><table className="sm-review-queue"><thead><tr>{['School','Monitoring slot','Monitoring date','Submitted by','Submitted date','Status','Review'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{queue.map(r=><tr key={r.id}>
        <td>{overview.schools.find(s=>s.id===r.location_id)?.school_name}</td><td>{SLOTS[r.monitoring_slot]||'Slot needs assignment'}</td><td>{r.monitoring_date}</td>
        <td>{r.submitted_by_name||r.created_by_name}{r.uploaded_on_behalf&&r.submitted_by_role==='supervisor'?' (on behalf of school/Manager)':''}</td><td>{r.submitted_at?new Date(r.submitted_at).toLocaleString():'—'}</td><td>{STATUSES[r.status]}</td><td><button type="button" disabled={busy} onClick={()=>openReview(r)}>Review</button></td>
      </tr>)}</tbody></table></div>}
    </section>
    {rows.map(s=><section key={s.id} className="sm-card"><h2>{s.school_name}</h2><div className="sm-slot-grid">{s.slots.map(p=><div key={p.slot}><strong>{SLOTS[p.slot]}</strong><p>{p.record?STATUSES[p.record.status]:'Not Started'}</p></div>)}</div><button type="button" onClick={()=>setSchool(s)}>Open School Monitorings</button></section>)}
    {!busy&&!rows.length&&<p>No schools match these filters.</p>}
  </main></div>;
}
