import React,{useEffect,useRef,useState} from 'react';
import {classroomHistory} from './service';
import {buildMealCountPdf,weekDates} from './mealCountPdf';
import {MEAL_FORM_URL,PACKING_URL} from './resources';
export default function MealCountPrint({token,record,location}){
 const [week,setWeek]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'})),[busy,setBusy]=useState(false),[error,setError]=useState(''),[url,setUrl]=useState(''),[filename,setFilename]=useState(`Breakfast-${record.room_code}`);
 const objectUrl=useRef('');useEffect(()=>()=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);},[]);
 function clear(){if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);objectUrl.current='';setUrl('');}
 async function preview(){setBusy(true);setError('');clear();try{
  const dates=weekDates(week);let days=[],cursor=null;
  // Existing scoped history RPC; older weeks must not be limited to the first 50 days.
  do{const result=await classroomHistory(token,record.id,null,cursor);const batch=result.days.slice(0,50);days.push(...batch.filter(d=>d.service_date>=dates[0]&&d.service_date<=dates[4]));const last=batch[batch.length-1];cursor=result.days.length>50&&last.service_date>=dates[0]?last.service_date:null;}while(cursor);
  const response=await fetch(MEAL_FORM_URL);if(!response.ok)throw new Error('The district meal-count template could not be loaded.');
  const bytes=await buildMealCountPdf(await response.arrayBuffer(),{location,record,days,week});objectUrl.current=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));setUrl(objectUrl.current);setFilename(`Breakfast-${record.room_code}-${dates[0]}`);
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="ba-print-tools"><h3>Official five-day meal-count form</h3><p>Saved, certified teacher counts mark the numbered boxes. Missing submissions stay blank. Recorded teacher adult meals fill the separate adult row. Attendance, pre-orders, and signatures remain blank for completion on the district form.</p><label>Date in reporting week<input type="date" required value={week} disabled={busy} onChange={e=>{clear();setWeek(e.target.value);}}/></label><button disabled={busy||!week} onClick={preview}>{busy?'Preparing…':'Preview / Print meal count form'}</button>{error&&<p role="alert">{error}</p>}{url&&<><label>PDF filename<input value={filename} onChange={e=>setFilename(e.target.value)} maxLength={120}/></label><a href={url} target="_blank" rel="noreferrer">Open PDF to print</a><a href={url} download={`${(filename.trim()||'Breakfast-meal-count').replace(/[<>:"/\\|?*]/g,'-').replace(/\.pdf$/i,'')}.pdf`}>Download PDF</a><iframe className="ba-print-preview" title="Official breakfast meal-count form preview" src={url}/></>}<div><a href={MEAL_FORM_URL} target="_blank" rel="noreferrer">Blank meal-count form</a><a href={PACKING_URL} target="_blank" rel="noreferrer">Worker packing report reference</a></div></section>;
}
