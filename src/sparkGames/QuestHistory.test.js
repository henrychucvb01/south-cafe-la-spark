import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import QuestHistory,{questHistory} from './QuestHistory';
test('history has compact read-only rows, actual release dates and no per-quest dropdowns',()=>{
 const data={quests:[{id:1,name:'Historical quest',description:'Original description',reward_points:30}],game_waves:[{id:'released',state:'released',released_at:'2026-10-12T14:00:00Z'},{id:'future',state:'planned'}],games_planning:{drafts:[{id:'a',quest_id:2,wave_id:'released',title:'Released prompt',description:'Saved description',reward_points:45},{id:'b',quest_id:3,wave_id:'future',title:'Future prompt'}]}};
 const before=JSON.stringify(data);expect(questHistory(data)).toHaveLength(2);
 global.IS_REACT_ACT_ENVIRONMENT=true;const host=document.createElement('div'),root=createRoot(host);act(()=>root.render(<QuestHistory data={data}/>));
 expect(host.textContent).toContain('Quest History');expect(host.textContent).toContain('10/12/2026');expect(host.textContent).toContain('Not recorded');expect(host.querySelectorAll('tbody tr')).toHaveLength(2);expect(host.querySelectorAll('details,input,button')).toHaveLength(0);expect(JSON.stringify(data)).toBe(before);act(()=>root.unmount());global.IS_REACT_ACT_ENVIRONMENT=false;
});
