import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import CafeteriaConnectionsGame from './CafeteriaConnectionsGame';
import {selectSeasonPuzzle} from './seasonPuzzles';
jest.mock('./GameResultDialog',()=>()=>null);
test('difficulty is visible before play and does not change chances or points',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
 try{
 const puzzle=selectSeasonPuzzle('spark-sort','2026-09-28');const save=jest.fn().mockResolvedValue(true);
 await act(async()=>root.render(<CafeteriaConnectionsGame puzzle={puzzle} onSave={save} onComplete={jest.fn()} streak={0}/>));
 expect(host.textContent).toContain("Today's difficulty: Easy");expect(host.querySelector('[aria-label="5 chances remaining"]')).not.toBeNull();
 for(const word of puzzle.groups[0].items)act(()=>Array.from(host.querySelectorAll('.spark-sort-grid button')).find(b=>b.textContent===word).click());
 await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Submit Group').click());
 expect(save).toHaveBeenCalledWith(expect.objectContaining({status:'in_progress',attemptCount:0}));
 expect(host.querySelector('[aria-label="5 chances remaining"]')).not.toBeNull();
 }finally{act(()=>root.unmount());host.remove();globalThis.IS_REACT_ACT_ENVIRONMENT=false;}
});

 test('paid hints persist, reveal one word per group and reduce completion points',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
 const puzzle=selectSeasonPuzzle('spark-sort','2026-09-28'),save=jest.fn().mockResolvedValue(true),complete=jest.fn().mockResolvedValue(true);
 const render=progress=>root.render(<CafeteriaConnectionsGame key={progress ? "restored" : "initial"} puzzle={puzzle} progress={progress} onSave={save} onComplete={complete} streak={0}/>);
 const button=text=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text);
 try{
 await act(async()=>render(null));
 await act(async()=>button('Hint (−1 point)').click());
 expect(save).toHaveBeenLastCalledWith(expect.objectContaining({state:{solvedGroupIds:[],mistakes:0,hintsUsed:1}}));
 const hints=host.querySelector('[aria-label="Connections hints"]');
 for(const group of puzzle.groups){expect(hints.textContent).toContain(group.items[0]);expect(hints.textContent).not.toContain(group.items[1]);}
 expect(host.textContent).toContain('4 points possible');
 await act(async()=>render({status:'in_progress',state:{solvedGroupIds:[],mistakes:0,hintsUsed:1}}));
 expect(host.textContent).toContain('4 points possible');
 for(const group of puzzle.groups){
   for(const item of group.items)act(()=>button(item).click());
   await act(async()=>button('Submit Group').click());
 }
 expect(complete).toHaveBeenCalledWith(expect.objectContaining({points:4,state:expect.objectContaining({hintsUsed:1})}));
 expect(button('Hint (−1 point)')).toBeUndefined();
 }finally{act(()=>root.unmount());host.remove();globalThis.IS_REACT_ACT_ENVIRONMENT=false;}
 });
 test('failed hint save reveals nothing and charges nothing',async()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
 try{
 await act(async()=>root.render(<CafeteriaConnectionsGame puzzle={selectSeasonPuzzle('spark-sort','2026-09-28')} onSave={jest.fn().mockResolvedValue(false)} onComplete={jest.fn()} streak={0}/>));
 await act(async()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Hint (−1 point)').click());
 expect(host.querySelector('[aria-label="Connections hints"]')).toBeNull();
 expect(host.textContent).toContain('5 points possible');expect(host.textContent).toContain('No point deducted');
 }finally{act(()=>root.unmount());host.remove();globalThis.IS_REACT_ACT_ENVIRONMENT=false;}
 });
