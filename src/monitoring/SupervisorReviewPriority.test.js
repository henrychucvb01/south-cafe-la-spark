import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import SupervisorMonitoringPage from './SupervisorMonitoringPage';
import {supervisorOverview} from '../supperMonitoring/service';
jest.mock('../supperMonitoring/service',()=>({supervisorOverview:jest.fn()}));
test('review queue follows the controls and precedes scheduling',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 supervisorOverview.mockResolvedValue({schools:[],sites:[],records:[]});
 const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container);
 try {
  await act(async()=>root.render(<SupervisorMonitoringPage supervisorPin="test"/>));
  const sections=container.querySelectorAll('main > section');
  expect(sections[0].textContent).toContain('Refresh Overview');
  expect(sections[1].querySelector('h2').textContent).toBe('Submitted for Review');
  expect(sections[2].querySelector('h2').textContent).toBe('Supper Scheduling / Matrix');
 }finally{act(()=>root.unmount());container.remove();globalThis.IS_REACT_ACT_ENVIRONMENT=false;}
});
