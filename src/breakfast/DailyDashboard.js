import React,{useCallback,useEffect,useRef,useState} from 'react';
import {dailyDashboard,reviewBreakfast} from './service';
import {breakfastToday} from './BreakfastDispatch';
export function breakfastStatus(record){
 if(!record?.packing_submitted_at)return 'Awaiting packing';
 if(!record.teacher_submitted_at)return 'Awaiting teacher';
 if(!record.worker_submitted_at)return 'Awaiting returns';
 return record.review_status==='reviewed'&&record.reviewed_at?'Reviewed':'Needs review';
}
export function breakfastFlags(d){
 if(!d)return [];
 const flags=[];
 if(d.teacher_submitted_at&&d.number_sent!=null&&d.teacher_meal_count>d.number_sent)flags.push('Teacher count exceeds meals sent');
 for(const [key,count] of Object.entries(d.returned_counts||{}))if(d.items_sent?.[key]!=null&&count>d.items_sent[key])flags.push(`${d.menu_snapshot?.[key]||key}: returns exceed sent`);
 return flags;
}
const time=value=>value?new Date(value).toLocaleString('en-US',{timeZone:'America/Los_Angeles'}):'Not submitted';
const countText=(items,menu)=>Object.entries(items||{}).map(([key,count])=>`${menu?.[key]||key}: ${count}`).join(' · ')||'Not recorded';
export default function DailyDashboard({token}){
 const [date,setDate]=useState(breakfastToday),[data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[updated,setUpdated]=useState(''),[filter,setFilter]=useState('All');
 const [review,setReview]=useState(null),[notes,setNotes]=useState(''),[saving,setSaving]=useState(false);
 const request=useRef(0);
 const load=useCallback(async()=>{const id=++request.current;setBusy(true);setError('');try{const result=await dailyDashboard(token,date);if(id===request.current){setData(result);setReview(null);setUpdated(new Date().toLocaleTimeString());}}catch(e){if(id===request.current)setError(e.message);}finally{if(id===request.current)setBusy(false);}},[token,date]);
 useEffect(()=>{const sequence=request;setData(null);setReview(null);load();return()=>{sequence.current++;};},[load]);
 async function saveReview(e){e.preventDefault();setSaving(true);setError('');try{await reviewBreakfast(token,review,date,notes);setReview(null);await load();}catch(e){setError(e.message);}finally{setSaving(false);}}
 const rows=data?.rows||[],finished=rows.filter(r=>r.record?.packing_submitted_at&&r.record?.teacher_submitted_at&&r.record?.worker_submitted_at).length;
 const reported=rows.filter(r=>r.record?.teacher_submitted_at&&r.record?.teacher_certified).length;
 const visible=rows.filter(r=>filter==='All'||(filter==='Incomplete'?breakfastStatus(r.record).startsWith('Awaiting'):breakfastStatus(r.record)===filter));
 return <section className="ba-panel ba-dashboard"><div className="ba-toolbar"><h2>BIC daily dashboard</h2><label>Service date / history<input type="date" value={date} required disabled={saving} onChange={e=>{if(e.target.value)setDate(e.target.value);}}/></label><button disabled={busy||saving} onClick={load}>{busy?'Refreshing…':'Refresh'}</button></div>
  {error&&<p role="alert" className="ba-error">{error}</p>}{updated&&<p className="ba-small" role="status">Last refreshed: {updated}</p>}
  {data&&<><div className="ba-totals"><section><strong>{data.total}</strong><span>School breakfast total · teacher counts</span></section><section><strong>{reported} / {rows.length}</strong><span>Teacher counts submitted</span></section><section><strong>{finished} / {rows.length}</strong><span>Packing + teacher + returns submitted</span></section></div>
   <p>{reported<rows.length?'Partial total—some teacher counts are still missing. ':'All listed teacher counts are submitted. '}This total uses certified teacher submissions only. Packing and leftover items do not add meals or change official meal-count records.</p>
   <label className="ba-dashboard-filter">Show<select value={filter} onChange={e=>setFilter(e.target.value)}>{['All','Incomplete','Needs review','Reviewed'].map(v=><option key={v}>{v}</option>)}</select></label>
   {!visible.length?<p>No classrooms match this date and filter.</p>:<div className="ba-table-scroll"><table className="ba-history-table"><thead><tr><th>Room / Teacher</th><th>Status</th><th>Meals sent</th><th>Teacher count</th><th>Returns</th><th>Review / Details</th></tr></thead><tbody>{visible.map(row=>{const d=row.record,status=breakfastStatus(d),flags=breakfastFlags(d);return <tr key={row.classroom_id}><th scope="row">{row.room}<br/><small>{row.teacher}{row.campus?` · ${row.campus}`:''}</small></th><td><span className={`ba-badge ${status.startsWith('Awaiting')?'ba-muted':''}`}>{status}</span>{flags.map(f=><p className="ba-warning" key={f}>{f}</p>)}</td><td>{d?.number_sent??'—'}</td><td>{d?.teacher_submitted_at?d.teacher_meal_count:'—'}</td><td>{d?.worker_submitted_at?countText(d.returned_counts,d.menu_snapshot):'Awaiting return count'}</td><td><details><summary>View details</summary><p>Packed: {time(d?.packing_submitted_at)}{d?.packing_worker_name?` · ${d.packing_worker_name}`:''}</p><p>{countText(d?.items_sent,d?.menu_snapshot)}</p><p>Teacher submitted: {time(d?.teacher_submitted_at)}</p><p>Returns submitted: {time(d?.worker_submitted_at)}{d?.worker_name?` · ${d.worker_name}`:''}</p>{d?.teacher_comments&&<p>Teacher: {d.teacher_comments}</p>}{d?.worker_notes&&<p>Worker: {d.worker_notes}</p>}{d?.manager_notes&&<p>Review notes: {d.manager_notes}</p>}{d?.reviewed_at&&<p>Reviewed: {time(d.reviewed_at)} · {d.reviewed_by}</p>}</details>{status==='Needs review'&&<button disabled={saving} onClick={()=>{setReview(row);setNotes(d.manager_notes||'');}}>Review</button>}</td></tr>;})}</tbody></table></div>}
   <p className="ba-small">Choose an earlier service date to review saved records. Missing submissions are tracked for the currently active classroom roster that existed on that date; saved records remain available for inactive classrooms.</p>
  </>}
  {review&&<form className="ba-review-form" onSubmit={saveReview}><h3>Review Room {review.room}</h3><p>Meals sent: {review.record.number_sent} · Teacher count: {review.record.teacher_meal_count}</p><p>Returned: {countText(review.record.returned_counts,review.record.menu_snapshot)}</p>{breakfastFlags(review.record).map(f=><p className="ba-warning" key={f}>{f}</p>)}<label>Manager review notes<textarea maxLength={2000} value={notes} disabled={saving} onChange={e=>setNotes(e.target.value)}/></label><div className="ba-actions"><button className="ba-primary" disabled={saving}>Mark reviewed</button><button type="button" disabled={saving} onClick={()=>setReview(null)}>Cancel</button></div><p>Any later packing, teacher, or return correction will require a new review.</p></form>}
 </section>;
}
