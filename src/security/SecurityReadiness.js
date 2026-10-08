import React, {useEffect,useState} from 'react';
import {supabase,databaseConfigurationError} from '../supabaseClient';

export function useSecurityReady() {
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    let active=true,inFlight=false;
    async function check(){
      if(inFlight)return;inFlight=true;
      try{
        const {data,error}=await supabase.rpc('spark_security_ready');
        // Once connected, a temporary network failure must not unmount an
        // employee's unsaved form. Database authorization still fails closed.
        if(active&&!error)setReady(data?.version===1&&data?.ready===true);
      }catch{/* Retry connectivity without discarding the current form. */}finally{inFlight=false;}
    }
    check();const timer=setInterval(check,10000);
    window.addEventListener('focus',check);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',check);};
  },[]);
  return ready;
}
export default function SecurityReadiness(){
  return <main className="login-main"><section className="login-card" role="status"><h1>SPARK</h1><p>{databaseConfigurationError || 'Connecting to SPARK…'}</p><p>If SPARK is updating, this page will reopen automatically when it is ready.</p></section></main>;
}
