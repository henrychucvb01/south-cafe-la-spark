import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import MysteryHistory from './MysteryHistory';
jest.mock('./service',()=>({dateLabel:value=>value}));
test('compact records preserve dispute details and fulfillment targets',()=>{
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host),fulfill=jest.fn();
 const rows=[{id:41,prize_icon:'🎁',prize_name:'Gift',school_name:'School One',location_code:'1111',won_at:'2026-09-26T10:00:00Z',token_used:1,status:'waiting',prize_kind:'manual',prize_description:'Original gift description'},
 {id:42,prize_icon:'⭐',prize_name:'Points',school_name:'School Two',location_code:'2222',won_at:'2026-09-25T10:00:00Z',token_used:1,status:'received',prize_kind:'spark_points',points_awarded:25,bonus_tokens:1,fulfilled_at:'2026-09-25T10:00:00Z'}];
 try{
  act(()=>root.render(<MysteryHistory rows={rows} onFulfill={fulfill}/>));
  expect(host.querySelectorAll('details')).toHaveLength(2);expect(host.querySelectorAll('details[open]')).toHaveLength(0);
  expect(host.querySelector('summary').textContent).toContain('School One');expect(host.textContent).toContain('Pull #41');expect(host.textContent).toContain('Original gift description');expect(host.textContent).toContain('Marked fulfilled 2026-09-25T10:00:00Z');expect(host.textContent).toContain('+25 SPARK points');
  expect(host.querySelectorAll('button')).toHaveLength(1);
  host.querySelector('details').open=true;act(()=>host.querySelector('button').click());expect(fulfill).toHaveBeenCalledWith(41);
  fulfill.mockClear();act(()=>root.render(<MysteryHistory rows={rows} disabled onFulfill={fulfill}/>));act(()=>host.querySelector('button').click());expect(fulfill).not.toHaveBeenCalled();
 }finally{act(()=>root.unmount());host.remove();}
});
