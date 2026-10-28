import React, {useEffect,useState} from 'react';
import {supabase,databaseConfigurationError} from '../supabaseClient';

export function useSecurityReady() {
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    let active=true,inFlight=false,timer,quotaRetryAt=0,retryDelay=60000;
    const schedule=delay=>{if(active)timer=setTimeout(check,delay);};
    async function check(){
      if(!active||inFlight)return;
      clearTimeout(timer);
      if(document.visibilityState==='hidden'){schedule(60000);return;}
      // Focus events must not bypass the quota cooldown.
      if(Date.now()<quotaRetryAt){schedule(quotaRetryAt-Date.now());return;}
      inFlight=true;
      try{
        const {data,error,status}=await supabase.rpc('spark_security_ready');
        // Once connected, a temporary network failure must not unmount an
        // employee's unsaved form. Database authorization still fails closed.
        if(status===402){quotaRetryAt=Date.now()+300000;retryDelay=300000;}
        else if(error)retryDelay=Math.min(retryDelay*2,300000);
        else{retryDelay=60000;if(active)setReady(data?.version===1&&data?.ready===true);}
      }catch{retryDelay=Math.min(retryDelay*2,300000);/* Preserve the current form. */}
      finally{inFlight=false;schedule(retryDelay);}
    }
    check();
    window.addEventListener('focus',check);
    document.addEventListener('visibilitychange',check);
    return()=>{active=false;clearTimeout(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
  },[]);
  return ready;
}
export default function SecurityReadiness(){
  return <main className="login-main"><section className="login-card" role="status"><h1>SPARK</h1><p>{databaseConfigurationError || 'Connecting to SPARK…'}</p><p>If SPARK is updating, this page will reopen automatically when it is ready.</p></section></main>;
}
