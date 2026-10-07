import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import QrPrintCenter from './QrPrintCenter';
import {classroomQr} from './service';
import {buildQrPrintPdf} from './qrPrintPdf';
jest.mock('./service',()=>({classroomQr:jest.fn()}));
jest.mock('./TeacherPage',()=>({teacherLink:qr=>`https://spark.test/#breakfast/${qr}`}));
jest.mock('./qrPrintPdf',()=>({qrPrintDefaults:{orientation:'portrait',perPage:4,layout:'vertical',order:'qr,room,campus',showCampus:true,qrSize:144,fontSize:32,campusSize:18,qrRotation:0,textRotation:0},buildQrPrintPdf:jest.fn()}));
let root,host;
const classrooms=[{id:'a',room_code:'203',campus_label:'Main',active:true},{id:'b',room_code:'S14',campus_label:'West',active:true},{id:'c',room_code:'OLD',active:false}];
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers();jest.clearAllMocks();classroomQr.mockImplementation(async(t,id)=>`qr-${id}`);buildQrPrintPdf.mockResolvedValue(new Uint8Array([1,2]));URL.createObjectURL=jest.fn(()=> 'blob:test');URL.revokeObjectURL=jest.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();jest.useRealTimers();});
const render=()=>act(async()=>root.render(<QrPrintCenter token="school-token" classrooms={classrooms}/>));
const click=async text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text).click());
const flush=()=>act(async()=>{jest.advanceTimersByTime(350);});
test('selected classrooms use their own permanent QR, settings regenerate preview, and filename is editable',async()=>{
 await render();expect(host.textContent).not.toContain('OLD');await click('Select all');await flush();expect(classroomQr.mock.calls).toEqual([['school-token','a'],['school-token','b']]);expect(buildQrPrintPdf.mock.calls[0][0].map(r=>r.url)).toEqual(['https://spark.test/#breakfast/qr-a','https://spark.test/#breakfast/qr-b']);expect(host.querySelector('iframe')).not.toBeNull();
 await act(async()=>{const select=host.querySelector('select');select.value='landscape';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(host.querySelector('iframe')).toBeNull();await flush();expect(classroomQr).toHaveBeenCalledTimes(2);expect(buildQrPrintPdf.mock.calls[1][1].orientation).toBe('landscape');
 await act(async()=>{const input=host.querySelector('input[maxlength="120"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'My labels.pdf');input.dispatchEvent(new Event('input',{bubbles:true}));});expect(host.querySelector('a[download]').download).toBe('My labels.pdf');await click('Clear');expect(host.querySelector('a[download]')).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalled();
});
test('QR fetch failure does not leave a printable wrong or partial document',async()=>{
 classroomQr.mockRejectedValue(new Error('School session expired'));await render();await click('Select all');await flush();expect(host.querySelector('[role=alert]').textContent).toContain('School session expired');expect(buildQrPrintPdf).not.toHaveBeenCalled();expect(host.querySelector('a[download]')).toBeNull();
});
