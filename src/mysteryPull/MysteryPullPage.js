import React,{useEffect,useState} from 'react';
import {usePageNavigation} from '../navigation/PageNavigation';
import {mysteryRpc,readSaved,saveSession} from './service';
import MysteryManager from './MysteryManager';
import MysterySupervisor from './MysterySupervisor';
import './mysteryPull.css';
export default function MysteryPullPage({onBack}) {
 const [session,setSession]=useState(()=>readSaved('spark-mystery-session')),[code,setCode]=useState(''),[schoolCode,setSchoolCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[checking,setChecking]=useState(true);
 usePageNavigation({title:'Mystery Pull',destination:'SPARK',onNavigate:onBack});
 useEffect(()=>{let active=true;async function restore(){if(session?.token){try{const context=await mysteryRpc('context',{p_token:session.token});if(active)setSession(current=>({...current,role:context.role}));}catch(e){if(active){if(/expired/i.test(e.message)){sessionStorage.removeItem('spark-mystery-session');setSession(null);}setError(e.message);}}}if(active)setChecking(false);}restore();return()=>{active=false;};},[]);
 async function enter(e){e.preventDefault();if(busy)return;setBusy(true);setError('');try{const next=session?.role==='entry'?await mysteryRpc('choose_school',{p_token:session.token,p_location_code:schoolCode}):await mysteryRpc('open',{p_code:code});saveSession(next);setSession(next);setCode('');}catch(err){setError(err.message);}finally{setBusy(false);}}
 function signOut(){if(session?.token)mysteryRpc('close',{p_token:session.token}).catch(()=>{});sessionStorage.removeItem('spark-mystery-session');setSession(null);setCode('');setSchoolCode('');setError('');}
 return <main className="mystery-app"><div className="mystery-shell"><header className="mystery-brand"><div><span className="mystery-brand-star">✦</span> SPARK <strong>MYSTERY PULL</strong></div>{session&&<button className="mystery-secondary" onClick={signOut}>Sign out</button>}</header>
  {checking?<p role="status">Opening Mystery Pull…</p>:session?.role==='manager'?<MysteryManager token={session.token} onExpired={signOut}/>:session?.role==='supervisor'?<MysterySupervisor token={session.token} onExpired={signOut}/>:<section className="mystery-entry"><p className="mystery-eyebrow">THE SPARK SIDE QUEST</p><div className="mystery-entry-art" aria-hidden="true">✦</div><h1>A little mystery.<br/>A delicious surprise.</h1><p>Pull something unexpected. Your school’s prizes live here.</p><form onSubmit={enter}>
   {session?.role==='entry'?<label>Your school/location code<input autoFocus required inputMode="numeric" autoComplete="off" maxLength="4" pattern="[0-9]{4}" value={schoolCode} onChange={e=>setSchoolCode(e.target.value.replace(/\D/g,''))}/></label>:<label>Mystery Pull access code<input autoFocus required type="password" inputMode="numeric" autoComplete="off" maxLength="4" pattern="[0-9]{4}" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label>}
   {error&&<p className="mystery-error" role="alert">{error}</p>}<button className="mystery-primary" disabled={busy||(session?.role==='entry'?schoolCode:code).length!==4}>{busy?'Opening…':session?.role==='entry'?'Find my school':'Enter Mystery Pull'}</button>
  </form><p className="mystery-fine-print">A fun extra, separate from your daily operations.</p></section>}
 </div></main>;
}
