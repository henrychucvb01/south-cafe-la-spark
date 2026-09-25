import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import HomeBase from './HomeBase';
import * as service from '../supperMonitoring/service';
jest.mock('../supperMonitoring/service',()=>({openSession:jest.fn(),closeSession:jest.fn(),listMonitorings:jest.fn()}));
const location={id:1,school_name:'Test School'},employee={id:11,employee_name:'Manager'};
let host,root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);jest.clearAllMocks();service.openSession.mockResolvedValue('session');service.closeSession.mockResolvedValue();service.listMonitorings.mockResolvedValue([]);});
afterEach(()=>{act(()=>root.unmount());host.remove();globalThis.IS_REACT_ACT_ENVIRONMENT=false;});
const button=()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent.includes('Monitorings'));
const render=async(props={})=>act(async()=>root.render(<HomeBase location={location} employee={employee} managerPin="pin" {...props}/>));
test.each([employee,{covering:true,employee_name:'Covering Manager'}])('returned school monitoring highlights Hub for regular and covering Managers',async(person)=>{
 service.listMonitorings.mockResolvedValue([{status:'corrections_requested',monitor_role:'manager',locked:false,created_by_employee_id:99},{status:'accepted',monitor_role:'manager',locked:true},{status:'corrections_requested',monitor_role:'supervisor',locked:false}]);
 const open=jest.fn();await render({employee:person,onMonitoring:open});
 expect(button().className).toContain('homebase-card-corrections');expect(button().textContent).toContain('1 monitoring: Corrections requested');
 act(()=>button().click());expect(open).toHaveBeenCalledTimes(1);expect(service.openSession).toHaveBeenCalledWith(location,person,'pin');expect(service.closeSession).not.toHaveBeenCalled();
 service.listMonitorings.mockResolvedValue([{status:'submitted',monitor_role:'manager',locked:false}]);
 await act(async()=>window.dispatchEvent(new Event('focus')));expect(button().className).not.toContain('homebase-card-corrections');
});
test('refresh failure retains existing warning and reuses authenticated session',async()=>{
 service.listMonitorings.mockResolvedValue([{status:'corrections_requested',monitor_role:'manager'}]);await render();
 service.listMonitorings.mockRejectedValue(new Error('Offline'));await act(async()=>window.dispatchEvent(new Event('focus')));
 expect(button().className).toContain('homebase-card-corrections');expect(service.openSession).toHaveBeenCalledTimes(1);
});
test('initial failure is visible rather than claiming no corrections',async()=>{service.listMonitorings.mockRejectedValue(new Error('Offline'));await render();expect(button().textContent).toContain('could not be refreshed');});
