import React,{useCallback,useEffect,useState} from 'react';
import MealCountPrint from './MealCountPrint';
import ClassroomTeacherTools from './ClassroomTeacherTools';
import {classroomHistory,addNote} from './service';
import {usePageNavigation} from '../navigation/PageNavigation';
const time=value=>new Date(value).toLocaleString('en-US',{timeZone:'America/Los_Angeles'});
const eventTitle=value=>value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export default function ClassroomHistory({token,record,location,onBack}) {
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[message,setMessage]=useState('');
 const [cursors,setCursors]=useState({event:null,date:null});
 usePageNavigation({title:`Room ${record.room_code}`,destination:'Breakfast',onNavigate:onBack,level:2});
 const load=useCallback(async()=>{setBusy(true);setError('');try{setData(await classroomHistory(token,record.id,cursors.event,cursors.date));}catch(e){setError(e.message);}finally{setBusy(false);}},[token,record.id,cursors]);
 useEffect(()=>{let active=true;setBusy(true);setError('');classroomHistory(token,record.id,cursors.event,cursors.date).then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[token,record.id,cursors]);
 async function submit(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{await addNote(token,record.id,note);setNote('');setMessage('Note saved to classroom history.');if(cursors.event)setCursors({...cursors,event:null});else await load();}catch(err){setError(err.message);}finally{setBusy(false);}}
 const classroom=data?.classroom||record;
 return <section className="ba-panel">
  <button onClick={onBack}>← Breakfast</button><h2>Room {classroom.room_code}</h2>
  <p>{classroom.teacher_name} · {classroom.enrolled_students} students{classroom.campus_label?` · ${classroom.campus_label}`:''} · {classroom.active?'Active':'Inactive'}</p>
  {error&&<p role="alert" className="ba-error">{error} <button onClick={load}>Retry</button></p>}{message&&<p role="status">{message}</p>}
  <ClassroomTeacherTools token={token} record={classroom} onMessage={load}/>
  {location&&<MealCountPrint token={token} record={classroom} location={location}/>}
  <h3>Classroom breakfast history</h3>
  <p>Historical records retain the room and teacher details from that service date.</p>
  {busy&&<p role="status">Loading…</p>}
  {data&&!data.days.length&&<p>No daily breakfast records yet. Teacher submissions from the classroom QR will appear here.</p>}
  {data?.days.slice(0,50).map(day=><article className="ba-history-item" key={day.id}><strong>{day.service_date} · Room {day.room_snapshot}</strong><p>{day.teacher_snapshot} · {eventTitle(day.review_status)}</p><p>Sent: {day.number_sent??'—'} · Teacher count: {day.teacher_meal_count??'—'} · Difference: {day.discrepancy??'—'}</p>{day.teacher_submitted_at&&<p>Teacher submitted: {time(day.teacher_submitted_at)}</p>}{day.worker_submitted_at&&<p>Returns submitted: {time(day.worker_submitted_at)}</p>}<p>Returned items: {Object.entries(day.returned_counts||{}).map(([key,value])=>`${key}: ${value}`).join(', ')||'Not recorded'}</p>{day.teacher_comments&&<p>Teacher comments: {day.teacher_comments}</p>}{day.manager_notes&&<p>Manager notes: {day.manager_notes}</p>}</article>)}
  {!!data&&<div className="ba-actions">{cursors.date&&<button disabled={busy} onClick={()=>setCursors({...cursors,date:null})}>Newest days</button>}{data.days.length>50&&<button disabled={busy} onClick={()=>setCursors({...cursors,date:data.days[49].service_date})}>Older days</button>}</div>}
  <h3>Notes & change history</h3><p>Times shown in Los Angeles time. Notes are saved permanently and are not sent to teachers.</p>
  <form onSubmit={submit}><label>Manager note<textarea required maxLength={4000} rows={3} value={note} onChange={e=>setNote(e.target.value)}/></label><button className="ba-primary" disabled={busy||!note.trim()}>Save note</button></form>
  {data?.events.slice(0,50).map(event=><article className="ba-history-item" key={event.id}><strong>{eventTitle(event.action)}</strong><p>{time(event.created_at)} · {event.actor_name}</p>{event.note&&<p className="ba-note">{event.note}</p>}{event.after_data?.room_code&&<p>Room {event.after_data.room_code} · {event.after_data.teacher_name} · {event.after_data.enrolled_students} students{event.after_data.campus_label?` · ${event.after_data.campus_label}`:''}</p>}{event.after_data?.count!=null&&<p>Count: {event.after_data.count}{event.before_data?.count!=null?` · Previously: ${event.before_data.count}`:''}{event.after_data.comments?` · ${event.after_data.comments}`:''}</p>}{event.before_data?.room_code&&<p>Previously: Room {event.before_data.room_code} · {event.before_data.teacher_name} · {event.before_data.enrolled_students} students{event.before_data.campus_label?` · ${event.before_data.campus_label}`:''}</p>}</article>)}
  {!!data&&<div className="ba-actions">{cursors.event&&<button disabled={busy} onClick={()=>setCursors({...cursors,event:null})}>Newest history</button>}{data.events.length>50&&<button disabled={busy} onClick={()=>setCursors({...cursors,event:data.events[49].id})}>Older history</button>}</div>}
 </section>;
}
