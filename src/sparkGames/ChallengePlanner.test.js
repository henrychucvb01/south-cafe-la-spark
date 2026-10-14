import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ChallengePlanner from './ChallengePlanner';
let host,root,run;
const draft={id:'one',month:'2027-11',monday:'2027-11-01',title:'Rainbow on a Tray',description:'Arrange a colorful meal.',goal:'Make lunch inviting.',reward_points:10,state:'proposed',revision:1};
const data={games_planning:{drafts:[draft],waves:[],warnings:[]}};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);run=jest.fn(async()=>true);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function render(){await act(async()=>root.render(<ChallengePlanner data={data} run={run} busy={false}/>));const input=host.querySelector('input[type=month]');await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2027-11');input.dispatchEvent(new Event('input',{bubbles:true}));});}
const click=async text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text).click());
test('compact row shows manager preview and approval calls',async()=>{await render();expect(host.querySelectorAll('tbody tr')).toHaveLength(1);await click('Preview');expect(host.querySelector('[role=dialog]').textContent).toContain('Make lunch inviting.');await click('Approve');expect(run).toHaveBeenCalledWith('games_approve',{ids:['one']});});
test('Try Another replaces with a different unapproved suggestion',async()=>{await render();await click('Try Another');const [,payload]=run.mock.calls[0];expect(payload.title).not.toBe(draft.title);expect(payload.state).toBe('proposed');expect(payload.monday).toBe(draft.monday);});
test('editing never directly publishes or approves a challenge',async()=>{await render();await click('Edit');await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(run.mock.calls[0][0]).toBe('games_draft');expect(run.mock.calls[0][1].state).toBe('proposed');});
