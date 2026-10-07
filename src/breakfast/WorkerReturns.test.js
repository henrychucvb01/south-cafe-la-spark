import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import WorkerReturns from './WorkerReturns';
import * as api from './service';
jest.mock('./service');
let host,root;
const page={room:'S14',teacher:'Ms. Garcia',service_date:'2026-10-07',sent:30,items_sent:{Milk:30},teacher_count:24,teacher_submitted_at:'2026-10-07T15:00:00Z',menu:{fruit:'Apple'},counts:{},notes:'',revision:0,submitted_at:null};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();api.workerNames.mockResolvedValue([{id:11,name:'Cafeteria Worker'}]);api.workerLogin.mockResolvedValue({token:'worker-session'});api.workerPage.mockResolvedValue(page);api.workerLogout.mockResolvedValue();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const click=el=>act(async()=>el.click());
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
const fill=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});
async function login(){await act(async()=>root.render(<WorkerReturns qr="classroom-qr" onBack={()=>{}}/>));await fill(host.querySelector('select'),'11');await fill(host.querySelector('input[type=password]'),'2468');await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
test('worker signs into the scanned classroom and certifies all four counts; correction resets confirmation',async()=>{
 await login();expect(api.workerLogin).toHaveBeenCalledWith('classroom-qr','11','2468');expect(host.textContent).toContain('Returned breakfast — Room S14');expect(host.querySelector('select')).toBeNull();expect(host.textContent).toContain('Apple');expect(host.textContent).toContain('Teacher reported: 24');expect(button('Submit return count').disabled).toBe(true);
 await click(host.querySelector('[aria-label="Add one Milk"]'));await click(host.querySelector('input[type=checkbox]'));expect(button('Submit return count').disabled).toBe(false);
 api.workerSubmit.mockResolvedValue({...page,counts:{Milk:1,Fruit:0,'Entrée':0,Other:0},revision:1,submitted_at:'2026-10-07T17:00:00Z',worker_name:'Cafeteria Worker'});
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.workerSubmit).toHaveBeenCalledWith('classroom-qr','worker-session',page,{Milk:1,Fruit:0,'Entrée':0,Other:0},'',true);expect(host.textContent).toContain('Return counts submitted');expect(host.textContent).toContain('Cafeteria Worker');await click(button('Correct return counts'));expect(button('Submit return count').disabled).toBe(true);await click(host.querySelector('[aria-label="Subtract one Milk"]'));expect(host.querySelector('[aria-label="Milk returned"]').textContent).toBe('0');expect(host.querySelector('[aria-label="Subtract one Milk"]').disabled).toBe(true);
});
test('incorrect PIN never opens return data or reveals a default PIN',async()=>{api.workerLogin.mockResolvedValue({error:'Name or worker PIN is incorrect.'});await login();expect(host.querySelector('[role=alert]').textContent).toContain('incorrect');expect(api.workerPage).not.toHaveBeenCalled();expect(host.textContent).not.toContain('9999');});
test('failed save preserves counts and offers refresh; missing quantities remain unknown',async()=>{
 api.workerPage.mockResolvedValue({...page,sent:null,teacher_count:null,teacher_submitted_at:null});await login();expect(host.textContent).toContain('Meals sent: Not recorded');expect(host.textContent).toContain('Teacher reported: Not submitted');await click(host.querySelector('[aria-label="Add one Fruit"]'));await click(host.querySelector('input[type=checkbox]'));api.workerSubmit.mockRejectedValue(new Error('Return counts changed in another session.'));await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.querySelector('[aria-label="Fruit returned"]').textContent).toBe('1');expect(button('Refresh return counts')).toBeTruthy();
});
