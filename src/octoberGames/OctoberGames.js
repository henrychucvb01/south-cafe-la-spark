import React,{useEffect,useRef,useState} from 'react';
import {openSession,closeSession} from '../supperMonitoring/service';
import {gamesRequest,prepareGamePhoto,useOctoberAvailable} from './service';
import './octoberGames.css';

export const DISCLAIMER='All submissions are subject to Area Food Services Supervisor approval. Photographs must clearly demonstrate completion of the challenge and be well-composed, clear, creative, and appropriate. The Supervisor has final discretion in determining whether a submission qualifies. Uploading a photo does not guarantee points.';
const day=value=>value?new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Not set';
const schoolName=(data,id)=>data.schools.find(s=>String(s.id)===String(id))?.school_name||'School';

export function OctoberBadge({location,employee,managerPin}){
 const enabled=useOctoberAvailable();const [fresh,setFresh]=useState(false);
 useEffect(()=>{if(!enabled||!employee?.id||employee.covering)return;let cancelled=false,token;
  const refresh=async()=>{try{if(!token)token=await openSession(location,employee,managerPin);if(cancelled)return;const d=await gamesRequest('badge',{token});if(!cancelled)setFresh(d.new_challenge);}catch{}finally{if(cancelled&&token)closeSession(token).catch(()=>{});}};
  refresh();const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);
  return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',refresh);if(token)closeSession(token).catch(()=>{});};
 },[enabled,location,employee,managerPin]);
 return fresh?<span className="og-badge">NEW CHALLENGE</span>:null;
}
export default function OctoberGames(props){const enabled=useOctoberAvailable();return enabled?<Games {...props}/>:null;}

