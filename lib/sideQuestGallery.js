// Only already-authorized, approved submissions with publishing consent may be signed.
export async function sideQuestGallery(data,bucket){
 const eligible=[...new Map((data.entries||[]).filter(e=>e.state==='approved'&&e.consent===true&&e.quest>0&&e.photo_path).map(e=>[e.photo_path,e])).values()];
 if(!eligible.length)return {photos:[]};
 const {data:urls,error}=await bucket.createSignedUrls([...new Set(eligible.map(e=>e.photo_path))],300);
 if(error)throw Error('Gallery unavailable.');
 const signed=new Map((urls||[]).filter(u=>!u.error&&u.signedUrl).map(u=>[u.path,u.signedUrl]));
 return {photos:eligible.filter(e=>signed.has(e.photo_path)).map(e=>({id:e.id,url:signed.get(e.photo_path),school:e.school_name||(data.schools||[]).find(s=>String(s.id)===String(e.location_id))?.school_name||'School',quest:e.quest_name||(data.quests||[]).find(q=>q.id===e.quest)?.name||'Side Quest'}))};
}
