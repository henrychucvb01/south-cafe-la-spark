import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import BreakfastDispatch from './BreakfastDispatch';
import {menuWorkspace} from './service';
import {dailyTotals,returnItems,returnsCsv} from './returnsModel';
jest.mock('./service',()=>({menuWorkspace:jest.fn()}));
let host,root,menus;
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();menus={};window.confirm=jest.fn(()=>true);menuWorkspace.mockImplementation(async(t,d,action='list',payload={})=>{if(action==='menu_save')menus[d]={...payload.items};if(action==='copy_date')menus[payload.destination]={...menus[d]};return {revision:1,groups:[],classrooms:[],menus:{standard:menus[d]||{}},saved_groups:menus[d]?['standard']:[]};});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const input=(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
test('autosaves the current menu before changing date and retains edits on failed save',async()=>{
 await act(async()=>root.render(<BreakfastDispatch token="t" expanded/>));const date=host.querySelector('input[type=date]').value;
 await act(async()=>host.querySelector('[aria-label="Include Entrée 1"]').click());await act(async()=>input(host.querySelector('input[type=text]'),'Toast'));expect(host.textContent).toContain('Unsaved changes');
 await act(async()=>input(host.querySelector('input[type=date]'),'2026-11-02'));expect(menus[date].entree1).toBe('Toast');expect(host.querySelector('input[type=date]').value).toBe('2026-11-02');
 await act(async()=>host.querySelector('[aria-label="Include Entrée 1"]').click());await act(async()=>input(host.querySelector('input[type=text]'),'Bagel'));menuWorkspace.mockRejectedValueOnce(new Error('Cannot save now'));
 await act(async()=>input(host.querySelector('input[type=date]'),'2026-11-03'));expect(host.querySelector('input[type=date]').value).toBe('2026-11-02');expect(host.querySelector('input[type=text]').value).toBe('Bagel');expect(host.textContent).toContain('Cannot save now');
});
test('copy confirms an existing destination and sends its snapshot to the server',async()=>{
 menus['2026-11-02']={entree1:'Toast',milk1:'Milk'};menus['2026-11-03']={entree1:'Cereal'};window.confirm=jest.fn(()=>false);
 await act(async()=>root.render(<BreakfastDispatch token="t" expanded/>));const dates=host.querySelectorAll('input[type=date]');await act(async()=>{input(dates[1],'2026-11-02');input(dates[2],'2026-11-03');});
 const copy=[...host.querySelectorAll('button')].find(b=>b.textContent==='Copy daily menu');await act(async()=>copy.click());expect(menuWorkspace.mock.calls.some(call=>call[2]==='copy_date')).toBe(false);window.confirm.mockReturnValue(true);await act(async()=>copy.click());expect(menuWorkspace).toHaveBeenCalledWith('t','2026-11-02','copy_date',expect.objectContaining({destination:'2026-11-03',confirmed:true,group_id:null}));
});
test('returns keep different dates/items apart and preserve zero versus missing deliveries',()=>{
 const rows=[{date:'2026-10-01',room:'1',menu:{entree1:'Toast',fruit:'Apple'},counts:{entree1:3,fruit:2},sent:{entree1:20,fruit:0}},{date:'2026-10-01',room:'2',menu:{entree1:'Toast'},counts:{entree1:4},sent:{}},{date:'2026-10-02',room:'1',menu:{entree1:'Bagel'},counts:{entree1:5},sent:{entree1:10}}];
 const items=returnItems(rows),totals=dailyTotals(items);expect(totals.map(x=>[x.date,x.item,x.quantity])).toEqual([['2026-10-01','Apple',2],['2026-10-01','Toast',7],['2026-10-02','Bagel',5]]);expect(items.map(x=>x.delivered)).toEqual([20,null,null,10]);expect(returnsCsv(items)).toContain('"Toast","7"');
});
