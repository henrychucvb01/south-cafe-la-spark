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
  const runRef=useRef(null);
  const choiceRef=useRef(null);

  useEffect(()=>{
    let cancelled=false, running=false, token=null, visitDate=null;
    setContext(null);setError('');setMessage('');setPicking(false);setSquare(null);
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
        }
        return true;
      } catch(err) {
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
  const choices=context?.replacement_goals||[];
  const selected=square===null?null:context?.goals[square];
  const canReplace=selected&&!selected.completed&&context?.repick_available;
  const perform=(action,extra={})=>runRef.current?.(action,{p_card:context.card.id,p_revision:context.card.revision,...extra});

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
        <button type="button" className="primary-button" disabled={busy||!context.can_renew} onClick={()=>perform('renew')}>Start New Card</button>
      </>}
    </div>
    {error&&<p className="login-error" role="alert">{error}</p>}
    {message&&<p className="bingo-cycle-message" role="status">{message}</p>}
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
          <p>This uses your school’s one repick for this calendar month.</p>
          <button type="button" className="primary-button" disabled={busy||!choices.some(g=>g.id===replacement)} onClick={()=>perform('repick',{p_square:square,p_goal:replacement})}>Replace square — use monthly repick</button>
        </>}
        <button type="button" className="secondary-button" disabled={busy} onClick={()=>{setSquare(null);setPicking(false);}}>Cancel</button>
      </div>}
      <div className="spark-bingo-progress-track" aria-hidden="true"><div className="spark-bingo-progress-fill" style={{width:`${completed*4}%`}}/></div>
      <div className="spark-bingo-board-wrap"><div className="spark-bingo-board">
        {context.goals.map((g,index)=>{
          const content=<><div className="spark-bingo-square-icon">{g.icon}</div><strong>{g.label}</strong><span>{detail(g,context)}</span>{g.completed&&<div className="spark-bingo-check" aria-label="Complete">✓</div>}</>;
          const className=`spark-bingo-square ${g.completed?'spark-bingo-square-complete':''}`;
          return picking&&!g.completed&&g.id!=='free'?<button key={g.id} type="button" className={`${className} bingo-repick-square`} disabled={busy||!context.repick_available} aria-label={`Replace ${g.label}: ${detail(g,context)}`} aria-pressed={square===index} onClick={()=>{setSquare(index);setReplacement('');}}>{content}</button>:<div key={g.id} className={className}>{content}</div>;
        })}
      </div></div>
      <div className="spark-bingo-rewards">{[1,2,3,4,5].map(n=><div key={n} style={context.earned_milestones.includes(n)?{background:'#eef8ea'}:undefined}><strong>{n} Line{n===1?'':'s'}</strong><span>{context.earned_milestones.includes(n)?'✓ Earned':`+${n*10} points`}</span></div>)}</div>
      <div className="spark-bingo-blackout bingo-cycle-message">{context.card.blackout_at?'🏆 BLACKOUT COMPLETE • +100 points earned':'🏆 BLACKOUT • Complete all 25 squares • +100 points'}</div>
      <p className="spark-bingo-note">New cards use fresh activity from their start date. Supper goals use Manager Supper {context.required_supper_number}; schools without Supper are excluded. Labor adjustments are not Bingo tasks.</p>
    </>}
  </section>;
}
