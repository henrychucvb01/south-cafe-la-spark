export const CATEGORIES=['Recognition','SPARK Cup','Golden Apron','Announcement','Challenge'];
export const REACTIONS=[['love','❤️','Love It'],['awesome','🔥','Awesome'],['great','👏','Great Job'],['spark','⚡','SPARK!']];
export async function spotlightRequest(action,params={}){
 const response=await fetch('/api/spotlight',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...params})});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load Spotlight.');return data;
}
export async function preparePhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10485760)throw Error('Choose a JPEG, PNG or WebP photo up to 10 MB.');
 const url=URL.createObjectURL(file);
 try{
  const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('This photo could not be opened.'));img.src=url;});
  const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const preview=canvas.toDataURL('image/jpeg',0.85);if(preview.length>2800000)throw Error('Choose a smaller photo.');
  return {preview,base64:preview.split(',')[1]};
 }finally{URL.revokeObjectURL(url);}
}
