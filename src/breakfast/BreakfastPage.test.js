import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BreakfastPage from './BreakfastPage';
import * as api from './service';
jest.mock('./ClassroomTrend',()=>()=>null);
jest.mock('./service',()=>({openSession:jest.fn(),closeSession:jest.fn(),listClassrooms:jest.fn(),saveClassroom:jest.fn(),classroomHistory:jest.fn(),addNote:jest.fn(),dailyDashboard:jest.fn(),breakfastMenu:jest.fn(),breakfastPacking:jest.fn().mockResolvedValue({sent:null,items:{},revision:0})}));
const location={id:1,school_name:'School A',location_code:'1234'},employee={id:11,employee_name:'Manager'};
const record={id:'class-1',location_id:1,room_code:'B-203',teacher_name:'Ms. Garcia',enrolled_students:28,campus_label:'',active:true,revision:1};
let root,host;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();api.dailyDashboard.mockResolvedValue({rows:[],total:0});api.breakfastMenu.mockResolvedValue({});api.breakfastPacking.mockResolvedValue({sent:null,items:{},revision:0});api.openSession.mockResolvedValue('scoped-token');api.closeSession.mockResolvedValue();api.listClassrooms.mockResolvedValue([record]);api.classroomHistory.mockResolvedValue({classroom:record,days:[],events:[]});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const render=()=>act(async()=>root.render(<BreakfastPage location={location} employee={employee} managerPin="test"/>));
const click=async text=>act(async()=>{const b=[...host.querySelectorAll('button')].find(e=>e.textContent===text);expect(b).toBeTruthy();b.click();});
function set(el,value){const setter=Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}
test('opens the scoped school roster, edits, deactivates, and preserves access to inactive history',async()=>{
 await render();await click('Classrooms');expect(api.openSession).toHaveBeenCalledWith(location,employee,'test');expect(host.textContent).toContain('Room B-203');
 await click('Edit');await act(async()=>set(host.querySelectorAll('form input')[1],'Mr. New'));
 api.saveClassroom.mockResolvedValue({...record,teacher_name:'Mr. New',revision:2});await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.saveClassroom).toHaveBeenCalledWith('scoped-token',record,expect.objectContaining({teacher_name:'Mr. New'}));expect(host.textContent).toContain('Mr. New');
 api.saveClassroom.mockResolvedValue({...record,teacher_name:'Mr. New',revision:3,active:false});await click('Deactivate');expect(host.querySelector('.ba-classroom')).toBeNull();
 await act(async()=>{const select=host.querySelector('select');select.value='inactive';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(host.textContent).toContain('Reactivate');await click('View & history');expect(api.classroomHistory).toHaveBeenCalledWith('scoped-token','class-1',null,null);expect(host.textContent).toContain('No daily breakfast records yet');expect(host.textContent).not.toContain('Preview / Print meal count form');
});
test('creates permanent records through the service and keeps failed edits available',async()=>{
 await render();await click('Classrooms');await click('+ Add classroom');await act(async()=>{const inputs=host.querySelectorAll('form input');set(inputs[0],'S14');set(inputs[1],'Teacher');set(inputs[2],'24');});
 api.saveClassroom.mockRejectedValue(new Error('That room already exists'));await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(host.querySelector('[role="alert"]').textContent).toContain('already exists');expect(host.querySelector('form input').value).toBe('S14');expect(api.saveClassroom).toHaveBeenCalledWith('scoped-token',null,expect.objectContaining({room_code:'S14'}));
});
test('does not show another school roster or fabricated data when authorization fails',async()=>{
 api.openSession.mockRejectedValue(new Error('School assignment could not be verified'));await render();expect(host.querySelector('[role="alert"]').textContent).toContain('School assignment');expect(api.listClassrooms).not.toHaveBeenCalled();expect(host.textContent).not.toContain('+ Add classroom');
});

test('Breakfast tabs show separate sections and milk checkboxes save selected item names',async()=>{
 await render();expect(host.querySelector('[role=tab][aria-selected=true]').textContent).toBe('Daily Dashboard');expect(host.querySelector('.ba-classroom-table')).toBeNull();
 await click('School Breakfast Menu');const labels=[...host.querySelectorAll('label')];const milk=labels.filter(l=>l.querySelector('input[type=checkbox]'));expect(milk.map(l=>l.textContent)).toEqual(['1% white milk 8 oz','Nonfat white milk 8 oz','Lactaid white milk 8 oz']);
 await act(async()=>milk[0].querySelector('input').click());await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(api.breakfastMenu).toHaveBeenLastCalledWith('scoped-token',expect.any(String),{milk1:'1% white milk 8 oz'});
 await click('Packing and BIC Meal Count report');expect(host.textContent).toContain('Preview / Print packing report');expect(host.querySelector('details')).toBeNull();await act(async()=>{const select=host.querySelector('.ba-report-classroom select');select.value='class-1';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(host.textContent).toContain('Preview / Print meal count form');
 await click('Classrooms');expect(host.textContent).toContain('Room B-203');expect(host.textContent).not.toContain('Preview / Print packing report');
});

test('creates ten rows and retries only failed classrooms after a partial save',async()=>{
 await render();await click('Classrooms');await click('+ Add classroom');await click('Submit');expect(host.querySelectorAll('.ba-classroom-entry tbody tr')).toHaveLength(10);
 for(let i=10;i>2;i--)await click('Remove');
 expect(host.querySelectorAll('.ba-classroom-entry tbody tr')).toHaveLength(2);
 await act(async()=>{const inputs=host.querySelectorAll('form input');set(inputs[0],'S14');set(inputs[1],'Teacher A');set(inputs[2],'24');set(inputs[4],'S15');set(inputs[5],'Teacher B');set(inputs[6],'20');});
 api.saveClassroom.mockResolvedValueOnce({...record,id:'saved-a',room_code:'S14'}).mockRejectedValueOnce(new Error('Please correct this room'));
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.saveClassroom).toHaveBeenCalledTimes(2);expect(host.querySelector('form input').disabled).toBe(true);expect(host.textContent).toContain('Please correct this room');
 api.saveClassroom.mockResolvedValueOnce({...record,id:'saved-b',room_code:'S15'});
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.saveClassroom).toHaveBeenCalledTimes(3);expect(api.saveClassroom.mock.calls[2][2].room_code).toBe('S15');await click('Done');expect(host.textContent).toContain('Room S14');expect(host.textContent).toContain('Room S15');
});
