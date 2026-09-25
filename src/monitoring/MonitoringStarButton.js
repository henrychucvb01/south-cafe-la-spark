import React, {useRef,useState} from 'react';
import {openSupervisorSession,closeSession,setMonitoringStar} from '../supperMonitoring/service';
import {isPerfectMonitoring} from './supperSchedule';
import {recordLabel} from './types';

export default function MonitoringStarButton({record,school,supervisorPin,onRefresh}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const pending=useRef(false);
 if(!record || record.monitor_role!=='manager' || record.status!=='accepted' || !record.locked)return null;
 const awarded=isPerfectMonitoring(record);
 async function toggle(){
  if(pending.current)return;
  pending.current=true;setBusy(true);setError('');let token;
  try{
   token=await openSupervisorSession(school,supervisorPin);
   await setMonitoringStar(token,record,!awarded);
   await onRefresh();
  }catch(e){setError(e.message);}
  finally{if(token)await closeSession(token).catch(()=>{});pending.current=false;setBusy(false);}
 }
 return <div className="sm-star-control"><button type="button" disabled={busy} onClick={toggle}
  aria-label={`${awarded?'Remove Star':'Award Star'} for ${school?.school_name || 'School'} · ${recordLabel(record)}`}>{busy?'Saving…':awarded?'Remove Star':'Award Star'}</button>
  {error && <p role="alert" className="sm-error">{error}</p>}</div>;
}
