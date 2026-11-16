import React,{useState} from 'react';
import {doorStyle,doorTheme} from './DoorContestSettings';
export default function DoorContestHistory({history,load}){
 const [detail,setDetail]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!history.length)return null;
 async function select(contest){setDetail(null);setError('');if(!contest)return;setBusy(true);try{const result=await load(Number(contest));setDetail(result.door_history_detail);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <details className="og-door-history"><summary>Past decoration contests</summary><label>View past contest<select defaultValue="" disabled={busy} onChange={e=>select(e.target.value)}><option value="">Choose a contest</option>{history.map(h=><option key={h.id} value={h.id}>{h.title}</option>)}</select></label>{busy&&<p role="status">Loading past contest…</p>}{error&&<p role="alert">{error}</p>}{detail&&<><h4>{detail.settings.door_title} · Results preserved</h4><div className="og-grid">{detail.entries.map(e=><article key={e.id} className="og-door" style={doorStyle(detail.settings)}><span>{doorTheme(detail.settings).decor}</span><h4>{e.school_name}{String(e.location_id)===String(detail.settings.champion)?' · Champion 🏆':''}</h4><img loading="lazy" src={e.photo_url} alt={`${e.school_name} decoration contest`}/><p>{e.state} · {e.votes} votes · {e.awarded_points} participation points</p></article>)}</div></>}</details>;
}
