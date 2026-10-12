import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {serverDatabase} from '../src/security/databaseEnvironment.js';
import {canonical,validate,filename} from '../src/snpMonitoring/model.js';
import {generatePdf,TEMPLATE_SHA256} from '../src/snpMonitoring/pdf.js';
const digest=value=>createHash('sha256').update(value).digest('hex');
export function createHandler({database,templateLoader=()=>readFile(resolve(process.cwd(),'public/snp-monitoring-2025-09-08.pdf'))}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
  const token=String(req.headers.authorization||'').replace(/^Bearer /,'');const {action,id,revision,previewHash}=req.body||{};
  if(!/^[a-f0-9-]{72}$/.test(token))return res.status(401).json({error:'Return to SPARK and sign in again.'});
  if(!['preview','finalize','download'].includes(action)||!/^[a-f0-9-]{36}$/.test(id||''))return res.status(400).json({error:'Choose a saved SNP report.'});
  const rpc=async(name,args)=>{const {data,error}=await database.rpc(name,args);if(error)throw Error(error.message);return data;};
  try{
   const record=await rpc('snp_get',{p_token:token,p_id:id});
   const send=bytes=>{res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${filename(record.payload)}"`);return res.status(200).send(Buffer.from(bytes));};
   if(action==='download'){if(record.status!=='finalized')return res.status(409).json({error:'Finalize the report before downloading.'});return send(Buffer.from(await rpc('snp_pdf',{p_token:token,p_id:id}),'base64'));}
   const context=await rpc('supper_context',{p_token:token});if(context.actor_role!=='supervisor')return res.status(403).json({error:'Supervisor authorization required.'});
   if(record.status==='finalized'){if(action==='finalize')return res.status(200).json({record});return send(Buffer.from(await rpc('snp_pdf',{p_token:token,p_id:id}),'base64'));}
   if(!Number.isInteger(revision)||revision!==record.revision)return res.status(409).json({error:'Draft changed. Reopen and preview the saved draft.'});
   const errors=validate(record.payload);const hash=digest(canonical(record.payload));
   for(const role of ['monitor','representative'])if(record.payload.signatures?.[role]?.contentHash!==hash)errors.push({section:5,message:`Accept the ${role} signature for the current report content.`});
   if(errors.length)return res.status(422).json({error:'Complete the required items before previewing.',errors});
   if(action==='finalize'&&previewHash!==hash)return res.status(409).json({error:'Preview this version before finalizing.'});
   const template=await templateLoader();if(digest(template)!==TEMPLATE_SHA256)throw Error('The official SNP template does not match the verified version.');
   const bytes=await generatePdf(template,record.payload);
   if(action==='preview'){res.setHeader('X-SNP-Preview-Hash',hash);return send(bytes);}
   const completed=await rpc('snp_finalize',{p_token:token,p_id:id,p_revision:revision,p_pdf:Buffer.from(bytes).toString('base64'),p_sha256:digest(bytes)});
   return res.status(200).json({record:completed});
  }catch(e){return res.status(/changed|revision/i.test(e.message)?409:/Session expired|access|assigned|not found|authorization/i.test(e.message)?403:422).json({error:e.message||'Your draft is preserved. Try again.'});}
 };
}
export default async function handler(req,res){
 let config;try{config=serverDatabase(process.env);}catch(e){return res.status(503).json({error:e.message});}
 const database=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false}});
 return createHandler({database})(req,res);
}
