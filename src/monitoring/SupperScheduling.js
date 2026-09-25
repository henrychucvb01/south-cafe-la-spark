import React, { useEffect, useRef, useState } from 'react';
import { openSupervisorSession, closeSession, saveSupperSchedule } from '../supperMonitoring/service';
import { SLOTS, STATUSES } from '../supperMonitoring/workflow';
import { displayDate, supperSchedule } from './supperSchedule';
import SupperScheduleDetails from './SupperScheduleDetails';

export default function SupperScheduling({ overview, year, schoolFilter, supervisorPin, onRefresh }) {
  const sites = (overview.sites || []).filter(site => !schoolFilter || String(site.location_id) === schoolFilter);
  const [selected,setSelected] = useState('');
  const siteId = sites.some(s => s.id === selected) ? selected : sites[0]?.id;
  const [slot,setSlot] = useState('manager_1');
  const [start,setStart] = useState(''), [end,setEnd] = useState(''), [due,setDue] = useState('');
  const [busy,setBusy] = useState(false), [message,setMessage] = useState(''), [error,setError] = useState('');
  const detail = useRef(null);
  const schedule = supperSchedule({ schedules:overview.supper_schedules, records:overview.records, siteId, year, slot });
  const setting = schedule.setting;
  useEffect(() => { setStart(setting?.available_start || '');setEnd(setting?.available_end || '');setDue(setting?.due_date || ''); }, [siteId,year,slot,setting]);
  useEffect(()=>{setMessage('');setError('');},[siteId,year,slot]);
  const schoolFor = site => overview.schools.find(s => s.id === site.location_id);
  const name = site => `${schoolFor(site)?.school_name || 'School'} · ${site.name}${site.kind === 'eec' ? ' (EEC)' : ''}`;
  async function publish(event) {
    event.preventDefault();setBusy(true);setError('');setMessage('');let token;
    try {
      token = await openSupervisorSession(schoolFor(sites.find(s => s.id === siteId)),supervisorPin);
      await saveSupperSchedule(token,{siteId,year,slot,start,end,due,revision:setting?.revision});
      await onRefresh();setMessage('Schedule published. Managers will see these dates when they open or refresh Monitorings.');
    } catch(e) { setError(e.message); }
    finally { if(token)await closeSession(token).catch(()=>{});setBusy(false); }
  }
  return <section className="sm-card sm-scheduling"><h2>Supper Scheduling / Matrix</h2><p>Publish windows and due dates for each site in {year}. The matrix updates from accepted/completed monitoring dates. Due dates are displayed separately from the available window.</p>
    {!sites.length ? <p>No monitored sites match this school selection. Open the school to add a site/program.</p> : <>
      <form onSubmit={publish} ref={detail}>
        <fieldset disabled={busy} className="sm-editor"><div className="sm-grid">
          <label>Scheduling school / site<select aria-label="Scheduling school / site" value={siteId} onChange={e=>setSelected(e.target.value)}>{sites.map(site=><option key={site.id} value={site.id}>{name(site)}</option>)}</select></label>
          <label>Supper monitoring number<select aria-label="Supper monitoring number" value={slot} onChange={e=>setSlot(e.target.value)}>{Object.entries(SLOTS).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
          <label>Available Start Date<input type="date" required value={start} onChange={e=>setStart(e.target.value)}/></label>
          <label>Available End Date<input type="date" required min={start || undefined} value={end} onChange={e=>setEnd(e.target.value)}/></label>
          <label>Due Date<input type="date" required value={due} onChange={e=>setDue(e.target.value)}/></label>
        </div><button type="submit" className="sm-primary">{busy ? 'Publishing…' : 'Publish Schedule'}</button></fieldset>
      </form>
      {error && <p role="alert" className="sm-error">{error}</p>}{message && <p role="status">{message}</p>}
      <h3>{name(sites.find(s=>s.id===siteId))} · {SLOTS[slot]} · {year}</h3>
      <SupperScheduleDetails schedule={schedule}/>
      <h3>School / Site Overview</h3><div className="sm-queue-scroll"><table className="sm-review-queue sm-schedule-overview"><thead><tr>{['School / Site','Supper 1','Supper 2','Supper 3','Next Due','Matrix'].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{sites.map(site=>{
        const progress = Object.keys(SLOTS).map(key=>{
          const record=overview.records.find(r=>r.monitoring_type==='supper' && r.monitoring_site_id===site.id && r.school_year===year && r.monitoring_slot===key);
          const scheduled=(overview.supper_schedules || []).find(s=>s.monitoring_site_id===site.id && s.school_year===year && s.monitoring_slot===key);
          return {key,record,scheduled,done:['accepted','completed'].includes(record?.status)};
        });
        const next=progress.filter(p=>!p.done && p.scheduled?.due_date).sort((a,b)=>a.scheduled.due_date.localeCompare(b.scheduled.due_date))[0];
        return <tr key={site.id}><th scope="row">{name(site)}</th>{progress.map(p=><td key={p.key}>{p.record ? STATUSES[p.record.status] : 'Not Started'}<br/>{p.done && <>Completed: {displayDate(p.record.monitoring_date)}<br/></>}Due: {displayDate(p.scheduled?.due_date)}</td>)}<td>{next ? `${SLOTS[next.key].split(' · ')[0]}: ${displayDate(next.scheduled.due_date)}` : '—'}</td><td><button type="button" disabled={busy} onClick={()=>{setSelected(site.id);setSlot(progress.find(p=>!p.done)?.key || 'manager_2');detail.current?.scrollIntoView({block:'start',behavior:'smooth'});}}>Open Matrix<span className="sm-sr-only"> for {name(site)}</span></button></td></tr>;
      })}</tbody></table></div>
    </>}
  </section>;
}
