import React,{useCallback,useEffect,useRef,useState} from 'react';
import PullControl from './PullControl';
import {mysteryRpc,newRequest,readSaved,dateLabel} from './service';
export default function MysteryManager({token,onExpired}) {
 const [data,setData]=useState(null),[history,setHistory]=useState([]),[more,setMore]=useState(false),[busy,setBusy]=useState(true),[phase,setPhase]=useState('ready'),[win,setWin]=useState(null),[error,setError]=useState('');
 const stage=useRef(null);
 const readVersion=useRef(0);
 const alive=useRef(true),inFlight=useRef(false),pending=useRef(null),key=useRef(null);
 const refresh=useCallback(async()=>{const version=++readVersion.current;const [next,rows]=await Promise.all([mysteryRpc('context',{p_token:token}),mysteryRpc('history',{p_token:token})]);if(alive.current&&version===readVersion.current){setData(next);setHistory(rows);setMore(rows.length===50);}return next;},[token]);
 const restore=useCallback(async()=>{
  const next=await refresh();key.current=`spark-mystery-pending-${next.school.id}`;pending.current=readSaved(key.current);
  if(pending.current){const saved=await mysteryRpc('pull_result',{p_token:token,p_request:pending.current.id});if(!alive.current)return;if(saved){setWin(saved);setPhase('revealed');sessionStorage.removeItem(key.current);pending.current=null;}else setPhase('recover');}
 },[refresh,token]);
 useEffect(()=>{alive.current=true;restore().catch(e=>{if(alive.current)setError(e.message);}).finally(()=>{if(alive.current)setBusy(false);});const timer=setInterval(()=>{if(!inFlight.current&&document.visibilityState!=='hidden')restore().catch(()=>{});},30000);return()=>{alive.current=false;clearInterval(timer);};},[restore]);
 useEffect(()=>{if(phase==='drawing'||phase==='revealed')stage.current?.scrollIntoView?.({block:'center',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});},[phase]);
 async function pull(){if(inFlight.current||!data)return;inFlight.current=true;setBusy(true);setError('');setPhase('drawing');setWin(null);
  try {
   if(!pending.current)pending.current={id:newRequest(),revision:data.revision};
   sessionStorage.setItem(key.current,JSON.stringify(pending.current));
   const started=Date.now();const result=await mysteryRpc('pull',{p_token:token,p_request:pending.current.id,p_revision:pending.current.revision});
   // Only the server result is revealed. A refresh can recover this exact winning record.
   const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,(reduced?300:1800)-(Date.now()-started))));
   if(!alive.current)return;
   setWin(result.win);setPhase('revealed');sessionStorage.removeItem(key.current);pending.current=null;
   await refresh().catch(e=>setError(e.message));
  } catch(e){if(alive.current){setError(e.message);if(e.confirmed&&!/expired/i.test(e.message)){sessionStorage.removeItem(key.current);pending.current=null;setPhase('ready');refresh().catch(()=>{});}else setPhase('recover');}}
  finally{inFlight.current=false;if(alive.current)setBusy(false);}
 }
 async function retryRefresh(){setBusy(true);try{await restore();setError('');}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function older(){setBusy(true);try{const rows=await mysteryRpc('history',{p_token:token,p_before:history.at(-1)?.id});setHistory(old=>[...old,...rows]);setMore(rows.length===50);}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <>
  <header className="mystery-school-heading"><div><p className="mystery-eyebrow">A LITTLE SURPRISE. ALL YOURS.</p><h1>{data?.school.name||'Your Mystery Pull'}</h1>{data&&<p>School {data.school.code}</p>}</div><div className="mystery-token-count"><strong>{data?.tokens??'—'}</strong><span>Mystery Tokens</span></div></header>
  {error&&<div className="mystery-error" role="alert">{error}{/expired/i.test(error)?<button onClick={onExpired}>Enter access code again</button>:<button disabled={busy} onClick={retryRefresh}>Refresh</button>}</div>}
  <section ref={stage} className={`mystery-machine ${phase}`} aria-label="Mystery Pull machine">
   <div className="mystery-prize-stage" aria-live="polite" aria-atomic="true">
    {phase==='revealed'&&win?<><span className="mystery-confetti" aria-hidden="true">✦ · ✧ · ✦</span><p className="mystery-eyebrow">{win.prize_kind==='extra_pull'?'EXTRA PULL!':'LOOK WHAT YOU FOUND'}</p><div className="mystery-prize-icon">{win.prize_icon}</div><h2>{win.prize_name}</h2><p>{win.prize_description}</p>{win.points_awarded>0&&<p className="mystery-award-note">+{win.points_awarded} SPARK points added to {data?.school.name}</p>}{win.bonus_tokens>0&&win.prize_kind!=='extra_pull'&&<p className="mystery-award-note">Plus 1 extra pull · Token added instantly!</p>}<strong className="mystery-status">{win.prize_kind==='extra_pull'?'+1 Mystery Token · Added instantly':win.status==='received'?'Received ✓':'Waiting for Huy'}</strong><button className="mystery-secondary" onClick={()=>{setPhase('ready');setWin(null);}}>Back to the pull</button></>
    :<><div className="mystery-orbit" aria-hidden="true"><span>✦</span><span>🍋</span><span>✧</span></div><div className="mystery-capsule" aria-hidden="true"><span className="mystery-spin-icon">✦</span></div><h2>{phase==='drawing'?'Something good is on its way…':phase==='recover'?'Let’s check your pull':'A little mystery. A big reveal.'}</h2><p>{phase==='drawing'?'Finding your surprise…':phase==='recover'?'Your request is saved. Continue it safely without starting a second pull.':'Your next surprise is one full pull away.'}</p></>}
   </div>
   {phase==='ready'&&<div className="mystery-control-area">{data?.tokens===0?<p className="mystery-empty">No Mystery Pulls are currently available.<br/>Your prizes are saved below.</p>:data&&!data.prizes_available?<p className="mystery-empty">Prizes are being restocked.<br/>Your tokens are safe.</p>:<p className="mystery-eyebrow">ONE TOKEN. ONE SURPRISE.</p>}<PullControl disabled={busy||!data||data.tokens<1||!data.prizes_available} onPull={pull}/></div>}
   {phase==='recover'&&<button className="mystery-primary" disabled={busy} onClick={pull}>Continue saved pull</button>}
  </section>
  <section className="mystery-inventory"><div className="mystery-section-title"><h2>My Prizes</h2><button className="mystery-secondary" disabled={busy} onClick={retryRefresh}>Refresh prizes</button></div><p>Your school’s surprises, all in one place.</p>
   {!history.length&&<p className="mystery-empty">Your first prize is waiting to be discovered.</p>}
   <div className="mystery-prize-grid">{history.map(prize=><article className="mystery-prize-card" key={prize.id}><span aria-hidden="true">{prize.prize_icon}</span><div><h3>{prize.prize_name}</h3><p>{prize.prize_description}</p>{prize.points_awarded>0&&<p>+{prize.points_awarded} SPARK points added to your school</p>}{prize.bonus_tokens>0&&prize.prize_kind!=='extra_pull'&&<p>+1 extra pull added</p>}<time dateTime={prize.won_at}>{dateLabel(prize.won_at)}</time><strong className="mystery-status">{prize.prize_kind==='extra_pull'?'Received ✓ · Token added':prize.status==='received'?'Received ✓':'Waiting'}</strong>{prize.fulfilled_at&&<small>Received {dateLabel(prize.fulfilled_at)}</small>}</div></article>)}</div>
   {more&&<button className="mystery-secondary" disabled={busy} onClick={older}>Load older prizes</button>}
  </section>
 </>;
}
