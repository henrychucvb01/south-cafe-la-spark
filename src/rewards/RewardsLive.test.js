import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ManagerRewards,{RewardsPage} from './RewardsPage';
import RewardsManagement from './RewardsManagement';
import {rewardsRequest} from './service';
import {openSession,closeSession} from '../supperMonitoring/service';
import {visibleRewards} from './model';
jest.mock('./service',()=>({rewardsRequest:jest.fn()}));
jest.mock('../supperMonitoring/service',()=>({openSession:jest.fn(),closeSession:jest.fn()}));
let host,root,data;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);data={launch_ready:true,manager_enabled:true,environment:'production',settings:{revision:3,meeting_spin_limit:1},catalog:[{id:'fixed',revision:1,name:'Fictional reward',type:'fixed',status:'published',active:true,config:{price:25},fulfillment:'not_started'}],activity:[],schools:[],balance:'100',location_id:1,wheel:[],history:[]};jest.clearAllMocks();rewardsRequest.mockImplementation(async()=>JSON.parse(JSON.stringify(data)));openSession.mockResolvedValue('school-session');closeSession.mockResolvedValue();Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=> '00000000-0000-0000-0000-000000000001'}});});
afterEach(()=>{act(()=>root.unmount());host.remove();});
test('activation is unlocked only with the completed launch protocol',async()=>{await act(async()=>root.render(<RewardsManagement supervisorPin="admin"/>));const input=host.querySelector('.sr-settings input');expect(input.disabled).toBe(false);expect(input.checked).toBe(true);expect(host.textContent).not.toContain('Phase 1');});
test('a real manager session stays open for confirmed redemption and closes on exit',async()=>{
 const confirm=jest.spyOn(window,'confirm').mockReturnValue(true);
 try{await act(async()=>root.render(<ManagerRewards location={{id:1}} employee={{id:11}} managerPin="pin" onBack={()=>{}}/>));expect(closeSession).not.toHaveBeenCalled();await act(async()=>host.querySelector('.sr-reward-action').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(rewardsRequest).toHaveBeenCalledWith('claim',null,expect.objectContaining({id:'fixed',revision:1,confirmed:true,amount:25,request_id:expect.any(String)}),'school-session');await act(async()=>root.render(null));expect(closeSession).toHaveBeenCalledWith('school-session');}finally{confirm.mockRestore();}
});
test('manager cards include activity and disable sold-out fixed rewards',async()=>{data.catalog[0].sold_out=true;data.activity=[{request_id:'one',reward_name:'Reward',kind:'bid',amount:50,refunded:true}];await act(async()=>root.render(<RewardsPage data={data} run={jest.fn()}/>));expect(host.querySelector('.sr-reward-action button').disabled).toBe(true);expect(host.textContent).toContain('Points returned');});
test('anti-sniping keeps an auction visible through its extended deadline',()=>{const now=Date.now();const r={...data.catalog[0],type:'auction',opens_at:new Date(now-10000).toISOString(),closes_at:new Date(now-1000).toISOString(),auction:{closes_at:new Date(now+60000).toISOString()}};expect(visibleRewards([r],{now})).toHaveLength(1);});

test('auction closing gets one final refresh before polling stops',async()=>{
 jest.useFakeTimers();
 try{
  data.catalog=[{...data.catalog[0],type:'auction',config:{starting_bid:10,increment:10},opens_at:new Date(Date.now()-60000).toISOString(),closes_at:new Date(Date.now()+1000).toISOString()}];
  await act(async()=>root.render(<ManagerRewards location={{id:1}} employee={{id:11}} managerPin="pin" onBack={()=>{}}/>));
  const initial=rewardsRequest.mock.calls.length;data.catalog=[];data.balance='120';
  await act(async()=>jest.advanceTimersByTime(30000));expect(rewardsRequest.mock.calls.length).toBe(initial+1);expect(host.textContent).toContain('120 SPARK Points');
  await act(async()=>jest.advanceTimersByTime(30000));expect(rewardsRequest.mock.calls.length).toBe(initial+1);
 }finally{act(()=>root.unmount());root=createRoot(host);jest.useRealTimers();}
});
