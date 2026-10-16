import MysteryPuzzle from './MysteryPuzzle';
import MysteryCollections from './MysteryCollections';
import CompletedMysteryCollection from './CompletedMysteryCollection';
import CycleDates from '../sparkGames/CycleDates';
import CompletedCollection from '../sparkGames/CompletedCollection';
import ChallengePlanner from '../sparkGames/ChallengePlanner';
import QuestHistory from '../sparkGames/QuestHistory';
import MysteryGuessControls from './MysteryGuessControls';
import MysteryUnlockControls from './MysteryUnlockControls';
import {remainingUnlocks} from './mysteryUnlocks';
import React,{useEffect,useRef,useState} from 'react';
import {openSession,closeSession} from '../supperMonitoring/service';
import {gamesRequest,prepareGamePhoto,useOctoberAvailable} from './service';
import './octoberGames.css';
import DoorContestSettings,{doorTheme,doorStyle} from './DoorContestSettings';

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
  return <article key={s.id} className={`og-door ${winner?'og-champion':''}`} style={doorStyle(data.settings)}><div className="og-door-decor" aria-hidden="true">{doorTheme(data.settings).decor}</div><h4>{s.school_name}</h4>{winner&&<strong>🏆 Door Decorating Champion</strong>}
   <div className="og-door-photo">{approved?<img loading="lazy" src={entry.photo_url} alt={`${s.school_name} door entry`}/>:<span>Awaiting Entry</span>}</div>
   {entry&&!approved&&(own||data.admin)&&<p className="og-status">{entry.state==='pending'?'Submitted — Pending Approval':entry.state==='replacement'?'New photo requested':'Not approved'}{entry.feedback&&` · ${entry.feedback}`}</p>}
   {approved&&<><span className="og-status">Approved{entry.awarded_points>0?` · +${entry.awarded_points} SPARK Points`:""}</span>{entry.votes!==null&&<p>{entry.votes} votes</p>}{data.vote===entry.id?<p>✓ Your vote</p>:canVote&&!own&&<button disabled={busy||!!data.vote||!data.identified} onClick={()=>window.confirm(`Cast your one vote for ${s.school_name}?`)&&run('vote',{id:entry.id})}>Vote for this school</button>}</>}
  </article>;
 })}</div>;
}
function QuestCard({quest,school,photo,example=false,children}){
 const completed=example||Boolean(quest.first_school);
 const [reduced,setReduced]=useState(()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
 const [flipped,setFlipped]=useState(reduced);
 useEffect(()=>{
  const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const change=()=>setReduced(Boolean(media?.matches));
  media?.addEventListener?.('change',change);
  return()=>media?.removeEventListener?.('change',change);
 },[]);
 useEffect(()=>{
  if(!completed)return;
  if(reduced){setFlipped(true);return;}
  const timer=setTimeout(()=>setFlipped(true),2000);
  return()=>clearTimeout(timer);
 },[completed,reduced]);
 if(!completed)return <article className="og-card og-quest-card">{children}</article>;
 return <button type="button" className={`og-completed ${flipped?'is-flipped':''} ${!reduced?'is-animated':''}`} aria-pressed={flipped} aria-label={`${quest.name} — completed by ${school}. Reward: ${quest.reward_points??10} SPARK Points. ${flipped?'Show quest description':'Show winning photo'}`} onClick={()=>setFlipped(value=>!value)}>
  <span className="og-flip-inner">
   <span className="og-flip-face og-flip-front" aria-hidden={flipped}>
    <span className="og-completed-task"><strong>{quest.name}</strong><span>{quest.description}</span></span>
    <span className="og-quest-reward">Reward: {quest.reward_points??10} SPARK Points</span>
   </span>
   <span className="og-flip-face og-flip-back" aria-hidden={!flipped}>
    {photo&&<img className="og-winning-photo" src={photo} alt={`${school}: ${quest.name} approved winning submission`}/>}
    <span className="og-completed-task"><strong>{quest.name}</strong><span className="og-completed-stamp">COMPLETED</span><span className="og-completed-school">Completed by: {school}</span></span>
    <span className="og-quest-reward">Reward: {quest.reward_points??10} SPARK Points</span>
   </span>
  </span>
 </button>;
}
function Games({location,employee,managerPin,supervisorPin,galleryOnly=false,initialTab="quests"}){
 const [data,setData]=useState(null),[tab,setTab]=useState(galleryOnly?'door':initialTab),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[submission,setSubmission]=useState(null),[preview,setPreview]=useState(false);
 const [pieceSelection,setPieceSelection]=useState(null);
 const auth=useRef(null);const mounted=useRef(true);const admin=Boolean(supervisorPin);
 useEffect(()=>{mounted.current=true;let cancelled=false,token,timer;
  (async()=>{try{const credentials=supervisorPin?{pin:supervisorPin}:{token:token=await openSession(location,employee,managerPin)};if(cancelled)return;auth.current=credentials;
   const result=await gamesRequest(supervisorPin||galleryOnly?'list':'seen',credentials);if(!cancelled)setData(result);
   timer=setInterval(async()=>{try{const result=await gamesRequest('list',credentials);if(!cancelled)setData(result);}catch{}},30000);
  }catch(e){if(!cancelled)setError(e.message);}finally{if(cancelled&&token)closeSession(token).catch(()=>{});}})();
  return()=>{cancelled=true;mounted.current=false;clearInterval(timer);auth.current=null;if(token)closeSession(token).catch(()=>{});};
 },[supervisorPin,location,employee,managerPin,galleryOnly]);
 async function run(action,payload={},photo){if(preview&&['submit','guess','vote','buy_guess','buy_unlocks','reveal_piece'].includes(action)){setNotice(action==='submit'?'Preview: this is where your photo would be sent for supervisor approval. Nothing was uploaded or saved.':['buy_guess','buy_unlocks'].includes(action)?'Preview purchase only. No points were spent.':action==='reveal_piece'?'Preview reveal only. No credits were used or pieces changed.':action==='guess'?'Preview guess received. No real guess was used and no points were awarded.':'Preview vote only. Nothing was saved.');return true;}if(!auth.current)return false;setBusy(true);setError('');setNotice('');try{const result=await gamesRequest(action,auth.current,payload,photo);if(mounted.current){setData(previous=>result.collection_update?{...previous,...result}:result);if(!result.collection_update)window.dispatchEvent(new Event('october-games-updated'));setNotice(action==='guess'?(result.guess_correct?`Correct! Your school earned ${result.guess_points??25} ${result.production?'SPARK Points':'test points'}. The next mystery is ready.`:'Guess saved. Use an available extra guess, or return tomorrow for a new free guess.'):action==='buy_guess'?'Extra guess purchased. It will be available tomorrow.':action==='buy_unlocks'?`${payload.credits} unlock ${payload.credits===1?'credit':'credits'} purchased. Ready to use now.`:action==='reveal_piece'?'Puzzle piece revealed.':action==='accept_guess'?'Guess accepted. Points awarded and unused purchases refunded.':action==='list'?'Updated.':'Saved.');}return true;}catch(e){if(mounted.current)setError(e.message);return false;}finally{if(mounted.current)setBusy(false);}}
 const settings=data?.settings,now=new Date(data?.server_time||Date.now());
 const voting=data?.participating&&settings?.door_state==='active'&&!settings.champion&&now<new Date(settings.voting_end);
 const submitting=preview||(data?.participating&&settings?.door_state==='active'&&!settings.champion&&now<new Date(settings.submission_end));
 const ownDoor=data?.entries.find(e=>e.quest===0&&e.location_id===data.location_id);
 const round=data?.rounds.find(r=>r.id===data.current_round);
 return <section className="og" aria-label="SPARK Games"><header className="og-header"><div><small>SPARK • GAMES</small><h2>{galleryOnly?(settings?.door_title||'Holiday Door Spotlight'):'A little mystery. A lot of SPARK.'}</h2><p>{data?.production?'Earn SPARK Points for your school.':'Development preview · rewards are test points and do not change live Cup standings.'}</p></div><button disabled={busy} onClick={()=>run('list')}>Refresh</button></header>
  {error&&<p role="alert" className="og-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!data?<p>Loading SPARK Games…</p>:<>
   {!galleryOnly&&<nav className="og-tabs" aria-label="SPARK Games sections">{[['quests','Side Quests'],['door','Door Contest'],['mystery','Mystery Photos'],['points','SPARK Standings'],...(admin?[['manage','Games & Challenges']]:[])].map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>{setTab(key);setSubmission(null);}}>{label}</button>)}</nav>}
   {!admin&&!data.participating&&!galleryOnly&&<div className="og-preview-note"><p>This school is not participating. Preview the upload and guessing controls here without switching schools.</p><button onClick={()=>{setPreview(!preview);setSubmission(null);setNotice('');}}>{preview?'Exit manager preview':'Preview manager experience'}</button>{preview&&<p><strong>Preview only:</strong> photos stay on this device. No submissions, guesses, votes, points or puzzle progress are saved.</p>}</div>}
   {!admin&&!data.identified&&<p>Voting and mystery guesses use your registered manager login. Covering managers can submit photos for their school.</p>}
   {tab==='quests'&&<><CycleDates data={data}/><h3>Side Quests <span className="og-status">{settings.quests_state}</span></h3><p>Be the first school approved for a quest to earn SPARK Points. Each quest locks after its first approval. Schools can win up to two new Side Quests per weekly wave; historical October wins stay unchanged. You can keep submitting after reaching the limit. Each winning completion adds 3 mystery unlock credits.</p>
    {preview&&<><h4>Completed card preview</h4><p>Try the sample card below. This does not complete a real quest.</p><div className="og-grid og-example"><QuestCard example quest={{name:'Picture Perfect Lunch',description:'Photograph a beautifully presented, complete school lunch tray.'}} school={location?.school_name||'Your school'}/></div></>}
    {data.game_waves&&<><h4>Available Side Quests</h4><p className="sg-win-count">{data.game_wave_wins?.filter(w=>String(w.location_id)===String(data.location_id)).map(w=>`Wave ${data.game_waves.find(x=>x.id===w.wave_id)?.monday}: ${w.wins}/2 wins`).join(" · ")||"No weekly wins yet."}</p></>}<div className={data.game_waves?"sg-available-grid":"og-grid"}>{data.quests.filter(q=>!data.game_waves||!q.first_school).map(q=>{const entry=data.entries.find(e=>e.quest===q.id&&e.location_id===data.location_id);const winner=data.entries.find(e=>e.quest===q.id&&String(e.location_id)===String(q.first_school)&&e.state==='approved');return <QuestCard key={q.id} quest={q} school={q.first_school?schoolName(data,q.first_school):null} photo={winner?.photo_url}><h4>{q.name}</h4>{q.wave_id&&data.game_waves?.some(w=>w.id===q.wave_id&&w.released_at&&now-new Date(w.released_at)<7*86400000)&&<span className="og-badge">NEW THIS WEEK</span>}<p>{q.description}</p>{q.goal&&<p><strong>The Challenge:</strong> {q.goal}</p>}{q.wave_id&&<p className="sg-win-count">Wave {data.game_waves?.find(w=>w.id===q.wave_id)?.monday} · {data.game_wave_wins?.find(w=>w.wave_id===q.wave_id&&String(w.location_id)===String(data.location_id))?.wins||0}/2 wins</p>}{entry&&<><p className="og-status">{entry.state==='pending'?'Submitted — Pending Approval':entry.state}</p>{entry.feedback&&<p>{entry.feedback}</p>}</>}{!admin&&!q.first_school&&(preview||(data.participating&&settings.quests_state==='active'))&&(!entry||['rejected','replacement'].includes(entry.state))&&<button disabled={busy} onClick={()=>setSubmission(q.id)}>Upload photo</button>}{submission===q.id&&<SubmissionForm quest={q.id} existing={entry} run={run} busy={busy} close={()=>setSubmission(null)}/>}<strong className="og-quest-reward">Reward: {q.reward_points??10} SPARK Points</strong></QuestCard>;})}</div>
    {data.game_waves&&<CompletedCollection data={data} scope={`${data.production?"live":"dev"}:${location?.id}:${employee?.id||"covering"}`} onRevealed={!admin&&data.identified?ids=>run("games_revealed",{quests:ids}):undefined}/>}<p className="og-disclaimer">{DISCLAIMER}</p></>}
   {tab==='door'&&<><h3>{settings.door_title||'Halloween Door Decorating Contest'} <span className="og-status">{settings.door_state}</span></h3><p>Submissions close: {day(settings.submission_end)}<br/>Voting closes: {day(settings.voting_end)}</p>
    {!galleryOnly&&submitting&&(!ownDoor||['rejected','replacement'].includes(ownDoor.state))&&<button onClick={()=>setSubmission(0)}>Submit your school’s door</button>}
    {submission===0&&<SubmissionForm quest={0} existing={ownDoor} run={run} busy={busy} close={()=>setSubmission(null)}/>}
    {!galleryOnly&&!submitting&&!admin&&<p>Door uploads open for participating schools until the submission closing time shown above. Use manager preview to see the form at a nonparticipating school.</p>}<p>{settings.door_participation_points??10} SPARK Points for approved participation · {settings.door_champion_points??20} additional SPARK Points for the champion. One vote per registered manager; no votes for your own school. Vote totals appear when voting closes.</p>
    <DoorGallery data={data} run={run} busy={busy} canVote={voting&&!admin}/></>}
   {tab==='mystery'&&<><h3>Mystery Photo Unlock <span className="og-status">{settings.mystery_state}</span></h3><p>Sequential monthly mysteries. One free guess per school each day. Extra guesses can be purchased with season SPARK Points or redeemed from prizes. The first correct answer earns the reward shown for that photo.</p>
    {round?<><h4>Mystery {round.position||round.id} of {data.rounds.filter(r=>!data.active_collection||r.collection_id===data.active_collection).length} · {round.unlocked} / {round.piece_count||32} pieces revealed</h4><p><strong>Reward: {round.reward_points??25} SPARK Points</strong> · {round.collection_id?'Each piece shows its reveal-credit cost.':round.id>=3?'Hard: edge pieces cost 1 credit; inner pieces cost 2 or 3.':'Easy: each piece costs 1 unlock credit.'} Each completed quest adds 3 credits.</p><h3 className="og-mystery-question">{round.question||'Who is this?'}</h3><MysteryPuzzle round={round} selectable={!admin&&(preview||(data.identified&&data.participating))&&!busy} selected={pieceSelection?.round===round.id?pieceSelection.index:null} onSelect={index=>setPieceSelection({round:round.id,index})}/>
     {!admin&&<MysteryGuessControls key={`${round.id}-${preview}`} data={data} round={round} preview={preview} busy={busy} run={run}/>}</>:<h4>Collection complete! 🎉</h4>}
    {!admin&&<MysteryUnlockControls selectedPiece={round&&pieceSelection?.round===round.id?pieceSelection.index:null} data={data} round={round} preview={preview} busy={busy} run={run}/>}
    {!admin&&data.recent_guesses?.length>0&&<section className="og-recent-guesses"><h4>Last 5 guesses from other schools</h4><ul>{data.recent_guesses.map(g=><li key={g.attempt_key}><strong>{g.school_name}</strong>: {g.guess} <small>· {day(g.submitted_at)}</small></li>)}</ul></section>}<CompletedMysteryCollection data={data}/></>}
   {tab==='points'&&<GamePoints data={data}/>}
   {tab==='manage'&&admin&&<Management data={data} run={run} busy={busy}/>}
  </>}
 </section>;
}
function GamePoints({data}){
 const [month,setMonth]=useState('2026-10');
 const ranked=data.schools.filter(s=>s.participating).map(s=>({...s,points:data.rewards.filter(r=>r.location_id===s.id&&!r.voided&&r.service_date.startsWith(month)).reduce((n,r)=>n+r.points,0)})).sort((a,b)=>b.points-a.points||a.school_name.localeCompare(b.school_name));
 return <><h3>{data.production?'October SPARK Points':'October Games test standings'}</h3><label>Points earned in month<input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label><p>{data.production?'These SPARK Points also count toward Monthly Cup and season standings.':'Development rewards only. Live Monthly Cup and season points stay unchanged.'}</p><div className="og-table"><table><thead><tr><th>Rank</th><th>School</th><th>{data.production?'SPARK Points':'Test points'}</th></tr></thead><tbody>{ranked.map((s,i)=><tr key={s.id}><td>{ranked.findIndex(x=>x.points===s.points)+1}</td><td>{s.school_name}</td><td>{s.points}</td></tr>)}</tbody></table></div></>;
}
function Management({data,run,busy}){
 const [all,setAll]=useState(false),[view,setView]=useState('settings');const cfg=data.settings;
 const pending=data.entries.filter(e=>e.state==='pending').length;
 return <><h3>Games & Challenges</h3><p>Set participating schools, verify BIC and Supper eligibility, upload your five mystery photos, then activate the games.</p>
  <nav className="og-tabs og-management-tabs" aria-label="Games management sections">
   <button type="button" aria-pressed={view==='settings'} onClick={()=>setView('settings')}>Settings</button>
   <button type="button" aria-pressed={view==='review'} onClick={()=>setView('review')}>Photo Review{pending>0&&<span className="og-review-count" role="status" aria-label={`${pending} photos awaiting review`}>{pending}</span>}</button>
   <button type="button" aria-pressed={view==='activity'} onClick={()=>setView('activity')}>Guesses, Unlocks & Points</button>
  </nav>
  {view==='settings'&&<>
  <div className="og-grid">{['quests','mystery'].map(game=><div className="og-card" key={game}><h4>{game==='quests'?'Side Quests':game==='door'?'Door Contest':'Mystery Photos'}</h4><label>Status<select disabled={busy} value={cfg[game+'_state']} onChange={e=>run('settings',{revision:cfg.revision,game,state:e.target.value})}>{['active','paused','ended'].map(s=><option key={s}>{s}</option>)}</select></label></div>)}</div>
  <details className="og-quest-management"><summary>Side Quests · generation & history</summary><ChallengePlanner data={data} run={run} busy={busy}/>{!data.games_planning&&<NewQuest key={cfg.revision} revision={cfg.revision} run={run} busy={busy}/>}<QuestHistory data={data}/></details>
  <SchoolSettings key={JSON.stringify(data.schools)} data={data} run={run} busy={busy}/>
  <DoorContestSettings cfg={cfg} run={run} busy={busy}/>
  <details className="og-mystery-management"><summary>Monthly Mystery Collections</summary>{data.collections?<MysteryCollections data={data} run={run} busy={busy}/>:<><h3>Mystery artwork and accepted answers</h3><div className="og-grid">{data.rounds.map(r=><RoundSettings key={`${r.id}-${r.revision}`} round={r} run={run} busy={busy}/>)}</div></>}</details>
  <h3>Confirm the door champion</h3><p>After voting ends, select the highest-voted school. If schools tie, select the winner from that tie.</p><div className="og-actions">{data.entries.filter(e=>e.quest===0&&e.state==='approved').map(e=><button disabled={busy||!cfg.voting_end||new Date(data.server_time)<new Date(cfg.voting_end)||!!cfg.champion} key={e.id} onClick={()=>window.confirm(`Confirm ${schoolName(data,e.location_id)} as champion?`)&&run('champion',{location_id:e.location_id})}>{schoolName(data,e.location_id)} · {e.votes??'votes hidden'}</button>)}</div>
  </>}
  {view==='review'&&<>
  <h3>Photo review</h3><label className="og-check"><input type="checkbox" checked={all} onChange={e=>setAll(e.target.checked)}/>Include already reviewed entries</label>
  <div className="og-grid">{data.entries.filter(e=>all||e.state==='pending').map(e=><Review key={`${e.id}-${e.revision}`} entry={e} data={data} run={run} busy={busy}/>)}</div>
  {!data.entries.some(e=>all||e.state==='pending')&&<p role="status">{all?'No photo submissions yet.':'No photos awaiting review.'}</p>}
  </>}
  {view==='activity'&&<><h3>Guesses, unlocks and awarded points</h3><h4>Guesses</h4><div className="og-table"><table><thead><tr><th>Round</th><th>School</th><th>Manager ID</th><th>Guess</th><th>Result</th><th>Submitted</th><th>Review</th></tr></thead><tbody>{data.guesses.map(g=><tr key={g.attempt_key||`${g.round}-${g.employee_id}-${g.win_id||'first'}`}><td>{g.round}</td><td>{schoolName(data,g.location_id)}</td><td>{g.employee_id}</td><td>{g.guess}</td><td>{g.supervisor_accepted?'Correct — accepted by supervisor':g.correct?'Correct':'Incorrect'}</td><td>{day(g.submitted_at)}</td><td>{!g.correct&&g.attempt_key&&!data.rounds.find(r=>r.id===g.round)?.solved_at&&<button disabled={busy} onClick={()=>window.confirm(`Accept ${schoolName(data,g.location_id)}’s guess as correct? This solves Mystery ${g.round}, awards its SPARK Points and refunds unused purchases.`)&&run('accept_guess',{round:g.round,attempt_key:g.attempt_key})}>Accept as correct</button>}</td></tr>)}</tbody></table></div>
   <p>{data.unlock_events.length} quest unlock events recorded. New completions add 3 unlock credits once. Previously earned credits stay unchanged.</p><h4>Points and corrections</h4><div className="og-table"><table><thead><tr><th>School</th><th>Source</th><th>Date</th><th>Points</th><th>Correction</th></tr></thead><tbody>{data.rewards.map(r=><tr key={r.event}><td>{schoolName(data,r.location_id)}</td><td>{r.event.startsWith('mystery')?'Mystery winner':r.event==='door:champion'?'Door champion':'Approved photo'}</td><td>{r.service_date}</td><td>{r.voided?'Voided':r.points}</td><td><button disabled={busy} onClick={()=>{const reason=window.prompt('Reason for this points correction:');if(reason)run('reward',{event:r.event,voided:!r.voided,reason});}}>{r.voided?'Restore':'Void'} award</button>{r.reason&&<small>{r.reason}</small>}</td></tr>)}</tbody></table></div>
  </>}</>;
}
function SchoolSettings({data,run,busy}){
 const [selected,setSelected]=useState(data.schools.filter(s=>s.participating).map(s=>s.id));
 return <details><summary>Participating schools · {selected.length} selected</summary><form onSubmit={e=>{e.preventDefault();run('settings',{revision:data.settings.revision,schools:selected});}}><div className="og-school-options">{data.schools.map(s=><label className="og-check" key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(e.target.checked?[...selected,s.id]:selected.filter(id=>id!==s.id))}/>{s.school_name}</label>)}</div><button disabled={busy}>Apply schools</button></form></details>;
}
function NewQuest({revision,run,busy}){
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[description,setDescription]=useState(''),[enabled,setEnabled]=useState(true),[reward,setReward]=useState(10);
 return <div className="og-new-quest"><button type="button" disabled={busy} onClick={()=>setOpen(!open)}>{open?'Cancel new quest':'+ Add quest'}</button>{open&&<form className="og-card" onSubmit={async e=>{e.preventDefault();if(await run('quest_create',{revision,name,description,enabled,reward_points:Number(reward)}))setOpen(false);}}><h4>New Side Quest</h4><label>Quest name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>Quest instructions<textarea required maxLength={1000} value={description} onChange={e=>setDescription(e.target.value)}/></label><label>Reward (SPARK Points)<input type="number" min="1" max="1000" step="1" required value={reward} onChange={e=>setReward(e.target.value)}/></label><label className="og-check"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Quest enabled</label><p>First approved school earns SPARK Points and adds 3 mystery unlock credits. Participating schools can compete.</p><button disabled={busy||!name.trim()||!description.trim()}>Create quest</button></form>}</div>;
}
function Review({entry:e,data,run,busy}){const [feedback,setFeedback]=useState(e.feedback);const quest=data.quests.find(q=>q.id===e.quest),waveWins=data.game_wave_wins?.find(w=>w.wave_id===quest?.wave_id&&String(w.location_id)===String(e.location_id))?.wins||0;return <article className="og-card"><h4>{schoolName(data,e.location_id)}</h4><p>{e.quest===0?(data.settings.door_title||'Door Contest'):data.quests.find(q=>q.id===e.quest)?.name} · {e.state}</p><img loading="lazy" className="og-full-photo" src={e.photo_url} alt="Submission for review"/>{e.note&&<p>{e.note}</p>}{quest?.wave_id&&<p>{waveWins}/2 wins in this weekly wave{waveWins>=2?" · Winning limit reached. No additional winning award is available.":""}</p>}<label>Feedback<textarea maxLength={1000} value={feedback} onChange={x=>setFeedback(x.target.value)}/></label><div className="og-actions">{[['approved','Approve'],['rejected','Reject'],['replacement','Request new photo']].map(([state,label])=><button disabled={busy||e.state===state||(state==="approved"&&quest?.wave_id&&waveWins>=2&&!quest.first_school)} key={state} onClick={()=>run('review',{id:e.id,revision:e.revision,state,feedback})}>{label}</button>)}</div></article>;}
function RoundSettings({round:r,run,busy}){
 const [photo,setPhoto]=useState(null),[answer,setAnswer]=useState(r.answer||''),[aliases,setAliases]=useState((r.aliases||[]).join('\n')),[error,setError]=useState(''),[reward,setReward]=useState(r.reward_points??25);
 return <form className="og-card" onSubmit={async e=>{e.preventDefault();if(await run('round',{id:r.id,revision:r.revision,answer,aliases:aliases.split('\n').map(s=>s.trim()).filter(Boolean)},photo))setPhoto(null);}}><h4>Mystery {r.id} · {r.id>=3?'Hard':'Easy'}</h4><label>Photo reward (SPARK Points)<input type="number" min="1" max="1000" step="1" value={reward} disabled={!!r.solved_at} onChange={e=>setReward(e.target.value)}/></label><button type="button" disabled={busy||!!r.solved_at||!Number.isInteger(Number(reward))||Number(reward)<1||Number(reward)>1000} onClick={()=>run('round_reward',{id:r.id,revision:r.revision,reward_points:Number(reward)})}>Save photo points</button>{r.photo_url&&<img loading="lazy" className="og-full-photo" src={r.photo_url} alt={`Mystery ${r.id} supervisor preview`}/>}<PhotoPicker camera={false} value={photo} onChange={setPhoto} onError={setError}/>{error&&<p role="alert">{error}</p>}<label>Accepted answer<input required maxLength={120} value={answer} onChange={e=>setAnswer(e.target.value)}/></label><label>Alternative spellings (one per line)<textarea value={aliases} onChange={e=>setAliases(e.target.value)}/></label><button disabled={busy||!!r.solved_at||r.unlocked>0}>Save mystery</button></form>;
}
