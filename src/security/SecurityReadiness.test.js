import React from 'react';
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {supabase} from '../supabaseClient';
import {useSecurityReady} from './SecurityReadiness';
jest.mock('../supabaseClient',()=>({supabase:{rpc:jest.fn()}}));
global.IS_REACT_ACT_ENVIRONMENT=true;
let root,node;
function Probe(){return <div>{useSecurityReady()?'Ready':'Waiting'}</div>;}
beforeEach(()=>{jest.useFakeTimers();node=document.createElement('div');root=createRoot(node);supabase.rpc.mockReset();});
afterEach(()=>{act(()=>root.unmount());jest.useRealTimers();});
test('missing database release blocks the app, and readiness automatically opens it',async()=>{
 supabase.rpc.mockResolvedValueOnce({error:{code:'PGRST202'}}).mockResolvedValue({data:{version:1,ready:true}});
 await act(async()=>root.render(<Probe/>));expect(node.textContent).toBe('Waiting');
 await act(async()=>jest.advanceTimersByTime(10000));expect(node.textContent).toBe('Ready');
});
test('release pause and incompatible version close the app until recovery',async()=>{
 supabase.rpc.mockResolvedValue({data:{version:1,ready:true}});
 await act(async()=>root.render(<Probe/>));expect(node.textContent).toBe('Ready');
 for(const data of [{version:1,ready:false},{version:2,ready:true}]){
  supabase.rpc.mockResolvedValue({data});await act(async()=>window.dispatchEvent(new Event('focus')));expect(node.textContent).toBe('Waiting');
 }
 supabase.rpc.mockResolvedValue({data:{version:1,ready:true}});await act(async()=>window.dispatchEvent(new Event('focus')));expect(node.textContent).toBe('Ready');
});
