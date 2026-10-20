import React,{useEffect,useRef,useState} from 'react';
import './sparkGames.css';
import {ShowdownCardTools,showdownChampion} from './SideQuestShowdowns';
export default function CompletedCollection({data,onRevealed,scope='preview',onChallenge=()=>{}}){
 const [zoom,setZoom]=useState(null);
 const [reduced,setReduced]=useState(()=>Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
 const [batch,setBatch]=useState([]),[pending,setPending]=useState([]);
 const callback=useRef(onRevealed);callback.current=onRevealed;
 const seen=useRef(new Set());const started=useRef(new Set());
 const cards=data.quests.filter(q=>q.first_school).map(q=>({quest:q,entry:showdownChampion(data,q)||data.entries.find(e=>e.quest===q.id&&String(e.location_id)===String(q.first_school)&&e.state==='approved'),school:data.schools.find(s=>String(s.id)===String(q.first_school))?.school_name||'School'}));
 const signature=cards.filter(c=>c.entry?.photo_url).map(c=>c.quest.id).join(',');
 const revealed=(data.games_revealed||[]).join(',');
 useEffect(()=>{const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');const change=()=>setReduced(Boolean(media?.matches));media?.addEventListener?.('change',change);return()=>media?.removeEventListener?.('change',change);},[]);
 function finish(ids){ids.forEach(id=>seen.current.add(id));try{localStorage.setItem(`spark-games-revealed:${scope}`,JSON.stringify([...seen.current]));}catch{}setBatch([]);setPending([]);callback.current?.(ids);}
 useEffect(()=>{try{seen.current=new Set(JSON.parse(localStorage.getItem(`spark-games-revealed:${scope}`)||'[]'));}catch{seen.current=new Set();}started.current=new Set();},[scope]);
 useEffect(()=>{revealed.split(',').filter(Boolean).map(Number).forEach(id=>seen.current.add(id));const ids=signature.split(',').filter(Boolean).map(Number).filter(id=>!seen.current.has(id)&&!started.current.has(id));if(!ids.length)return;ids.forEach(id=>started.current.add(id));if(reduced){finish(ids);return;}setPending(ids);setBatch(ids.slice(0,6));
 // Changing signed photo URLs must not replay or restart this timer.

 },[signature,revealed,reduced,scope]);
 useEffect(()=>{if(!pending.length)return;if(reduced){finish(pending);return;}const timer=setTimeout(()=>finish(pending),2600);return()=>clearTimeout(timer);

 },[pending,reduced]);
 const count=batch.length;
 const spins=batch.map((id,i)=>{const forward=i*.1,reverse=.85+(count-1-i)*.1;const percent=x=>(x/2.6*100).toFixed(2);return `@keyframes sg-cascade-${i}{0%,${percent(forward)}%{transform:rotateY(0deg) scale(1)}${percent(forward+.28)}%,${percent(reverse)}%{transform:rotateY(360deg) scale(1)}${percent(reverse+.28)}%,80%{transform:rotateY(0deg) scale(1)}86%{transform:rotateY(0deg) scale(1.12)}100%{transform:rotateY(0deg) scale(1)}}`;}).join('');
 return <section className="sg-collection"><div className="sg-collection-header"><h4>Completed Side Quests</h4>{batch.length>0&&<button onClick={()=>finish(pending)}>Skip celebration</button>}</div><style>{spins}</style>{!cards.length?<p>Winning photographs will appear here after approval.</p>:<div className="sg-completed-grid">{cards.map(({quest:q,entry,school})=>{const index=batch.indexOf(q.id);return <div key={q.id} className="sg-showdown-card"><button className={`sg-photo-card ${index>=0?'sg-cascading':''}`} style={index>=0?{animation:`sg-cascade-${index} 2.6s ease both`}:undefined} onClick={()=>{if(batch.length)finish(pending);if(entry?.photo_url)setZoom({url:entry.photo_url,alt:`${school}: ${q.name}`});}} aria-label={`Enlarge winning photo: ${q.name}, ${school}`}>
 {entry?.photo_url?<span className="sg-visual"><span className="sg-visual-inner"><img src={entry.photo_url} alt={`${school}: ${q.name} winning photograph`}/>{index>=0&&<span className="sg-preview-face">{q.name}</span>}</span></span>:<span className="sg-preview-face">Winning photograph is temporarily unavailable. Refresh to retry.</span>}<span><strong>{q.name}</strong></span><span>{school}</span><span>{q.reward_points??10} SPARK Points</span></button><ShowdownCardTools data={data} quest={q} onChallenge={onChallenge}/></div>;})}</div>}
 {zoom&&<div className="sg-lightbox" role="dialog" aria-modal="true" aria-label="Winning photograph" onKeyDown={e=>e.key==='Escape'&&setZoom(null)}><button autoFocus onClick={()=>setZoom(null)}>Close photo</button><img src={zoom.url} alt={zoom.alt}/></div>}
 </section>;
}
