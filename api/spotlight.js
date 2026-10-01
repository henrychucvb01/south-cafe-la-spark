import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';

export function imageBytes(photo) {
 if(!photo || typeof photo.base64!=='string' || photo.base64.length>2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.base64)) throw Error('Choose a JPEG, PNG or WebP photo under 2 MB.');
 const bytes=Buffer.from(photo.base64,'base64');
 const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 const type=jpg?'image/jpeg':png?'image/png':webp?'image/webp':null;
 if(!type || bytes.length>2097152 || bytes.length<12) throw Error('Choose a valid JPEG, PNG or WebP photo under 2 MB.');
 return {bytes,type,extension:jpg?'jpg':png?'png':'webp'};
}
export function createHandler(database) {
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
  const {action,token,pin,id,revision,payload,photo,offset=0,limit=20,reaction}=req.body||{};
  const bucket=database.storage.from('spotlight-photos');let staged;
  const rpc=async(name,args)=>{const {data,error}=await database.rpc(name,args);if(error)throw Error(error.message);return data;};
  try {
   if(action==='list') {
    const posts=await rpc('spotlight_list',{p_token:token||null,p_pin:pin||null,p_offset:offset,p_limit:limit});
    for(const post of posts) if(post.photo_path){const {data,error}=await bucket.createSignedUrl(post.photo_path,3600);if(error)throw Error('Could not load Spotlight photo.');post.photo_url=data.signedUrl;}
    return res.status(200).json(posts);
   }
   if(action==='react'){const result=await rpc('spotlight_react',{p_token:token,p_id:id,p_reaction:reaction});return res.status(200).json(result);}
   if(!['save','publish','unpublish','delete'].includes(action))return res.status(400).json({error:'Invalid Spotlight action.'});
   if(await rpc('verify_supervisor_pin',{p_pin:pin})!==true) return res.status(403).json({error:'Supervisor authorization required.'});
   const content={...payload};
   if(action==='save'&&photo){
    const {bytes,type,extension}=imageBytes(photo);staged=`${randomUUID()}/${randomUUID()}.${extension}`;
    const {error}=await bucket.upload(staged,bytes,{contentType:type,upsert:false});if(error)throw Error('Photo upload failed. Please try again.');content.photo_path=staged;
   }
   const result=await rpc('spotlight_manage',{p_pin:pin,p_action:action,p_id:id||null,p_revision:revision||null,p_payload:content});
   staged=null; // DB now owns the photo. Cleanup failures must never undo a saved post.
   if(result.old_photo) await bucket.remove([result.old_photo]).catch(()=>{});
   return res.status(200).json(result.post||{ok:true});
  }catch(error){if(staged)await bucket.remove([staged]).catch(()=>{});return res.status(400).json({error:error.message||'Could not save Spotlight.'});}
 };
}
export default async function handler(req,res){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)return res.status(503).json({error:'Spotlight storage is not configured.'});
 return createHandler(createClient(process.env.SUPABASE_URL||'https://kkrcxqhfzepifhkryodd.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}}))(req,res);
}
