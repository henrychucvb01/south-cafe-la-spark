import React,{useEffect,useRef,useState} from 'react';
import {openSession,closeSession} from '../supperMonitoring/service';
import {gamesRequest} from '../octoberGames/service';
import './sideQuestGalleries.css';

// Photos are fetched only after the manager explicitly opens the gallery.
export default function SideQuestGalleries({location,employee,managerPin}){
 const [open,setOpen]=useState(false),[photos,setPhotos]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[version,setVersion]=useState(0),[preview,setPreview]=useState(null);
 const dialog=useRef(null);
 useEffect(()=>{if(!open)return;dialog.current?.showModal?.();let stopped=false,token;
  setLoading(true);setPhotos([]);setPreview(null);setError('');
  (async()=>{try{
   token=await openSession(location,employee,managerPin);if(stopped)return;
   const data=await gamesRequest('side_quest_gallery',{token});if(!stopped)setPhotos(data.photos||[]);
  }catch(e){if(!stopped)setError(e.message||'Photos could not be loaded.');}
  finally{if(token)closeSession(token).catch(()=>{});if(!stopped)setLoading(false);}})();
  return()=>{stopped=true;};
 },[open,version,location?.id,employee?.id,employee?.employee_name,employee?.covering,managerPin]);
 return <div className="db-gallery-launch"><button type="button" onClick={()=>setOpen(true)}>View Side Quest photos</button>{open&&<dialog className="db-photo-dialog" ref={dialog} aria-label="Side Quest photos" onClose={()=>{setOpen(false);setPhotos([]);setPreview(null);}} onCancel={()=>setOpen(false)}>
  <button type="button" onClick={()=>{dialog.current?.close?.();setOpen(false);}}>Close ×</button><h3>Side Quest photos</h3>
  <button type="button" disabled={loading} onClick={()=>setVersion(v=>v+1)}>Refresh photos</button>
  {loading&&<p role="status">Loading photos…</p>}{error&&<p role="alert">{error}</p>}{!loading&&!error&&!photos.length&&<p>No approved Side Quest photos yet.</p>}
  <p>Photos load when you open this gallery. Use Refresh photos if a photo link expires.</p>
  {preview&&<><img src={preview.url} alt={preview.school+' — '+preview.quest}/><p>{preview.school} · {preview.quest}</p></>}
  <div className="db-gallery-grid">{photos.map(photo=><button type="button" key={photo.id} onClick={()=>setPreview(photo)}><img loading="lazy" src={photo.url} alt={photo.school+' — '+photo.quest}/><span>{photo.school} · {photo.quest}</span></button>)}</div>
 </dialog>}</div>;
}
