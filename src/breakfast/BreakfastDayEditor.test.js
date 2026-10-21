import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ClassroomHistory from './ClassroomHistory';
import * as api from './service';
jest.mock('./service',()=>({classroomHistory:jest.fn(),editBreakfastDay:jest.fn()}));
jest.mock('./ClassroomTrend',()=>()=>null);
jest.mock('./ClassroomTeacherTools',()=>()=>null);
let host,root;
const day={id:'day',classroom_id:'room',service_date:'2026-10-21',room_snapshot:'1-1st',teacher_snapshot:'Teacher',teacher_meal_count:5,teacher_attendance:20,review_status:'awaiting_return',updated_at:'version',returned_counts:{fruit:12},menu_snapshot:{fruit:'Pear'}};
const record={id:'room',room_code:'1-1st',teacher_name:'Teacher',active:true};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();api.classroomHistory.mockResolvedValue({classroom:record,days:[day]});api.editBreakfastDay.mockResolvedValue();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const click=el=>act(async()=>el.click());
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
const editor=()=>host.querySelector('[aria-label="Edit breakfast day"]');
const set=async(el,value)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
async function open(){await act(async()=>root.render(<ClassroomHistory token="school" record={record} onBack={()=>{}}/>));await click(button('Edit'));}
test('history has edit beside the date; zero corrections require confirmation and save',async()=>{
 await open();expect(host.querySelector('tbody tr').children[1].textContent).toBe('Edit');expect(button('✓ Save changes').disabled).toBe(true);
 await set(editor().querySelector('input[type=number]'),'0');await click(editor().querySelectorAll('input[type=checkbox]')[2]);await click(button('✓ Save changes'));
 expect(api.editBreakfastDay).toHaveBeenCalledWith('school',day,{count:0,attendance:20,adult:false,returns:{fruit:12}},false,true);expect(editor()).toBeNull();expect(host.textContent).toContain('Breakfast corrections saved.');
});
test('reset explains its classroom scope, requires its own check mark and reloads history',async()=>{
 await open();await click(editor().querySelector('input[type=checkbox]'));expect(editor().textContent).toContain('Other classrooms and dates are unaffected.');expect(button('Save reset').disabled).toBe(true);expect(editor().querySelector('input[type=number]')).toBeNull();await click(editor().querySelectorAll('input[type=checkbox]')[1]);await click(button('Save reset'));
 expect(api.editBreakfastDay.mock.calls[0].slice(3)).toEqual([true,true]);expect(api.classroomHistory).toHaveBeenCalledTimes(2);expect(host.textContent).toContain('Classroom day reset.');
});
test('changing a confirmed count clears the check mark; a failed save keeps the draft',async()=>{
 await open();await click(editor().querySelectorAll('input[type=checkbox]')[2]);await set(editor().querySelector('input[type=number]'),'0');expect(button('✓ Save changes').disabled).toBe(true);await click(editor().querySelectorAll('input[type=checkbox]')[2]);api.editBreakfastDay.mockRejectedValue(new Error('This record changed. Refresh history before editing.'));await click(button('✓ Save changes'));expect(editor().querySelector('[role=alert]').textContent).toContain('record changed');expect(editor().querySelector('input[type=number]').value).toBe('0');await click(button('Cancel'));expect(editor()).toBeNull();
});
