import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SupervisorLeaderboard from './SupervisorLeaderboard';
import {supabase} from '../supabaseClient';
jest.mock('../supabaseClient',()=>({supabase:{from:jest.fn()}}));
let host,root;
beforeEach(()=>{globalThis.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers().setSystemTime(new Date('2026-09-25T12:00:00'));localStorage.clear();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);supabase.from.mockImplementation(table=>{const q={};for(const method of ['select','eq','order','gte','lte','range'])q[method]=()=>q;q.abortSignal=()=>Promise.resolve({data:table==='locations'?[{id:1,school_name:'School One',location_code:'1111'},{id:2,school_name:'School Two',location_code:'2222'}]:[{location_id:1,points:30,service_date:'2026-08-25'},{location_id:2,points:10,service_date:'2026-08-25'},{location_id:1,points:5,service_date:'2026-09-25'}],error:null});return q;});});
afterEach(()=>{act(()=>root.unmount());host.remove();jest.useRealTimers();});
test('highlights new finished-month results, preserves standings, and never displays side-quest rewards',async()=>{
 await act(async()=>root.render(<SupervisorLeaderboard compact currentLocationId={1}/>));
 expect(host.textContent).toContain('NEW MONTHLY RESULTS');expect(host.textContent).toContain('August 2026 standings are ready');expect(host.textContent).toContain('September 2026');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes('View results')).click());
 expect(host.querySelector('select').value).toBe('2026-08');expect(host.textContent).not.toContain('NEW MONTHLY RESULTS');expect(host.querySelector('tbody tr').textContent).toContain('School One');expect(host.querySelector('tbody tr').textContent).toContain('30');
 expect(host.textContent).not.toMatch(/passport|stamp|mystery|token/i);expect(localStorage.getItem('spark-monthly-results-seen-1')).toBe('2026-08');
});
