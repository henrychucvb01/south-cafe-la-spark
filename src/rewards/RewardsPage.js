import React,{useEffect,useState} from 'react';
import {TYPES,HELP,visibleRewards} from './model';
import {rewardsRequest} from './service';
import {openSession,closeSession} from '../supperMonitoring/service';
import './rewards.css';
import RewardDetails from './RewardDetails';
export function RewardsPage({data,preview=false,onlyReward,onBack}){
 const [type,setType]=useState('all'),[drafts,setDrafts]=useState(true);
 if(!preview&&(!data?.manager_enabled||!data?.launch_ready))return <section className="sr"><h1>SPARK Rewards</h1><p>Rewards is not available yet.</p>{onBack&&<button onClick={onBack}>Back to Daily Bites</button>}</section>;
 const cards=visibleRewards(onlyReward?data.catalog.filter(r=>r.id===onlyReward):data.catalog,{preview,includeDrafts:preview&&drafts,type});
 return <section className="sr sr-manager"><header className="sr-page-heading"><div>{preview&&<strong className="sr-preview-label">Supervisor Preview · Read-only</strong>}<h1>SPARK Rewards</h1><p>Your points. Your rewards. Your fun.</p></div><div className="sr-balance"><span>School season balance</span><strong>{data.location_id?Number(data.balance).toLocaleString()+' SPARK Points':'Select a school'}</strong></div></header>
  <nav className="sr-filters" aria-label="Reward categories">{[['all','All Rewards'],...Object.entries(TYPES)].map(([key,label])=><button key={key} aria-pressed={type===key} onClick={()=>setType(key)}>{label}</button>)}</nav>
  {preview&&<label className="sr-check"><input type="checkbox" checked={drafts} onChange={e=>setDrafts(e.target.checked)}/>Include unpublished and inactive rewards</label>}
  <div className="sr-reward-grid">{cards.map(r=><article className="sr-reward" key={r.id}>{r.image_url?<img className="sr-reward-image" src={r.image_url} referrerPolicy="no-referrer" alt={r.name}/>:<div className="sr-reward-icon" aria-hidden="true">{r.icon||'🎁'}</div>}<div className="sr-card-body"><div className="sr-card-status"><span>{TYPES[r.type]}</span><details className="sr-help"><summary title={HELP[r.type]} aria-label={`About ${TYPES[r.type]}`}>?</summary><p>{HELP[r.type]}</p></details>{r.status==='draft'&&<strong>Draft</strong>}{!r.active&&<span>Inactive</span>}</div><h2>{r.name}</h2><p>{r.description||'Description not configured.'}</p><RewardDetails reward={r} school={data.location_id}/>
   <button disabled title={preview?'Read-only Supervisor preview':'Participation is not enabled'}>{r.type==='pool'||r.type==='wheel'?'Contribute Points':r.type==='fixed'?(r.claimed?'Claimed':'Redeem'):'Place Bid'}</button></div></article>)}</div>
  {!cards.length&&<p role="status">No rewards in this category.</p>}<h2>My Rewards Activity</h2><p>No rewards activity.</p>
 </section>;
}
export default function ManagerRewards({location,employee,managerPin,onBack}){
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true,token;async function load(){try{token=await openSession(location,employee,managerPin);const result=await rewardsRequest('manager_context',null,{},token);if(alive)setData(result);}catch(e){if(alive)setError(e.message);}finally{if(token)await closeSession(token).catch(()=>{});}}load();return()=>{alive=false;};},[location,employee,managerPin]);
 if(error)return <section className="sr"><h1>SPARK Rewards</h1><p role="alert">{error}</p><button onClick={onBack}>Back to Daily Bites</button></section>;
 return data?<RewardsPage data={data} onBack={onBack}/>:<section className="sr"><p>Checking Rewards availability...</p><button onClick={onBack}>Back to Daily Bites</button></section>;
}
