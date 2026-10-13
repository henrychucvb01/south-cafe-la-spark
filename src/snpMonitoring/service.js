import {supabase} from '../supabaseClient';
import {filename} from './model';
const rpc=async(name,args)=>{const {data,error}=await supabase.rpc(name,args);if(error)throw Error(error.message);return data;};
export const list=(token,program='snp')=>rpc(program==='eec-snack'?'snack_list':'snp_list',{p_token:token});
export const sites=(token,program='snp')=>rpc(program==='eec-snack'?'snack_sites':'snp_sites',{p_token:token});
export const get=(token,id)=>rpc('snp_get',{p_token:token,p_id:id});
export const save=(token,record,data,section)=>rpc('snp_save',{p_token:token,p_id:record.id,p_revision:record.revision,p_site:record.site_key,p_payload:data,p_section:section});
export const completeFollowup=(token,record,id,note,date)=>rpc('snp_followup',{p_token:token,p_id:record.id,p_revision:record.revision,p_finding:id,p_note:note,p_completed:date});
export async function report(token,record,action,previewHash){const res=await fetch('/api/snp-monitoring',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action,id:record.id,revision:record.revision,previewHash})});if(!res.ok){const body=await res.json();const error=Error(body.error);error.errors=body.errors;throw error;}return action==='finalize'?(await res.json()).record:{bytes:new Uint8Array(await res.arrayBuffer()),hash:res.headers.get('X-SNP-Preview-Hash')};}
export function download(bytes,data){const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=filename(data);a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
