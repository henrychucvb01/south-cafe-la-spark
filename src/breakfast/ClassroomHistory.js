import React,{useCallback,useEffect,useState} from 'react';
import MealCountPrint from './MealCountPrint';
import ClassroomTeacherTools from './ClassroomTeacherTools';
import {classroomHistory} from './service';
import {usePageNavigation} from '../navigation/PageNavigation';
const time=value=>new Date(value).toLocaleString('en-US',{timeZone:'America/Los_Angeles'});
const eventTitle=value=>value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export default function ClassroomHistory({token,record,location,onBack}) {
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [beforeDate,setBeforeDate]=useState(null);
 usePageNavigation({title:`Room ${record.room_code}`,destination:'Breakfast',onNavigate:onBack,level:2});
 const load=useCallback(async()=>{setBusy(true);setError('');try{setData(await classroomHistory(token,record.id,null,beforeDate));}catch(e){setError(e.message);}finally{setBusy(false);}},[token,record.id,beforeDate]);
 useEffect(()=>{let active=true;setBusy(true);setError('');classroomHistory(token,record.id,null,beforeDate).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[token,record.id,beforeDate]);

 const classroom=data?.classroom||record;
 return <section className="ba-panel">
  <button onClick={onBack}>← Breakfast</button><h2>Room {classroom.room_code}</h2>
  <p>{classroom.teacher_name} · {classroom.enrolled_students} students{classroom.campus_label?` · ${classroom.campus_label}`:''} · {classroom.active?'Active':'Inactive'}</p>
  {error&&<p role="alert" className="ba-error">{error} <button onClick={load}>Retry</button></p>}
  <ClassroomTeacherTools token={token} record={classroom} onMessage={load}/>
  {location&&<MealCountPrint token={token} record={classroom} location={location}/>}
  <h3>Classroom breakfast history</h3>
  <p>Historical records retain the room and teacher details from that service date.</p>
  {busy&&<p role="status">Loading…</p>}
  {data&&!data.days.length&&<p>No daily breakfast records yet. Teacher submissions from the classroom QR will appear here.</p>}
  {data?.days.slice(0,50).map(day=><article className="ba-history-item" key={day.id}><strong>{day.service_date} · Room {day.room_snapshot}</strong><p>{day.teacher_snapshot} · {eventTitle(day.review_status)}</p><p>Sent: {day.number_sent??'—'} · Teacher count: {day.teacher_meal_count??'—'} · Difference: {day.discrepancy??'—'}</p>{day.teacher_submitted_at&&<p>Teacher submitted: {time(day.teacher_submitted_at)}</p>}{day.worker_submitted_at&&<p>Returns submitted: {time(day.worker_submitted_at)}</p>}<p>Returned items: {Object.entries(day.returned_counts||{}).map(([key,value])=>`${key}: ${value}`).join(', ')||'Not recorded'}</p>{day.teacher_comments&&<p>Teacher comments: {day.teacher_comments}</p>}{day.manager_notes&&<p>Manager notes: {day.manager_notes}</p>}</article>)}
  {!!data&&<div className="ba-actions">{beforeDate&&<button disabled={busy} onClick={()=>setBeforeDate(null)}>Newest days</button>}{data.days.length>50&&<button disabled={busy} onClick={()=>setBeforeDate(data.days[49].service_date)}>Older days</button>}</div>}

 </section>;
}
