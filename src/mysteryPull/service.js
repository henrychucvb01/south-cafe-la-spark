import {supabase} from '../supabaseClient';
export async function mysteryRpc(name,params={}) {
 const {data,error}=await supabase.rpc(`mystery_${name}`,params);
 if(error) {const failure=new Error(/PGRST202|42883/.test(error.code||'')?'Mystery Pull is not ready yet. Its database setup is still needed.':error.message||'Connection interrupted. Try again.');failure.confirmed=error.code==='P0001'||error.code?.startsWith('22')||error.code?.startsWith('23');throw failure;}
 if(data?.error)throw Error(data.error);
 return data;
}
export const newRequest=()=>crypto.randomUUID();
export function readSaved(key){try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}}
export const saveSession=value=>sessionStorage.setItem('spark-mystery-session',JSON.stringify(value));
export const dateLabel=value=>new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
