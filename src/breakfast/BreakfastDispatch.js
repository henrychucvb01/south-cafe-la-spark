import React,{useEffect,useState} from 'react';
import {menuWorkspace} from './service';
import MenuFields from './MenuFields';
import ManageMenuGroups from './ManageMenuGroups';
import ClassroomMenuPreview from './ClassroomMenuPreview';
import {weekDates} from './mealCountPdf';
export const breakfastToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export default function BreakfastDispatch({token,onSaved,onDirty,expanded=false}){
 const [date,setDate]=useState(breakfastToday),[data,setData]=useState(null),[group,setGroup]=useState('standard'),[values,setValues]=useState({}),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [source,setSource]=useState(breakfastToday),[destination,setDestination]=useState(''),[copyGroup,setCopyGroup]=useState('standard'),[copyOpen,setCopyOpen]=useState(false),[manage,setManage]=useState(false),[preview,setPreview]=useState(false);
 useEffect(()=>{let active=true;setBusy(true);menuWorkspace(token,breakfastToday()).then(v=>{if(active){setData(v);setValues(v.menus.standard||{});setDirty(false);setGroup('standard');}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[token]);
 useEffect(()=>{onDirty?.(dirty);},[dirty,onDirty]);
 useEffect(()=>{const warn=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const selected=data?.groups.find(g=>g.id===group),groups=[{id:'standard',name:'Standard BIC',count:data?.classrooms.length||0},...(data?.groups||[])];
 async function persist(){
  if(!dirty)return true;
  if(data.saved_groups?.includes(group)&&!window.confirm(`Replace the saved ${selected?.name||'Standard BIC'} menu for ${date}? Submitted orders and packed item names stay unchanged.`))return false;
  const saved=await menuWorkspace(token,date,'menu_save',{revision:data.revision,group_id:group==='standard'?null:group,items:values,confirmed:true});setData(saved);setValues(saved.menus[group]||{});setDirty(false);setMessage('Menu saved.');onSaved?.();return true;
 }
 async function guarded(work){setBusy(true);setError('');try{await work();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function navigate(nextDate,nextGroup=group){if(!nextDate||(nextDate===date&&nextGroup===group))return;await guarded(async()=>{if(!await persist())return;const loaded=await menuWorkspace(token,nextDate);setData(loaded);setValues(loaded.menus[nextGroup]||{});setDate(nextDate);setSource(nextDate);setGroup(nextGroup);setMessage('');setCopyOpen(false);});}
 async function changeWorkspace(action,payload){let success=false;await guarded(async()=>{const saved=await menuWorkspace(token,date,action,{revision:data.revision,...payload});setData(saved);if(!dirty){const next=group==='standard'||saved.groups.some(g=>g.id===group)?group:'standard';setGroup(next);setValues(saved.menus[next]||{});}setMessage('Saved.');onSaved?.();success=true;});return success;}
 async function show(which){await guarded(async()=>{if(!await persist())return;if(which==='groups')setManage(v=>!v);else setPreview(v=>!v);});}
 async function copyFromGroup(){const original=data.menus[copyGroup];if(!original){setError('That group has no saved menu for this date.');return;}if(dirty&&!window.confirm('Replace your unsaved menu changes?'))return;
 const milkOnly=selected?.kind==='milk';setValues(milkOnly?Object.fromEntries(Object.entries(original).filter(([key])=>['milk1','milkNonfat','milkLactaid','milkSpecial'].includes(key))):{...original});setDirty(true);setMessage('Copied into this menu. Uncheck or change items, then save.');setCopyOpen(false);}
 async function copyDate(){await guarded(async()=>{if(!await persist())return;const current=await menuWorkspace(token,source),existing=await menuWorkspace(token,destination);if(current.revision!==existing.revision)throw new Error('Menu configuration changed. Refresh before copying.');if(existing.saved_groups?.includes(group)&&!window.confirm('Replace the saved group menu for '+destination+'?'))return;await menuWorkspace(token,source,'copy_date',{revision:existing.revision,group_id:group==='standard'?null:group,destination,confirmed:true});const loaded=await menuWorkspace(token,date);setData(loaded);setValues(loaded.menus[group]||{});setMessage('Menu copied to '+destination+'.');onSaved?.();});}
 function change(key,value){setValues(v=>({...v,[key]:value}));setDirty(true);setMessage('');}
 const Container=expanded?'section':'details',Title=expanded?'h2':'summary';
 return <Container className="ba-dispatch"><Title>School breakfast menu</Title><p>Choose a weekday and group. Main-menu groups replace the default; milk-only groups change milk choices. Saved orders and packed item names remain protected.</p>
 <label>Menu service date<input type="date" required disabled={busy} value={date} onChange={e=>navigate(e.target.value)}/></label>
 <div className="ba-actions" aria-label="Breakfast week">{weekDates(date).map((day,i)=><button type="button" key={day} disabled={busy} aria-pressed={day===date} onClick={()=>navigate(day)}>{['Mon','Tue','Wed','Thu','Fri'][i]} {day.slice(5)}</button>)}</div>
 <div className="ba-actions ba-menu-tools"><button disabled={busy||!data} onClick={()=>show('groups')}>Manage Groups</button><button disabled={busy||!data} onClick={()=>show('preview')}>Preview Classroom Menu</button><button disabled={busy||!data} onClick={()=>guarded(async()=>{if(dirty&&!window.confirm('Discard unsaved menu changes and refresh?'))return;const loaded=await menuWorkspace(token,date);setData(loaded);setValues(loaded.menus[group]||{});setDirty(false);})}>Refresh menus</button></div>
 <p role="status">{dirty?'Unsaved changes':busy?'Loading…':'Saved'}{message?' · '+message:''}</p>{error&&<p role="alert" className="ba-error">{error}</p>}
 {data&&<>{manage&&<ManageMenuGroups data={data} busy={busy} onChange={changeWorkspace} onClose={()=>setManage(false)}/>}
 <div className="ba-menu-group-tabs" role="group" aria-label="Menu groups">{groups.map(g=><button type="button" key={g.id} disabled={busy} aria-pressed={g.id===group} onClick={()=>navigate(date,g.id)}>{g.name}<small>{g.count} classrooms</small></button>)}<button type="button" disabled={busy} onClick={()=>show('groups')}>+ Group</button></div>
 <div className="ba-actions"><button disabled={busy} onClick={()=>{setCopyGroup(groups.find(g=>g.id!==group)?.id||'standard');setCopyOpen(v=>!v);}}>Copy Menu From</button></div>
 {copyOpen&&<div className="ba-copy-group"><label>Copy from group<select value={copyGroup} disabled={busy} onChange={e=>setCopyGroup(e.target.value)}>{groups.filter(g=>g.id!==group).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label><button type="button" disabled={busy||copyGroup===group} onClick={copyFromGroup}>Copy selected menu</button></div>}
 {selected?.kind==='milk'?<p className="ba-small">Only checked milk options will be offered to these classrooms. Food comes from their main menu.</p>:<p className="ba-small">Use assigned groups for vegan, special-diet, Lactaid and special-milk items. These items are not automatically added to unassigned classrooms once groups are configured.</p>}
 <form onSubmit={e=>{e.preventDefault();guarded(persist);}} className="ba-form"><fieldset disabled={busy}><legend>{selected?.name||'Standard BIC'} · {date}</legend><MenuFields standard={group==='standard'} values={values} onChange={change} milkOnly={selected?.kind==='milk'}/><button className="ba-primary" disabled={!dirty}>{busy?'Saving…':'Save menu'}</button></fieldset></form>
 <details><summary>Copy Menu to another date</summary><div className="ba-fields"><label>Source date<input type="date" value={source} disabled={busy} onChange={e=>setSource(e.target.value)}/></label><label>Destination date<input type="date" value={destination} disabled={busy} onChange={e=>setDestination(e.target.value)}/></label></div><button disabled={busy||!source||!destination||source===destination} onClick={copyDate}>Copy daily menu</button></details>
 {preview&&<ClassroomMenuPreview token={token} date={date} data={data} busy={busy} onChange={changeWorkspace}/>}</>}
 </Container>;
}
