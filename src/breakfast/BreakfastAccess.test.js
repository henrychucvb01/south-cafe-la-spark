import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BreakfastAccess from './BreakfastAccess';
import * as api from './service';
jest.mock('./service');
let host,root;const location={id:1},employee={id:11};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();api.openSession.mockResolvedValue('token');api.closeSession.mockResolvedValue();api.managerEnabled.mockResolvedValue(false);api.qrEnabled.mockResolvedValue(false);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const render=props=>act(async()=>root.render(<BreakfastAccess {...props}><button>Protected breakfast</button></BreakfastAccess>));
test('manager access fails closed, enables only after server check and revokes on focus',async()=>{await render({location,employee,managerPin:'pin'});expect(host.textContent).not.toContain('Protected breakfast');expect(api.openSession).toHaveBeenCalledWith(location,employee,'pin');api.managerEnabled.mockResolvedValue(true);await act(async()=>window.dispatchEvent(new Event('focus')));expect(host.textContent).toContain('Protected breakfast');api.managerEnabled.mockResolvedValue(false);await act(async()=>window.dispatchEvent(new Event('focus')));expect(host.textContent).toContain('not currently available');});
test('enabled QR works without manager login; disabling hides the content',async()=>{api.qrEnabled.mockResolvedValue(true);await render({qr:'classroom-qr'});expect(api.openSession).not.toHaveBeenCalled();expect(host.textContent).toContain('Protected breakfast');api.qrEnabled.mockResolvedValue(false);await act(async()=>window.dispatchEvent(new Event('focus')));expect(host.textContent).not.toContain('Protected breakfast');});
test('changing schools cannot reuse an enabled result, and network failure blocks access',async()=>{api.managerEnabled.mockResolvedValue(true);await render({location,employee,managerPin:'pin'});api.managerEnabled.mockRejectedValue(new Error('Offline'));await render({location:{id:2},employee:{id:22},managerPin:'other'});expect(host.textContent).not.toContain('Protected breakfast');expect(host.textContent).toContain('could not be checked');expect(api.closeSession).toHaveBeenCalledWith('token');});
test('Breakfast access has no interval polling and skips hidden focus checks',async()=>{
 jest.useFakeTimers();let visibility='visible';const original=Object.getOwnPropertyDescriptor(document,'visibilityState');
 Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>visibility});
 try{
  await render({location,employee,managerPin:'pin'});expect(api.managerEnabled).toHaveBeenCalledTimes(1);
  await act(async()=>jest.advanceTimersByTime(600000));expect(api.managerEnabled).toHaveBeenCalledTimes(1);
  visibility='hidden';await act(async()=>window.dispatchEvent(new Event('focus')));expect(api.managerEnabled).toHaveBeenCalledTimes(1);
  visibility='visible';await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(api.managerEnabled).toHaveBeenCalledTimes(2);
 }finally{if(original)Object.defineProperty(document,'visibilityState',original);else delete document.visibilityState;jest.useRealTimers();}
});
