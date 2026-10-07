import React,{useEffect,useState} from 'react';
import {breakfastMenu} from './service';
import {PACKING_ITEMS} from './packingItems';
export const breakfastToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
// Menu is shared by the school; sent quantities belong to one classroom/date.
export default function BreakfastDispatch({token,onSaved,expanded=false}){
 const [date,setDate]=useState(breakfastToday),[values,setValues]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;setBusy(true);setValues(null);setError('');setMessage('');const request=breakfastMenu(token,date);request.then(v=>{if(active)setValues(v);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[token,date]);
 async function save(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{setValues(await breakfastMenu(token,date,values));setMessage('School menu saved.');onSaved?.();}catch(e){setError(e.message);}finally{setBusy(false);}}
 const items=values;
 const Container=expanded?'section':'details',Title=expanded?'h2':'summary';
 return <Container className="ba-dispatch"><Title>School breakfast menu</Title><p>Enter the exact item names for this date, such as “Apple” or “Breakfast burrito.” Check the milk options being served and leave other unused categories blank. Workers pack and count only these items. Once packing begins, item names stay fixed for the day.</p><label>Menu service date<input type="date" required disabled={busy} value={date} onChange={e=>setDate(e.target.value)}/></label>{error&&<p role="alert" className="ba-error">{error}</p>}{message&&<p role="status">{message}</p>}{values&&<form onSubmit={save} className="ba-form"><fieldset disabled={busy}><div className="ba-fields">{PACKING_ITEMS.map(([k,label])=>['milk1','milkNonfat','milkLactaid'].includes(k)?<label key={k} className="ba-check"><input type="checkbox" checked={Boolean(items[k]?.trim())} onChange={e=>setValues({...values,[k]:e.target.checked?label:''})}/>{label}</label>:<label key={k}>{label}<input type="text" maxLength={160} value={items[k]??''} onChange={e=>setValues({...values,[k]:e.target.value})}/></label>)}</div><button className="ba-primary">{busy?'Saving…':'Save menu'}</button></fieldset></form>}</Container>;
}
