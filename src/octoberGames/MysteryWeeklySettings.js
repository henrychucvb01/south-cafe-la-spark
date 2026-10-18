import React,{useState} from 'react';

export function MysteryPricing({collection,busy,run}){
 const fields=[['guess_first_price','First extra guess',10],['guess_next_price','Second extra guess',25],['guess_multiplier','Next guess multiplier',2],['unlock_single_price','1 unlock credit',5],['unlock_bundle_price','5 unlock credits',20]];
 const [values,setValues]=useState(()=>Object.fromEntries(fields.map(([key,,fallback])=>[key,collection[key]??fallback])));
 const [saved,setSaved]=useState(false);
 return <form className="mc-pricing" onSubmit={async e=>{e.preventDefault();setSaved(false);if(await run('collection_pricing',{collection_id:collection.id,collection_revision:collection.revision,...Object.fromEntries(Object.entries(values).map(([key,value])=>[key,Number(value)]))}))setSaved(true);}}>
  <h4>Monthly Pricing</h4><div className="mc-toolbar">{fields.map(([key,label])=><label key={key}>{label}<input type="number" min={key==='guess_multiplier'?2:1} max={key==='guess_multiplier'?10:10000} step="1" required value={values[key]} disabled={busy||collection.state==='archived'} onChange={e=>{setSaved(false);setValues({...values,[key]:e.target.value});}}/></label>)}<button disabled={busy||collection.state==='archived'}>Save prices</button></div>
  <p>SPARK Points. Extra-guess prices progress per school across the entire month, not each photo or week. Existing purchases are unchanged.</p>{saved&&<p role="status">Prices saved.</p>}
 </form>;
}

export const losAngelesInput=value=>{
 if(!value)return '';
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

export function MysteryWeek({week,collection,items,renderRow,busy,run}){
 const [release,setRelease]=useState(()=>losAngelesInput(week.release_at));
 const ready=items.filter(r=>r.photo_url&&r.answer&&r.pieces?.length===r.piece_count).length;
 const released=week.state==='released',scheduled=week.state==='scheduled';
 return <details className="mc-week"><summary>Week {week.week} · Photos {(week.week-1)*5+1}–{week.week*5} · {released?'Released':scheduled?'Scheduled':`${ready}/5 ready`}</summary>
  <div className="mc-toolbar"><label>Release date and time · Los Angeles<input type="datetime-local" required value={release} disabled={busy||released||scheduled||collection.state==='archived'} onChange={e=>setRelease(e.target.value)}/></label>
   {!released&&collection.state!=='archived'&&(scheduled?<button disabled={busy} onClick={()=>run('collection_unschedule',{collection_id:collection.id,collection_revision:collection.revision,week:week.week,revision:week.revision})}>Unschedule to edit</button>:<button disabled={busy||ready!==5||!release} onClick={()=>{if(window.confirm(`Schedule these five Mystery Photos for ${release.replace('T',' ')} Los Angeles time?`))run('collection_schedule',{collection_id:collection.id,collection_revision:collection.revision,week:week.week,revision:week.revision,release_local:release,confirmed:true});}}>Schedule 5 photos</button>)}
  </div><div className="mc-table"><table><thead><tr><th>#</th><th>Photo</th><th>SPARK Points</th><th>Pieces</th><th>Status</th><th>Actions</th></tr></thead><tbody>{items.map(renderRow)}</tbody></table></div>
 </details>;
}
