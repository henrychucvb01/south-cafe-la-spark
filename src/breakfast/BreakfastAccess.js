import React,{useEffect,useState} from 'react';
import {openSession,closeSession,managerEnabled,qrEnabled} from './service';
// Recheck without reloading teacher input. Database guards enforce every request too.
export function useBreakfastAccess({location,employee,managerPin,qr}) {
 const key=qr||`${location?.id}:${employee?.id}:${employee?.covering}:${managerPin}`;
 const [state,setState]=useState({key:null,enabled:false,loading:true,error:''});
 const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true,session,inFlight=false;
  setState({key,enabled:false,loading:true,error:''});
  async function check(){if(inFlight)return;inFlight=true;try{
   if(!qr&&!session){session=await openSession(location,employee,managerPin);if(!active){await closeSession(session);session=null;return;}}
   const enabled=await (qr?qrEnabled(qr):managerEnabled(session));
   if(active)setState({key,enabled:enabled===true,loading:false,error:''});
  }catch(e){if(active)setState({key,enabled:false,loading:false,error:e.message});}finally{inFlight=false;}}
  check();const timer=setInterval(check,30000);window.addEventListener('focus',check);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',check);if(session)closeSession(session).catch(()=>{});};
 },[key,qr,location,employee,managerPin,retry]);
 return {...(state.key===key?state:{enabled:false,loading:true,error:''}),refresh:()=>setRetry(v=>v+1)};
}
export default function BreakfastAccess({children,...props}) {
 const {enabled,loading,error,refresh}=useBreakfastAccess(props);
 if(enabled)return children;
 return <main className="ba-root"><section className="ba-panel"><h1>Breakfast Accountability</h1><p role={error?'alert':'status'}>{loading?'Checking Breakfast availability…':error?'Breakfast availability could not be checked. Please try again.':'Breakfast Accountability is not currently available for this school.'}</p>{!loading&&<button onClick={refresh}>Try again</button>}</section></main>;
}
