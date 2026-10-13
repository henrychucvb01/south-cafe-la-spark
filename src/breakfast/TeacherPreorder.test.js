import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import TeacherPreorder from './TeacherPreorder';
import {teacherPreorderItems} from './service';
jest.mock('./service',()=>({teacherPreorderItems:jest.fn()}));
let root,host;const onSaved=jest.fn(),onBusy=jest.fn();
const page={preorder_menu:{entree1:'Cereal'},service_date:'2026-10-09',preorder_date:'2026-10-13',record:{count:16,submitted_at:'saved'}};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
function set(input,value){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}
test('saves an optional pre-order for server-selected next school day and preserves zero',async()=>{
 await act(async()=>root.render(<TeacherPreorder qr="qr-a" page={page} onSaved={onSaved} onBusy={onBusy}/>));expect(host.textContent).toContain('Tuesday, Oct 13');expect(teacherPreorderItems).not.toHaveBeenCalled();
 await act(async()=>{set(host.querySelector('input'),'0');});const result={...page,record:{...page.record,preorder_count:0}};teacherPreorderItems.mockResolvedValue(result);
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(teacherPreorderItems).toHaveBeenCalledWith('qr-a',page,{entree1:0},{entree1:'Cereal'});expect(onSaved).toHaveBeenCalledWith(result);expect(onBusy.mock.calls).toEqual([[true],[false]]);expect(host.textContent).toContain('Pre-order saved.');
});
test('failed pre-order retains entered data for correction',async()=>{
 await act(async()=>root.render(<TeacherPreorder qr="qr-a" page={page} onSaved={onSaved} onBusy={onBusy}/>));await act(async()=>{set(host.querySelector('input'),'20');});teacherPreorderItems.mockRejectedValue(new Error('Refresh before editing'));
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.querySelector('[role=alert]').textContent).toContain('Refresh');expect(host.querySelector('input').value).toBe('20');expect(onSaved).not.toHaveBeenCalled();
});
