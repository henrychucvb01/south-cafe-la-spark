import React,{useEffect,useState} from 'react';
import {openSupervisorSession,schoolManagers,closeSession} from '../../supperMonitoring/service';
import {localDate} from '../../supperMonitoring/model';
import {fillLunch,filename,grades,questions} from './form';

import './answers.css';

// Observation answers only; site information and final findings are never copied.
const exampleAnswers=Object.fromEntries(questions.map((q,i)=>[q.yes,i===0||(i>=6&&i<28)?'yes':i<6?'na':'no']));
const key='spark-accuclaims-lunch-v1';
function read(){try{return JSON.parse(localStorage.getItem(key))||{};}catch{return {};}}
export default function AccuClaims({overview,supervisorPin,onBack}) {
 const [saved,setSaved]=useState(read),[site,setSite]=useState(null),[draft,setDraft]=useState(null),[managers,setManagers]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[url,setUrl]=useState('');
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 const sites=overview.schools.filter(s=>!/^test\b/i.test(s.school_name)).flatMap(s=>[{...s,key:`main:${s.id}`,name:s.school_name},...(overview.sites||[]).filter(t=>String(t.location_id)===String(s.id)&&t.kind!=='main').map(t=>({...s,key:`site:${t.id}`,name:t.name}))]);
 const id=site&&draft?`${site.key}:${draft.date}`:'';
 function change(p){setDraft(d=>({...d,...p}));setUrl('');setNote('');}
 function persist(next,message){try{localStorage.setItem(key,JSON.stringify(next));setSaved(next);setNote(message);}catch{setError('Could not save on this device.');}}
 async function open(s){
  setBusy(true);setError('');setNote('');setUrl('');let token;
  try{
   token=await openSupervisorSession(s,supervisorPin);
   const staff=(await schoolManagers(token))||[];
   setManagers(staff);
   const date=localDate();
   setSite(s);setDraft(saved.drafts?.[`${s.key}:${date}`]||{site:s.name.toUpperCase(),date,staff:staff.length===1?staff[0].employee_name:'',arrival:'10:00 AM',departure:'1:00 PM',menu:'',findings:'',procedures:saved.sites?.[s.key]?.procedures||'',other:'',grades:saved.sites?.[s.key]?.grades||[],answers:{...saved.answers}});
  }catch(e){setError(e.message||'Could not load school data.');}
  finally{if(token)await closeSession(token).catch(()=>{});setBusy(false);}
 }
 async function preview(){
  setBusy(true);setError('');
  try{const r=await fetch('/monitoring/snp-23.pdf');if(!r.ok)throw Error('Could not load the original SNP-23 form.');setUrl(URL.createObjectURL(new Blob([await fillLunch(await r.arrayBuffer(),draft)],{type:'application/pdf'})));}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className="sm-card">
 <button onClick={site?()=>{setSite(null);setUrl('');setNote('');setError('');}:onBack}>← {site?'Site list':'Monitorings'}</button>
 <h2>AccuClaims Monitoring · SNP Lunch</h2>
 <p>Pilot · Drafts and defaults are saved in this browser. Breakfast uses a separate workflow and is outside this pilot.</p>
 {error&&<p role="alert">{error}</p>}{note&&<p role="status">{note}</p>}
 {!site ? <ul>{sites.map(s=><li key={s.key}><button disabled={busy} onClick={()=>open(s)}>{s.name}{s.name!==s.school_name?` · ${s.school_name}`:''}</button></li>)}</ul>:<>
 <h3>{site.name}</h3>
 {Object.entries(saved.drafts||{}).filter(([k])=>k.startsWith(site.key+':')).length>0&&<label>Resume saved visit<select value="" onChange={e=>{if(e.target.value)change(saved.drafts[e.target.value]);}}><option value="">Choose a date</option>{Object.entries(saved.drafts||{}).filter(([k])=>k.startsWith(site.key+':')).map(([k,d])=><option key={k} value={k}>{d.date}</option>)}</select></label>}
 <div className="ac-visit-controls">
 <label>Visit date<input type="date" value={draft.date} onChange={e=>change({date:e.target.value})}/></label>
 <div><strong>Program: CEP</strong><div className="ac-result" role="group" aria-label="Visit result">{[['pass','Pass'],['follow-up','Follow-Up']].map(([value,label])=><button key={value} type="button" aria-pressed={draft.result===value} onClick={()=>change({result:value})}>{label}</button>)}</div></div>
 </div>
 <details><summary> {draft.staff || "Staff not selected"} · {draft.arrival}–{draft.departure} · Edit visit details</summary>
 <div className="sm-grid">{[['site','Site name on PDF'],['staff','Staff responsible for meal counts'],['arrival','Arrival'],['departure','Departure'],['procedures','Where procedures are kept'],['other','Other service points']].map(([k,label,type])=><label key={k}>{label}<input type={type||'text'} value={draft[k]} maxLength={100} onChange={e=>change({[k]:e.target.value})}/></label>)}</div>
 {managers.length>1&&<label>Use assigned manager<select value="" onChange={e=>{if(e.target.value)change({staff:e.target.value});}}><option value="">Select manager</option>{managers.map(m=><option key={m.id} value={m.employee_name}>{m.employee_name}</option>)}</select></label>}
 </details>
 <fieldset className="ac-grade-groups"><legend>Menu-planning grade groups</legend><div>{Object.keys(grades).map(g=><label key={g}><input type="checkbox" checked={draft.grades.includes(g)} onChange={e=>change({grades:e.target.checked?[...draft.grades,g]:draft.grades.filter(x=>x!==g)})}/>{g}</label>)}</div></fieldset>
 <label>Menu served and serving sizes<textarea value={draft.menu} onChange={e=>change({menu:e.target.value})}/></label>
 {(saved.menus?.[draft.date]||[]).length>0&&<label>Reuse a saved menu for this date<select value="" onChange={e=>{if(e.target.value!=='')change({menu:saved.menus[draft.date][Number(e.target.value)]});}}><option value="">Choose a menu</option>{saved.menus[draft.date].map((m,i)=><option key={m} value={i}>{m.slice(0,90)}</option>)}</select></label>}
 <button disabled={!draft.date||!draft.menu.trim()} onClick={()=>persist({...saved,menus:{...saved.menus,[draft.date]:[...new Set([...(saved.menus?.[draft.date]||[]),draft.menu])]}},'Menu saved for reuse on this date.')}>Save menu for this date</button>
 <details className="ac-answers"><summary>Review standard answers · {questions.filter(q=>draft.answers[q.yes]).length} of {questions.length} answered</summary>
 <p>Load the example as a starting point, check what applies to this visit, then save reusable defaults below.</p>
 <button type="button" onClick={()=>change({answers:{...exampleAnswers,...Object.fromEntries(Object.entries(draft.answers).filter(([,v])=>v))}})}>Fill blank answers from 186th Street example</button>
 {questions.map(q=><div className="ac-answer" role="group" aria-label={q.label} key={q.yes}><span>{q.label}</span><div className="ac-options">{[['yes','Yes'],['no','No'],...(q.na?[['na','N/A']]:[])].map(([value,label])=><button type="button" key={value} aria-label={q.label+': '+label} aria-pressed={draft.answers[q.yes]===value} onClick={()=>change({answers:{...draft.answers,[q.yes]:draft.answers[q.yes]===value?'':value}})}>{label}</button>)}</div></div>)}
 </details>
 <label>Visit findings and recommended corrective action<textarea value={draft.findings} onChange={e=>change({findings:e.target.value})}/></label>
 <p>Review the answers for this visit. Complete the remaining visit-specific fields and sign the original PDF after download.</p>
 <button onClick={()=>persist({...saved,answers:draft.answers,sites:{...saved.sites,[site.key]:{grades:draft.grades,procedures:draft.procedures}}},'Common answers and site defaults saved.')}>Save as reusable defaults</button>{' '}
 <button disabled={!draft.date} onClick={()=>persist({...saved,drafts:{...saved.drafts,[id]:draft}},'Visit draft saved.')}>Save visit draft</button>{' '}
 <button disabled={busy||!draft.date||!draft.result||!draft.site.trim()||!draft.staff.trim()||!draft.menu.trim()||!draft.grades.length} onClick={preview}>Preview original PDF</button>
 {url&&<><p><a href={url} download={filename(draft.site)}>Download {filename(draft.site)}</a></p><iframe title="Original SNP-23 lunch form preview" src={url} style={{width:'100%',height:'70vh',border:0}}/></>}
 </>}
 </section>;
}
