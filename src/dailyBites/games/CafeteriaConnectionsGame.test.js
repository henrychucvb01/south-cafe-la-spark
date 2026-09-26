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
