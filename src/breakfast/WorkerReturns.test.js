import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import WorkerReturns from './WorkerReturns';
import * as api from './service';
jest.mock('./service');
let host,root;
const page={room:'S14',teacher:'Ms. Garcia',service_date:'2026-10-07',sent:30,packing_submitted_at:'2026-10-07T14:00:00Z',packing_revision:1,items_sent:{milk1:30,fruit:30,entree1:30},teacher_count:24,teacher_submitted_at:'2026-10-07T15:00:00Z',menu:{milk1:'White milk',fruit:'Apple',entree1:'Burrito'},counts:{},notes:'',revision:0,submitted_at:null};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();api.workerNames.mockResolvedValue([{id:11,name:'Cafeteria Worker'}]);api.workerLogin.mockResolvedValue({token:'worker-session'});api.workerPage.mockResolvedValue(page);api.workerLogout.mockResolvedValue();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const click=el=>act(async()=>el.click());
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
const fill=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));});
async function login(){await act(async()=>root.render(<WorkerReturns qr="classroom-qr" onBack={()=>{}}/>));await fill(host.querySelector('select'),'11');await fill(host.querySelector('input[type=password]'),'2468');await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
test('worker signs into the scanned classroom and certifies exact menu counts; correction resets confirmation',async()=>{
 await login();expect(api.workerLogin).toHaveBeenCalledWith('classroom-qr','11','2468');expect(host.textContent).toContain('Cafeteria Workers — Room S14');expect(host.querySelector('select')).toBeNull();expect(host.textContent).toContain('Apple');expect(host.textContent).toContain('Teacher reported: 24');expect(button('Submit return count').disabled).toBe(true);
 await click(host.querySelector('[aria-label="Add one White milk"]'));await click(host.querySelector('input[type=checkbox]'));expect(button('Submit return count').disabled).toBe(false);
 api.workerSubmit.mockResolvedValue({...page,counts:{milk1:1,fruit:0,entree1:0},revision:1,submitted_at:'2026-10-07T17:00:00Z',worker_name:'Cafeteria Worker'});
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.workerSubmit).toHaveBeenCalledWith('classroom-qr','worker-session',page,{milk1:1,fruit:0,entree1:0},'',true);expect(host.textContent).toContain('Return counts submitted');expect(host.textContent).toContain('Cafeteria Worker');await click(button('Correct return counts'));expect(button('Submit return count').disabled).toBe(true);await click(host.querySelector('[aria-label="Subtract one White milk"]'));expect(host.querySelector('[aria-label="White milk quantity"]').value).toBe('0');expect(host.querySelector('[aria-label="Subtract one White milk"]').disabled).toBe(true);
});
test('incorrect PIN never opens return data or reveals a default PIN',async()=>{api.workerLogin.mockResolvedValue({error:'Name or worker PIN is incorrect.'});await login();expect(host.querySelector('[role=alert]').textContent).toContain('incorrect');expect(api.workerPage).not.toHaveBeenCalled();expect(host.textContent).not.toContain('9999');});
test('failed save preserves counts and offers refresh; missing quantities remain unknown',async()=>{
 api.workerPage.mockResolvedValue({...page,sent:null,teacher_count:null,teacher_submitted_at:null});await login();expect(host.textContent).not.toContain('Meals sent');expect(host.textContent).not.toContain('Morning packing report');expect(host.textContent).toContain('Teacher reported: Not submitted');await click(host.querySelector('[aria-label="Add one Apple"]'));await click(host.querySelector('input[type=checkbox]'));api.workerSubmit.mockRejectedValue(new Error('Return counts changed in another session.'));await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.querySelector('[aria-label="Apple quantity"]').value).toBe('1');expect(button('Refresh breakfast data')).toBeTruthy();
});

test('morning packing uses exact menu names and opens returns after certification',async()=>{
 api.workerPage.mockResolvedValue({...page,packing_submitted_at:null,packing_revision:0,sent:0,items_sent:{}});await login();expect(host.textContent).toContain('Pack today’s breakfast menu');expect(host.textContent).not.toContain('Vegan entrée');expect(button('Submit packing counts').disabled).toBe(true);
 await click(host.querySelector('[aria-label="Add one Burrito"]'));await click(host.querySelector('input[type=checkbox]'));api.workerPack.mockResolvedValue(page);
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.workerPack).toHaveBeenCalledWith('classroom-qr','worker-session',expect.objectContaining({packing_revision:0}),null,{milk1:0,fruit:0,entree1:1},true);expect(host.textContent).toContain('Morning packing submitted');expect(button('Returned / leftover items').disabled).toBe(false);
});
test('missing menu shows a manager setup message instead of invented items',async()=>{api.workerPage.mockResolvedValue({...page,menu:{},packing_submitted_at:null});await login();expect(host.textContent).toContain('manager needs to enter');expect(button('Submit packing counts')).toBeUndefined();});
