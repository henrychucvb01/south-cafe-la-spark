import React,{act} from 'react';import {createRoot} from 'react-dom/client';
import SupervisorMealAnalytics from './SupervisorMealAnalytics';import {loadMplhReportData} from '../mplhReport/mplhReportService';
jest.mock('../mplhReport/mplhReportService',()=>({loadMplhReportData:jest.fn()}));
jest.mock('recharts',()=>{const React=require('react');const box=({children})=><div>{children}</div>;return {ResponsiveContainer:box,LineChart:box,Line:()=>null,XAxis:()=>null,YAxis:()=>null,CartesianGrid:()=>null,Tooltip:()=>null,Legend:()=>null};});
test('overview, vertical school selection and comparison controls update automatically',async()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;loadMplhReportData.mockResolvedValue({officialMealRows:[{location_id:1,service_date:'2026-09-08',lunch_count:100},{location_id:2,service_date:'2026-09-08',lunch_count:200}],mealRows:[],excludedRows:[]});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const end=jest.fn();
 await act(async()=>root.render(<SupervisorMealAnalytics schools={[{id:1,school_name:'Alpha School'},{id:2,school_name:'Beta School'}]} supervisorPin="test" endDate="2026-09-08" setEndDate={end} refreshKey={0} rates={{breakfast:4.08,lunch:5.9,supper:4.6}}/>));
 const click=async(name)=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===name).click());
 expect(host.textContent).toContain('300');await click('By School');expect(host.querySelector('nav[aria-label="Choose a school"]')).not.toBeNull();await click('Beta School');expect(host.querySelector('.ma-content h3').textContent).toBe('Beta School');
 await click('Compare Schools');expect(host.querySelectorAll('.ma-comparison h3')).toHaveLength(2);expect(host.querySelectorAll('option').length).toBeGreaterThan(10);
 const combined=host.querySelector('.ma-check input');await act(async()=>combined.click());expect(host.querySelectorAll('.ma-comparison [role="img"]')).toHaveLength(2);
 await act(async()=>root.unmount());host.remove();
});
