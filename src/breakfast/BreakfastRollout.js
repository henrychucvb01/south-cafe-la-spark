import React,{useEffect,useState} from 'react';
import {rolloutSettings} from './service';
import './breakfast.css';
export default function BreakfastRollout({supervisorPin}) {
 const [schools,setSchools]=useState([]),[selected,setSelected]=useState({}),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const accept=rows=>{setSchools(rows);setSelected(Object.fromEntries(rows.map(s=>[s.id,s.enabled])));};
 useEffect(()=>{let active=true;setBusy(true);setSchools([]);setSelected({});setError('');rolloutSettings(supervisorPin).then(rows=>{if(active)accept(rows);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[supervisorPin]);
 async function reload(){setBusy(true);setError('');setMessage('');try{accept(await rolloutSettings(supervisorPin));}catch(e){setError(e.message);}finally{setBusy(false);}}
 const changes=schools.filter(s=>Boolean(selected[s.id])!==s.enabled).map(s=>({id:s.id,previous:s.enabled,enabled:Boolean(selected[s.id])}));
 async function apply(){setBusy(true);setError('');setMessage('');try{accept(await rolloutSettings(supervisorPin,changes));setMessage('Breakfast rollout changes saved.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="ba-root"><h2>Breakfast Accountability Rollout</h2><p>Choose which schools can use Breakfast Accountability. Disabling a school preserves its classrooms, QR codes, counts, and history.</p>
 {error&&<p role="alert" className="ba-error">{error}</p>}{message&&<p role="status" className="ba-success">{message}</p>}
 <div className="ba-toolbar"><strong aria-live="polite">{schools.filter(s=>selected[s.id]).length} of {schools.length} schools enabled{changes.length?' (pending changes)':''}</strong><button disabled={busy} onClick={reload}>Reload</button><button className="ba-primary" disabled={busy||!changes.length} onClick={apply}>{busy?'Loading…':'Apply Changes'}</button></div>
 <div className="ba-rollout-schools">{schools.map(s=><label className="ba-check ba-rollout-school" key={s.id}><input type="checkbox" checked={Boolean(selected[s.id])} disabled={busy} onChange={e=>{setSelected(old=>({...old,[s.id]:e.target.checked}));setMessage('');}}/><span><strong>{s.school_name}</strong><small>Location {s.location_code}</small></span></label>)}</div>
 {!busy&&!error&&!schools.length&&<p>No active schools found.</p>}
 </section>;
}
