import React,{useEffect,useRef,useState} from 'react';
import {TYPES,HELP,visibleRewards} from './model';
import {rewardsRequest} from './service';
import {openSession,closeSession} from '../supperMonitoring/service';
import './rewards.css';
import RewardDetails from './RewardDetails';
export function RewardsPage({data,preview=false,onlyReward,onBack,run,busy,error,message,onRefresh}){
 const [type,setType]=useState('all'),[drafts,setDrafts]=useState(true);
 if(!preview&&(!data?.manager_enabled||!data?.launch_ready))return <section className="sr"><h1>SPARK Rewards</h1><p>Rewards is not available yet.</p>{onBack&&<button onClick={onBack}>Back to Daily Bites</button>}</section>;
 const cards=visibleRewards(onlyReward?data.catalog.filter(r=>r.id===onlyReward):data.catalog,{preview,includeDrafts:preview&&drafts,type});
 return <section className="sr sr-manager"><header className="sr-page-heading"><div>{preview&&<strong className="sr-preview-label">Supervisor Preview · Read-only</strong>}<h1>SPARK Rewards</h1><p>Your points. Your rewards. Your fun.</p></div><div className="sr-balance"><span>School season balance</span><strong>{data.location_id?Number(data.balance).toLocaleString()+' SPARK Points':'Select a school'}</strong></div></header>
  {onBack&&<button onClick={onBack}>Back to Daily Bites</button>}{onRefresh&&<button disabled={busy} onClick={onRefresh}>Refresh rewards</button>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  <nav className="sr-filters" aria-label="Reward categories">{[['all','All Rewards'],...Object.entries(TYPES)].map(([key,label])=><button key={key} aria-pressed={type===key} onClick={()=>setType(key)}>{label}</button>)}</nav>
  {preview&&<label className="sr-check"><input type="checkbox" checked={drafts} onChange={e=>setDrafts(e.target.checked)}/>Include unpublished and inactive rewards</label>}
  <div className="sr-reward-grid">{cards.map(r=><article className="sr-reward" key={r.id}>{r.image_url?<img className="sr-reward-image" src={r.image_url} referrerPolicy="no-referrer" alt={r.name}/>:<div className="sr-reward-icon" aria-hidden="true">{r.icon||'🎁'}</div>}<div className="sr-card-body"><div className="sr-card-status"><span>{TYPES[r.type]}</span><details className="sr-help"><summary title={HELP[r.type]} aria-label={`About ${TYPES[r.type]}`}>?</summary><p>{HELP[r.type]}</p></details>{r.status==='draft'&&<strong>Draft</strong>}{!r.active&&<span>Inactive</span>}</div><h2>{r.name}</h2><p>{r.description||'Description not configured.'}</p><RewardDetails reward={r} school={data.location_id}/>
   <RewardAction reward={r} preview={preview} run={run} busy={busy}/></div></article>)}</div>
  {!cards.length&&<p role="status">No rewards in this category.</p>}<h2>My Rewards Activity</h2>{data.activity?.length?<div className="sr-table"><table><thead><tr><th>Reward</th><th>Action</th><th>Points</th><th>Status</th></tr></thead><tbody>{data.activity.map(t=><tr key={t.request_id}><td>{t.reward_name}</td><td>{t.kind}</td><td>{Number(t.amount).toLocaleString()}</td><td>{t.refunded?'Points returned':t.fulfilled?'Fulfilled':t.auction_won?'Auction won':t.kind==='bid'?'Points reserved for bid':'Awaiting fulfillment'}</td></tr>)}</tbody></table></div>:<p>No rewards activity.</p>}
 </section>;
}

function RewardAction({reward:r,preview,run,busy}){
 const [amount,setAmount]=useState('');
 const label=r.type==='pool'||r.type==='wheel'?'Contribute Points':r.type==='fixed'?(r.claimed?'Claimed':'Redeem'):'Place Bid';
 if(preview)return <button disabled title="Read-only Supervisor preview">{label}</button>;
 const remaining=Math.max(0,Number(r.config.goal||0)-Number(r.contributed||0));
 const nextBid=r.auction?.highest_bid?Number(r.auction.highest_bid)+Number(r.config.increment||1):Number(r.config.starting_bid||0);
 const disabled=busy||!run||r.fulfillment==='fulfilled'||r.fulfillment==='canceled'||(r.type==='fixed'&&(r.claimed||r.sold_out))||(['pool','wheel'].includes(r.type)&&remaining<=0);
 async function submit(event){event.preventDefault();const cost=r.type==='fixed'?Number(r.config.price):Number(amount||nextBid);if(!window.confirm(`${r.type==='auction'?'Reserve':'Spend'} ${cost.toLocaleString()} school SPARK Points for ${r.name}?${r.type==='auction'?' Points return automatically if your school is outbid.':''}`))return;
  if(await run(r.type==='fixed'?'claim':r.type==='auction'?'bid':'contribute',{id:r.id,revision:r.revision,amount:cost,confirmed:true}))setAmount('');
 }
 return <form onSubmit={submit} className="sr-reward-action">{r.type!=='fixed'&&<label>{r.type==='auction'?'Your bid (SPARK Points)':'Contribution (SPARK Points)'}<input type="number" required min={r.type==='auction'?nextBid:Number(r.config.minimum)||1} max={r.type==='auction'?2147483647:Math.min(remaining,Number(r.config.maximum)||2147483647)} step="1" value={amount} placeholder={r.type==='auction'?String(nextBid):''} disabled={disabled} onChange={e=>setAmount(e.target.value)}/></label>}<button disabled={disabled}>{label}</button></form>;
}
export default function ManagerRewards({location,employee,managerPin,onBack}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const latest=useRef(null);useEffect(()=>{latest.current=data;},[data]);
 const tokenRef=useRef(null),inFlight=useRef(false),requests=useRef(new Map()),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;let alive=true,token,timer;
  const refresh=async()=>{if(!alive||document.visibilityState==='hidden'||inFlight.current||!latest.current?.catalog.some(r=>r.type==='auction'&&new Date(r.opens_at)<=new Date()))return;try{const result=await rewardsRequest('manager_context',null,{},token);if(alive)setData(result);}catch{}};
  (async()=>{try{token=await openSession(location,employee,managerPin);if(!alive){await closeSession(token);return;}tokenRef.current=token;const result=await rewardsRequest('manager_context',null,{},token);if(alive){setData(result);timer=setInterval(refresh,30000);}}catch(e){if(alive)setError(e.message);}})();
  return()=>{alive=false;mounted.current=false;clearInterval(timer);tokenRef.current=null;if(token)closeSession(token).catch(()=>{});};
 },[location,employee,managerPin]);
 async function run(action,payload={}){if(!tokenRef.current||inFlight.current)return false;inFlight.current=true;setBusy(true);setError('');setMessage('');
  const key=JSON.stringify([action,payload.id,payload.amount]);if(action!=='manager_context'&&!requests.current.has(key))requests.current.set(key,crypto.randomUUID());
  try{const result=await rewardsRequest(action,null,{...payload,...(action!=='manager_context'?{request_id:requests.current.get(key)}:{})},tokenRef.current);requests.current.delete(key);if(mounted.current){setData(result);setMessage(action==='manager_context'?'Updated.':'Saved. School points and rewards activity are updated.');}return true;}
  catch(e){if(mounted.current){setError(e.message);try{const latest=await rewardsRequest('manager_context',null,{},tokenRef.current);if(mounted.current)setData(latest);}catch{}}return false;}
  finally{inFlight.current=false;if(mounted.current)setBusy(false);}
 }
 if(!data)return <section className="sr"><h1>SPARK Rewards</h1>{error?<p role="alert">{error}</p>:<p>Checking Rewards availability...</p>}<button onClick={onBack}>Back to Daily Bites</button></section>;
 return <RewardsPage data={data} onBack={onBack} run={run} busy={busy} error={error} message={message} onRefresh={()=>run('manager_context')}/>;
}
