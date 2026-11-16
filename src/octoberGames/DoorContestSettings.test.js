import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import DoorContestSettings,{doorLocal} from './DoorContestSettings';
import DoorContestHistory from './DoorContestHistory';
let root,host;const cfg={revision:26,champion:4,door_contest:1,door_title:'Halloween Doors',door_theme:'halloween',door_participation_points:10,door_champion_points:50};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const render=async element=>act(async()=>root.render(element));
async function input(label,value){const node=[...host.querySelectorAll('label')].find(n=>n.textContent.startsWith(label)).querySelector('input');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
test('confirmed contest stays read-only while a separate Thanksgiving schedule can save',async()=>{
 const run=jest.fn().mockResolvedValue(true);await render(<DoorContestSettings cfg={cfg} run={run}/>);
 expect(host.querySelector('.og-door-settings form')).toBeNull();expect(host.textContent).toContain('preserved');expect(host.querySelector('.og-door-next').open).toBe(true);
 expect(host.querySelector('.og-door-next form').textContent).toContain('Thanksgiving Door Decorating Contest');
 await input('Contest opens','2099-11-18T08:00');await input('Next submissions close','2099-11-23T15:00');await input('Next voting closes','2099-11-25T15:00');
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(run).toHaveBeenCalledWith('door_next_save',expect.objectContaining({revision:26,scheduled:true,opens_local:'2099-11-18T08:00',door_theme:'autumn',door_champion_points:50}));
 expect(host.textContent).toContain('Next contest scheduled.');
});
test('invalid ordering prevents scheduling',async()=>{
 const run=jest.fn();await render(<DoorContestSettings cfg={cfg} run={run}/>);
 await input('Contest opens','2099-11-25T08:00');await input('Next submissions close','2099-11-23T15:00');await input('Next voting closes','2099-11-25T15:00');
 await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(run).not.toHaveBeenCalled();expect(host.textContent).toContain('Opening must precede');
});
test('saved draft can start only after explicit confirmation',async()=>{
 const run=jest.fn(),confirm=jest.spyOn(window,'confirm').mockReturnValue(false);
 const settings={...cfg,submission_start:'2099-11-18T16:00:00Z',submission_end:'2099-11-23T23:00:00Z',voting_end:'2099-11-25T23:00:00Z'};
 await render(<DoorContestSettings cfg={cfg} next={{settings,scheduled:false}} run={run}/>);
 const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='Start saved contest now');
 await act(async()=>button.click());expect(run).not.toHaveBeenCalled();confirm.mockReturnValue(true);await act(async()=>button.click());
 expect(run).toHaveBeenCalledWith('door_next_start',{revision:26,confirmed:true});confirm.mockRestore();
});
test('Los Angeles schedule formatting handles daylight saving time',()=>{
 expect(doorLocal('2026-11-18T16:00:00Z')).toBe('2026-11-18T08:00');expect(doorLocal('2027-07-18T16:00:00Z')).toBe('2027-07-18T09:00');
});
test('past photos load only when a contest is selected and offer no voting controls',async()=>{
 const load=jest.fn().mockResolvedValue({door_history_detail:{settings:cfg,entries:[{id:'old',location_id:4,school_name:'School Four',photo_url:'test.webp',state:'approved',votes:7,awarded_points:10}]}});
 await render(<DoorContestHistory history={[{id:1,title:'Halloween Doors'}]} load={load}/>);expect(load).not.toHaveBeenCalled();
 await act(async()=>{const s=host.querySelector('select');s.value='1';s.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(load).toHaveBeenCalledWith(1);expect(host.textContent).toContain('Champion');expect(host.textContent).toContain('7 votes');expect(host.querySelector('button')).toBeNull();
});
