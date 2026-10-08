import {useEffect,useState} from 'react';
export async function gamesRequest(action,auth={},payload={},photo){
 const response=await fetch('/api/october-games',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...auth,payload,photo})});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load October Games.');return data;
}
let available;
export function useOctoberMode(){
 const [mode,setMode]=useState(null);
 useEffect(()=>{let current=true;if(typeof fetch!=='function')return;
  if(!available)available=fetch('/api/october-games').then(r=>r.ok?r.json():null).then(d=>d?.enabled?(d.mode||'preview'):null).catch(()=>null);
  available.then(v=>{if(current)setMode(v);});return()=>{current=false;};
 },[]);return mode;
}
export function useOctoberAvailable(){return !!useOctoberMode();}
export async function prepareGamePhoto(file){
 if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('Choose a JPEG, PNG or WebP photo under 20 MB.');
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Could not open this image.'));image.src=url;});
  const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  let quality=.7,blob;
  const encode=q=>new Promise(resolve=>canvas.toBlob(resolve,'image/webp',q));
  do{blob=await encode(quality);quality-=.1;}while(blob&&blob.size>250000&&quality>=.4);
  if(!blob||blob.type!=='image/webp'||blob.size>2097152)throw Error('Could not compress this photo. Try a smaller image.');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  return {base64:data.split(',')[1],preview:data,size:blob.size};
 }finally{URL.revokeObjectURL(url);}
}
