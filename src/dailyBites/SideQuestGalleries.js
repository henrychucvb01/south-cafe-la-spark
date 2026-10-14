import React,{useEffect,useRef,useState} from 'react';
import {openSession,closeSession} from '../supperMonitoring/service';
import {gamesRequest} from '../octoberGames/service';
import {pickPhoto,gallerySpace} from './sideGalleryModel';
import './sideQuestGalleries.css';
export default function SideQuestGalleries({contentRef,location,employee,managerPin}){
 const [space,setSpace]=useState(null),[photos,setPhotos]=useState([]),[visible,setVisible]=useState(!document.hidden),[reduced,setReduced]=useState(false),[slides,setSlides]=useState([{},{}]),[preview,setPreview]=useState(null);
 const current=useRef(slides),dialog=useRef(null);current.current=slides;
 useEffect(()=>{const measure=()=>setSpace(contentRef.current?gallerySpace(contentRef.current.getBoundingClientRect(),window.innerWidth,window.innerHeight):null);const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;if(contentRef.current)observer?.observe(contentRef.current);window.addEventListener('resize',measure);measure();return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};},[contentRef]);
 useEffect(()=>{const mq=window.matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>setReduced(mq.matches),visibility=()=>setVisible(!document.hidden);motion();mq.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);return()=>{mq.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);};},[]);
 const wide=!!space;
 useEffect(()=>{if(!wide||!visible)return;let stopped=false,token,timer;
  const load=async()=>{try{if(!token)token=await openSession(location,employee,managerPin);if(stopped)return;const data=await gamesRequest('side_quest_gallery',{token});if(!stopped)setPhotos(data.photos||[]);}catch{if(!stopped){setPhotos([]);setPreview(null);}}finally{if(stopped&&token)closeSession(token).catch(()=>{});}};
  load();timer=setInterval(load,240000);window.addEventListener('october-games-updated',load);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('october-games-updated',load);setPhotos([]);setPreview(null);if(token)closeSession(token).catch(()=>{});};
 },[wide,visible,location,employee,managerPin]);
 useEffect(()=>{setSlides(old=>{const existing=id=>photos.find(p=>p.id===id);const rightOld=existing(old[1].photo?.id);const left=existing(old[0].photo?.id)||pickPhoto(photos,[rightOld?.id])||rightOld;const right=rightOld&&rightOld.id!==left?.id?rightOld:pickPhoto(photos,[left?.id])||left;return [{photo:left},{photo:right}];});setPreview(old=>old?photos.find(p=>p.id===old.id)||null:null);},[photos]);
 useEffect(()=>{if(!wide||!visible||reduced||photos.length<3)return;let stopped=false;const timers=new Set(),loading=[];
  const later=(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);};
  const rotate=side=>{if(stopped)return;const other=current.current[1-side],own=current.current[side],next=pickPhoto(photos,[other.photo?.id,other.previous?.id,own.photo?.id]);
   if(next){const img=new Image();loading.push(img);img.onload=()=>{if(stopped)return;const otherNow=current.current[1-side];if([otherNow.photo?.id,otherNow.previous?.id].includes(next.id))return;setSlides(old=>old.map((s,i)=>i===side?{photo:next,previous:s.photo}:s));later(()=>setSlides(old=>old.map((s,i)=>i===side?{photo:s.photo}:s)),650);};img.onerror=()=>{if(!stopped)setPhotos(old=>old.filter(p=>p.id!==next.id));};img.src=next.url;}
   later(()=>rotate(side),7000);
  };later(()=>rotate(0),7000);later(()=>rotate(1),10500);
  return()=>{stopped=true;timers.forEach(clearTimeout);loading.forEach(img=>{img.onload=null;img.onerror=null;});};
 },[wide,visible,reduced,photos]);
 useEffect(()=>{if(preview&&dialog.current&&!dialog.current.open)dialog.current.showModal();},[preview]);
 if(!space||!photos.length)return null;
 return <><aside className="db-side-gallery db-side-left" style={{width:space.left}} aria-label="Side Quest photos, left">{card(0)}</aside><aside className="db-side-gallery db-side-right" style={{width:space.right}} aria-label="Side Quest photos, right">{card(1)}</aside>{preview&&<dialog className="db-photo-dialog" ref={dialog} onClose={()=>setPreview(null)} onClick={e=>{if(e.target===e.currentTarget){dialog.current.close();setPreview(null);}}}><button autoFocus onClick={()=>{dialog.current.close();setPreview(null);}} aria-label="Close photo preview">Close ×</button><img src={preview.url} alt={`${preview.school} — ${preview.quest}`}/><p>{preview.school} · {preview.quest}</p></dialog>}</>;
 function card(side){const {photo,previous}=slides[side];if(!photo)return null;return <button className="db-side-photo" onClick={()=>setPreview(photo)} aria-label={`View ${photo.school} — ${photo.quest}`}><span className="db-side-image">{previous&&<img className="db-side-previous" src={previous.url} alt="" aria-hidden="true"/>}<img key={photo.id} className={previous?'db-side-current':''} src={photo.url} alt={`${photo.school} — ${photo.quest}`} onError={()=>setPhotos(old=>old.filter(p=>p.id!==photo.id))}/></span><span className="db-side-caption"><strong>{photo.school}</strong><span>{photo.quest}</span></span></button>;}
}
