import OctoberGames from "../octoberGames/OctoberGames";
import React,{useEffect,useRef,useState} from 'react';
import {openSession,closeSession} from '../supperMonitoring/service';
import {spotlightRequest} from './service';
import SpotlightCard from './SpotlightCard';
export default function SpotlightFeed({location,employee,managerPin,archive=false,onViewAll}){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(null),[more,setMore]=useState(false);
 const session=useRef(null);const limit=archive?20:3;
 useEffect(()=>{let cancelled=false,token;
  setLoading(true);setRows([]);setError('');
  (async()=>{try{token=await openSession(location,employee,managerPin);if(cancelled)return;session.current=token;
   const posts=await spotlightRequest('list',{token,limit});if(!cancelled){setRows(posts);setMore(posts.length===limit);}
  }catch(e){if(!cancelled)setError(e.message);}finally{if(!cancelled)setLoading(false);else if(token)closeSession(token).catch(()=>{});}})();
  return()=>{cancelled=true;session.current=null;if(token)closeSession(token).catch(()=>{});};
 },[location.id,employee.id,employee.employee_name,employee.covering,managerPin,limit]);
 async function react(post,reaction){setBusy(post.id);setError('');try{const result=await spotlightRequest('react',{token:session.current,id:post.id,reaction});setRows(old=>old.map(p=>p.id===post.id?{...p,...result}:p));}catch(e){setError(e.message);}finally{setBusy(null);}}
 async function loadMore(){setBusy('more');setError('');try{const posts=await spotlightRequest('list',{token:session.current,offset:rows.length,limit});setRows(old=>[...old,...posts]);setMore(posts.length===limit);}catch(e){setError(e.message);}finally{setBusy(null);}}
 return <section className="spotlight-section" aria-label="SPARK Spotlight"><header className="spotlight-heading"><div><span className="spotlight-eyebrow">GOOD NEWS. GREAT PEOPLE.</span><h2>✦ SPARK Spotlight</h2><p>Celebrating the people and schools that make SPARK shine.</p></div>{!archive&&<button type="button" className="spotlight-secondary" onClick={onViewAll}>View All Spotlights →</button>}</header>
  {error&&<p role="alert">{error}</p>}{loading?<p>Loading Spotlights…</p>:!rows.length&&!error?<p>The next SPARK celebration is coming soon.</p>:null}
  <div className={archive?'spotlight-archive-grid':'spotlight-feed-grid'}>{rows.map(post=><SpotlightCard key={post.id} post={post} onReact={react} busy={!!busy}/>)}</div>
  {archive&&more&&<button className="spotlight-secondary" disabled={!!busy} onClick={loadMore}>Load older Spotlights</button>}
  {archive&&<OctoberGames location={location} employee={employee} managerPin={managerPin} galleryOnly/>}
  {!!rows.length&&<small>One reaction per school. Change your reaction anytime. Reactions do not earn points.</small>}
 </section>;
}
