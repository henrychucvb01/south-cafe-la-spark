import React,{useEffect,useState} from 'react';
import {teacherPage,teacherMessage,teacherSubmit} from './service';
import './breakfast.css';
export function teacherLink(qr){return `${window.location.origin}${window.location.pathname}#breakfast/${qr}`;}
export function teacherToken(hash){return /^#breakfast\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(hash)?.[1]||null;}
const localTime=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
export default function TeacherPage({qr}) {
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
 async function submit(e){e.preventDefault();setBusy(true);setError('');try{accept(await teacherSubmit(qr,page,count,comments,certified));}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <main className="ba-root ba-teacher" data-clock-tick={tick}>
  <header className="ba-heading"><p>SPARK · Breakfast</p><h1>{page?`Room ${page.room}`:'Classroom breakfast'}</h1>{page&&<><p>{page.teacher} · {page.enrollment} enrolled students{page.campus?` · ${page.campus}`:''}</p><p>{page.service_date} · Reporting closes {page.cutoff.slice(0,5)} (Los Angeles time)</p></>}</header>
  {error&&<div role="alert" className="ba-error">{error} <button disabled={busy} onClick={refresh}>Refresh latest count</button></div>}
  {!page&&busy&&<p role="status">Opening classroom…</p>}
  {page&&<>
   {page.messages.map(m=><section className="ba-panel ba-message" key={m.id}><h2>Message from the cafeteria</h2><p className="ba-note">{m.body}</p>{m.require_ack&&<button disabled={busy} onClick={()=>ack(m.id)}>I have read this message</button>}</section>)}
   {closed&&<section className="ba-panel"><h2>Breakfast teacher reporting is closed for today.</h2><p>Contact the cafeteria if a count needs correcting.</p><button disabled={busy} onClick={refresh}>Refresh for today</button></section>}
   {page.record?.submitted_at&&!editing&&<section className="ba-panel" role="status"><h2>Breakfast Count Submitted</h2><p>Room {page.room}</p><strong className="ba-count-summary">{page.record.count} meals</strong><p>Submitted {new Date(page.record.submitted_at).toLocaleTimeString('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit'})}</p><p><strong>Please return the breakfast bag and remaining items to the cafeteria.</strong></p>{page.record.comments&&<p className="ba-note">{page.record.comments}</p>}{!closed&&<button disabled={busy} onClick={()=>{setCertified(false);setEditing(true);}}>Correct breakfast count</button>}</section>}
   {!closed&&(!page.record?.submitted_at||editing)&&<form className="ba-panel" onSubmit={submit}><h2>Breakfast meals served</h2><div className="ba-counter"><button type="button" aria-label="Subtract one meal" disabled={busy||count===0} onClick={()=>{setCount(c=>c-1);setCertified(false);}}>−</button><output aria-live="polite" aria-label="Meals served">{count}</output><button type="button" className="ba-primary ba-plus" aria-label="Add one meal" disabled={busy||count>=10000} onClick={()=>{setCount(c=>c+1);setCertified(false);}}>+</button></div>
    <label>Comments for future services (optional)<textarea maxLength={2000} value={comments} disabled={busy} onChange={e=>{setComments(e.target.value);setCertified(false);}}/></label><p>Comments are for future service needs. If you need food or assistance immediately during today's breakfast service, send a runner or call the cafeteria.</p>
    <label className="ba-check"><input type="checkbox" checked={certified} disabled={busy} onChange={e=>setCertified(e.target.checked)}/>I confirm that this breakfast count is accurate.</label><button className="ba-primary ba-submit" disabled={busy||!certified||page.messages.some(m=>m.require_ack)}>{busy?'Saving…':editing?'Submit corrected count':'Submit breakfast count'}</button>{editing&&<button type="button" disabled={busy} onClick={()=>accept(page)}>Cancel correction</button>}
   </form>}
   <section className="ba-panel ba-resources"><h2>Training & quick tips</h2>{[['Training Video',page.training_url],['1-Page Setup & Quick Tips',page.tips_url]].map(([name,url])=>url?<a key={name} href={url} target="_blank" rel="noreferrer">{name}</a>:<p key={name}>{name} — not added yet</p>)}</section>
   <p className="ba-info">Cafeteria staff: returned-bag entry will be available in the next phase. This classroom QR remains available after teacher reporting closes.</p>
  </>}
 </main>;
}
