import React,{useEffect,useState} from 'react';
import {teacherPage,teacherMessage,teacherSubmit,teacherAdultMeal} from './service';
import {TRAINING_URL,TIPS_URL} from './resources';
import './breakfast.css';
import WorkerReturns from './WorkerReturns';
import TeacherPreorder from './TeacherPreorder';
export function teacherLink(qr){return `${window.location.origin}${window.location.pathname}#breakfast/${qr}`;}
export function teacherToken(hash){return /^#breakfast\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(hash)?.[1]||null;}
const localTime=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
export default function TeacherPage({qr}) {
 const [worker,setWorker]=useState(false),[finished,setFinished]=useState(false),[preorderBusy,setPreorderBusy]=useState(false);
 useEffect(()=>{if(!finished)return;const timer=setTimeout(()=>{try{window.close();}catch{}},1500);return()=>clearTimeout(timer);},[finished]);
 const [showReturnReminder,setShowReturnReminder]=useState(false);
 const [page,setPage]=useState(null),[count,setCount]=useState(0),[comments,setComments]=useState(''),[certified,setCertified]=useState(false),[editing,setEditing]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[tick,setTick]=useState(0);
 const accept=data=>{setPage(data);setCount(data.record?.count??0);setComments(data.record?.comments||'');setCertified(false);setEditing(false);};
 async function refresh(){setBusy(true);setError('');try{accept(await teacherPage(qr));}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{let active=true;setBusy(true);teacherPage(qr).then(d=>{if(active)accept(d);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[qr]);
 useEffect(()=>{const timer=setInterval(()=>setTick(t=>t+1),15000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(!page)return;let active=true;Promise.all(page.messages.map(m=>teacherMessage(qr,m.id))).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[qr,page]);
 // Device clock improves the display; Postgres remains authoritative on every save.
 const parts=Object.fromEntries(localTime().map(p=>[p.type,p.value]));
 const date=`${parts.year}-${parts.month}-${parts.day}`,time=`${parts.hour}:${parts.minute}:${parts.second}`;
 const closed=page&&(page.closed||date!==page.service_date||time>=page.cutoff);
 async function ack(id){setBusy(true);setError('');try{await teacherMessage(qr,id,true);setPage(p=>({...p,messages:p.messages.filter(m=>m.id!==id)}));}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{accept(await teacherSubmit(qr,page,count,comments,certified));setShowReturnReminder(true);}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function adultMeal(){setBusy(true);setError('');try{const result=await teacherAdultMeal(qr,page,!page.record?.adult_received);setPage(p=>({...p,record:{...p.record,adult_received:result.record.adult_received,adult_recorded_at:result.record.adult_recorded_at,adult_revision:result.record.adult_revision}}));}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <main className="ba-root ba-teacher" data-clock-tick={tick}>
  <header className="ba-heading"><p>SPARK · Breakfast</p><h1>{page?`Room ${page.room}`:'Classroom breakfast'}</h1>{page&&<><p>{page.teacher} · {page.enrollment} enrolled students{page.campus?` · ${page.campus}`:''}</p><p>{page.service_date} · Teacher reporting closes {page.cutoff.slice(0,5)} (Los Angeles time)</p></>}</header>
  {error&&<div role="alert" className="ba-error">{error} <button disabled={busy} onClick={refresh}>Refresh latest count</button></div>}
  {!page&&busy&&<p role="status">Opening classroom…</p>}
  {worker&&<WorkerReturns qr={qr} onBack={()=>setWorker(false)}/>}
  {page&&!worker&&!finished&&<>
   {page.messages.map(m=><section className="ba-panel ba-message" key={m.id}><h2>Message from the cafeteria</h2><p className="ba-note">{m.body}</p>{m.require_ack&&<button disabled={busy} onClick={()=>ack(m.id)}>I have read this message</button>}</section>)}
   {closed&&<section className="ba-panel"><h2>Breakfast teacher reporting is closed for today.</h2><p>Contact the cafeteria if a count needs correcting.</p><button disabled={busy} onClick={refresh}>Refresh for today</button></section>}
   {page.record?.submitted_at&&!editing&&<section className="ba-panel" role="status"><h2>Breakfast Count Submitted</h2><p>Room {page.room}</p><strong className="ba-count-summary">{page.record.count} meals</strong><p>Submitted {new Date(page.record.submitted_at).toLocaleTimeString('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit'})}</p><p><strong>Please return the breakfast bag and remaining items to the cafeteria.</strong></p>{page.record.comments&&<p className="ba-note">{page.record.comments}</p>}<div className="ba-actions">{!closed&&<button disabled={busy} onClick={()=>{setCertified(false);setEditing(true);}}>Correct breakfast count</button>}<button className="ba-primary" disabled={busy||preorderBusy} onClick={()=>setFinished(true)}>Done / Close</button></div></section>}
   {!closed&&(!page.record?.submitted_at||editing)&&<form className="ba-panel" onSubmit={submit}><h2>Breakfast meals served</h2><p className="ba-meal-reminder">Students must take a reimbursable breakfast, including a fruit and an entrée. Count the meal after both are taken.</p><div className="ba-counter"><output aria-live="polite" aria-label="Meals served">{count}</output><button type="button" className="ba-primary ba-plus" aria-label="Add one meal" disabled={busy||count>=10000} onClick={()=>{setCount(c=>c+1);setCertified(false);}}>+</button></div>
    <label>Comments for future services (optional)<textarea maxLength={2000} value={comments} disabled={busy} onChange={e=>{setComments(e.target.value);setCertified(false);}}/></label><p>Comments are for future service needs. If you need food or assistance immediately during today's breakfast service, send a runner or call the cafeteria.</p>
    <div className="ba-certification"><button type="button" className="ba-minus" aria-label="Subtract one meal" disabled={busy||count===0} onClick={()=>{setCount(c=>c-1);setCertified(false);}}>−</button><label className="ba-check"><input type="checkbox" checked={certified} disabled={busy} onChange={e=>setCertified(e.target.checked)}/>I confirm that this breakfast count is accurate.</label></div><button className="ba-primary ba-submit" disabled={busy||!certified||page.messages.some(m=>m.require_ack)}>{busy?'Saving…':editing?'Submit corrected count':'Submit breakfast count'}</button>{editing&&<button type="button" disabled={busy} onClick={()=>accept(page)}>Cancel correction</button>}
   </form>}
   {page.record?.submitted_at&&!editing&&page.preorder_date&&date===page.service_date&&<TeacherPreorder qr={qr} page={page} onBusy={setPreorderBusy} onSaved={result=>setPage(p=>({...p,record:{...p.record,preorder_date:result.record.preorder_date,preorder_entree:result.record.preorder_entree,preorder_count:result.record.preorder_count,preorder_revision:result.record.preorder_revision,preorder_submitted_at:result.record.preorder_submitted_at}}))}/>}
   <section className="ba-panel"><h2>Teacher’s own breakfast</h2><p>Record one adult meal if you received breakfast. This is separate from your students’ count.</p><button type="button" className="ba-adult-meal" aria-pressed={Boolean(page.record?.adult_received)} disabled={busy||closed} onClick={adultMeal}>{page.record?.adult_received?'✓ Teacher adult meal received — click to undo':'Teacher adult meal not recorded — click if received'}</button>{page.record?.adult_recorded_at&&<p role="status">{page.record.adult_received?'1 adult meal recorded.':'Adult meal removed.'}</p>}</section>
   <section className="ba-panel ba-resources"><h2>Training & quick tips</h2>{[['Training Video',page.training_url||TRAINING_URL],['1-Page Setup & Quick Tips',page.tips_url||TIPS_URL]].map(([name,url])=>url?<a key={name} href={url} target="_blank" rel="noreferrer">{name}</a>:<p key={name}>{name} — not added yet</p>)}</section>
   <button className="ba-staff-link" onClick={()=>setWorker(true)}>Cafeteria Workers — Packing & returns</button>
  </>}
  {finished&&!worker&&<section className="ba-panel ba-thank-you" role="status"><h2>Thank you for your help! 😊</h2><p>Your breakfast count is saved. You can close this tab if it stays open.</p><button className="ba-staff-link" onClick={()=>setWorker(true)}>Cafeteria Workers — Packing & returns</button></section>}
  {showReturnReminder&&<div className="ba-modal-shade"><section role="alertdialog" aria-modal="true" aria-labelledby="ba-return-title" aria-describedby="ba-return-message" className="ba-return-dialog" onKeyDown={e=>{if(e.key==='Tab'){e.preventDefault();e.currentTarget.querySelector('button').focus();}if(e.key==='Escape')setShowReturnReminder(false);}}><h2 id="ba-return-title">Breakfast count submitted</h2><p id="ba-return-message">Please return the breakfast bags and remaining items to the cafeteria.</p><button autoFocus className="ba-primary" onClick={()=>setShowReturnReminder(false)}>Got it</button></section></div>}
 </main>;
}
