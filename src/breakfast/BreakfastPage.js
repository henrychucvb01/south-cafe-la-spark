import React,{useEffect,useState} from 'react';
import {openSession,closeSession,listClassrooms,saveClassroom} from './service';
import BreakfastSettings from './BreakfastSettings';
import ClassroomForm from './ClassroomForm';
import ClassroomHistory from './ClassroomHistory';
import './breakfast.css';
export default function BreakfastPage({location,employee,managerPin}) {
 const [token,setToken]=useState(''),[records,setRecords]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(true),[retry,setRetry]=useState(0);
 const [showSettings,setShowSettings]=useState(false);
 const [editing,setEditing]=useState(null),[selected,setSelected]=useState(null),[filter,setFilter]=useState('active'),[message,setMessage]=useState('');
 useEffect(()=>{let cancelled=false,session;
  setBusy(true);setError('');setToken('');setRecords([]);
  async function start(){try{session=await openSession(location,employee,managerPin);if(cancelled){await closeSession(session);return;}const rows=await listClassrooms(session);if(!cancelled){setToken(session);setRecords(rows||[]);}}catch(e){if(!cancelled)setError(e.message);}finally{if(!cancelled)setBusy(false);}}
  start();return()=>{cancelled=true;if(session)closeSession(session).catch(()=>{});};
 },[location,employee,managerPin,retry]);
 async function save(values,record=editing?.record){setBusy(true);setError('');setMessage('');try{const saved=await saveClassroom(token,record,values);setRecords(old=>[...old.filter(r=>r.id!==saved.id),saved]);setEditing(null);setMessage(`Room ${saved.room_code} saved.`);}catch(e){setError(e.message);}finally{setBusy(false);}}
 const active=records.filter(r=>r.active),visible=records.filter(r=>filter==='all'||(filter==='active'?r.active:!r.active)).sort((a,b)=>a.campus_label.localeCompare(b.campus_label)||a.room_code.localeCompare(b.room_code,undefined,{numeric:true}));
 return <main className="ba-root"><header className="ba-heading"><p>{location.school_name} · {location.location_code}</p><h1>Breakfast Accountability</h1><p>Classroom setup and history</p></header>
  {error&&<div role="alert" className="ba-error">{error} <button disabled={busy} onClick={()=>{setEditing(null);setSelected(null);setRetry(v=>v+1);}}>Reconnect / Refresh</button></div>}
  {message&&<p role="status" className="ba-success">{message}</p>}
  {!token&&busy&&<p role="status">Opening your school’s Breakfast area…</p>}
  {token&&(showSettings?<BreakfastSettings token={token} onBack={()=>setShowSettings(false)}/>:selected?<ClassroomHistory key={selected.id} token={token} record={selected} onBack={()=>setSelected(null)}/>:<>
   <div className="ba-totals"><section><strong>{active.length}</strong><span>Active classrooms</span></section><section><strong>{active.reduce((sum,r)=>sum+r.enrolled_students,0)}</strong><span>Enrolled students</span></section><section><strong>{records.length-active.length}</strong><span>Inactive classrooms</span></section></div>
   <p className="ba-info">Set up your permanent classroom roster here. Open a classroom to show its QR, send teacher messages, or view submitted counts. Returned bags and the QR Print Center will be added in later phases.</p>
   {editing?<ClassroomForm key={editing.record?.id||'new'} record={editing.record} onSave={save} onCancel={()=>setEditing(null)} busy={busy}/>:<section className="ba-panel">
    <div className="ba-toolbar"><h2>Classrooms</h2><button onClick={()=>setShowSettings(true)}>Breakfast settings</button><button className="ba-primary" disabled={busy} onClick={()=>setEditing({record:null})}>+ Add classroom</button><label>Show<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All classrooms</option></select></label></div>
    {!visible.length&&<p>No {filter==='all'?'':filter+' '}classrooms yet. Add a classroom to get started.</p>}
    <div className="ba-classrooms">{visible.map(record=><article className="ba-classroom" key={record.id}><div><h3>Room {record.room_code}</h3><span className={`ba-badge ${record.active?'':'ba-muted'}`}>{record.active?'Active':'Inactive'}</span></div><p>{record.teacher_name}</p><p>{record.enrolled_students} students{record.campus_label?` · ${record.campus_label}`:''}</p><div className="ba-actions"><button disabled={busy} onClick={()=>setSelected(record)}>View & history</button><button disabled={busy} onClick={()=>setEditing({record})}>Edit</button><button disabled={busy} onClick={()=>save({...record,active:!record.active},record)}>{record.active?'Deactivate':'Reactivate'}</button></div></article>)}</div>
   </section>}
  </>)}
 </main>;
}
