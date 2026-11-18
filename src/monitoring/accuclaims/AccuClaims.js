import React,{useEffect,useState} from 'react';
import {openSupervisorSession,schoolManagers,closeSession} from '../../supperMonitoring/service';
import {localDate,schoolYear} from '../../supperMonitoring/model';
import SignaturePad from '../../supperMonitoring/SignaturePad';
import {loadProductionMenu} from './productionMenu';
import {fillLunch,filename,grades,questions} from './form';

import './answers.css';
import AnnualDashboard,{annualSites} from './AnnualDashboard';

// Observation answers only; site information and final findings are never copied.
const exampleAnswers=Object.fromEntries(questions.map((q,i)=>[q.yes,i===0||(i>=6&&i<28)?'yes':i<6?'na':'no']));
const signaturePages=[2,3];
const key='spark-accuclaims-lunch-v1';
function read(){try{return JSON.parse(localStorage.getItem(key))||{};}catch{return {};}}
export default function AccuClaims({overview,supervisorPin,onBack,initialYear,onYearChange,parentBusy}) {
 const [saved,setSaved]=useState(read),[site,setSite]=useState(null),[draft,setDraft]=useState(null),[managers,setManagers]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[url,setUrl]=useState(''),[previewDraft,setPreviewDraft]=useState(null);
 const [signingRole,setSigningRole]=useState(null),[signerName,setSignerName]=useState('');
 useEffect(()=>()=>{if(url)URL.revokeObjectURL(url);},[url]);
 const currentYear=schoolYear(localDate());
 const [year,setYear]=useState(initialYear||currentYear);
 const sites=annualSites(overview);
 const meal=draft?.meal||'lunch';
 const lookupDate=draft?.date;
 const lookupMenu=Boolean(draft&&!draft.menu&&!draft.menuEdited);
 const [menuLookupError,setMenuLookupError]=useState(false);
 useEffect(()=>{
  setMenuLookupError(false);
  if(!site||!lookupMenu||!schoolYear(lookupDate)||lookupDate>localDate())return;
  let active=true;
  loadProductionMenu(supervisorPin,site,lookupDate,meal).then(menu=>{
   if(!active||!menu)return;
   setDraft(current=>current?.date===lookupDate&&current.meal===meal&&!current.menu&&!current.menuEdited
    ? {...current,menu,menuProductionDate:lookupDate}
    : current);
  }).catch(()=>{if(active)setMenuLookupError(true);});
  return ()=>{active=false;};
 },[site,lookupDate,lookupMenu,meal,supervisorPin]);
 const mealLabel=meal==='breakfast'?'Breakfast':'Lunch';
 const id=site&&draft?`${site.key}:${meal}:${draft.date}`:'';
 function change(p){setDraft(d=>({...d,...p}));setUrl('');setNote('');}
 function persist(next,message){try{localStorage.setItem(key,JSON.stringify(next));setSaved(next);setNote(message);return true;}catch{setError('Could not save on this device.');}}
 async function open(s,selectedYear,meal,completed){
  setBusy(true);setError('');setNote('');setUrl('');let token;
  try{
   token=await openSupervisorSession(s,supervisorPin);
   const staff=(await schoolManagers(token))||[];
   setManagers(staff);
   const date=selectedYear===currentYear?localDate():selectedYear.slice(0,4)+'-07-01';
   const latestDraft=Object.entries(saved.drafts||{})
    .filter(([draftKey,visit])=>draftKey.startsWith(s.key+':')&&schoolYear(visit.date)===selectedYear&&(visit.meal||'lunch')===meal)
    .map(([,visit])=>visit)
    .sort((a,b)=>b.date.localeCompare(a.date))[0];
   setSigningRole(null);
   setSite(s);setDraft({...(latestDraft||completed||{site:s.name.toUpperCase(),date,staff:staff.length===1?staff[0].employee_name:'',arrival:meal==='breakfast'?'7:00 AM':'10:00 AM',departure:meal==='breakfast'?'10:00 AM':'1:00 PM',menu:'',findings:'',procedures:saved.sites?.[s.key]?.procedures||'',other:'',grades:saved.sites?.[s.key]?.grades||[],answers:{...(meal==='breakfast'?saved.breakfastAnswers:saved.answers)}}),meal});
  }catch(e){setError(e.message||'Could not load school data.');}
  finally{if(token)await closeSession(token).catch(()=>{});setBusy(false);}
 }
 const menuStore=meal==='breakfast'?'breakfastMenus':'menus';
 function finish(event){
  const visits=saved.completed?.[year]||{};
  const next={...saved,drafts:{...saved.drafts,[id]:draft},completed:{...saved.completed,[year]:{
   ...visits,[site.key]:{...visits[site.rosterKey],...visits[site.key],[meal]:draft}
  }}};
  if(!persist(next,'Completed visit saved.'))event.preventDefault();
 }
 async function preview(){
  setBusy(true);setError('');
  try{const r=await fetch('/monitoring/snp-23.pdf');if(!r.ok)throw Error('Could not load the original SNP-23 form.');setUrl(URL.createObjectURL(new Blob([await fillLunch(await r.arrayBuffer(),draft)],{type:'application/pdf'})));setPreviewDraft(draft);}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className="sm-card">
 <button onClick={site?()=>{setSite(null);setUrl('');setNote('');setError('');}:onBack}>← {site?'Site list':'Monitorings'}</button>
 {site&&<h2>AccuClaims Monitoring · SNP {mealLabel}</h2>}
 {site&&<p>{mealLabel} form · Drafts and defaults are saved in this browser.</p>}
 {error&&<p role="alert">{error}</p>}{note&&<p role="status">{note}</p>}
 {!site ? <AnnualDashboard sites={sites} saved={saved} year={year} currentYear={currentYear} setYear={y=>{setYear(y);onYearChange(y);}} onOpen={open} busy={busy||parentBusy}/>:<>
 <h3>{site.name}</h3>
 <div className="ac-visit-controls">
 <label>Visit date<input type="date" min={year.slice(0,4)+'-07-01'} max={(Number(year.slice(0,4))+1)+'-06-30'} value={draft.date} onChange={e=>{
  const date=e.target.value;
  change(draft.menuProductionDate&&draft.menuProductionDate!==date
   ? {date,menu:'',menuProductionDate:undefined,menuEdited:false}
   : {date,menuEdited:Boolean(draft.menu)});
 }}/></label>
 <div><strong>Program: CEP</strong><div className="ac-result" role="group" aria-label="Visit result">{[['pass','Pass'],['follow-up','Follow-Up']].map(([value,label])=><button key={value} type="button" aria-pressed={draft.result===value} onClick={()=>change({result:value})}>{label}</button>)}</div></div>
 </div>
 <details><summary> {draft.staff || "Staff not selected"} · {draft.arrival}–{draft.departure} · Edit visit details</summary>
 <div className="sm-grid">{[['site','Site name on PDF'],['staff','Staff responsible for meal counts'],['arrival','Arrival'],['departure','Departure'],['procedures','Where procedures are kept'],['other','Other service points']].map(([k,label,type])=><label key={k}>{label}<input type={type||'text'} value={draft[k]} maxLength={100} onChange={e=>change({[k]:e.target.value})}/></label>)}</div>
 {managers.length>1&&<label>Use assigned manager<select value="" onChange={e=>{if(e.target.value)change({staff:e.target.value});}}><option value="">Select manager</option>{managers.map(m=><option key={m.id} value={m.employee_name}>{m.employee_name}</option>)}</select></label>}
 </details>
 <fieldset className="ac-grade-groups"><legend>Menu-planning grade groups</legend><div>{Object.keys(grades).map(g=><label key={g}><input type="checkbox" checked={draft.grades.includes(g)} onChange={e=>change({grades:e.target.checked?[...draft.grades,g]:draft.grades.filter(x=>x!==g)})}/>{g}</label>)}</div></fieldset>
 <label>Menu served and serving sizes<textarea value={draft.menu} onChange={e=>change({menu:e.target.value,menuEdited:true})}/></label>
 {menuLookupError&&<p role="status">Production records could not be loaded. You can enter the menu here.</p>}
 {(saved[menuStore]?.[draft.date]||[]).length>0&&<label>Reuse a saved menu for this date<select value="" onChange={e=>{if(e.target.value!=='')change({menu:saved[menuStore][draft.date][Number(e.target.value)],menuEdited:true,menuProductionDate:draft.date});}}><option value="">Choose a menu</option>{saved[menuStore][draft.date].map((m,i)=><option key={m} value={i}>{m.slice(0,90)}</option>)}</select></label>}
 <button disabled={!draft.date||!draft.menu.trim()} onClick={()=>persist({...saved,[menuStore]:{...saved[menuStore],[draft.date]:[...new Set([...(saved[menuStore]?.[draft.date]||[]),draft.menu])]}},'Menu saved for reuse on this date.')}>Save menu for this date</button>
 <details className="ac-answers"><summary>Review standard answers · {questions.filter(q=>draft.answers[q.yes]).length} of {questions.length} answered</summary>
 <p>Review what applies to this visit. Save reusable defaults separately for each meal.</p>
 {meal==='lunch'&&<button type="button" onClick={()=>change({answers:{...exampleAnswers,...Object.fromEntries(Object.entries(draft.answers).filter(([,v])=>v))}})}>Fill blank answers from 186th Street example</button>}
 {questions.map(q=><div className="ac-answer" role="group" aria-label={q.label} key={q.yes}><span>{q.label}</span><div className="ac-options">{[['yes','Yes'],['no','No'],...(q.na?[['na','N/A']]:[])].map(([value,label])=><button type="button" key={value} aria-label={q.label+': '+label} aria-pressed={draft.answers[q.yes]===value} onClick={()=>change({answers:{...draft.answers,[q.yes]:draft.answers[q.yes]===value?'':value}})}>{label}</button>)}</div></div>)}
 </details>
 <label>Visit findings and recommended corrective action<textarea value={draft.findings} onChange={e=>change({findings:e.target.value})}/></label>
 <fieldset>
 <legend>Signatures</legend>
 {['supervisor','manager'].map(role=>{
  const label=role==='supervisor'?'Supervisor':'Manager';
  const signature=draft.signatures?.[role];
  return <section className="sm-subcard" key={role}>
   <h3>{label}</h3>
   {signature&&<p>Signed by {signature.printedName} on {signature.date}</p>}
   {signingRole===role?<><label>{label} printed name<input value={signerName} onChange={e=>setSignerName(e.target.value)}/></label>
    <SignaturePad initiallyExpanded disabled={schoolYear(draft.date)!==year} label={label} name={signerName} pages={signaturePages} onChange={value=>{
     if(!value)return;
     const signatures={...draft.signatures,[role]:value};
     const nextDraft={...draft,signatures};
     if(persist({...saved,drafts:{...saved.drafts,[id]:nextDraft}},`${label} signature saved.`)){
      setDraft(nextDraft);
      setUrl('');
      setSigningRole(null);
     }
    }}/>
    <button type="button" onClick={()=>setSigningRole(null)}>Cancel signing</button>
   </>:<button type="button" disabled={busy||signingRole!==null||schoolYear(draft.date)!==year} onClick={()=>{
    setSignerName(signature?.printedName||'');
    setSigningRole(role);
   }}>{signature?`Replace ${role} signature`:`Sign as ${role}`}</button>}
  </section>;
 })}
 </fieldset>
 <button onClick={()=>persist({...saved,[meal==='breakfast'?'breakfastAnswers':'answers']:draft.answers,sites:{...saved.sites,[site.key]:{grades:draft.grades,procedures:draft.procedures}}},'Common answers and site defaults saved.')}>Save as reusable defaults</button>{' '}
 <button disabled={schoolYear(draft.date)!==year} onClick={()=>persist({...saved,drafts:{...saved.drafts,[id]:draft}},'Visit draft saved.')}>Save visit draft</button>{' '}
 <button disabled={busy||signingRole!==null||schoolYear(draft.date)!==year||!draft.result||!draft.site.trim()||!draft.staff.trim()||!draft.menu.trim()||!draft.grades.length} onClick={preview}>Preview original PDF</button>
 {url&&previewDraft===draft&&<><p><a href={url} download={filename(draft.site,meal)} onClick={finish}>Finish visit and download {filename(draft.site,meal)}</a></p><iframe title="Original SNP-23 form preview" src={url} style={{width:'100%',height:'70vh',border:0}}/></>}
 </>}
 </section>;
}
