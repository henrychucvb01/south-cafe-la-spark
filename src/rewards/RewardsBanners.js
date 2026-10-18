import React,{useEffect,useState} from 'react';
import {useRewardsAvailable,rewardsRequest} from './service';
import {openSession,closeSession} from '../supperMonitoring/service';
import './rewards.css';
export default function RewardsBanners({location,employee,managerPin,onRewards,children}){
 const available=useRewardsAvailable(),[enabled,setEnabled]=useState(false);
 useEffect(()=>{let active=true,token;setEnabled(false);if(available&&location&&employee&&managerPin)(async()=>{try{token=await openSession(location,employee,managerPin);const data=await rewardsRequest('manager_context',null,{},token);if(active)setEnabled(data.manager_enabled===true&&data.launch_ready===true);}catch{}finally{if(token)await closeSession(token).catch(()=>{});}})();return()=>{active=false;};},[available,location,employee,managerPin]);
 if(!enabled)return children;
 return <div className="sr-banner-row">{children}<button className="sr-rewards-banner" onClick={onRewards}><strong>🎁 SPARK Rewards</strong><span>Redeem Points, Auctions &amp; Community Goals</span></button></div>;
}
