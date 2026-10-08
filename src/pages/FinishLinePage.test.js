import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import FinishLinePage from './FinishLinePage';
import {supabase} from '../supabaseClient';
jest.mock('../supabaseClient',()=>({supabase:{from:jest.fn(),rpc:jest.fn()}}));
jest.mock('../breakfast/FinishLineBreakfast',()=>()=>null);
jest.mock('../mysteryPull/benefits',()=>({loadSchoolBenefits:async()=>({makeup:new Set(),shields:new Set()})}));
let root,host,complete,failedLoad;
const keys=['previous_meal_counts','dairy_order_created','receivers_completed','production_worksheet','production_record','meal_count_entered','reports_reviewed','thursday_orders_complete'];
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;failedLoad=false;complete=jest.fn();
 Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:jest.fn(()=> '11111111-1111-4111-8111-111111111111')}});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 supabase.from.mockImplementation(table=>{
  const chain={select:jest.fn(()=>chain),eq:jest.fn(()=>chain),maybeSingle:async()=>({data:table==='meal_counts'?{breakfast_count:10,lunch_count:20,supper_count:null,updated_at:'2026-10-01T19:00:00Z'}:{id:1,comments:'',status:'complete',submitted_at:'2026-10-01T19:00:00Z',finish_line_items:keys.map(item_key=>({item_key,answer:'yes'}))},error:failedLoad?{message:'Disconnected'}:null})};return chain;
 });
 supabase.rpc.mockReset();
});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const render=()=>act(async()=>root.render(<FinishLinePage location={{id:42,school_name:'Synthetic'}} employee={{id:7,employee_name:'Synthetic Manager'}} existingCheck={{service_date:'2026-10-01'}} onComplete={complete}/>));
const submit=()=>act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
test('one atomic RPC contains all answers, meals and versions; failed save retains inputs and retries same request',async()=>{
 await render();supabase.rpc.mockResolvedValueOnce({error:{message:'Connection interrupted'}}).mockResolvedValue({data:{check:{submitted_at:'2026-10-01T19:00:00Z'}}});
 await submit();expect(complete).not.toHaveBeenCalled();expect(host.textContent).toContain('Connection interrupted');expect(host.querySelector('input[inputmode="numeric"]').value).toBe('10');
 await submit();expect(complete).toHaveBeenCalledTimes(1);expect(supabase.rpc).toHaveBeenCalledTimes(2);
 const [name,args]=supabase.rpc.mock.calls[0];expect(name).toBe('spark_submit_finish_line');expect(supabase.rpc.mock.calls[1][1]).toEqual(args);
 expect(args.p_payload.meals).toEqual({breakfast:10,lunch:20,supper:null});expect(Object.keys(args.p_payload.items)).toEqual(keys);expect(args.p_payload.expected_check_version).toBe('2026-10-01T19:00:00Z');
});
test('failed initial load cannot overwrite saved data',async()=>{failedLoad=true;await render();await submit();expect(supabase.rpc).not.toHaveBeenCalled();expect(host.querySelector('button[type="submit"]').disabled).toBe(true);});
test('duplicate clicks while save is pending cause only one request',async()=>{await render();let resolve;supabase.rpc.mockImplementation(()=>new Promise(r=>resolve=r));await act(async()=>{host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});expect(supabase.rpc).toHaveBeenCalledTimes(1);await act(async()=>resolve({data:{check:{submitted_at:'2026-10-01T19:00:00Z'}}}));});
