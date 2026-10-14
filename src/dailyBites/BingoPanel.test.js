import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BingoPanel from './BingoPanel';
import {supabase} from '../supabaseClient';
import {recordScorecardOpen} from './bingoTracking';
import {openSession,closeSession} from '../supperMonitoring/service';
jest.mock('../supabaseClient',()=>({supabase:{rpc:jest.fn()}}));
jest.mock('../supperMonitoring/service',()=>({openSession:jest.fn(),closeSession:jest.fn()}));
jest.mock('../sparkPoints',()=>({awardSparkPoints:jest.fn(async()=>true)}));
let host,root,context;
const location={id:4},employee={id:1};
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();jest.clearAllMocks();
 Object.defineProperty(global,'crypto',{value:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},configurable:true});
 context={card:{id:'22222222-2222-4222-8222-222222222222',revision:1,cycle:1,started_on:'2026-08-01'},goals:Array.from({length:25},(_,i)=>({id:i===12?'free':`task-${i}`,label:i===12?'Free':'Task '+i,detail:'Complete',completed:i===12})),completed_lines:[],earned_milestones:[],renew_on:'2026-09-01',can_renew:false,repick_available:true,replacement_goals:[{id:'new-task',label:'New Task',detail:'Win 10 days'}],paid_shop:{count:0,balance:'100',price:'25',prizes:[{id:5,label:'Change a Bingo Square'}]}};
 openSession.mockResolvedValue('scoped');closeSession.mockResolvedValue();supabase.rpc.mockResolvedValue({data:context});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();jest.restoreAllMocks();});
const render=async()=>act(async()=>root.render(<BingoPanel location={location} employee={employee} managerPin="pin"/>));
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
const click=async text=>act(async()=>button(text).click());
const selectSquare=async()=>{
 await click(context.repick_available?'Use monthly repick':'Replace a square');
 await act(async()=>host.querySelector('.bingo-repick-square').click());
 await act(async()=>{const select=host.querySelector('select');select.value='new-task';select.dispatchEvent(new Event('change',{bubbles:true}));});
};
test('confirmation displays current/replacement tasks, price, balance and remaining points; cancel spends nothing',async()=>{
 await render();await selectSquare();const confirm=jest.spyOn(window,'confirm').mockReturnValue(false);await click('Buy replacement — 25 points');
 expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Remaining: 75'));expect(confirm.mock.calls[0][0]).toContain('Task 0');expect(confirm.mock.calls[0][0]).toContain('New Task');expect(supabase.rpc.mock.calls.every(([name])=>name==='spark_bingo_context')).toBe(true);
});
test('confirmed purchase is scoped, and a lost response retries with the same request id and original card revision',async()=>{
 await render();await selectSquare();jest.spyOn(window,'confirm').mockReturnValue(true);
 supabase.rpc.mockResolvedValueOnce({error:{message:'Response lost'}});await click('Buy replacement — 25 points');
 const request=supabase.rpc.mock.calls.at(-1)[1];expect(request).toMatchObject({p_token:'scoped',p_price:'25',p_confirmed:true,p_square:0});
 expect(sessionStorage.getItem('spark-bingo-purchase-4')).not.toBeNull();await click('Check pending purchase');
 expect(supabase.rpc.mock.calls.at(-1)).toEqual(['spark_bingo_buy_replacement',request]);expect(sessionStorage.getItem('spark-bingo-purchase-4')).toBeNull();
});
test('insufficient points disable only paid purchase; monthly and prize options remain available',async()=>{
 context.paid_shop.balance='20';await render();await selectSquare();expect(button('Buy replacement — 25 points').disabled).toBe(true);expect(button('Replace square — use monthly repick').disabled).toBe(false);expect(button('Use Change a Bingo Square').disabled).toBe(false);
});
test('paid replacement remains accessible after monthly quota is used; completed/free squares cannot be selected',async()=>{
 context.repick_available=false;context.goals[0].completed=true;await render();await click('Replace a square');expect(host.querySelectorAll('.bingo-repick-square')).toHaveLength(23);
});
test('very large prices remain exact and safely disabled without numeric overflow',async()=>{
 context.paid_shop.price=null;context.paid_shop.price_formula='25 x 2^1000000';await render();await selectSquare();expect(button('Buy replacement — 25 x 2^1000000 points').disabled).toBe(true);
});
test('scorecard view tracking uses a school session and always closes it after failure',async()=>{
 supabase.rpc.mockResolvedValue({error:new Error('Unavailable')});await expect(recordScorecardOpen(location,employee,'pin')).rejects.toThrow('Unavailable');expect(openSession).toHaveBeenCalledWith(location,employee,'pin');expect(closeSession).toHaveBeenCalledWith('scoped');
});
