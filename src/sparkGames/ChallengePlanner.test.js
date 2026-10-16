import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ChallengePlanner from './ChallengePlanner';
let host,root,run;
const draft={id:'one',month:'2027-11',monday:'2027-11-01',title:'Rainbow on a Tray',description:'Arrange a colorful meal.',goal:'Make lunch inviting.',reward_points:10,state:'proposed',revision:1};
let data;
beforeEach(()=>{sessionStorage.clear();data={games_planning:{drafts:[{...draft}],waves:[],warnings:[]}};global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);run=jest.fn(async()=>true);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(){await act(async()=>root.render(<ChallengePlanner data={data} run={run} busy={false}/>));const input=host.querySelector('input[type=month]');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2027-11');input.dispatchEvent(new Event('input',{bubbles:true}));});}
const click=async text=>act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent===text).click());
test('compact row shows manager preview and approval calls',async()=>{await render();expect(host.querySelectorAll('tbody tr')).toHaveLength(1);await click('Preview');expect(document.querySelector('[role=dialog]').textContent).toContain('Make lunch inviting.');await click('Close preview');await click('Approve');expect(run).toHaveBeenCalledWith('games_approve',{ids:['one']});});
test('Try Another replaces with a different unapproved suggestion',async()=>{await render();await click('Try Another');const [,payload]=run.mock.calls[0];expect(payload.title).not.toBe(draft.title);expect(payload.state).toBe('proposed');expect(payload.monday).toBe(draft.monday);});
test('editing never directly publishes or approves a challenge',async()=>{await render();await click('Edit');await act(async()=>document.querySelector('dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(run.mock.calls[0][0]).toBe('games_draft');expect(run.mock.calls[0][1].state).toBe('proposed');});

function serverUpdates(){run.mockImplementation(async(action,payload)=>{
 if(action==='games_draft')data={...data,games_planning:{...data.games_planning,drafts:data.games_planning.drafts.map(row=>row.id===payload.id?{...payload,revision:row.revision+1}:row)}};
 root.render(<ChallengePlanner data={data} run={run} busy={false}/>);return true;
});}
const change=async(input,value)=>act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});

test('edit opens a modal and saves an original prompt back into its existing row',async()=>{
 serverUpdates();await render();await click('Edit');const dialog=document.querySelector('dialog');expect(dialog.parentElement).toBe(document.body);expect(dialog.getAttribute('aria-modal')).toBe('true');
 await change(dialog.querySelector('textarea'),'My original quest');await change(dialog.querySelectorAll('textarea')[1],'My own instructions');
 await act(async()=>dialog.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(document.querySelector('dialog')).toBeNull();expect(host.querySelector('tbody').textContent).toContain('My original quest');expect(host.querySelector('tbody').textContent).toContain('My own instructions');expect(run.mock.calls[0][1].id).toBe('one');
});
test('failed save keeps the modal and custom text available',async()=>{
 run.mockResolvedValue(false);await render();await click('Edit');await change(document.querySelector('dialog textarea'),'Do not lose this');
 await act(async()=>document.querySelector('dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(document.querySelector('dialog textarea').value).toBe('Do not lose this');expect(document.querySelector('dialog [role=alert]')).not.toBeNull();await click('Cancel');expect(document.querySelector('dialog')).toBeNull();
});
test('Try Another never cycles through prompts already used, including after remount',async()=>{
 serverUpdates();await render();const titles=[draft.title];
 for(let i=0;i<3;i++){await click('Try Another');titles.push(run.mock.calls.at(-1)[1].title);}
 expect(new Set(titles).size).toBe(4);
 await act(async()=>root.unmount());root=createRoot(host);await render();await click('Try Another');expect(titles).not.toContain(run.mock.calls.at(-1)[1].title);
});
test('red remove button hides a scheduled approved quest only after confirmation',async()=>{
 data.games_planning.drafts[0].state='approved';serverUpdates();await render();
 const confirm=jest.spyOn(window,'confirm').mockReturnValue(false),remove=host.querySelector('.sg-remove');await act(async()=>remove.click());expect(run).not.toHaveBeenCalled();
 confirm.mockReturnValue(true);await act(async()=>remove.click());expect(host.querySelectorAll('tbody tr')).toHaveLength(0);expect(run.mock.calls[0][1].state).toBe('rejected');expect(data.games_planning.drafts).toHaveLength(1);confirm.mockRestore();
});
test('five approved quests are a valid week and unreleased approvals remain editable',async()=>{
 data.games_planning.drafts=Array.from({length:5},(_,i)=>({...draft,id:'row'+i,title:'Quest '+i,state:'approved'}));await render();
 expect(host.textContent).toContain('5 approved for release');expect(host.textContent).not.toContain('/10');expect(host.textContent).not.toContain('Only 5');
 expect([...host.querySelectorAll('.sg-row-actions button')].filter(b=>b.textContent==='Edit').every(b=>!b.disabled)).toBe(true);
});
test('published weeks lock editing, replacement and removal but keep preview',async()=>{
 data.games_planning.waves=[{monday:draft.monday,month:draft.month,state:'released',release_at:'2027-11-01T15:00:00Z'}];await render();
 expect([...host.querySelectorAll('button')].filter(b=>['Edit','Try Another'].includes(b.textContent)).every(b=>b.disabled)).toBe(true);expect(host.querySelector('.sg-remove').disabled).toBe(true);await click('Preview');expect(document.querySelector('dialog')).not.toBeNull();
});
