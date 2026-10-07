import React,{useState} from 'react';
import PackingPrint from './PackingPrint';
import MealCountPrint from './MealCountPrint';
export default function BreakfastReports({token,location,classrooms}){
 const [classroomId,setClassroomId]=useState('');
 const rows=[...classrooms].sort((a,b)=>(a.campus_label||'').localeCompare(b.campus_label||'')||a.room_code.localeCompare(b.room_code,undefined,{numeric:true}));
 const selected=rows.find(r=>String(r.id)===classroomId);
 return <><PackingPrint token={token} expanded/><section className="ba-report-meals"><h2>BIC Meal Count report</h2><label className="ba-report-classroom">Classroom<select value={classroomId} onChange={e=>setClassroomId(e.target.value)}><option value="">Select a classroom</option>{rows.map(r=><option key={r.id} value={r.id}>Room {r.room_code} · {r.teacher_name}{r.campus_label?` · ${r.campus_label}`:''}{r.active?'':' (Inactive)'}</option>)}</select></label>{selected?<MealCountPrint key={selected.id} token={token} record={selected} location={location}/>:<p>{rows.length?'Choose a classroom to preview or print its official five-day meal-count form.':'Add a classroom to prepare its meal-count form.'}</p>}</section></>;
}
