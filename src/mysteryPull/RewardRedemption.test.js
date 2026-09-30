import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import RewardRedemption from './RewardRedemption';
import {mysteryRpc} from './service';
import {prizeStatus} from './rewards';
jest.mock('./service',()=>({mysteryRpc:jest.fn()}));
let host,root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);jest.resetAllMocks();});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
test('late checklist stays unused until selected and redeemed',async()=>{
 mysteryRpc.mockResolvedValueOnce({dates:['2026-09-04']}).mockResolvedValueOnce({service_date:'2026-09-04'});
 const done=jest.fn();await act(async()=>root.render(<RewardRedemption token="school-session" prize={{id:22,reward_type:'late_checklist',prize_name:'Make-Up Late Checklist'}} onRedeemed={done}/>));
 expect(button('Redeem prize').disabled).toBe(true);expect(mysteryRpc).toHaveBeenCalledTimes(1);
 act(()=>{const select=host.querySelector('select');select.value='2026-09-04';select.dispatchEvent(new Event('change',{bubbles:true}));});
 await act(async()=>button('Redeem prize').click());
 expect(mysteryRpc).toHaveBeenLastCalledWith('redeem',{p_token:'school-session',p_win:22,p_details:{date:'2026-09-04'}});expect(done).toHaveBeenCalled();
});
test('no eligible checklist keeps prize in inventory',async()=>{
 mysteryRpc.mockResolvedValue({dates:[]});const close=jest.fn();await act(async()=>root.render(<RewardRedemption token="school-session" prize={{id:22,reward_type:'late_checklist',prize_name:'Make-Up Late Checklist'}} onClose={close}/>));
 expect(button('Redeem prize').disabled).toBe(true);act(()=>button('Keep in inventory').click());expect(close).toHaveBeenCalled();expect(mysteryRpc).toHaveBeenCalledTimes(1);
});
test('digital and physical inventory show correct status',()=>{
 expect(prizeStatus({status:'waiting',reward_type:'bingo_free'})).toBe('Ready to redeem');
 expect(prizeStatus({status:'waiting',reward_type:'candy_bar'})).toBe('Waiting for supervisor');
 expect(prizeStatus({status:'received',reward_type:'bingo_free'})).toBe('Redeemed ✓');
});
