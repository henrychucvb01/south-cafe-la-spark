import {createClient} from '@supabase/supabase-js';
import webpush from 'web-push';
import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {serverDatabase} from '../src/security/databaseEnvironment.js';

export function validSubscription(subscription) {
 try {
  const u=new URL(subscription.endpoint);
  const allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'];
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||subscription.endpoint.length>2048 ||
   !(allowed.includes(u.hostname)||u.hostname.endsWith('.push.apple.com')||u.hostname.endsWith('.notify.windows.com'))) return false;
  const {p256dh,auth}=subscription.keys||{};
  return typeof p256dh==='string'&&/^[\w-]+$/.test(p256dh)&&Buffer.from(p256dh,'base64url').length===65&&
   typeof auth==='string'&&/^[\w-]+$/.test(auth)&&Buffer.from(auth,'base64url').length===16;
 } catch {return false;}
}
const hash=value=>createHash('sha256').update(value).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createHandler(database,push=webpush) {
 const rpc=async(name,args)=>{const {data,error}=await database.rpc(name,args);if(error)throw Error('Notification service unavailable. Please try again.');return data;};
 const service=(p_action,p_data={})=>rpc('supervisor_push_service',{p_action,p_data});
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
  const {action,pin,subscription,device,secret}=req.body||{};
  try {
   if(action==='dispatch') {
    const config=await service('config');
    if(!config||!same(secret,config.secret))return res.status(403).json({error:'Authorization required.'});
    const batch=await service('claim');
    // Five parallel sends, bounded leases and per-device retries prevent a failed endpoint blocking others.
    for(let i=0;i<batch.subscriptions.length;i+=5) await Promise.all(batch.subscriptions.slice(i,i+5).map(async item=>{
     let status='sent';
     try {
      if(!validSubscription(item.subscription))status='gone';
      else await push.sendNotification(item.subscription,JSON.stringify({version:batch.counts.version,total:batch.counts.total}),{
       TTL:300,urgency:'low',topic:'spark-supervisor',timeout:8000,
       vapidDetails:{subject:'https://spark.cafelalistens.org',publicKey:config.publicKey,privateKey:config.privateKey},
      });
     }catch(error){status=[404,410].includes(error.statusCode)?'gone':'retry';}
     await service('ack',{id:item.id,lease:batch.lease,version:batch.counts.version,status});
    }));
    return res.status(200).json({ok:true});
   }
   if(action==='unsubscribe') {
    if(typeof device!=='string'||!/^[a-f0-9]{64}$/.test(device))return res.status(400).json({error:'Invalid device.'});
    await service('unsubscribe',{device_hash:hash(device)});return res.status(200).json({ok:true});
   }
   if(!['key','subscribe'].includes(action))return res.status(400).json({error:'Invalid action.'});
   if(await rpc('verify_supervisor_pin',{p_pin:pin||null})!==true)return res.status(403).json({error:'Supervisor authorization required.'});
   if(action==='key') {
    let config=await service('config');
    if(!config)config=await service('config',{...push.generateVAPIDKeys(),secret:randomBytes(32).toString('hex')});
    return res.status(200).json({publicKey:config.publicKey});
   }
   if(!validSubscription(subscription)||typeof device!=='string'||!/^[a-f0-9]{64}$/.test(device))return res.status(400).json({error:'Invalid push subscription.'});
   await service('subscribe',{pin,subscription,device_hash:hash(device)});
   return res.status(200).json({ok:true});
  }catch {return res.status(503).json({error:'Notifications could not be updated. Please try again.'});}
 };
}
export default async function handler(req,res){
 try {
  const config=serverDatabase(process.env);
  return await createHandler(createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}}))(req,res);
 }catch {return res.status(503).json({error:'Notifications are unavailable in this environment.'});}
}
