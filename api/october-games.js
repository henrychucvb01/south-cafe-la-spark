import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {makePieces,maskSvg} from '../lib/octoberGeometry.js';

export function previewEnabled(env=process.env){
 return env.VERCEL_ENV==='preview' && ['spark-development','development'].includes(env.VERCEL_GIT_COMMIT_REF);
}
export function createHandler(db,enabled=previewEnabled()){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(!enabled)return res.status(404).json({error:'October Games is available only in SPARK Development.'});
  if(req.method==='GET')return res.status(200).json({enabled:true});
  if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
  const {action='list',token,pin,photo,payload={}}=req.body||{};
  const bucket=db.storage.from('october-games-dev');let staged;
  const rpc=async(action,content)=>{
   const {data,error}=await db.rpc('october_games_dev',{p_action:action,p_token:token||null,p_pin:pin||null,p_payload:content||{}});
   if(error)throw Error(error.code==='PGRST202'?'October Games development database setup is pending. Your existing SPARK features are unaffected.':error.message);return data;
  };
  try{
   // Never accept a caller-provided storage path or puzzle arrangement.
   const content={...payload};delete content.photo_path;delete content.pieces;
   if(photo){
    if(!['submit','round'].includes(action))throw Error('Unexpected photo.');
    const actor=await rpc('authorize');
    if(action==='round'&&!actor.admin)throw Error('Supervisor authorization required.');
    if(typeof photo.base64!=='string'||photo.base64.length>2800000||!/^[A-Za-z0-9+/]+={0,2}$/.test(photo.base64))throw Error('Choose a photo under 2 MB.');
    const input=Buffer.from(photo.base64,'base64');
    const metadata=await sharp(input,{limitInputPixels:20000000}).metadata();
    if(!['webp','jpeg','png'].includes(metadata.format))throw Error('Choose a JPEG, PNG or WebP image.');
    // Re-encode server-side too: guarantees stripped metadata and bounded dimensions.
    const bytes=await sharp(input,{limitInputPixels:20000000}).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:70}).toBuffer();
    staged=`${randomUUID()}/${randomUUID()}.webp`;
    const {error}=await bucket.upload(staged,bytes,{contentType:'image/webp',upsert:false});
    if(error)throw Error('Photo upload failed. Try again.');
    content.photo_path=staged;
    if(action==='round')content.pieces=makePieces();
   }
   const data=await rpc(action==='badge'?'list':action,content);staged=null;
   if(data.old_photo)await bucket.remove([data.old_photo]).catch(()=>{});
   delete data.old_photo;
   if(action==='authorize')return res.status(200).json(data);
   if(action==='badge')return res.status(200).json({participating:data.participating,new_challenge:data.new_challenge});
   const paths=(data.entries||[]).filter(e=>e.photo_path).map(e=>e.photo_path);
   const urls=new Map();
   if(paths.length){const {data:signed,error}=await bucket.createSignedUrls(paths,300);if(error)throw Error('Could not load submission photos.');for(const url of signed)urls.set(url.path,url.signedUrl);}
   for(const e of data.entries||[]){
    if(e.photo_path){e.photo_url=urls.get(e.photo_path);if(!e.photo_url)throw Error('Could not load a photo.');}
    delete e.photo_path;
   }
   for(const r of data.rounds||[]){
    if(r.photo_path){
     if(data.admin||r.solved_at){const {data:url,error}=await bucket.createSignedUrl(r.photo_path,300);if(error)throw Error('Could not load a mystery photo.');r.photo_url=url.signedUrl;}
     else{
      const {data:blob,error}=await bucket.download(r.photo_path);if(error)throw Error('Could not load the mystery.');
      const bytes=Buffer.from(await blob.arrayBuffer());const meta=await sharp(bytes).metadata();
      const masked=await sharp(bytes).ensureAlpha().composite([{input:maskSvg(r.pieces,r.unlocked,meta.width,meta.height),blend:'dest-in'}]).png().toBuffer();
      // Flatten in a separate pass so even fully transparent RGB channels cannot
      // carry hidden pixels that a client could recover by editing the alpha.
      const safe=await sharp(masked).flatten({background:'#352742'}).png().toBuffer();
      r.photo_url=`data:image/png;base64,${safe.toString('base64')}`;
     }
    }
    delete r.photo_path;
    // Coordinates are harmless; retaining them lets the UI outline unrevealed pieces.
   }
   return res.status(200).json(data);
  }catch(error){if(staged)await bucket.remove([staged]).catch(()=>{});return res.status(400).json({error:error.message||'October Games could not be saved.'});}
 };
}
export default async function handler(req,res){
 if(!previewEnabled())return createHandler(null,false)(req,res);
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key)return res.status(503).json({error:'Development Games storage is not configured.'});
 return createHandler(createClient(process.env.SUPABASE_URL||'https://kkrcxqhfzepifhkryodd.supabase.co',key,{auth:{persistSession:false,autoRefreshToken:false}}),true)(req,res);
}
