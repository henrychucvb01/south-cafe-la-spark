import React,{useEffect,useState} from 'react';
import {gamesRequest} from '../octoberGames/service';
import {openSession,closeSession} from '../supperMonitoring/service';
import './sparkGames.css';
export function waveAnnouncement(data,now=Date.now()){
 const active=new Set((data.game_cycles||[]).filter(c=>c.state==='active').map(c=>c.id));
 const released=(data.game_waves||[]).filter(w=>active.has(w.cycle_id)&&w.state==='released'&&w.released_count>0&&now-new Date(w.released_at).getTime()<7*86400000).sort((a,b)=>new Date(b.release_at)-new Date(a.release_at));
 if(released.length)return {key:released[0].id,title:'NEW SIDE QUESTS ARE HERE!',description:`${released[0].released_count} new challenges are available.`};
 const upcoming=(data.game_waves||[]).filter(w=>w.state==='planned'&&Number(w.approved_count)>0&&new Date(w.release_at)>now).sort((a,b)=>new Date(a.release_at)-new Date(b.release_at))[0];
 return upcoming?{key:upcoming.id,title:'Upcoming SPARK Games Side Quests',description:`${upcoming.approved_count} challenges release ${new Date(upcoming.release_at).toLocaleString('en-US',{timeZone:'America/Los_Angeles',weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'})}.`}:null;
}
export default function GameAnnouncements({location,employee,managerPin,onOpen}){
 const [notice,setNotice]=useState(null);
 useEffect(()=>{if(!location||!employee)return;let cancelled=false,inFlight=false,token;
 const refresh=async()=>{if(cancelled||inFlight||document.visibilityState==='hidden')return;inFlight=true;try{if(!token)token=await openSession(location,employee,managerPin);if(cancelled)return;const data=await gamesRequest('announcements',{token});if(!cancelled)setNotice(data.participating?waveAnnouncement(data,new Date(data.server_time).getTime()):null);}catch{}finally{inFlight=false;if(cancelled&&token)closeSession(token).catch(()=>{});}};
 refresh();const timer=setInterval(refresh,120000);window.addEventListener('focus',refresh);window.addEventListener('october-games-updated',refresh);return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('october-games-updated',refresh);if(token)closeSession(token).catch(()=>{});};
 },[location?.id,employee?.id,employee?.employee_name,employee?.covering,managerPin]);
 return notice?<aside className="sg-announcement" aria-label="SPARK Games announcement"><div><strong>{notice.title}</strong><div>{notice.description}</div></div><button onClick={onOpen}>Open SPARK Games →</button></aside>:null;
}
