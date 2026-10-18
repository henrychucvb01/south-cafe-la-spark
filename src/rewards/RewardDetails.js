import React,{useEffect,useState} from 'react';
import {WHEEL_TYPES,eligibleSegments,pointLabel} from './model';
import WheelDisplay from './WheelDisplay';
export function auctionView(reward,school,now=Date.now()){
 const a=reward.auction||{},highest=Number(a.highest_bid)||0,starting=Number(reward.config.starting_bid)||0,increment=Number(reward.config.increment)||1;
 const closes=a.closes_at||reward.closes_at,open=reward.opens_at?new Date(reward.opens_at).getTime():null,end=closes?new Date(closes).getTime():null;
 const status=reward.fulfillment==='canceled'?'Canceled':a.settled?'Closed':end&&now>=end?'Closed':open&&now<open?'Upcoming':open&&end?'Open':'Not scheduled';
 return {highest,next:highest?highest+increment:starting,status,closes,remaining:end?Math.max(0,end-now):null,reserveMet:!!a.reserve_met,ownBid:Number(a.own_bid)||0,leading:!!a.leading,extended:!!a.extended};
}
export function Countdown({closes,now}){const [clock,setClock]=useState(Date.now());useEffect(()=>{if(now!=null)return;const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[now]);if(!closes)return <small>Closing time not configured</small>;const seconds=Math.max(0,Math.ceil((new Date(closes).getTime()-(now??clock))/1000));return <small aria-label="Auction countdown">{seconds===0?'Auction closed':`${Math.floor(seconds/86400)}d ${Math.floor(seconds/3600)%24}h ${Math.floor(seconds/60)%60}m ${seconds%60}s remaining`}</small>;}
export default function RewardDetails({reward:r,school,now}){
 const total=Number(r.contributed)||0,goal=Number(r.config.goal)||0,remaining=Math.max(0,goal-total),a=r.type==='auction'?auctionView(r,school,now):null;
 return <>
  {r.type==='fixed'&&<><strong>{pointLabel(r)}</strong>{r.fulfillment==='fulfilled'?<strong>Fulfilled</strong>:r.claimed?<strong>Claimed · Awaiting fulfillment</strong>:null}</>}
  {(r.type==='pool'||r.type==='wheel')&&<><strong>{pointLabel(r)} goal</strong><progress value={total} max={goal||1} aria-label="Community goal progress"/><small>{total.toLocaleString()} contributed · {goal?remaining.toLocaleString():'—'} remaining</small>{goal>0&&!remaining&&<strong>{r.type==='wheel'?'Wheel unlocked · Awaiting Supervisor session':'Goal Reached'}</strong>}{r.type==='pool'&&r.config.show_names&&r.contributions?.length>0&&<details><summary>Contributors</summary><ul>{r.contributions.map((c,i)=><li key={i}>{c.name} · {c.amount.toLocaleString()} points</li>)}</ul></details>}{r.type==='wheel'&&<><small>{WHEEL_TYPES[r.config.wheel_type]||'Wheel type not configured'}</small><details className="sr-card-wheel"><summary>Wheel Preview</summary><WheelDisplay segments={eligibleSegments(r.config)} testMode/></details></>}</>}
  {a&&<><strong>{a.highest?'Current highest bid':'Starting bid'}: {(a.highest||Number(r.config.starting_bid)||0).toLocaleString()} SPARK Points</strong><small>Minimum next bid: {a.next.toLocaleString()} points</small><strong>{a.reserveMet?'Reserve Met':'Reserve Not Met'}</strong><small>{a.status} · Anonymous bidding</small><Countdown closes={a.closes} now={now}/>{a.extended&&<strong>Auction Extended</strong>}{a.ownBid>0&&<><small>Your bid: {a.ownBid.toLocaleString()} points</small><strong>{a.leading?'You are the highest bidder!':"You've been outbid!"}</strong></>}</>}
  {r.type==='auction'&&r.opens_at&&<small>Opens {new Date(r.opens_at).toLocaleString()}</small>}{r.type==='auction'&&(r.auction?.closes_at||r.closes_at)&&<small>Closes {new Date(r.auction?.closes_at||r.closes_at).toLocaleString()}</small>}
 </>;
}
