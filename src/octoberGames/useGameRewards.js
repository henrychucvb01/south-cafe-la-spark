import {useEffect,useState} from 'react';
import {openSession,closeSession} from '../supperMonitoring/service';
import {gamesRequest,useOctoberAvailable} from './service';
export default function useGameRewards({location,employee,managerPin,supervisorPin}){
 const enabled=useOctoberAvailable(),[rewards,setRewards]=useState([]),[error,setError]=useState('');
 useEffect(()=>{
  if(!enabled||(!supervisorPin&&(!location||!employee||!managerPin)))return;
  let cancelled=false,token,timer;
  const refresh=async()=>{try{if(!supervisorPin&&!token)token=await openSession(location,employee,managerPin);const rows=await gamesRequest('rewards',supervisorPin?{pin:supervisorPin}:{token});if(!cancelled){setRewards(rows);setError('');}}catch(e){if(!cancelled)setError(e.message);}};
  refresh();timer=setInterval(refresh,30000);window.addEventListener('october-games-updated',refresh);
  return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('october-games-updated',refresh);if(token)closeSession(token).catch(()=>{});};
 },[enabled,location,employee,managerPin,supervisorPin]);
 return {rewards,enabled,error};
}
