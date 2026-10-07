import React,{useEffect,useState} from 'react';
import {PACKING_ITEMS} from './packingItems';
import PackingPrint from './PackingPrint';
import {workerNames,workerLogin,workerPage,workerSubmit,workerLogout} from './service';
export const RETURN_ITEMS=['Milk','Fruit','Entrée','Other'];
const timestamp=value=>new Date(value).toLocaleString('en-US',{timeZone:'America/Los_Angeles'});
export default function WorkerReturns({qr,onBack}){
 const [names,setNames]=useState([]),[employee,setEmployee]=useState(''),[pin,setPin]=useState(''),[token,setToken]=useState('');
 const [page,setPage]=useState(null),[counts,setCounts]=useState({}),[notes,setNotes]=useState(''),[certified,setCertified]=useState(false),[editing,setEditing]=useState(false);
 const [busy,setBusy]=useState(true),[error,setError]=useState('');
 const accept=p=>{setPage(p);setCounts(Object.fromEntries(RETURN_ITEMS.map(k=>[k,p.counts[k]??0])));setNotes(p.notes);setCertified(false);setEditing(false);};
 useEffect(()=>{let active=true;workerNames(qr).then(n=>{if(active)setNames(n);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[qr]);
 useEffect(()=>()=>{if(token)workerLogout(token).catch(()=>{});},[token]);
 async function login(e){e.preventDefault();setBusy(true);setError('');try{const result=await workerLogin(qr,employee,pin);if(result.error)throw new Error(result.error);setToken(result.token);setPin('');accept(await workerPage(qr,result.token));}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function refresh(){setBusy(true);setError('');try{accept(await workerPage(qr,token));}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function submit(e){e.preventDefault();if(!certified)return;setBusy(true);setError('');try{accept(await workerSubmit(qr,token,page,counts,notes,certified));}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="ba-panel ba-worker">
  <button disabled={busy} onClick={onBack}>← Teacher page / Sign out</button>
  <h2>{page?`Returned breakfast — Room ${page.room}`:'Cafeteria staff — Return counts'}</h2>
  {error&&<p role="alert" className="ba-error">{error}{token&&<button disabled={busy} onClick={refresh}>Refresh return counts</button>}</p>}
  {!page&&<form onSubmit={login} className="ba-form"><p>Select your name and enter the cafeteria worker PIN.</p><label>Your name<select required disabled={busy} value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">Select your name</option>{names.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>{!busy&&!names.length&&<p>No active staff are listed for this school. Contact the cafeteria manager.</p>}<label>Worker PIN<input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required value={pin} onChange={e=>setPin(e.target.value)}/></label><button className="ba-primary" disabled={busy||!employee||!pin}>{busy?'Opening…':'Enter return counts'}</button></form>}
  {page&&<><p>{page.teacher} · {page.service_date}</p><div className="ba-return-summary"><p>Meals sent: <strong>{page.sent??'Not recorded'}</strong></p><p>Teacher reported: <strong>{page.teacher_submitted_at?page.teacher_count:'Not submitted'}</strong></p></div>
   <PackingPrint qr={qr} workerToken={token}/><h3>Today’s menu & items sent</h3><ul>{PACKING_ITEMS.map(([k,label])=><li key={k}><strong>{label}</strong>: {page.menu[k]||'Menu not entered'} · Sent: {page.items_sent[k]??'Not recorded'}</li>)}</ul>
   {page.submitted_at&&!editing?<div className="ba-success" role="status"><h3>Return counts submitted</h3><p>{RETURN_ITEMS.map(k=>`${k}: ${page.counts[k]}`).join(' · ')}</p><p>{page.worker_name} · {timestamp(page.submitted_at)} (Los Angeles time)</p>{page.notes&&<p className="ba-note">{page.notes}</p>}<button disabled={busy} onClick={()=>{setEditing(true);setCertified(false);}}>Correct return counts</button></div>:<form onSubmit={submit}>
    <h3>Returned / leftover items</h3>{RETURN_ITEMS.map(k=><div className="ba-return-counter" key={k}><strong>{k}</strong><div><button type="button" aria-label={`Subtract one ${k}`} disabled={busy||counts[k]===0} onClick={()=>{setCounts(c=>({...c,[k]:c[k]-1}));setCertified(false);}}>−</button><output aria-live="polite" aria-label={`${k} returned`}>{counts[k]}</output><button type="button" className="ba-primary" aria-label={`Add one ${k}`} disabled={busy||counts[k]>=10000} onClick={()=>{setCounts(c=>({...c,[k]:c[k]+1}));setCertified(false);}}>+</button></div></div>)}
    <label>Notes (optional)<textarea maxLength={2000} disabled={busy} value={notes} onChange={e=>{setNotes(e.target.value);setCertified(false);}}/></label>
    <label className="ba-check"><input type="checkbox" checked={certified} disabled={busy} onChange={e=>setCertified(e.target.checked)}/>I confirm these return counts are accurate.</label><button className="ba-primary ba-submit" disabled={busy||!certified}>{busy?'Saving…':'Submit return count'}</button>{editing&&<button type="button" disabled={busy} onClick={()=>accept(page)}>Cancel correction</button>}
   </form>}
  </>}
 </section>;
}
