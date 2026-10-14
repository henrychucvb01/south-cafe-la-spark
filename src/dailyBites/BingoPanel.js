import React, {useEffect, useRef, useState} from 'react';
import {supabase} from '../supabaseClient';
import {openSession, closeSession} from '../supperMonitoring/service';
import {awardSparkPoints} from '../sparkPoints';
import {getLosAngelesDate} from './training/arTrainingUtils';
import './bingoCycles.css';

const displayDate = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'});
const detail = (goal, context) => goal.evidence === 'monitoring'
  ? `Manager Supper ${context.required_supper_number} accepted` : goal.detail;

export default function BingoPanel({location, employee, managerPin, activityVersion}) {
  const [context,setContext]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [picking,setPicking]=useState(false);
  const [square,setSquare]=useState(null);
  const [replacement,setReplacement]=useState('');
  const [pendingPurchase,setPendingPurchase]=useState(null);
  const runRef=useRef(null);
  const choiceRef=useRef(null);

  useEffect(()=>{
    let cancelled=false, running=false, token=null, visitDate=null;
    setContext(null);setError('');setMessage('');setPicking(false);setSquare(null);
    const pendingKey=`spark-bingo-purchase-${location?.id}`;
    try {setPendingPurchase(JSON.parse(sessionStorage.getItem(pendingKey)||'null'));} catch {setPendingPurchase(null);}
    async function run(action='context', params={}) {
      if(cancelled || running || !location?.id) return false;
      running=true;setBusy(true);
      try {
        if(!managerPin) throw Error('Return to Manager Hub and sign in again to load your school’s Bingo card.');
        if(!token) token=await openSession(location,employee,managerPin);
        if(cancelled) {await closeSession(token).catch(()=>{});return false;}
        const today=getLosAngelesDate(new Date());
        if(visitDate!==today) {
          const saved=await awardSparkPoints({locationId:location.id,points:1,pointType:'daily_bites_visit',description:'Visited Daily Bites',serviceDate:today,employeeId:employee?.id,employeeName:employee?.employee_name||'Covering Employee',uniqueKey:`daily-bites-${location.id}-${today}`});
          if(saved) visitDate=today;
        }
        const {data,error:rpcError}=await supabase.rpc(`spark_bingo_${action}`,{p_token:token,...params});
        if(rpcError) throw rpcError;
        if(!data?.card || !Array.isArray(data.goals) || data.goals.length!==25) throw Error('Bingo could not load. Please try Refresh.');
        if(!cancelled) {
          setContext(data);setError('');
          if(data.new_points>0) setMessage(`Bingo earned your school ${data.new_points} points!`);
          if(action==='renew') {setMessage('Your new card is ready. Fresh activity counts toward these squares.');setPicking(false);setSquare(null);}
          if(action==='repick') {setMessage('Square replaced. Your school’s repick is used for this month.');setPicking(false);setSquare(null);}
          if(action==='buy_replacement') {sessionStorage.removeItem(pendingKey);setPendingPurchase(null);setMessage('Square replaced. SPARK Points purchase confirmed.');setPicking(false);setSquare(null);}
          if(action==='redeem_replacement') {setMessage('Replacement prize redeemed. Your monthly repick and paid price are unchanged.');setPicking(false);setSquare(null);}
        }
        return true;
      } catch(err) {
        if(action==='buy_replacement'&&err.code==='P0001'&&!cancelled) {
          sessionStorage.removeItem(pendingKey);setPendingPurchase(null);
        }
        if(/session expired/i.test(err.message||'')) {await closeSession(token).catch(()=>{});token=null;}
        if(!cancelled) setError(/PGRST202|42883/.test(err.code||'') ? 'The Bingo update needs its database setup before this card can load.' : err.message || 'Bingo could not connect. Please try Refresh.');
        return false;
      } finally {running=false;if(!cancelled)setBusy(false);}
    }
    runRef.current=run;
    const refresh=()=>{if(document.visibilityState!=='hidden')run();};
    run();
    const timer=setInterval(refresh,60000);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return ()=>{cancelled=true;runRef.current=null;clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);if(token)closeSession(token).catch(()=>{});};
  },[location?.id,employee?.id,employee?.employee_name,employee?.covering,managerPin]);

  useEffect(()=>{if(activityVersion)runRef.current?.();},[activityVersion]);
  useEffect(()=>{if(square!==null)choiceRef.current?.focus();},[square]);
  const completed=context?.goals.filter(g=>g.completed).length||0;
  const choices=(context?.replacement_goals||[]).filter(candidate=>square===null||!candidate.family||
    !context.goals.some((goal,index)=>index!==square&&goal.family===candidate.family));
  const selected=square===null?null:context?.goals[square];
  const canReplace=selected&&!selected.completed;
  const shop=context?.paid_shop;
  const price=shop?.price;
  const balance=BigInt(shop?.balance||'0');
  const affordable=price!=null&&BigInt(price)<=balance;
  const validChoice=choices.some(g=>g.id===replacement);
  const perform=(action,extra={})=>runRef.current?.(action,{p_card:context.card.id,p_revision:context.card.revision,...extra});
  const buy=()=>{
    const next=choices.find(g=>g.id===replacement);
    if(!next||!affordable||!window.confirm(`Replace ${selected.label} (${detail(selected,context)}) with ${next.label} (${detail(next,context)})?\nCost: ${price} SPARK Points\nSeason balance: ${balance}\nRemaining: ${balance-BigInt(price)}`))return;
    const request={p_request:crypto.randomUUID(),p_card:context.card.id,p_revision:context.card.revision,p_square:square,p_goal:replacement,p_price:price,p_confirmed:true};
    sessionStorage.setItem(`spark-bingo-purchase-${location.id}`,JSON.stringify(request));setPendingPurchase(request);
    runRef.current?.('buy_replacement',request);
  };

  return <section className="dashboard-card spark-bingo-section" aria-label="SPARK Bingo">
    <div className="spark-bingo-heading">
      <div><div className="dashboard-small-label">{context?`CARD ${context.card.cycle}`:'YOUR SCHOOL’S CARD'}</div>
        <h2>🎯 SPARK Bingo</h2><p>Squares complete automatically when SPARK verifies your school’s work. Earn rewards once per card.</p>
        {context&&<p>Started {displayDate(context.card.started_on)} · New card eligible from {displayDate(context.renew_on)}, after blackout.</p>}
      </div>
      <div className="spark-bingo-progress-summary"><strong>{context?`${completed} / 25`:'…'}</strong><span>{context?.card.blackout_at?'BLACKOUT!':'Squares complete'}</span></div>
    </div>
    <div className="bingo-cycle-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={()=>runRef.current?.()}>{busy?'Checking…':'Refresh Bingo'}</button>
      {context&&<>
        <button type="button" className="secondary-button" disabled={busy||!context.repick_available||!choices.length} onClick={()=>{setPicking(!picking);setSquare(null);setReplacement('');}}>{picking?'Cancel repick':'Use monthly repick'}</button>
        {!context.repick_available&&shop&&<button type="button" className="secondary-button" disabled={busy||!!context.card.blackout_at||!choices.length} onClick={()=>{setPicking(!picking);setSquare(null);setReplacement('');}}>{picking?'Cancel replacement':'Replace a square'}</button>}
        <button type="button" className="primary-button" disabled={busy||!context.can_renew} onClick={()=>perform('renew')}>Start New Card</button>
      </>}
    </div>
    {error&&<p className="login-error" role="alert">{error}</p>}
    {message&&<p className="bingo-cycle-message" role="status">{message}</p>}
    {pendingPurchase&&<div className="bingo-cycle-message"><p>Purchase confirmation pending. Retry the same purchase without another charge.</p><button type="button" disabled={busy} onClick={()=>runRef.current?.('buy_replacement',pendingPurchase)}>Check pending purchase</button></div>}
    {context&&<>
      <p className="spark-bingo-note">{context.card.blackout_at?(context.can_renew?'Blackout complete! You can start a new card with different tasks.':`Blackout complete! Your new card unlocks ${displayDate(context.renew_on)}.`):'Complete blackout and keep this card for one full month to unlock a new card. An unfinished card stays until you finish it.'} Your earned points stay credited.</p>
      <p className="spark-bingo-note">{context.repick_available?'One repick is available for your school this calendar month. Choose an incomplete square and a different task.':context.card.blackout_at?'A completed card has no squares to replace.':'Your school has used its repick this calendar month. Another is available next month.'}</p>
      {picking&&<p className="bingo-cycle-message">Select an incomplete square below to replace it. Completed squares and the free space stay.</p>}
      {selected&&picking&&<div className="bingo-repick-form">
        <h3>Replace {selected.label}</h3><p>{detail(selected,context)}</p>
        {!canReplace?<p>This square is no longer available to replace. Refresh or choose another incomplete square.</p>:<>
          <label htmlFor="bingo-replacement">Choose a different task</label>
          <select ref={choiceRef} id="bingo-replacement" value={replacement} onChange={e=>setReplacement(e.target.value)}>
            <option value="">Select a task</option>{choices.map(g=><option key={g.id} value={g.id}>{g.label} — {detail(g,context)}</option>)}
          </select>
          {!choices.length&&<p>No eligible unfinished replacements are available for this square.</p>}
          {context.repick_available&&<><p>This uses your school’s one repick for this calendar month.</p><button type="button" className="primary-button" disabled={busy||!validChoice||!!pendingPurchase} onClick={()=>perform('repick',{p_square:square,p_goal:replacement})}>Replace square — use monthly repick</button></>}
          {shop&&<><p>Season balance: <strong>{balance.toLocaleString()} SPARK Points</strong> · Paid replacements on this card: {shop.count}</p><p>Next paid replacement: <strong>{price!=null?`${BigInt(price).toLocaleString()} points`:shop.price_formula+' points'}</strong>{price!=null&&<> · Remaining balance: {(balance-BigInt(price)).toLocaleString()}</>}</p>
            <button type="button" className="primary-button" disabled={busy||!validChoice||!affordable||!!pendingPurchase} onClick={buy}>Buy replacement — {price!=null?BigInt(price).toLocaleString():shop.price_formula} points</button>
            {shop.prizes?.map(prize=><button key={prize.id} type="button" className="secondary-button" disabled={busy||!validChoice||!!pendingPurchase} onClick={()=>window.confirm(`Use ${prize.label} to replace ${selected.label} with ${choices.find(g=>g.id===replacement)?.label}? No SPARK Points will be spent.`)&&perform('redeem_replacement',{p_win:prize.id,p_square:square,p_goal:replacement})}>Use {prize.label}</button>)}
          </>}
        </>}
        <button type="button" className="secondary-button" disabled={busy} onClick={()=>{setSquare(null);setPicking(false);}}>Cancel</button>
      </div>}
      <div className="spark-bingo-progress-track" aria-hidden="true"><div className="spark-bingo-progress-fill" style={{width:`${completed*4}%`}}/></div>
      <div className="spark-bingo-board-wrap"><div className="spark-bingo-board">
        {context.goals.map((g,index)=>{
          const repair=context.repair_windows?.find(r=>r.goal===g.id);
          const content=<><div className="spark-bingo-square-icon">{g.icon}</div><strong>{g.label}</strong><span>{detail(g,context)}</span>{repair&&<small>New activity since {new Date(repair.started_at).toLocaleDateString()}</small>}{g.completed&&<div className="spark-bingo-check" aria-label="Complete">✓</div>}</>;
          const className=`spark-bingo-square ${g.completed?'spark-bingo-square-complete':''}`;
          return picking&&!g.completed&&g.id!=='free'?<button key={g.id} type="button" className={`${className} bingo-repick-square`} disabled={busy||!!pendingPurchase} aria-label={`Replace ${g.label}: ${detail(g,context)}`} aria-pressed={square===index} onClick={()=>{setSquare(index);setReplacement('');}}>{content}</button>:<div key={g.id} className={className}>{content}</div>;
        })}
      </div></div>
      <div className="spark-bingo-rewards">{[1,2,3,4,5].map(n=><div key={n} style={context.earned_milestones.includes(n)?{background:'#eef8ea'}:undefined}><strong>{n} Line{n===1?'':'s'}</strong><span>{context.earned_milestones.includes(n)?'✓ Earned':`+${n*10} points`}</span></div>)}</div>
      <div className="spark-bingo-blackout bingo-cycle-message">{context.card.blackout_at?'🏆 BLACKOUT COMPLETE • +100 points earned':'🏆 BLACKOUT • Complete all 25 squares • +100 points'}</div>
      <p className="spark-bingo-note">New cards use fresh activity from their start date. Repaired squares count new activity after their replacement. Completed squares and earned rewards stay.</p>
    </>}
  </section>;
}
