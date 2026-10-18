import {createClient} from '@supabase/supabase-js';
import {serverDatabase} from '../src/security/databaseEnvironment.js';
export const developmentEnabled=env=>env.REWARDS_DEVELOPMENT==='true'&&env.VERCEL_ENV!=='production';
export const productionSupervisorEnabled=env=>env.VERCEL_ENV==='production'&&env.VERCEL_GIT_COMMIT_REF==='main';
const supervisorActions=new Set(['context','settings','save','duplicate']);
export function createRewardsHandler(db,enabled=false,rpcName='spark_rewards_dev'){return async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!enabled)return res.status(404).json({available:false,error:'Rewards development is not available.'});
 if(req.method==='GET'){
  if(rpcName==='spark_rewards_supervisor'){
   try{const {data,error}=await db.rpc(rpcName,{p_action:'capabilities'});if(error||data?.supervisor_available!==true||data?.protocol_version!==1||data?.manager_enabled!==false)return res.status(404).json({available:false});return res.status(200).json({available:true,supervisor_only:true,manager_enabled:false});}catch{return res.status(404).json({available:false});}
  }
  return res.status(200).json({available:true});
 }
 if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
 try{const {action='context',pin,token,payload={}}=req.body||{};const production=rpcName==='spark_rewards_supervisor';if(production&&(!supervisorActions.has(action)||typeof pin!=='string'||!pin))return res.status(403).json({error:'Supervisor access only. Manager participation and real awards are not enabled.'});const args={p_action:action,p_pin:pin||null,p_payload:payload};if(!production)args.p_token=token||null;const {data,error}=await db.rpc(rpcName,args);if(error)throw Error(error.message);return res.status(200).json(data);}catch(e){return res.status(400).json({error:e.message||'Rewards could not be loaded.'});}
};}
let handler;
export default async function rewards(req,res){
 const production=productionSupervisorEnabled(process.env);
 if(!production&&!developmentEnabled(process.env))return createRewardsHandler(null,false)(req,res);
 try{if(!handler){const cfg=serverDatabase(process.env);handler=createRewardsHandler(createClient(cfg.url,cfg.key,{auth:{persistSession:false}}),true,production?'spark_rewards_supervisor':'spark_rewards_dev');}return handler(req,res);}catch{return res.status(503).json({error:'Rewards configuration is not available.'});}
}
