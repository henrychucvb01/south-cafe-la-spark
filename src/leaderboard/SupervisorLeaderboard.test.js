import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import SupervisorLeaderboard, { monthlyBand } from './SupervisorLeaderboard';
import {supabase} from '../supabaseClient';
jest.mock('../supabaseClient',()=>({supabase:{from:jest.fn(),rpc:jest.fn(()=>({abortSignal:()=>Promise.resolve({data:[],error:null})}))}}));
let host,root;
beforeEach(()=>{supabase.rpc.mockImplementation(()=>({abortSignal:()=>Promise.resolve({data:[],error:null})}));globalThis.IS_REACT_ACT_ENVIRONMENT=true;jest.useFakeTimers().setSystemTime(new Date('2026-09-25T12:00:00'));localStorage.clear();host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);supabase.from.mockImplementation(table=>{const q={};for(const method of ['select','eq','order','gte','lte','range'])q[method]=()=>q;q.abortSignal=()=>Promise.resolve({data:table==='locations'?[{id:1,school_name:'School One',location_code:'1111'},{id:2,school_name:'School Two',location_code:'2222'}]:[{location_id:1,points:30,service_date:'2026-08-25'},{location_id:2,points:10,service_date:'2026-08-25'},{location_id:1,points:5,service_date:'2026-09-25'}],error:null});return q;});});
afterEach(()=>{act(()=>root.unmount());host.remove();jest.useRealTimers();});
test('highlights new finished-month results, preserves standings, and never displays side-quest rewards',async()=>{
 await act(async()=>root.render(<SupervisorLeaderboard compact currentLocationId={1}/>));
 expect(host.textContent).toContain('NEW MONTHLY RESULTS');expect(host.textContent).toContain('August 2026 standings are ready');expect(host.textContent).toContain('September 2026');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes('View results')).click());
 expect(host.querySelector('select').value).toBe('2026-08');expect(host.textContent).not.toContain('NEW MONTHLY RESULTS');expect(host.querySelector('tbody tr').textContent).toContain('School One');expect(host.querySelector('tbody tr').textContent).toContain('30');
 expect(host.textContent).not.toMatch(/passport|stamp|mystery|token/i);expect(localStorage.getItem('spark-monthly-results-seen-1')).toBe('2026-08');
});
test('Monthly Cup bands include tied boundary ranks without exposing reward rules',()=>{
 expect([1,5,5,6,17,17,18].map(rank=>monthlyBand({rank}))).toEqual(['cup-top-five','cup-top-five','cup-top-five','cup-top-seventeen','cup-top-seventeen','cup-top-seventeen','']);
});
test('closed-month standings use the frozen results instead of subsequently edited points',async()=>{
 supabase.rpc.mockReturnValueOnce({abortSignal:()=>Promise.resolve({data:[{month:'2026-08-01',location_id:2,school_name:'School Two',location_code:'2222',points:40,rank:1},{month:'2026-08-01',location_id:1,school_name:'School One',location_code:'1111',points:30,rank:2}],error:null})});
 await act(async()=>root.render(<SupervisorLeaderboard compact currentLocationId={1}/>));
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes('View results')).click());
 expect(host.querySelector('tbody tr').textContent).toContain('School Two');
 expect(host.querySelector('tbody tr').className).toContain('cup-top-five');
 expect(host.textContent).not.toMatch(/pull|token|reward/i);
});
