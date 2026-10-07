import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BreakfastPage from './BreakfastPage';
import * as api from './service';
jest.mock('./service',()=>({openSession:jest.fn(),closeSession:jest.fn(),listClassrooms:jest.fn(),saveClassroom:jest.fn(),classroomHistory:jest.fn(),addNote:jest.fn()}));
const location={id:1,school_name:'School A',location_code:'1234'},employee={id:11,employee_name:'Manager'};
const record={id:'class-1',location_id:1,room_code:'B-203',teacher_name:'Ms. Garcia',enrolled_students:28,campus_label:'',active:true,revision:1};
let root,host;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();api.openSession.mockResolvedValue('scoped-token');api.closeSession.mockResolvedValue();api.listClassrooms.mockResolvedValue([record]);api.classroomHistory.mockResolvedValue({classroom:record,days:[],events:[]});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const render=()=>act(async()=>root.render(<BreakfastPage location={location} employee={employee} managerPin="test"/>));
const click=async text=>act(async()=>{const b=[...host.querySelectorAll('button')].find(e=>e.textContent===text);expect(b).toBeTruthy();b.click();});
function set(el,value){const setter=Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}
test('opens the scoped school roster, edits, deactivates, and preserves access to inactive history',async()=>{
 await render();expect(api.openSession).toHaveBeenCalledWith(location,employee,'test');expect(host.textContent).toContain('Room B-203');
 await click('Edit');await act(async()=>set(host.querySelectorAll('input')[1],'Mr. New'));
 api.saveClassroom.mockResolvedValue({...record,teacher_name:'Mr. New',revision:2});await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.saveClassroom).toHaveBeenCalledWith('scoped-token',record,expect.objectContaining({teacher_name:'Mr. New'}));expect(host.textContent).toContain('Mr. New');
 api.saveClassroom.mockResolvedValue({...record,teacher_name:'Mr. New',revision:3,active:false});await click('Deactivate');expect(host.querySelector('.ba-classroom')).toBeNull();
 await act(async()=>{const select=host.querySelector('select');select.value='inactive';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(host.textContent).toContain('Reactivate');await click('View & history');expect(api.classroomHistory).toHaveBeenCalledWith('scoped-token','class-1',null,null);expect(host.textContent).toContain('No daily breakfast records yet');
});
test('creates permanent records through the service and keeps failed edits available',async()=>{
 await render();await click('+ Add classroom');await act(async()=>{const inputs=host.querySelectorAll('input');set(inputs[0],'S14');set(inputs[1],'Teacher');set(inputs[2],'24');});
 api.saveClassroom.mockRejectedValue(new Error('That room already exists'));await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(host.querySelector('[role="alert"]').textContent).toContain('already exists');expect(host.querySelector('input').value).toBe('S14');expect(api.saveClassroom).toHaveBeenCalledWith('scoped-token',null,expect.objectContaining({room_code:'S14'}));
});
test('does not show another school roster or fabricated data when authorization fails',async()=>{
 api.openSession.mockRejectedValue(new Error('School assignment could not be verified'));await render();expect(host.querySelector('[role="alert"]').textContent).toContain('School assignment');expect(api.listClassrooms).not.toHaveBeenCalled();expect(host.textContent).not.toContain('+ Add classroom');
});
