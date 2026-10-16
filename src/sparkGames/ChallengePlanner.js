import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {generateChallenges,mondayDates} from './challengeLibrary.mjs';
import './sparkGames.css';

function PlannerDialog({title,onClose,busy,children}){
 const ref=useRef(null);
 useEffect(()=>{
  const dialog=ref.current;
  if(dialog.showModal)dialog.showModal();else dialog.open=true;
  return()=>{if(dialog.open&&dialog.close)dialog.close();};
 },[]);
 return createPortal(<dialog ref={ref} role="dialog" aria-modal="true" aria-label={title} className="og sg-planner-dialog"
  onCancel={e=>{e.preventDefault();if(!busy)onClose();}} onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
  <div className="sg-dialog-content"><header className="sg-dialog-heading"><h3>{title}</h3><button type="button" className="sg-close" title="Close" aria-label="Close dialog" disabled={busy} onClick={onClose}>&times;</button></header>{children}</div>
 </dialog>,document.body);
}
const historyKey=month=>'spark-quest-alternatives:'+month;
function readHistory(month){try{const values=JSON.parse(sessionStorage.getItem(historyKey(month))||'[]');return Array.isArray(values)?values:[];}catch{return [];}}
export default function ChallengePlanner({data,run,busy}){
 const [month,setMonth]=useState(()=>{const p=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit'}).formatToParts(new Date());return p.find(x=>x.type==='year').value+'-'+p.find(x=>x.type==='month').value;});
 const [count,setCount]=useState(50),[time,setTime]=useState('07:00'),[selected,setSelected]=useState([]),[edit,setEdit]=useState(null),[preview,setPreview]=useState(null),[message,setMessage]=useState(''),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState('');
 const inFlight=useRef(false),tried=useRef({});
 if(!data.games_planning)return <p>SPARK Games planning will be available after the planning migration is installed.</p>;
 const all=data.games_planning.drafts||[],rows=all.filter(r=>r.month===month&&r.state!=='rejected'),waves=(data.games_planning.waves||[]).filter(w=>w.month===month);
 const recent=[...all.flatMap(r=>[r.library_id,r.title]).filter(Boolean),...(tried.current[month]||readHistory(month))];
 const locked=row=>waves.find(w=>w.monday===row.monday)?.state==='released';
 const save=row=>row.id?run('games_draft',{...row,month,revision:row.revision}):run('games_generate',{month,release_time:time,prompts:[row]});
 const remember=items=>{const values=[...new Set([...recent,...items.flatMap(r=>[r.library_id,r.title]).filter(Boolean)])];tried.current[month]=values;try{sessionStorage.setItem(historyKey(month),JSON.stringify(values));}catch{}};
 function openEdit(row){setSaveError('');setEdit({...row});}
 async function generate(){try{const prompts=generateChallenges(month,Number(count),recent);if(!prompts.length){setMessage('No unused suggestions remain. Edit a quest or add an original challenge.');return;}setMessage(prompts.length<Number(count)?`Only ${prompts.length} unused suggestions remain. No repeated prompts were added.`:'');if(await run('games_generate',{month,release_time:time,prompts}))remember(prompts);}catch(e){setMessage(e.message);}}
 async function alternative(row){
  if(busy||inFlight.current||locked(row))return;
  const candidate=generateChallenges(month,50,recent).find(q=>q.title!==row.title);
  if(!candidate){setMessage('No unused alternative remains. Use Edit to write your own challenge.');return;}
  inFlight.current=true;setSaving(true);
  try{if(await save({...row,...candidate,monday:row.monday,state:'proposed'})){remember([row,candidate]);setSelected(ids=>ids.filter(id=>id!==row.id));setMessage(`Replaced "${row.title}" with "${candidate.title}". Approval is required again.`);}else setMessage('The replacement could not be saved. Please try again.');}
  finally{inFlight.current=false;setSaving(false);}
 }
 async function remove(row){
  if(busy||inFlight.current||locked(row)||!window.confirm(`Remove "${row.title}" from this week's release? It will not be published. Existing records are kept.`))return;
  inFlight.current=true;setSaving(true);
  try{if(await save({...row,state:'rejected'})){remember([row]);setSelected(ids=>ids.filter(id=>id!==row.id));setMessage(`Removed "${row.title}" from the schedule.`);}else setMessage('The quest could not be removed. Please try again.');}
  finally{inFlight.current=false;setSaving(false);}
 }
 const pending=busy||saving;
 return <section className="sg-planner"><h4>Generate Side Quests</h4><p>Curated suggestions only. Approval schedules a quest; it does not publish it immediately. Times use America/Los_Angeles.</p>
 {data.game_next_missing&&<p role="status" className="sg-warning">Next month has no approved competition ready. Existing records and the current competition will be retained until an approved replacement is ready.</p>}
 <div className="sg-toolbar"><label>Competition month<input type="month" value={month} onChange={e=>{setMonth(e.target.value);setSelected([]);setMessage('');}}/></label><label>Suggestions<input type="number" min="1" max="50" value={count} onChange={e=>setCount(e.target.value)}/></label><label>Monday release time<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label><button disabled={pending} onClick={generate}>Generate Side Quests</button><button disabled={pending||!waves.length} onClick={()=>run('games_time',{month,release_time:time})}>Save release time</button></div>
 {message&&<p role="status" className="sg-planner-feedback">{message}</p>}{(data.games_planning.warnings||[]).map(w=><p role="status" key={w}>{w}</p>)}
 <button disabled={pending} onClick={()=>openEdit({title:'',description:'',goal:'',reward_points:10,monday:mondayDates(month)[0]})}>Add original challenge</button> <button disabled={pending||!selected.length} onClick={async()=>{if(await run('games_approve',{ids:selected}))setSelected([]);}}>Approve selected ({selected.length})</button>
 {[...mondayDates(month),null].map(day=>{
  const group=rows.filter(r=>r.monday===day);if(!group.length&&!day)return null;
  const approved=group.filter(r=>r.state==='approved').length,wave=waves.find(w=>w.monday===day),released=wave?.state==='released';
  return <div key={day||'pool'}><h5>{day?`Monday ${day} · ${approved} approved for release`:'Unassigned planning pool'}</h5>
   {wave&&<p className="sg-wave-date">Release: {new Date(wave.release_at).toLocaleString('en-US',{timeZone:'America/Los_Angeles',timeZoneName:'short'})} · {wave.state}</p>}
   {day&&!approved&&!released&&<p className="sg-warning">No quests approved for this week.</p>}
   <div className="sg-table"><table><thead><tr><th>Select</th><th>Challenge title</th><th>Short description</th><th>Scheduled wave</th><th>Points</th><th>Approve</th><th>Try Another</th><th>Edit / Preview</th><th>Remove</th></tr></thead><tbody>{group.map(row=><tr key={row.id}>
    <td><input aria-label={`Select ${row.title}`} type="checkbox" disabled={pending||row.state==='approved'||released} checked={row.state==='approved'||selected.includes(row.id)} onChange={e=>setSelected(e.target.checked?[...selected,row.id]:selected.filter(id=>id!==row.id))}/></td>
    <td><strong>{row.title}</strong><small>{row.state}</small></td><td>{row.description}</td>
    <td><select aria-label={`Wave for ${row.title}`} disabled={pending||released} value={row.monday||''} onChange={e=>save({...row,monday:e.target.value||null,state:'proposed'})}><option value="">Planning pool</option>{mondayDates(month).map(d=><option key={d}>{d}</option>)}</select></td>
    <td>{row.reward_points}</td><td><button disabled={pending||!row.monday||row.state==='approved'||released} onClick={()=>run('games_approve',{ids:[row.id]})}>Approve</button></td>
    <td><button disabled={pending||released} onClick={()=>alternative(row)}>Try Another</button></td>
    <td><div className="sg-row-actions"><button disabled={pending||released} onClick={()=>openEdit(row)}>Edit</button><button onClick={()=>setPreview(row)}>Preview</button></div></td>
    <td><button className="sg-remove" title={`Remove ${row.title}`} aria-label={`Remove ${row.title}`} disabled={pending||released} onClick={()=>remove(row)}>&times;</button></td>
   </tr>)}</tbody></table></div></div>;
 })}
 {edit&&<PlannerDialog title={edit.id?'Edit Side Quest':'Add Side Quest'} busy={pending} onClose={()=>setEdit(null)}>
  <form onSubmit={async e=>{e.preventDefault();if(inFlight.current||pending)return;inFlight.current=true;setSaving(true);setSaveError('');try{if(await save({...edit,library_id:null,state:'proposed'})){remember([edit]);setSelected(ids=>ids.filter(id=>id!==edit.id));setEdit(null);setMessage('Quest saved. Approval is required before release.');}else setSaveError('Could not save. Your changes are still here; please try again.');}finally{inFlight.current=false;setSaving(false);}}}>
   {saveError&&<p role="alert">{saveError}</p>}
   {[['title','Title',100],['description','Description',1000],['goal','The Challenge',300]].map(([key,label,max])=><label key={key}>{label}<textarea aria-label={label} required maxLength={max} value={edit[key]||''} disabled={pending} onChange={e=>setEdit({...edit,[key]:e.target.value})}/></label>)}
   <label>Points<input type="number" min="1" max="1000" step="1" required disabled={pending} value={edit.reward_points} onChange={e=>setEdit({...edit,reward_points:Number(e.target.value)})}/></label>
   <div className="og-actions"><button disabled={pending}>Save changes</button><button type="button" disabled={pending} onClick={()=>setEdit(null)}>Cancel</button></div>
  </form>
 </PlannerDialog>}
 {preview&&<PlannerDialog title="Manager challenge preview" onClose={()=>setPreview(null)}>
  <article className="og-card og-quest-card sg-manager-preview"><h4>{preview.title}</h4><p>{preview.description}</p><p><strong>The Challenge:</strong> {preview.goal}</p><strong className="og-quest-reward">Reward: {preview.reward_points} SPARK Points</strong></article>
  <div className="og-actions"><button onClick={()=>setPreview(null)}>Close preview</button></div>
 </PlannerDialog>}
 </section>;
}
