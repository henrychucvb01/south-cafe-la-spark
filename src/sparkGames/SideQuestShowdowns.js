import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import './sideQuestShowdowns.css';

const name=(data,id)=>data.schools.find(s=>String(s.id)===String(id))?.school_name||'School';
const date=value=>new Date(value).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
export function showdownChampion(data,quest){return data.showdowns?.champions?.find(c=>c.quest===quest.id);}
export function canChallenge(data,quest){
 const sd=data.showdowns;if(!sd||data.admin||!data.identified||!data.participating||!quest.first_school||String(quest.first_school)===String(data.location_id)||!sd.eligible_quests.includes(quest.id)||sd.used.includes(quest.id))return false;
 if(sd.submissions.some(s=>s.quest===quest.id&&s.state==='pending'))return false;
 const round=sd.rounds.find(r=>r.quest===quest.id&&r.state!=='finalized');return !round||(round.state==='voting'&&round.photos.length<3);
}
export function ShowdownCardTools({data,quest,onChallenge}){
 if(!data.showdowns)return null;
 const history=data.showdowns.rounds.filter(r=>r.quest===quest.id&&r.state==='finalized');
 const pending=data.showdowns.submissions.some(s=>s.quest===quest.id&&s.state==='pending');
 return <div className="sd-card-tools">{canChallenge(data,quest)&&<button type="button" onClick={()=>onChallenge(quest)}>Challenge</button>}{!data.admin&&pending&&<small>Your challenge is awaiting approval.</small>}{history.length>0&&<details><summary>Challenge history · {history.length}</summary>{history.map(r=>{const winning=r.photos.find(p=>p.id===r.winner);return <div key={r.id}>{r.photos.filter(p=>p.role==='challenger').map(p=><p key={p.id}>{p.id===r.winner?'👑':'🥊'} {p.school_name} challenged {name(data,r.defender)}{p.id===r.winner?' and claimed the crown!':'… and lost!'} <small>{date(r.finalized_at)}</small></p>)}<small>Champion: {winning?.school_name}</small></div>;})}</details>}</div>;
}
function Dialog({title,onClose,children}){
 const ref=useRef(null);useEffect(()=>{ref.current?.showModal?.();},[]);
 return createPortal(<dialog ref={ref} className="sd-dialog" aria-label={title} onCancel={e=>{e.preventDefault();onClose();}}><header><h3>{title}</h3><button type="button" title="Close" aria-label="Close showdown dialog" onClick={onClose}>×</button></header>{children}</dialog>,document.body);
}
function Submission({quest,data,run,busy,onClose,PhotoPicker}){
 const [photo,setPhoto]=useState(null),[consent,setConsent]=useState(false),[note,setNote]=useState(''),[error,setError]=useState('');const request=useRef(null),inFlight=useRef(false);
 const champion=showdownChampion(data,quest)||data.entries.find(e=>e.quest===quest.id&&String(e.location_id)===String(quest.first_school)&&e.state==='approved');
 return <Dialog title={`Challenge: ${quest.name}`} onClose={()=>!busy&&onClose()}><form onSubmit={async e=>{e.preventDefault();if(inFlight.current||busy||!photo||!consent)return;if(!window.confirm('Submit this photograph for Supervisor approval? This challenge is free.'))return;request.current??=crypto.randomUUID();inFlight.current=true;try{if(await run('showdown_submit',{quest:quest.id,note,consent,confirmed:true,request_id:request.current},photo))onClose();}finally{inFlight.current=false;}}}>
  <p>{quest.description}</p>{quest.goal&&<p><strong>The Challenge:</strong> {quest.goal}</p>}<strong>Current champion: {name(data,quest.first_school)}</strong>{champion?.photo_url&&<img className="sd-original" src={champion.photo_url} alt={`${name(data,quest.first_school)} current winning photograph`}/>}
  <PhotoPicker value={photo} onChange={setPhoto} onError={setError}/>{error&&<p role="alert">{error}</p>}<label>Notes (optional)<textarea maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label><label className="og-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/>I have permission to publish this photograph and it represents the original Side Quest.</label><div className="og-actions"><button disabled={busy||!photo||!consent}>Submit challenge for approval</button><button type="button" disabled={busy} onClick={onClose}>Cancel</button></div>
 </form></Dialog>;
}
function Countdown({closesAt,serverTime}){
 const [now,setNow]=useState(Date.now());const offset=new Date(serverTime||Date.now()).getTime()-Date.now();const reference=useRef(offset);useEffect(()=>{reference.current=offset;},[serverTime]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const seconds=Math.max(0,Math.ceil((new Date(closesAt).getTime()-now-reference.current)/1000));
 return <span className="sd-countdown" role="timer">{seconds?`${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m ${seconds%60}s remaining`:'Awaiting Supervisor Decision'}</span>;
}
function Round({round:r,data,run,busy,onZoom}){
 const q=data.quests.find(q=>q.id===r.quest),total=r.photos.reduce((sum,p)=>sum+p.votes,0),closed=r.state!=='voting'||new Date(r.closes_at)<=new Date(data.server_time||Date.now());const requests=useRef({});
 async function decide(photo){if(busy||!window.confirm(`Confirm ${photo.school_name} as champion? The Supervisor's choice is final. A challenger receives the full reward and 3 unlock credits. The previous champion's points stop at zero; any shortfall is recorded.`))return;const key=photo.id;requests.current[key]??=crypto.randomUUID();await run('showdown_finalize',{round_id:r.id,photo:photo.id,revision:r.revision,confirmed:true,request_id:requests.current[key]});}
 return <section className="sd-round"><header><div><h4>{r.quest_name||q?.name||'Side Quest Showdown'}</h4><span>Defending champion: {name(data,r.defender)}</span></div>{r.state==='finalized'?<strong>Champion: {r.photos.find(p=>p.id===r.winner)?.school_name}</strong>:<Countdown closesAt={r.closes_at} serverTime={data.server_time}/>}</header><p>{r.quest_description||q?.description}</p>{(r.quest_goal||q?.goal)&&<p><strong>The Challenge:</strong> {r.quest_goal||q.goal}</p>}
  <div className="sd-comparison" style={{'--sd-columns':r.photos.length}}>{r.photos.map(p=>{const selected=r.my_vote===p.id,own=String(p.location_id)===String(data.location_id),percent=total?Math.round(p.votes/total*100):0;return <article className={`sd-photo ${p.id===r.winner?'sd-winner':''}`} key={p.id}><button className="sd-enlarge" title={`Enlarge ${p.school_name} photograph`} onClick={()=>onZoom({url:p.photo_url,school:p.school_name})} disabled={!p.photo_url}>{p.photo_url?<img src={p.photo_url} alt={`${p.school_name} competing photograph`}/>:<span>Photo unavailable</span>}</button><strong>{p.school_name}</strong><small>{p.role==='defender'?'Defending champion':'Challenger'}</small><div className="sd-result"><span>{p.votes} {p.votes===1?'vote':'votes'} · {percent}%</span><progress value={p.votes} max={Math.max(total,1)} aria-label={`${p.school_name}: ${p.votes} votes, ${percent}%`}/></div>
   {!data.admin&&r.state==='voting'&&<button disabled={busy||closed||own||!data.identified||!data.participating} aria-pressed={selected} onClick={()=>run('showdown_vote',{round_id:r.id,generation:r.generation,photo:p.id})}>{own?'Your school':selected?'Your vote':'Vote for this photo'}</button>}
   {data.admin&&r.state==='decision'&&<button disabled={busy} onClick={()=>decide(p)}>Select as champion</button>}</article>;})}</div>
  {r.state!=='finalized'&&<p className="sd-final-discretion">Community votes help the supervisor evaluate the photos. The supervisor makes the final decision.</p>}{data.admin&&r.state==='finalized'&&<details><summary>Reward transactions</summary><p>{r.points_recovered??0} points recovered · {r.points_shortfall??0} points unrecovered under the zero-floor policy.</p><ul>{(r.reward_events||[]).map(e=><li key={e.event}>{e.event.startsWith('quest:first:')?'Original award':e.event.endsWith(':reversal')?'Reversal':'Champion award'} · {name(data,e.location_id)} · {e.points} SPARK Points · {e.service_date}</li>)}</ul></details>}
  {data.admin&&r.vote_activity?.length>0&&<details><summary>Voting activity · {r.vote_activity.length}</summary><ul>{r.vote_activity.map(v=><li key={`${v.generation}:${v.location_id}`}>Round {v.generation} · {name(data,v.location_id)} → {r.photos.find(p=>p.id===v.photo)?.school_name} · {date(v.updated_at)}</li>)}</ul></details>}
 </section>;
}
function Review({submission:s,data,run,busy,onZoom}){
 const [feedback,setFeedback]=useState('');const q=data.quests.find(q=>q.id===s.quest);
 return <div className="sd-review"><div><strong>{q?.name||'Side Quest'}</strong><p>{s.school_name} challenges {name(data,s.target_school)}</p><small>{date(s.submitted_at)}</small></div><div className="sd-review-photos">{[[s.target_photo_url,'Current champion'],[s.photo_url,'Challenger']].map(([url,label])=><button key={label} title={`Enlarge ${label.toLowerCase()} photo`} onClick={()=>onZoom({url,school:label})} disabled={!url}>{url&&<img src={url} alt={label}/>}<span>{label}</span></button>)}</div><div className="og-actions"><button disabled={busy} onClick={()=>window.confirm('Approve this challenge? Voting starts for 24 hours. Adding a second challenger resets the current votes and restarts the timer.')&&run('showdown_approve',{id:s.id,revision:s.revision})}>Approve</button><button disabled={busy} onClick={()=>window.confirm('Reject this photograph? The school can correct and resubmit while the competition remains open.')&&run('showdown_reject',{id:s.id,revision:s.revision,feedback})}>Reject</button></div><details><summary>View Details</summary><p>{q?.description}</p><p>{q?.goal}</p>{s.note&&<p>{s.note}</p>}<label>Private review notes<textarea maxLength={1000} value={feedback} onChange={e=>setFeedback(e.target.value)}/></label></details></div>;
}
export default function SideQuestShowdowns({data,run,busy,challengeQuest,onCloseChallenge,PhotoPicker}){
 const [zoom,setZoom]=useState(null);const sd=data.showdowns;if(!sd)return null;
 const active=sd.rounds.filter(r=>r.state!=='finalized'),history=sd.rounds.filter(r=>r.state==='finalized'),pending=sd.submissions.filter(s=>s.state==='pending');
 return <section className="sd"><h3>{data.admin?'Side Quest Challenges':'Side Quest Showdowns'}</h3>{data.admin&&<><h4>Pending photographs · {pending.length}</h4>{pending.map(s=><Review key={s.id} submission={s} data={data} run={run} busy={busy} onZoom={setZoom}/>)}{!pending.length&&<p>No challenge photographs awaiting review.</p>}</>}
  {active.map(r=><Round key={r.id} round={r} data={data} run={run} busy={busy} onZoom={setZoom}/>)}
  {!data.admin&&sd.submissions.filter(s=>s.state==='rejected').map(s=><p key={s.id} className="sd-status">Your photograph for {data.quests.find(q=>q.id===s.quest)?.name||'this quest'} was not approved. You may submit a corrected photo while eligible.</p>)}
  {!!history.length&&<details className="sd-history"><summary>Showdown photographs & history · {history.length}</summary>{history.map(r=><Round key={r.id} round={r} data={data} run={run} busy={busy} onZoom={setZoom}/>)}</details>}
  {challengeQuest&&<Submission key={challengeQuest.id} quest={challengeQuest} data={data} run={run} busy={busy} onClose={onCloseChallenge} PhotoPicker={PhotoPicker}/>}
  {zoom&&<Dialog title={`${zoom.school} photograph`} onClose={()=>setZoom(null)}><img className="sd-zoom" src={zoom.url} alt={`${zoom.school} enlarged photograph`}/></Dialog>}
 </section>;
}
