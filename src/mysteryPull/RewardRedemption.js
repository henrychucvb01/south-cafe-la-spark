import React,{useEffect,useState} from 'react';
import {mysteryRpc} from './service';

export default function RewardRedemption({token,prize,onClose,onRedeemed}) {
 const [options,setOptions]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const [date,setDate]=useState(''),[square,setSquare]=useState(''),[goal,setGoal]=useState('');
 const [pending,setPending]=useState(null);
 useEffect(()=>{let active=true;mysteryRpc('redemption_options',{p_token:token,p_win:prize.id}).then(value=>{if(active)setOptions(value);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[token,prize.id]);
 const bingo=options?.bingo,isBingo=prize.reward_type.startsWith('bingo_');
 const ready=options&&(prize.reward_type==='double_bites'||(isBingo?square!==''&&(prize.reward_type==='bingo_free'||goal):date));
 async function redeem(){
  const details=pending||(isBingo?{card:bingo.card.id,revision:bingo.card.revision,square:Number(square),...(prize.reward_type==='bingo_change'?{goal}:{})}:prize.reward_type==='double_bites'?{}:{date});
  setPending(details);setBusy(true);setError('');
  try {const result=await mysteryRpc('redeem',{p_token:token,p_win:prize.id,p_details:details});await onRedeemed(result);}
  catch(e){setError(e.message);if(e.confirmed)setPending(null);}
  finally{setBusy(false);}
 }
 return <section className="mystery-editor" aria-label="Redeem prize"><h2>{prize.prize_name}</h2>
  {error&&<p role="alert" className="mystery-error">{error}</p>}
  {busy&&!options&&<p>Loading your choices…</p>}
  <fieldset disabled={busy||!!pending} style={{border:0,padding:0}}>
   {prize.reward_type==='late_checklist'&&<label>Late checklist<select value={date} onChange={e=>setDate(e.target.value)}><option value="">Choose a checklist</option>{options?.dates.map(d=><option key={d} value={d}>{d}</option>)}</select>{options&&!options.dates.length&&<p>No eligible late checklists. This prize will stay in your inventory.</p>}</label>}
   {prize.reward_type==='streak_shield'&&<label>Missed qualifying day<input type="date" min="2026-09-03" value={date} onChange={e=>setDate(e.target.value)}/><p>Protects one past missed weekday. It does not submit a checklist or add a completed day to your streak.</p></label>}
   {isBingo&&bingo&&<><label>Incomplete square<select value={square} onChange={e=>setSquare(e.target.value)}><option value="">Choose a square</option>{bingo.goals.map((g,i)=>!g.completed&&i!==12&&<option key={g.id} value={i}>{i+1}. {g.label} — {g.detail}</option>)}</select></label>{prize.reward_type==='bingo_change'&&<label>Replacement task<select value={goal} onChange={e=>setGoal(e.target.value)}><option value="">Choose a task</option>{bingo.replacement_goals.map(g=><option key={g.id} value={g.id}>{g.label} — {g.detail}</option>)}</select><p>Your regular monthly repick remains available.</p></label>}</>}
   {prize.reward_type==='double_bites'&&<p>Starts immediately when won. Doubles Daily Bites visit, Word, Connections and AR Training points for one calendar month. Existing points are unchanged. Another double-points prize can be saved until this one ends.</p>}
  </fieldset>
  <div className="mystery-section-title"><button className="mystery-primary" disabled={busy||(!ready&&!pending)} onClick={redeem}>{pending?'Retry redemption':'Redeem prize'}</button><button className="mystery-secondary" disabled={busy} onClick={onClose}>Keep in inventory</button></div>
 </section>;
}
