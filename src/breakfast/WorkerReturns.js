import React,{useEffect,useState} from 'react';
import {PACKING_ITEMS} from './packingItems';
import PackingPrint from './PackingPrint';
import {workerNames,workerLogin,workerPage,workerSubmit,workerLogout,workerPack} from './service';
const menuItems=page=>PACKING_ITEMS.filter(([key])=>page?.menu[key]);
const timestamp=value=>new Date(value).toLocaleString('en-US',{timeZone:'America/Los_Angeles'});
export default function WorkerReturns({qr,onBack}){
 const [names,setNames]=useState([]),[employee,setEmployee]=useState(''),[pin,setPin]=useState(''),[token,setToken]=useState('');
 const [page,setPage]=useState(null),[counts,setCounts]=useState({}),[notes,setNotes]=useState(''),[certified,setCertified]=useState(false),[editing,setEditing]=useState(false);
 const [mode,setMode]=useState('packing'),[sent,setSent]=useState(0),[packed,setPacked]=useState({});
 const [busy,setBusy]=useState(true),[error,setError]=useState('');
 const accept=p=>{setPage(p);setCounts(Object.fromEntries(menuItems(p).map(([k])=>[k,p.counts[k]??0])));setPacked(Object.fromEntries(menuItems(p).map(([k])=>[k,p.items_sent[k]??0])));setSent(p.sent??0);setMode(p.packing_submitted_at?'returns':'packing');setNotes(p.notes);setCertified(false);setEditing(false);};
 useEffect(()=>{let active=true;workerNames(qr).then(n=>{if(active)setNames(n);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[qr]);
 useEffect(()=>()=>{if(token)workerLogout(token).catch(()=>{});},[token]);
 async function login(e){e.preventDefault();setBusy(true);setError('');try{const result=await workerLogin(qr,employee,pin);if(result.error)throw new Error(result.error);setToken(result.token);setPin('');accept(await workerPage(qr,result.token));}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function refresh(){setBusy(true);setError('');try{accept(await workerPage(qr,token));}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function submit(e){e.preventDefault();if(!certified)return;setBusy(true);setError('');try{accept(mode==='packing'?await workerPack(qr,token,page,sent,packed,certified):await workerSubmit(qr,token,page,counts,notes,certified));if(mode==='packing')setMode('packing');}catch(e){setError(e.message);}finally{setBusy(false);}}
 const saved=mode==='packing'?page?.packing_submitted_at:page?.submitted_at;
 const values=mode==='packing'?packed:counts;
 function change(key,value){(mode==='packing'?setPacked:setCounts)(c=>({...c,[key]:value}));setCertified(false);}
 return <section className="ba-panel ba-worker">
  <button disabled={busy} onClick={onBack}>← Teacher page / Sign out</button>
  <h2>Cafeteria Workers{page?` — Room ${page.room}`:''}</h2>
  {error&&<p role="alert" className="ba-error">{error}{token&&<button disabled={busy} onClick={refresh}>Refresh breakfast data</button>}</p>}
  {!page&&<form onSubmit={login} className="ba-form"><p>Select your name and enter the shared Breakfast worker PIN.</p><label>Your name<select required disabled={busy} value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">Select your name</option>{names.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></label>{!busy&&!names.length&&<p>No active workers or manager are listed for this school. Contact your supervisor.</p>}<label>Worker PIN<input type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required value={pin} onChange={e=>setPin(e.target.value)}/></label><button className="ba-primary" disabled={busy||!employee||!pin}>{busy?'Opening…':'Open breakfast bag'}</button></form>}
  {page&&<><p>{page.teacher} · {page.service_date}</p><div className="ba-return-summary"><p>Meals sent: <strong>{page.sent??'Not recorded'}</strong></p><p>Teacher reported: <strong>{page.teacher_submitted_at?page.teacher_count:'Not submitted'}</strong></p></div>
   <div className="ba-actions ba-worker-tabs"><button aria-pressed={mode==='packing'} disabled={busy} onClick={()=>{setMode('packing');setEditing(false);setCertified(false);}}>Morning packing</button><button aria-pressed={mode==='returns'} disabled={busy||!page.packing_submitted_at} onClick={()=>{setMode('returns');setEditing(false);setCertified(false);}}>Returned / leftover items</button><button disabled={busy} onClick={refresh}>Refresh</button></div>
   <PackingPrint qr={qr} workerToken={token}/>
   {!menuItems(page).length?<p className="ba-info">The manager needs to enter today’s breakfast menu. Refresh after the menu is saved.</p>:saved&&!editing?<div className="ba-success" role="status"><h3>{mode==='packing'?'Morning packing submitted':'Return counts submitted'}</h3><ul>{menuItems(page).map(([k])=><li key={k}>{page.menu[k]}: {mode==='packing'?page.items_sent[k]:page.counts[k]??'Not recorded'}</li>)}</ul><p>{mode==='packing'?page.packing_worker_name:page.worker_name} · {timestamp(saved)} (Los Angeles time)</p>{mode==='returns'&&page.notes&&<p className="ba-note">{page.notes}</p>}<button disabled={busy} onClick={()=>{setEditing(true);setCertified(false);}}>{mode==='packing'?'Correct packing counts':'Correct return counts'}</button></div>:<form onSubmit={submit}>
    <h3>{mode==='packing'?'Pack today’s breakfast menu':'Count returned / leftover items'}</h3>
    {mode==='packing'&&<label>Meals sent<input type="number" min="0" max="10000" step="1" required disabled={busy} value={sent} onChange={e=>{setSent(e.target.value===''?'':Number(e.target.value));setCertified(false);}}/></label>}
    {menuItems(page).map(([k,category])=><div className="ba-return-counter" key={k}><div className="ba-item-name"><strong>{page.menu[k]}</strong><small>{category}{mode==='returns'?` · Sent: ${page.items_sent[k]??'Not recorded'}`:''}</small></div><div><button type="button" aria-label={`Subtract one ${page.menu[k]}`} disabled={busy||values[k]===0} onClick={()=>change(k,Math.max(0,Number(values[k])-1))}>−</button><input className="ba-quantity" aria-label={`${page.menu[k]} quantity`} type="number" inputMode="numeric" min="0" max="10000" step="1" required disabled={busy} value={values[k]} onChange={e=>change(k,e.target.value===''?'':Number(e.target.value))}/><button type="button" className="ba-primary" aria-label={`Add one ${page.menu[k]}`} disabled={busy||values[k]>=10000} onClick={()=>change(k,Number(values[k])+1)}>+</button></div></div>)}
    {mode==='returns'&&<label>Notes (optional)<textarea maxLength={2000} disabled={busy} value={notes} onChange={e=>{setNotes(e.target.value);setCertified(false);}}/></label>}
    <label className="ba-check"><input type="checkbox" checked={certified} disabled={busy} onChange={e=>setCertified(e.target.checked)}/>I confirm these {mode==='packing'?'packed':'return'} counts are accurate.</label><button className="ba-primary ba-submit" disabled={busy||!certified}>{busy?'Saving…':mode==='packing'?'Submit packing counts':'Submit return count'}</button>{editing&&<button type="button" disabled={busy} onClick={()=>{accept(page);setMode(mode);}}>Cancel correction</button>}
   </form>}
  </>}
 </section>;
}
