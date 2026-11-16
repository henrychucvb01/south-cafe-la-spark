export const PHOTO_PAGE_SIZE=18;
export const MAX_PHOTO_DOWNLOADS=30;
export async function supervisorPhotoLibrary({db,bucket,photoCache,pin,production,action,payload}){
 const {data,error}=await db.rpc('spark_games_photo_library',{p_pin:pin||null,p_development:!production});
 if(error)throw Error(error.message);
 if(!Array.isArray(data))throw Error('Photo library unavailable.');
 const schools=[...new Map(data.map(p=>[String(p.school_id),{id:String(p.school_id),name:p.school}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
 const contests=[...new Map(data.map(p=>[p.contest_id,{id:p.contest_id,name:p.contest}])).values()].sort((a,b)=>a.name.localeCompare(b.name));
 let photos,total,page;
 if(action==='photo_library_download'){
  if(!Array.isArray(payload.ids)||!payload.ids.length||payload.ids.length>MAX_PHOTO_DOWNLOADS||payload.ids.some(id=>typeof id!=='string'))throw Error('Choose 1 to 30 photos.');
  const ids=new Set(payload.ids);photos=data.filter(p=>ids.has(p.id));
  if(photos.length!==ids.size)throw Error('A photo is no longer available for sharing. Refresh the library.');
 }else{
  const filtered=data.filter(p=>(!payload.school||String(p.school_id)===String(payload.school))&&(!payload.contest||p.contest_id===payload.contest)&&(!payload.category||p.category===payload.category)&&(!payload.from||p.date>=payload.from)&&(!payload.to||p.date<=payload.to));
  total=filtered.length;page=Math.max(1,Math.min(Math.ceil(total/PHOTO_PAGE_SIZE)||1,Math.floor(Number(payload.page)||1)));photos=filtered.slice((page-1)*PHOTO_PAGE_SIZE,page*PHOTO_PAGE_SIZE);
 }
 const {data:signed}=await photoCache.signedUrls(bucket,photos.map(p=>p.photo_path));const urls=new Map(signed.map(s=>[s.path,s.signedUrl]));
 return {photos:photos.map(({photo_path,...p})=>{const url=urls.get(photo_path);if(!url)throw Error('Could not load a library photo.');return {...p,url};}),...(action==='photo_library'?{schools,contests,total,page,page_size:PHOTO_PAGE_SIZE}: {})};
}
