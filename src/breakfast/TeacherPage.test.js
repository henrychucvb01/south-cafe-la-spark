import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import TeacherPage,{teacherToken,teacherLink} from './TeacherPage';
import * as api from './service';
jest.mock('./service',()=>({teacherPage:jest.fn(),teacherSubmit:jest.fn(),teacherMessage:jest.fn()}));
let host,root;
const qr='00000000-0000-4000-8000-000000000001';
const base={room:'S14',teacher:'Ms. Garcia',enrollment:28,campus:'Main',service_date:'2026-10-06',cutoff:'09:00:00',closed:false,record:null,messages:[],training_url:'',tips_url:''};
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-06T15:00:00Z'));global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();api.teacherPage.mockResolvedValue(base);api.teacherMessage.mockResolvedValue();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.useRealTimers();});
const render=()=>act(async()=>root.render(<TeacherPage qr={qr}/>));
const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent===text);
const click=el=>act(async()=>el.click());
test('permanent URL contains only the classroom bearer token',()=>{expect(teacherToken('#breakfast/'+qr)).toBe(qr);expect(teacherToken('#breakfast/not-a-token')).toBeNull();expect(teacherLink(qr)).toContain('#breakfast/'+qr);});
test('requires certification; counts, submits, and explicitly corrects with a fresh confirmation',async()=>{
 await render();expect(button('Submit breakfast count').disabled).toBe(true);await click(host.querySelector('[aria-label="Add one meal"]'));expect(host.querySelector('output').textContent).toBe('1');await click(host.querySelector('input[type="checkbox"]'));
 api.teacherSubmit.mockResolvedValue({...base,record:{count:1,comments:'',revision:1,submitted_at:'2026-10-06T15:17:00Z'}});await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.teacherSubmit).toHaveBeenCalledWith(qr,base,1,'',true);expect(host.textContent).toContain('Breakfast Count Submitted');expect(host.querySelector('[role="alertdialog"]').textContent).toContain('Please return the breakfast bags');await click(button('Got it'));expect(host.querySelector('[role="alertdialog"]')).toBeNull();await click(button('Correct breakfast count'));expect(button('Submit corrected count').disabled).toBe(true);await click(host.querySelector('[aria-label="Subtract one meal"]'));expect(host.querySelector('output').textContent).toBe('0');expect(host.querySelector('[aria-label="Subtract one meal"]').disabled).toBe(true);
});
test('displays and acknowledges required manager messages without discarding the draft count',async()=>{
 api.teacherPage.mockResolvedValue({...base,messages:[{id:'m1',body:'Count when served',require_ack:true}]});await render();expect(api.teacherMessage).toHaveBeenCalledWith(qr,'m1');await click(host.querySelector('[aria-label="Add one meal"]'));await click(button('I have read this message'));expect(api.teacherMessage).toHaveBeenCalledWith(qr,'m1',true);expect(host.querySelector('output').textContent).toBe('1');expect(host.textContent).not.toContain('Count when served');
});
test('cutoff closes entry while keeping the QR page and submitted count visible',async()=>{
 api.teacherPage.mockResolvedValue({...base,record:{count:24,revision:1,submitted_at:'2026-10-06T15:17:00Z'}});await render();await act(async()=>{jest.setSystemTime(new Date('2026-10-06T16:00:00Z'));jest.advanceTimersByTime(15000);});expect(host.textContent).toContain('reporting is closed');expect(host.textContent).toContain('24 meals');expect(button('Correct breakfast count')).toBeUndefined();expect(api.teacherSubmit).not.toHaveBeenCalled();
});
test('save failure preserves the draft and gives a way to refresh a stale record',async()=>{
 await render();await click(host.querySelector('[aria-label="Add one meal"]'));await click(host.querySelector('input[type="checkbox"]'));api.teacherSubmit.mockRejectedValue(new Error('This count changed in another session.'));await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(host.querySelector('output').textContent).toBe('1');expect(host.querySelector('[role="alert"]').textContent).toContain('another session');expect(button('Refresh latest count')).toBeTruthy();
});

test('shows the meal reminder and supplied resources with the large plus below the count and minus beside certification',async()=>{
 await render();expect(host.textContent).toContain('including a fruit and an entrée');
 const counter=host.querySelector('.ba-counter');expect(counter.firstElementChild.tagName).toBe('OUTPUT');expect(counter.lastElementChild.getAttribute('aria-label')).toBe('Add one meal');
 expect(host.querySelector('.ba-certification [aria-label="Subtract one meal"]')).toBeTruthy();expect([...host.querySelectorAll('a')].some(a=>a.getAttribute('href')==='/breakfast/teacher-quick-tips.pdf')).toBe(true);
});
