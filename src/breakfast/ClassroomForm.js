import React,{useState} from 'react';
export default function ClassroomForm({record,onSave,onCancel,busy}) {
 const [values,setValues]=useState(record || {room_code:'',teacher_name:'',enrolled_students:'',campus_label:'',active:true});
 const change=(key,value)=>setValues(v=>({...v,[key]:value}));
 return <form className="ba-panel ba-form" onSubmit={e=>{e.preventDefault();onSave(values);}}>
  <h2>{record?'Edit classroom':'Add classroom'}</h2>
  <div className="ba-fields">
   <label>Room number / code<input required maxLength={40} value={values.room_code} onChange={e=>change('room_code',e.target.value)} placeholder="S14 or B-203"/></label>
   <label>Teacher name<input required maxLength={160} value={values.teacher_name} onChange={e=>change('teacher_name',e.target.value)}/></label>
   <label>Enrolled students<input type="number" required min="0" max="1000" step="1" value={values.enrolled_students} onChange={e=>change('enrolled_students',e.target.value)}/></label>
   <label>Campus / offsite label (optional)<input maxLength={120} value={values.campus_label} onChange={e=>change('campus_label',e.target.value)} placeholder="Main site, EEC, or other campus"/></label>
  </div>
  <p>Classrooms are permanent. Editing a teacher or room keeps its history.</p>
  <div className="ba-actions"><button disabled={busy} className="ba-primary">{busy?'Saving…':'Save classroom'}</button><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
 </form>;
}
