jest.mock('../octoberGames/service',()=>({useOctoberAvailable:()=>false}));
import {useBreakfastAccess} from '../breakfast/BreakfastAccess';
jest.mock('../breakfast/BreakfastAccess',()=>({useBreakfastAccess:jest.fn(()=>({enabled:false}))}));
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import HomeBase from './HomeBase';
import * as service from '../supperMonitoring/service';
jest.mock('../supperMonitoring/service',()=>({openSession:jest.fn(),closeSession:jest.fn(),correctionCount:jest.fn()}));
const location={id:1,school_name:'Test School'},employee={id:11,employee_name:'Manager'};
let host,root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);jest.clearAllMocks();useBreakfastAccess.mockReturnValue({enabled:false});service.openSession.mockResolvedValue('session');service.closeSession.mockResolvedValue();service.correctionCount.mockResolvedValue(0);});
afterEach(()=>{act(()=>root.unmount());host.remove();globalThis.IS_REACT_ACT_ENVIRONMENT=false;});
const button=()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent.includes('Monitorings'));
const render=async(props={})=>act(async()=>root.render(<HomeBase location={location} employee={employee} managerPin="pin" {...props}/>));
test.each([employee,{covering:true,employee_name:'Covering Manager'}])('returned school monitoring highlights Hub for regular and covering Managers',async(person)=>{
 service.correctionCount.mockResolvedValue(1);
 const open=jest.fn();await render({employee:person,onMonitoring:open});
 expect(button().className).toContain('homebase-card-corrections');expect(button().textContent).toContain('1 monitoring: Corrections requested');
 act(()=>button().click());expect(open).toHaveBeenCalledTimes(1);expect(service.openSession).toHaveBeenCalledWith(location,person,'pin');expect(service.closeSession).not.toHaveBeenCalled();
 service.correctionCount.mockResolvedValue(0);
 await act(async()=>window.dispatchEvent(new Event('focus')));expect(button().className).not.toContain('homebase-card-corrections');
});
test('refresh failure retains existing warning and reuses authenticated session',async()=>{
 service.correctionCount.mockResolvedValue(1);await render();
 service.correctionCount.mockRejectedValue(new Error('Offline'));await act(async()=>window.dispatchEvent(new Event('focus')));
 expect(button().className).toContain('homebase-card-corrections');expect(service.openSession).toHaveBeenCalledTimes(1);
});
test('initial failure is visible rather than claiming no corrections',async()=>{service.correctionCount.mockRejectedValue(new Error('Offline'));await render();expect(button().textContent).toContain('could not be refreshed');});

test('Breakfast is visible only for an enabled school',async()=>{await render();expect(host.textContent).not.toContain('Breakfast');useBreakfastAccess.mockReturnValue({enabled:true});await render();expect(host.textContent).toContain('Breakfast');useBreakfastAccess.mockReturnValue({enabled:false});await render({location:{id:2,school_name:'Other school'}});expect(host.textContent).not.toContain('Breakfast');});
