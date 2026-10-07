import React,{useCallback,useEffect,useState} from 'react';
import ClassroomTrend from './ClassroomTrend';
import ClassroomTeacherTools from './ClassroomTeacherTools';
import {classroomHistory} from './service';
import {usePageNavigation} from '../navigation/PageNavigation';
const time=value=>new Date(value).toLocaleString('en-US',{timeZone:'America/Los_Angeles'});
const eventTitle=value=>value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export default function ClassroomHistory({token,record,onBack}) {
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
  {data&&<ClassroomTrend days={data.days.slice(0,50)}/>}
  <ClassroomTeacherTools token={token} record={classroom} onMessage={load}/>
  <h3>Classroom breakfast history</h3>
  <p>Historical records retain the room and teacher details from that service date.</p>
  {busy&&<p role="status">Loading…</p>}
  {data&&!data.days.length&&<p>No daily breakfast records yet. Teacher submissions from the classroom QR will appear here.</p>}
  {!!data?.days.length&&<div className="ba-table-scroll"><table className="ba-history-table" aria-label="Classroom breakfast history"><thead><tr><th scope="col">Date</th><th scope="col">Room</th><th scope="col">Teacher</th><th scope="col">Status</th><th scope="col">Student meals</th><th scope="col">Teacher adult meal</th><th scope="col">Returned items</th><th scope="col">Teacher submitted</th><th scope="col">Details</th></tr></thead><tbody>{data.days.slice(0,50).map(day=><tr key={day.id}><th scope="row">{day.service_date}</th><td>{day.room_snapshot}</td><td>{day.teacher_snapshot}</td><td>{eventTitle(day.review_status)}</td><td>{day.teacher_meal_count??'—'}</td><td>{day.adult_meal_recorded_at?(day.adult_meal_received?'1':'0'):'—'}</td><td>{Object.entries(day.returned_counts||{}).map(([key,value])=>`${day.menu_snapshot?.[key]||key}: ${value}`).join(', ')||'Not recorded'}</td><td>{day.teacher_submitted_at?time(day.teacher_submitted_at):'—'}</td><td>{day.preorder_submitted_at||day.worker_submitted_at||day.teacher_comments||day.worker_notes||day.manager_notes||day.adult_meal_recorded_at?<details><summary>Notes / compliance</summary>{day.preorder_submitted_at&&<p>Pre-order for {day.preorder_date}: {day.preorder_entree} · {day.preorder_count}</p>}{day.adult_meal_recorded_at&&<p>Teacher adult meal recorded: {time(day.adult_meal_recorded_at)}</p>}{day.worker_submitted_at&&<p>Returns submitted: {time(day.worker_submitted_at)}{day.worker_name?` · ${day.worker_name}`:''}</p>}{day.worker_notes&&<p>Worker notes: {day.worker_notes}</p>}{day.teacher_comments&&<p>Teacher comments: {day.teacher_comments}</p>}{day.manager_notes&&<p>Manager notes: {day.manager_notes}</p>}</details>:'—'}</td></tr>)}</tbody></table></div>}
  {!!data&&<div className="ba-actions">{beforeDate&&<button disabled={busy} onClick={()=>setBeforeDate(null)}>Newest days</button>}{data.days.length>50&&<button disabled={busy} onClick={()=>setBeforeDate(data.days[49].service_date)}>Older days</button>}</div>}

 </section>;
}
