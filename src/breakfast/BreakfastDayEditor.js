import React,{useRef,useState} from 'react';
import {editBreakfastDay} from './service';
export default function BreakfastDayEditor({token,day,onCancel,onSaved}) {
 const [count,setCount]=useState(day.teacher_meal_count??''),[attendance,setAttendance]=useState(day.teacher_attendance??'');
 const [adult,setAdult]=useState(Boolean(day.adult_meal_received));
 const [returns,setReturns]=useState(day.teacher_returned_counts??day.returned_counts??{});
 const [reset,setReset]=useState(false),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const inFlight=useRef(false);
 const keys=Object.keys(returns);
 const changed=fn=>{fn();setConfirmed(false);};
 async function save(e){e.preventDefault();if(!confirmed||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');try{await editBreakfastDay(token,day,{count:count===''?null:Number(count),attendance:attendance===''?null:Number(attendance),adult,returns:Object.fromEntries(Object.entries(returns).map(([k,v])=>[k,Number(v)]))},reset,confirmed);await onSaved(reset);}catch(e){setError(e.message);setBusy(false);}finally{inFlight.current=false;}}
 return <form className="ba-panel ba-day-editor" aria-label="Edit breakfast day" onSubmit={save}>
  <h3>Edit Room {day.room_snapshot} · {day.service_date}</h3>
  {error&&<p role="alert" className="ba-error">{error}</p>}
  <label className="ba-check"><input type="checkbox" checked={reset} disabled={busy} onChange={e=>changed(()=>setReset(e.target.checked))}/>Reset this classroom’s day</label>
  {reset?<p>This clears this classroom’s meal counts, attendance, adult meal, packing, returns, and pre-order entered on this date. It returns the day to not submitted. Change history is kept. Other classrooms and dates are unaffected.</p>:<>
   <label>Student meals<input type="number" min="0" max="10000" step="1" required value={count} disabled={busy} onChange={e=>changed(()=>setCount(e.target.value))}/></label>
   <label>Class attendance<input type="number" min="0" max="10000" step="1" value={attendance} disabled={busy} onChange={e=>changed(()=>setAttendance(e.target.value))}/></label>
   <label className="ba-check"><input type="checkbox" checked={adult} disabled={busy} onChange={e=>changed(()=>setAdult(e.target.checked))}/>Teacher adult meal received</label>
   {!!keys.length&&<fieldset><legend>Returned items</legend>{keys.map(k=><label key={k}>{day.menu_snapshot?.[k]||k}<input type="number" min="0" max="10000" step="1" required value={returns[k]} disabled={busy} onChange={e=>changed(()=>setReturns(r=>({...r,[k]:e.target.value})))}/></label>)}</fieldset>}
  </>}
  <label className="ba-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>{reset?'I confirm resetting this classroom’s day.':'I confirm these corrected numbers are accurate.'}</label>
  <div className="ba-actions"><button className="ba-primary" disabled={busy||!confirmed}>{busy?'Saving…':reset?'Save reset':'✓ Save changes'}</button><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
 </form>;
}
