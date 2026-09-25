import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import MonitoringHome from '../supperMonitoring/MonitoringHome';
import SupperScheduling from './SupperScheduling';
import {schoolYear,localDate} from '../supperMonitoring/model';
jest.mock('./DeleteDraftButton',()=>function DeleteDraft(){return null;});
const year=schoolYear(localDate());
const site={id:'site',location_id:1,name:'Main Site',kind:'main'};
const school={id:1,school_name:'School'};
const first={id:'first',monitoring_type:'supper',monitoring_site_id:site.id,school_year:year,monitoring_slot:'manager_1',monitor_role:'manager',status:'accepted',locked:true,had_correction_requested:false};
let container,root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();globalThis.IS_REACT_ACT_ENVIRONMENT=false;});
test('Manager star fits the existing four-column completed row and card',()=>{
 act(()=>root.render(<MonitoringHome records={[first]} context={{actor_role:'manager',monitoring_sites:[site]}} location={school}/>));
 expect(container.querySelector('.sm-status-card').textContent).toContain('⭐ Perfect Monitoring');
 const row=container.querySelector('.sm-compact-records li');
 expect(row.children).toHaveLength(4);
 expect(row.querySelector('.sm-compact-comment').textContent).toContain('⭐ Perfect Monitoring');
 expect(row.lastElementChild.textContent).toBe('View');
});
test('Supervisor green completed cells and recognition do not leak onto incomplete or own records',()=>{
 const records=[first,{...first,id:'second',monitoring_slot:'supervisor',monitor_role:'supervisor',status:'completed'},{...first,id:'third',monitoring_slot:'manager_2',status:'submitted',locked:false}];
 act(()=>root.render(<SupperScheduling overview={{schools:[school],sites:[site],records}} year={year}/>));
 const cells=container.querySelectorAll('.sm-schedule-overview td');
 expect(cells[0].className).toBe('sm-overview-completed');expect(cells[0].textContent).toContain('Perfect Monitoring');
 expect(cells[1].className).toBe('sm-overview-completed');expect(cells[1].textContent).not.toContain('Perfect Monitoring');
 expect(cells[2].className).toBe('sm-overview-submitted');expect(cells[2].textContent).not.toContain('Perfect Monitoring');
 expect(container.querySelector('form').textContent).not.toContain('Matrix school / site');
 expect(container.textContent).toContain('All Schools / Sites');
});
test('Manager top card exposes Resume Draft and later cards explain locks',()=>{
 act(()=>root.render(<MonitoringHome records={[{...first,status:'draft',locked:false}]} context={{actor_role:'manager',monitoring_sites:[site]}} location={school}/>));
 const cards=container.querySelectorAll('.sm-status-card');
 expect(cards[0].textContent).toContain('Resume Draft');
 expect(cards[1].disabled).toBe(true);expect(cards[1].textContent).toContain('Waiting for Supper 1');
 expect(cards[2].disabled).toBe(true);expect(cards[2].textContent).toContain('Complete Supper 1 and Supper 2');
 expect(container.querySelectorAll('details')).toHaveLength(1);
});
