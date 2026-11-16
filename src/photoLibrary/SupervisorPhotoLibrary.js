import React,{useEffect,useRef,useState} from 'react';
import {gamesRequest} from '../octoberGames/service';
import {photoFilename,photoZip,saveBlob} from './downloads';
import './photoLibrary.css';
const initial={school:'',contest:'',category:'',from:'',to:'',page:1};
export default function SupervisorPhotoLibrary({supervisorPin}){
 const [filters,setFilters]=useState(initial),[result,setResult]=useState(null),[selected,setSelected]=useState(new Set()),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[refresh,setRefresh]=useState(0);
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{let current=true;setLoading(true);setError('');gamesRequest('photo_library',{pin:supervisorPin},filters).then(data=>{if(current)setResult(data);}).catch(e=>{if(current){setResult(null);setError(e.message);}}).finally(()=>{if(current)setLoading(false);});return()=>{current=false;};},[supervisorPin,filters,refresh]);
 function filter(name,value){setFilters(old=>({...old,[name]:value,page:1}));setSelected(new Set());setMessage('');}
 function toggle(id){setSelected(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else if(next.size<30)next.add(id);return next;});}
 async function download(ids,zip=false){setBusy(true);setError('');setMessage('Preparing download…');try{
  const data=await gamesRequest('photo_library_download',{pin:supervisorPin},{ids});const files=[];
  for(const [index,p] of data.photos.entries()){
   if(!mounted.current)return;
   setMessage(`Downloading ${index+1} of ${data.photos.length}…`);
   let response=await fetch(p.url,{cache:'force-cache'});
   if([400,403].includes(response.status)){const renewed=await gamesRequest('photo_library_download',{pin:supervisorPin},{ids:[p.id]});response=await fetch(renewed.photos[0].url,{cache:'force-cache'});}
   if(!response.ok)throw Error('Photo download failed. Please try again.');
   const bytes=await response.arrayBuffer();if(!mounted.current)return;files.push({name:photoFilename(p),bytes});
  }
  if(zip)saveBlob(photoZip(files),'SPARK-game-photos.zip');else saveBlob(new Blob([files[0].bytes],{type:'image/webp'}),files[0].name);
  if(mounted.current)setMessage(`${files.length} ${files.length===1?'photo':'photos'} downloaded.`);
 }catch(e){if(mounted.current){setError(e.message);setMessage('');}}finally{if(mounted.current)setBusy(false);}}
 const pages=Math.max(1,Math.ceil((result?.total||0)/(result?.page_size||18)));
 return <section className="spark-photo-library"><header><div><h2>SPARK Photo Library</h2><p>Approved game photos with permission to publish, including past decoration contests and Side Quest Showdowns. Mystery answers and pending submissions stay private.</p></div><button disabled={loading||busy} onClick={()=>setRefresh(n=>n+1)}>Refresh photos</button></header>
  <div className="spl-filters"><label>School<select value={filters.school} disabled={busy} onChange={e=>filter('school',e.target.value)}><option value="">All schools</option>{result?.schools?.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label>Photo type<select value={filters.category} disabled={busy} onChange={e=>filter('category',e.target.value)}><option value="">All game photos</option><option value="decoration">Decoration contests</option><option value="side_quest">Side Quests</option><option value="showdown">Side Quest Showdowns</option></select></label>
   <label>Contest or challenge<select value={filters.contest} disabled={busy} onChange={e=>filter('contest',e.target.value)}><option value="">All contests and challenges</option>{result?.contests?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>From<input type="date" value={filters.from} disabled={busy} onChange={e=>filter('from',e.target.value)}/></label><label>Through<input type="date" value={filters.to} disabled={busy} onChange={e=>filter('to',e.target.value)}/></label>
  </div>
  <div className="spl-toolbar"><span>{result?.total??0} photos · {selected.size}/30 selected</span><div><button disabled={loading||busy||!result?.photos.length} onClick={()=>{const next=new Set(selected);for(const p of result.photos){if(next.size>=30)break;next.add(p.id);}setSelected(next);}}>Select this page</button><button disabled={busy||!selected.size} onClick={()=>setSelected(new Set())}>Clear selection</button><button disabled={loading||busy||!selected.size} onClick={()=>download([...selected],true)}>Download selected ZIP</button></div></div>
  {error&&<p className="spl-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  {loading?<p role="status">Loading photo library…</p>:result?.photos.length?<div className="spl-grid">{result.photos.map(p=><article key={p.id}><label className="spl-select"><input type="checkbox" disabled={busy||(!selected.has(p.id)&&selected.size>=30)} checked={selected.has(p.id)} onChange={()=>toggle(p.id)}/>Select {p.school} photo</label><a href={p.url} target="_blank" rel="noreferrer" aria-label={`Open ${p.school} — ${p.contest}`}><img loading="lazy" src={p.url} alt={`${p.school} — ${p.contest}`}/></a><div className="spl-caption"><h3>{p.school}</h3><p>{p.contest}</p><p><time>{p.date}</time> · {({decoration:'Decoration Contest',side_quest:'Side Quest',showdown:'Showdown'})[p.category]}</p><button disabled={busy} onClick={()=>download([p.id])}>Download photo</button></div></article>)}</div>:!error&&<p>No approved photos match these filters.</p>}
  {result&&<nav className="spl-pages" aria-label="Photo pages"><button disabled={loading||busy||filters.page<=1} onClick={()=>setFilters(old=>({...old,page:old.page-1}))}>Previous photos</button><span>Page {result.page} of {pages}</span><button disabled={loading||busy||result.page>=pages} onClick={()=>setFilters(old=>({...old,page:result.page+1}))}>Next photos</button></nav>}
  <p className="spl-note">Photos load only while this library is open. Downloads use your existing bandwidth allowance. Select up to 30 photos per ZIP.</p>
 </section>;
}
