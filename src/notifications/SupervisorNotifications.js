import React,{useEffect,useRef,useState} from 'react';
import {loadCounts,enablePush,disablePush,updateBadge} from './service';
import './notifications.css';

export function NotificationSettings({supervisorPin}) {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function change(enable){setBusy(true);setMessage('');try{if(enable)await enablePush(supervisorPin);else await disablePush();setMessage(enable?'Notifications enabled on this device.':'Notifications disabled on this device.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 return <section className="dashboard-card notification-settings"><h3>Supervisor Notifications</h3>
  <p>Get one grouped update when items need your attention.</p>
  <div className="notification-actions"><button disabled={busy} onClick={()=>change(true)}>Enable Notifications</button><button disabled={busy} onClick={()=>change(false)}>Turn off on this device</button></div>
  <p role="status">{message}</p>
  <p>On iPhone: open SPARK in Safari → Share → Add to Home Screen. Open that icon, sign in as supervisor, then tap Enable Notifications.</p>
  <p className="notification-note">Requires iOS 16.4 or later. Allow notifications and badges in iPhone Settings. iOS requires a visible notification for background updates; quiet delivery and badge timing depend on your device settings. Signing out turns off notifications on this device.</p>
 </section>;
}
export default function SupervisorNotifications({supervisorPin,onCategory,onSettings}) {
 const [counts,setCounts]=useState(null),[error,setError]=useState(false),[open,setOpen]=useState(()=>new URLSearchParams(window.location.search).has('supervisorNotifications'));
 const root=useRef(),button=useRef();
 useEffect(()=>{
  let stopped=false,timer,busy=false,failures=0;
  async function refresh(){
   clearTimeout(timer);if(stopped||document.hidden||busy)return;busy=true;
   try{const next=await loadCounts(supervisorPin);if(!stopped){setCounts(next);setError(false);await updateBadge(next.total,next.version);}failures=0;}
   catch{if(!stopped){setError(true);setCounts(null);}failures++;}
   finally{busy=false;if(!stopped)timer=setTimeout(refresh,Math.min(300000,30000*2**failures));}
  }
  refresh();
  const events=['focus','october-games-updated','supervisor-notifications-updated'];
  events.forEach(e=>window.addEventListener(e,refresh));document.addEventListener('visibilitychange',refresh);
  function pushed(event){if(event.data?.type==='open-supervisor-notifications')setOpen(true);refresh();}
  navigator.serviceWorker?.addEventListener('message',pushed);
  return()=>{stopped=true;clearTimeout(timer);events.forEach(e=>window.removeEventListener(e,refresh));document.removeEventListener('visibilitychange',refresh);navigator.serviceWorker?.removeEventListener('message',pushed);};
 },[supervisorPin]);
 useEffect(()=>{
  if(!open)return;
  function close(e){if(e.key==='Escape'){setOpen(false);button.current?.focus();}else if(e.type==='pointerdown'&&!root.current?.contains(e.target))setOpen(false);}
  document.addEventListener('keydown',close);document.addEventListener('pointerdown',close);
  return()=>{document.removeEventListener('keydown',close);document.removeEventListener('pointerdown',close);};
 },[open]);
 return <div className="supervisor-notifications" ref={root}>
  <button ref={button} className="notification-bell" aria-label={`Notifications${counts?`: ${counts.total} pending`:error?' unavailable':''}`} aria-expanded={open} aria-controls="supervisor-notification-panel" onClick={()=>setOpen(!open)}>
   <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
   {counts?.total>0&&<span className="notification-badge">{counts.total}</span>}{error&&<span aria-hidden="true">!</span>}
  </button>
  {open&&<div id="supervisor-notification-panel" className="notification-panel"><h3>Needs attention</h3>
   {error&&<p role="status">Counts unavailable. They will retry automatically.</p>}
   {[['quests','Photo Side Quests'],['monitoring','Monitoring'],['feedback','Feedback']].map(([key,label])=><button key={key} onClick={()=>{setOpen(false);onCategory(key);}}><span>{label}</span><strong>{counts?.[key]??'—'}</strong></button>)}
   <button className="notification-settings-link" onClick={()=>{setOpen(false);onSettings();}}>Notification settings</button>
  </div>}
 </div>;
}
