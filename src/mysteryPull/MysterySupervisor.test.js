import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import MysterySupervisor from './MysterySupervisor';
import {mysteryRpc} from './service';
jest.mock('./service',()=>({mysteryRpc:jest.fn(),newRequest:()=> 'test-request',readSaved:()=>null}));
let host,root;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);mysteryRpc.mockReset();mysteryRpc.mockImplementation(async name=>name==='context'?{schools:[],prizes:[{id:'one',name:'Candy Bar',description:'A treat',icon:'🍫',reward_type:'candy_bar',inventory:9,active:true,revision:1}]}:[]);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
const click=async text=>act(async()=>button(text).click());
test('inventory has one compact row per prize and supports icons and new effects',async()=>{
 await act(async()=>root.render(<MysterySupervisor token="admin"/>));await click('Prize inventory');
 expect(host.querySelectorAll('.mystery-inventory tbody tr')).toHaveLength(1);expect(host.querySelector('.mystery-prize-grid')).toBeNull();expect(host.textContent).not.toContain('seven prizes');
 await click('+ Add prize');const form=host.querySelector('.mystery-prize-fields'),effect=[...form.querySelectorAll('select')][0];
 await act(async()=>{effect.value='extra_guess';effect.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(form.querySelector('input[maxlength="80"]').value).toBe('Extra Mystery Guess');
 const icon=form.querySelector('[aria-label="Choose 🎯 icon"]');await act(async()=>icon.click());expect(icon.getAttribute('aria-pressed')).toBe('true');
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(mysteryRpc).toHaveBeenCalledWith('admin',expect.objectContaining({p_payload:expect.objectContaining({action:'prize',name:'Extra Mystery Guess',reward_type:'extra_guess',icon:'🎯'})}));
});
test('existing prize names and icons are editable while effects remain fixed',async()=>{
 await act(async()=>root.render(<MysterySupervisor token="admin"/>));await click('Prize inventory');await click('Edit');
 const form=host.querySelector('.mystery-prize-fields');expect(form.querySelector('input[maxlength="80"]').readOnly).toBe(false);expect(form.querySelector('select').disabled).toBe(true);expect(host.textContent).toContain('9 remaining');
});
