import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import MonitoringStarButton from './MonitoringStarButton';
import {isPerfectMonitoring} from './supperSchedule';
import * as service from '../supperMonitoring/service';
jest.mock('../supperMonitoring/service',()=>({openSupervisorSession:jest.fn(),closeSession:jest.fn(),setMonitoringStar:jest.fn()}));
const record={id:'record',revision:4,monitoring_type:'supper',monitoring_slot:'manager_1',monitoring_site_name:'Main Site',monitor_role:'manager',status:'accepted',locked:true,had_correction_requested:false};
const school={id:1,school_name:'School'};
let container,root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);jest.clearAllMocks();service.openSupervisorSession.mockResolvedValue('supervisor-token');service.closeSession.mockResolvedValue();service.setMonitoringStar.mockResolvedValue({});});
afterEach(()=>{act(()=>root.unmount());container.remove();globalThis.IS_REACT_ACT_ENVIRONMENT=false;});
test.each([[record,false,'Remove Star'],[{...record,perfect_monitoring_override:false},true,'Award Star']])('Supervisor toggles the current star through own session',async(r,awarded,label)=>{
 const refresh=jest.fn();act(()=>root.render(<MonitoringStarButton record={r} school={school} supervisorPin="supervisor-pin" onRefresh={refresh}/>));
 expect(container.querySelector('button').textContent).toBe(label);
 await act(async()=>container.querySelector('button').click());
 expect(service.openSupervisorSession).toHaveBeenCalledWith(school,'supervisor-pin');
 expect(service.setMonitoringStar).toHaveBeenCalledWith('supervisor-token',r,awarded);
 expect(refresh).toHaveBeenCalledTimes(1);expect(service.closeSession).toHaveBeenCalledWith('supervisor-token');
});
test('failed save preserves the decision and gives a retryable error',async()=>{
 service.setMonitoringStar.mockRejectedValueOnce(new Error('Refresh before changing its star.'));
 act(()=>root.render(<MonitoringStarButton record={record} school={school} supervisorPin="pin" onRefresh={jest.fn()}/>));
 await act(async()=>container.querySelector('button').click());
 expect(container.querySelector('[role=alert]').textContent).toContain('Refresh');expect(container.querySelector('button').disabled).toBe(false);
 expect(container.querySelector('button').textContent).toBe('Remove Star');expect(service.closeSession).toHaveBeenCalled();
});
test('no award control for drafts, unlocked or Supervisor records',()=>{
 for(const r of [{...record,status:'draft'},{...record,locked:false},{...record,monitor_role:'supervisor'}]){
  act(()=>root.render(<MonitoringStarButton record={r}/>));expect(container.querySelector('button')).toBeNull();
 }
});
test('explicit Supervisor decision takes precedence over automatic eligibility',()=>{
 expect(isPerfectMonitoring({...record,perfect_monitoring_override:false})).toBe(false);
 expect(isPerfectMonitoring({...record,had_correction_requested:true,perfect_monitoring_override:true})).toBe(true);
 expect(isPerfectMonitoring({...record,had_correction_requested:null,perfect_monitoring_override:true})).toBe(true);
 expect(isPerfectMonitoring({...record,status:'corrections_requested',locked:false,perfect_monitoring_override:true})).toBe(false);
});
