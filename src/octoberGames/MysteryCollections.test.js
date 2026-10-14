import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import MysteryCollections from './MysteryCollections';
import CompletedMysteryCollection from './CompletedMysteryCollection';
let host,root,run,data;
beforeEach(()=>{
 global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);run=jest.fn(async()=>true);
 data={active_collection:'old',collections:[{id:'old',month:'2026-10-01',state:'active',legacy:true},{id:'new',month:'2026-11-01',state:'draft',revision:1}],rounds:[{id:1,position:1,collection_id:'old',solved_at:'2026-10-10',answer:'Pumpkin',winner:2,reward_points:25,photo_url:'old.webp'}],schools:[{id:2,school_name:'Winning School'}],mystery_drafts:Array.from({length:10},(_,i)=>({id:'draft'+i,position:i+1,collection_id:'new',revision:1,answer:i===0?'Apple':'',aliases:[],photo_url:i===0?'draft.webp':null,piece_count:12,pieces:i===0?Array(12).fill([]):[],reward_points:10,difficulty:1}))};
});
afterEach(()=>{act(()=>root.unmount());host.remove();jest.restoreAllMocks();});
const render=async()=>act(async()=>root.render(<MysteryCollections data={data} run={run} busy={false}/>));
const button=t=>[...host.querySelectorAll('button')].find(b=>b.textContent===t);
test('ten compact slots and preview do not submit or alter progress',async()=>{await render();expect(host.querySelectorAll('tbody tr')).toHaveLength(10);await act(async()=>button('Preview').click());expect(host.querySelector('[role=dialog] img').getAttribute('src')).toBe('draft.webp');expect(run).not.toHaveBeenCalled();await act(async()=>button('Close preview').click());expect(host.querySelector('[role=dialog]')).toBeNull();});
test('incomplete activation requires confirmation and declares incomplete collection',async()=>{await render();jest.spyOn(window,'confirm').mockReturnValue(false);await act(async()=>button('Confirm activation').click());expect(run).not.toHaveBeenCalled();window.confirm.mockReturnValue(true);await act(async()=>button('Confirm activation').click());expect(run).toHaveBeenCalledWith('collection_activate',expect.objectContaining({confirmed:true,confirm_incomplete:true,collection_revision:1,collection_id:'new'}));});
test('ordering sends current revisions; active collection has no editing controls',async()=>{await render();await act(async()=>host.querySelector('[aria-label="Move mystery 1 down"]').click());expect(run).toHaveBeenCalledWith('collection_move',expect.objectContaining({id:'draft0',direction:1,revision:1}));const select=host.querySelector('select');await act(async()=>{select.value='old';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(button('Edit')).toBeUndefined();expect(button('Confirm activation')).toBeUndefined();expect(host.textContent).toContain('Solved');});
test('completed collection retains school, original reward and photograph',async()=>{await act(async()=>root.render(<CompletedMysteryCollection data={data}/>));expect(host.textContent).toContain('Solved by: Winning School · +25 SPARK Points');expect(host.querySelector('img').getAttribute('src')).toBe('old.webp');expect(host.textContent).not.toContain('2026-11');});