function PhotoPicker({value,onChange,onError,camera=true}){
 const [loading,setLoading]=useState(false),[dragging,setDragging]=useState(false);const sequence=useRef(0);
 async function choose(file){if(!file)return;const id=++sequence.current;setLoading(true);onChange(null);onError('');try{const p=await prepareGamePhoto(file);if(id===sequence.current)onChange(p);}catch(e){onError(e.message);}finally{if(id===sequence.current)setLoading(false);}}
 return <div className="og-photo-picker"><div className={`og-dropzone ${dragging?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);choose(e.dataTransfer.files?.[0]);}}><strong>Drag & drop a photo here</strong><label>or choose a photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>choose(e.target.files?.[0])}/></label></div>{camera&&<label className="og-camera">Take a photo<input type="file" accept="image/*" capture="environment" onChange={e=>choose(e.target.files?.[0])}/></label>}{loading&&<p role="status">Preparing photo…</p>}{value&&<><img loading="lazy" src={value.preview} alt="Selected submission preview"/><small>{Math.round(value.size/1024)} KB · ready to upload</small><button type="button" onClick={()=>{sequence.current++;onChange(null);}}>Remove photo</button></>}</div>;
}
function SubmissionForm({quest,existing,run,busy,close}){
 const [photo,setPhoto]=useState(null),[note,setNote]=useState(''),[consent,setConsent]=useState(false),[error,setError]=useState('');
 return <form className="og-submit" onSubmit={async e=>{e.preventDefault();if(await run('submit',{quest,revision:existing?.revision,note,consent},photo))close();}}>
  <PhotoPicker value={photo} onChange={setPhoto} onError={setError}/>{error&&<p role="alert">{error}</p>}
  <label>{quest===3?'Teacher’s written review':'Notes (optional)'}<textarea maxLength={2000} required={quest===3} value={note} onChange={e=>setNote(e.target.value)}/></label>
  <label className="og-check"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/>I have permission to publish this photo, including permission from identifiable people shown.</label>
  <p className="og-disclaimer">{DISCLAIMER}</p><div className="og-actions"><button disabled={busy||!photo||!consent}>Submit for approval</button><button type="button" onClick={close}>Cancel</button></div>
 </form>;
}
function DoorGallery({data,run,busy,canVote}){
 return <div className="og-doors">{data.schools.filter(s=>s.participating).map(s=>{
  const own=String(s.id)===String(data.location_id),entry=data.entries.find(e=>e.quest===0&&String(e.location_id)===String(s.id));
  const approved=entry?.state==='approved',winner=String(data.settings.champion)===String(s.id);
  return <article key={s.id} className={`og-door ${winner?'og-champion':''}`}><div className="og-door-decor" aria-hidden="true">✦ 🦇 🎃 ✦</div><h4>{s.school_name}</h4>{winner&&<strong>🏆 Door Decorating Champion</strong>}
   <div className="og-door-photo">{approved?<img loading="lazy" src={entry.photo_url} alt={`${s.school_name} Halloween door`}/>:<span>🎃<br/>Awaiting Entry</span>}</div>
   {entry&&!approved&&(own||data.admin)&&<p className="og-status">{entry.state==='pending'?'Submitted — Pending Approval':entry.state==='replacement'?'New photo requested':'Not approved'}{entry.feedback&&` · ${entry.feedback}`}</p>}
   {approved&&<><span className="og-status">Approved · +10 points</span>{entry.votes!==null&&<p>{entry.votes} votes</p>}{data.vote===entry.id?<p>✓ Your vote</p>:canVote&&!own&&<button disabled={busy||!!data.vote||!data.identified} onClick={()=>window.confirm(`Cast your one vote for ${s.school_name}?`)&&run('vote',{id:entry.id})}>Vote for this school</button>}</>}
  </article>;
 })}</div>;
}
function Games({location,employee,managerPin,supervisorPin,galleryOnly=false}){
 const [data,setData]=useState(null),[tab,setTab]=useState(galleryOnly?'door':'quests'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[submission,setSubmission]=useState(null),[guess,setGuess]=useState(''),[preview,setPreview]=useState(false);
 const auth=useRef(null);const mounted=useRef(true);const admin=Boolean(supervisorPin);
 useEffect(()=>{mounted.current=true;let cancelled=false,token,timer;
  (async()=>{try{const credentials=supervisorPin?{pin:supervisorPin}:{token:token=await openSession(location,employee,managerPin)};if(cancelled)return;auth.current=credentials;
   const result=await gamesRequest(supervisorPin||galleryOnly?'list':'seen',credentials);if(!cancelled)setData(result);
   timer=setInterval(async()=>{try{const result=await gamesRequest('list',credentials);if(!cancelled)setData(result);}catch{}},30000);
  }catch(e){if(!cancelled)setError(e.message);}finally{if(cancelled&&token)closeSession(token).catch(()=>{});}})();
  return()=>{cancelled=true;mounted.current=false;clearInterval(timer);auth.current=null;if(token)closeSession(token).catch(()=>{});};
 },[supervisorPin,location,employee,managerPin,galleryOnly]);
 async function run(action,payload={},photo){if(preview&&['submit','guess','vote'].includes(action)){setNotice(action==='submit'?'Preview: this is where your photo would be sent for supervisor approval. Nothing was uploaded or saved.':action==='guess'?'Preview guess received. No real guess was used and no points were awarded.':'Preview vote only. Nothing was saved.');return true;}if(!auth.current)return false;setBusy(true);setError('');setNotice('');try{const result=await gamesRequest(action,auth.current,payload,photo);if(mounted.current){setData(result);window.dispatchEvent(new Event('october-games-updated'));setNotice(action==='guess'?(result.guess_correct?'Correct! Your school earned 25 test points. The next mystery is ready.':'Guess saved. Try again when the next mystery opens.'):action==='list'?'Updated.':'Saved.');}return true;}catch(e){if(mounted.current)setError(e.message);return false;}finally{if(mounted.current)setBusy(false);}}
 const settings=data?.settings,now=new Date(data?.server_time||Date.now());
 const voting=data?.participating&&settings?.door_state==='active'&&now>=new Date(settings.voting_start)&&now<new Date(settings.voting_end);
 const submitting=preview||(data?.participating&&settings?.door_state==='active'&&settings.submission_start&&now>=new Date(settings.submission_start)&&now<new Date(settings.submission_end));
 const ownDoor=data?.entries.find(e=>e.quest===0&&e.location_id===data.location_id);
 const round=data?.rounds.find(r=>r.id===data.current_round);
 useEffect(()=>setGuess(''),[data?.current_round]);
 return <section className="og" aria-label="October Games"><header className="og-header"><div><small>SPARK • OCTOBER GAMES</small><h2>{galleryOnly?'Halloween Door Spotlight':'A little mystery. A lot of SPARK.'}</h2><p>Development preview · rewards are test points and do not change live Cup standings.</p></div><button disabled={busy} onClick={()=>run('list')}>Refresh</button></header>
  {error&&<p role="alert" className="og-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!data?<p>Loading October Games…</p>:<>
   {!galleryOnly&&<nav className="og-tabs" aria-label="October Games sections">{[['quests','Side Quests'],['door','Halloween Doors'],['mystery','Mystery Photos'],['points','Game Standings'],...(admin?[['manage','Games & Challenges']]:[])].map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>{setTab(key);setSubmission(null);}}>{label}</button>)}</nav>}
   {!admin&&!data.participating&&!galleryOnly&&<div className="og-preview-note"><p>This school is not participating. Preview the upload and guessing controls here without switching schools.</p><button onClick={()=>{setPreview(!preview);setSubmission(null);setNotice('');}}>{preview?'Exit manager preview':'Preview manager experience'}</button>{preview&&<p><strong>Preview only:</strong> photos stay on this device. No submissions, guesses, votes, points or puzzle progress are saved.</p>}</div>}
   {!admin&&!data.identified&&<p>Voting and mystery guesses use your registered manager login. Covering managers can submit photos for their school.</p>}
   {tab==='quests'&&<><h3>Side Quests <span className="og-status">{settings.quests_state}</span></h3><p>Be the first school approved for a quest to earn 10 points. Each quest locks after its first approval. Win as many of the 15 quests as you can! Each winning completion reveals five mystery pieces.</p>
    <div className="og-grid">{data.quests.map(q=>{const entry=data.entries.find(e=>e.quest===q.id&&e.location_id===data.location_id);return <article className="og-card" key={q.id}><span className="og-points">{q.first_school?'Completed · Locked':'First school: +10'}</span><h4>{q.name}</h4><p>{q.description}</p>{q.first_school&&<p>Completed by {schoolName(data,q.first_school)}. This quest is locked.</p>}{entry&&<><p className="og-status">{entry.state==='pending'?'Submitted — Pending Approval':entry.state}</p>{entry.feedback&&<p>{entry.feedback}</p>}</>}{!admin&&!q.first_school&&(preview||(data.participating&&settings.quests_state==='active'))&&(!entry||['rejected','replacement'].includes(entry.state))&&<button disabled={busy} onClick={()=>setSubmission(q.id)}>Upload photo</button>}{submission===q.id&&<SubmissionForm quest={q.id} existing={entry} run={run} busy={busy} close={()=>setSubmission(null)}/>}</article>;})}</div>
    <h3>SPARK Trading Cards</h3><div className="og-grid">{data.entries.filter(e=>e.quest>0&&e.state==='approved').map(e=><article className="og-trading" key={e.id}><img loading="lazy" src={e.photo_url} alt={`${schoolName(data,e.location_id)} quest submission`}/><div><small>{schoolName(data,e.location_id)}</small><h4>{e.quest_name||data.quests.find(q=>q.id===e.quest)?.name||'Side Quest'}</h4><span>✦ Approved{e.awarded_points?` · +${e.awarded_points} points`:''} · 5 mystery pieces</span>{e.note&&<p>{e.note}</p>}</div></article>)}</div><p className="og-disclaimer">{DISCLAIMER}</p></>}
   {tab==='door'&&<><h3>Halloween Door Decorating Contest <span className="og-status">{settings.door_state}</span></h3><p>Submissions: {day(settings.submission_start)} – {day(settings.submission_end)}<br/>Voting: {day(settings.voting_start)} – {day(settings.voting_end)}</p>
    {!galleryOnly&&submitting&&(!ownDoor||['rejected','replacement'].includes(ownDoor.state))&&<button onClick={()=>setSubmission(0)}>Submit your school’s door</button>}
    {submission===0&&<SubmissionForm quest={0} existing={ownDoor} run={run} busy={busy} close={()=>setSubmission(null)}/>}
    {!galleryOnly&&!submitting&&!admin&&<p>Door uploads open for participating schools during the submission dates shown above. Use manager preview to see the form at a nonparticipating school.</p>}<p>10 points for approved participation · 20 additional points for the champion. One vote per registered manager; no votes for your own school. Vote totals appear when voting closes.</p>
    <DoorGallery data={data} run={run} busy={busy} canVote={voting&&!admin}/></>}
   {tab==='mystery'&&<><h3>Mystery Photo Unlock <span className="og-status">{settings.mystery_state}</span></h3><p>Five mysteries. One guess per manager for each mystery. First correct answer earns 25 points for your school.</p>
    {round?<><h4>Mystery {round.id} of 5 · {round.unlocked} / {round.piece_count||32} pieces revealed</h4><div className="og-puzzle">{round.photo_url?<><img loading="lazy" key={`${round.id}-${round.unlocked}`} src={round.photo_url} alt={`Shared mystery ${round.id}, ${round.unlocked} pieces revealed`}/>{round.pieces&&<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">{round.pieces.slice(round.unlocked).map((p,i)=><polygon key={i} points={p.map(v=>v.join(',')).join(' ')}/>)}</svg>}</>:<p>Waiting for the supervisor’s mystery artwork.</p>}</div>
     {round.guessed&&!preview?<p>Your guess is saved. The next round gives you another chance.</p>:!admin&&<form className="og-guess" onSubmit={async e=>{e.preventDefault();if(window.confirm('Submit your one guess for this mystery?')&&await run('guess',{round:round.id,guess}))setGuess('');}}><label>{preview?'Preview your guess':'Your one guess'}<input maxLength={120} required value={guess} onChange={e=>setGuess(e.target.value)}/></label><button disabled={busy||(!preview&&(!data.identified||!data.participating||settings.mystery_state!=='active'||!round.photo_url))}>Submit guess</button></form>}{!admin&&!preview&&(!data.participating||settings.mystery_state!=='active'||!round.photo_url)&&<p>Guessing opens when your school is participating and this mystery is active with its photo ready.</p>}</>:<h4>All five mysteries solved! 🎉</h4>}
    <h3>The solved collection</h3><div className="og-grid">{data.rounds.filter(r=>r.solved_at).map(r=><article className="og-card" key={r.id}><img loading="lazy" className="og-full-photo" src={r.photo_url} alt={r.answer}/><h4>{r.answer}</h4><p>🏆 {schoolName(data,r.winner)} · +25 points</p></article>)}</div></>}
   {tab==='points'&&<GamePoints data={data}/>}
   {tab==='manage'&&admin&&<Management data={data} run={run} busy={busy}/>}
  </>}
 </section>;
}
function GamePoints({data}){
 const [month,setMonth]=useState('2026-10');
 const ranked=data.schools.filter(s=>s.participating).map(s=>({...s,points:data.rewards.filter(r=>r.location_id===s.id&&!r.voided&&r.service_date.startsWith(month)).reduce((n,r)=>n+r.points,0)})).sort((a,b)=>b.points-a.points||a.school_name.localeCompare(b.school_name));
 return <><h3>October Games test standings</h3><label>Points earned in month<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><p>These are game rewards only. Live Monthly Cup and season points stay unchanged during development.</p><div className="og-table"><table><thead><tr><th>Rank</th><th>School</th><th>Test points</th></tr></thead><tbody>{ranked.map((s,i)=><tr key={s.id}><td>{ranked.findIndex(x=>x.points===s.points)+1}</td><td>{s.school_name}</td><td>{s.points}</td></tr>)}</tbody></table></div></>;
}
function Management({data,run,busy}){
 const [all,setAll]=useState(false);const cfg=data.settings;
 return <><h3>Games & Challenges</h3><p>Set participating schools, verify BIC and Supper eligibility, upload your five mystery photos, then activate the games.</p>
  <div className="og-grid">{['quests','door','mystery'].map(game=><div className="og-card" key={game}><h4>{game==='quests'?'Side Quests':game==='door'?'Door Contest':'Mystery Photos'}</h4><label>Status<select disabled={busy} value={cfg[game+'_state']} onChange={e=>run('settings',{revision:cfg.revision,game,state:e.target.value})}>{['active','paused','ended'].map(s=><option key={s}>{s}</option>)}</select></label></div>)}</div>
  <SchoolSettings key={JSON.stringify(data.schools)} data={data} run={run} busy={busy}/><Dates key={`${cfg.submission_start}-${cfg.voting_end}`} cfg={cfg} run={run} busy={busy}/>
  <details><summary>Quest instructions</summary>{data.quests.map(q=><QuestSettings key={`${q.id}-${q.revision}`} q={q} run={run} busy={busy}/>)}</details>
  <h3>Photo review</h3><label className="og-check"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>Include already reviewed entries</label>
  <div className="og-grid">{data.entries.filter(e=>all||e.state==='pending').map(e=><Review key={`${e.id}-${e.revision}`} entry={e} data={data} run={run} busy={busy}/>)}</div>
  <h3>Mystery artwork and accepted answers</h3><p>Upload your own images. Started or solved rounds are locked to preserve guesses and winners.</p><div className="og-grid">{data.rounds.map(r=><RoundSettings key={`${r.id}-${r.revision}`} round={r} run={run} busy={busy}/>)}</div>
  <h3>Confirm the door champion</h3><p>After voting ends, select the highest-voted school. If schools tie, select the winner from that tie.</p><div className="og-actions">{data.entries.filter(e=>e.quest===0&&e.state==='approved').map(e=><button disabled={busy||!cfg.voting_end||new Date(data.server_time)<new Date(cfg.voting_end)||!!cfg.champion} key={e.id} onClick={()=>window.confirm(`Confirm ${schoolName(data,e.location_id)} as champion?`)&&run('champion',{location_id:e.location_id})}>{schoolName(data,e.location_id)} · {e.votes??'votes hidden'}</button>)}</div>
  <details><summary>Guesses, unlocks and awarded points</summary><h4>Guesses</h4><div className="og-table"><table><thead><tr><th>Round</th><th>School</th><th>Manager ID</th><th>Guess</th><th>Result</th><th>Submitted</th></tr></thead><tbody>{data.guesses.map(g=><tr key={`${g.round}-${g.employee_id}`}><td>{g.round}</td><td>{schoolName(data,g.location_id)}</td><td>{g.employee_id}</td><td>{g.guess}</td><td>{g.correct?'Correct':'Incorrect'}</td><td>{day(g.submitted_at)}</td></tr>)}</tbody></table></div>
   <p>{data.unlock_events.length} quest unlock events recorded. Each event awards five pieces once; pieces stop at the end of the current puzzle.</p><h4>Points and corrections</h4><div className="og-table"><table><thead><tr><th>School</th><th>Source</th><th>Date</th><th>Points</th><th>Correction</th></tr></thead><tbody>{data.rewards.map(r=><tr key={r.event}><td>{schoolName(data,r.location_id)}</td><td>{r.event.startsWith('mystery')?'Mystery winner':r.event==='door:champion'?'Door champion':'Approved photo'}</td><td>{r.service_date}</td><td>{r.voided?'Voided':r.points}</td><td><button disabled={busy} onClick={()=>{const reason=window.prompt('Reason for this points correction:');if(reason)run('reward',{event:r.event,voided:!r.voided,reason});}}>{r.voided?'Restore':'Void'} award</button>{r.reason&&<small>{r.reason}</small>}</td></tr>)}</tbody></table></div>
  </details></>;
}
function SchoolSettings({data,run,busy}){
 const [selected,setSelected]=useState(data.schools.filter(s=>s.participating).map(s=>s.id));
 return <details><summary>Participating schools · {selected.length} selected</summary><form onSubmit={e=>{e.preventDefault();run('settings',{revision:data.settings.revision,schools:selected});}}><div className="og-school-options">{data.schools.map(s=><label className="og-check" key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(e.target.checked?[...selected,s.id]:selected.filter(id=>id!==s.id))}/>{s.school_name}</label>)}</div><button disabled={busy}>Apply schools</button></form></details>;
}
function Dates({cfg,run,busy}){
 const fields=['submission_start','submission_end','voting_start','voting_end'];const local=v=>{if(!v)return '';const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
 const [values,setValues]=useState(Object.fromEntries(fields.map(f=>[f,local(cfg[f])])));
 return <details><summary>Door submission and voting dates</summary><form onSubmit={e=>{e.preventDefault();run('settings',{revision:cfg.revision,...Object.fromEntries(fields.map(f=>[f,new Date(values[f]).toISOString()]))});}}><p>Times use your device’s time zone. Voting dates lock after the first vote.</p><div className="og-grid">{fields.map(f=><label key={f}>{f.replace('_',' ')}<input type="datetime-local" required value={values[f]} onChange={e=>setValues({...values,[f]:e.target.value})}/></label>)}</div><button disabled={busy}>Save dates</button></form></details>;
}
function QuestSettings({q,run,busy}){
 const [name,setName]=useState(q.name),[description,setDescription]=useState(q.description),[enabled,setEnabled]=useState(q.enabled);
 return <details><summary>{q.name}</summary><form onSubmit={e=>{e.preventDefault();run('quest',{id:q.id,revision:q.revision,name,description,enabled,eligible:q.eligible??null});}}><label>Name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>Instructions<textarea required maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)}/></label><label className="og-check"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Quest enabled</label><button disabled={busy}>Save quest</button></form></details>;
}
function Review({entry:e,data,run,busy}){const [feedback,setFeedback]=useState(e.feedback);return <article className="og-card"><h4>{schoolName(data,e.location_id)}</h4><p>{e.quest===0?'Halloween Door':data.quests.find(q=>q.id===e.quest)?.name} · {e.state}</p><img loading="lazy" className="og-full-photo" src={e.photo_url} alt="Submission for review"/>{e.note&&<p>{e.note}</p>}<label>Feedback<textarea maxLength={1000} value={feedback} onChange={x=>setFeedback(x.target.value)}/></label><div className="og-actions">{[['approved','Approve'],['rejected','Reject'],['replacement','Request new photo']].map(([state,label])=><button disabled={busy||e.state===state} key={state} onClick={()=>run('review',{id:e.id,revision:e.revision,state,feedback})}>{label}</button>)}</div></article>;}
function RoundSettings({round:r,run,busy}){
 const [photo,setPhoto]=useState(null),[answer,setAnswer]=useState(r.answer||''),[aliases,setAliases]=useState((r.aliases||[]).join('\n')),[error,setError]=useState('');
 return <form className="og-card" onSubmit={async e=>{e.preventDefault();if(await run('round',{id:r.id,revision:r.revision,answer,aliases:aliases.split('\n').map(s=>s.trim()).filter(Boolean)},photo))setPhoto(null);}}><h4>Mystery {r.id}</h4>{r.photo_url&&<img loading="lazy" className="og-full-photo" src={r.photo_url} alt={`Mystery ${r.id} supervisor preview`}/>}<PhotoPicker camera={false} value={photo} onChange={setPhoto} onError={setError}/>{error&&<p role="alert">{error}</p>}<label>Accepted answer<input required maxLength={120} value={answer} onChange={e=>setAnswer(e.target.value)}/></label><label>Alternative spellings (one per line)<textarea value={aliases} onChange={e=>setAliases(e.target.value)}/></label><button disabled={busy||!!r.solved_at||r.unlocked>0}>Save mystery</button></form>;
}
