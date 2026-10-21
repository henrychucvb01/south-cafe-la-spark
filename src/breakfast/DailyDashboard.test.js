import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import DailyDashboard,{breakfastFlags,breakfastStatus} from './DailyDashboard';
import * as api from './service';
jest.mock('./service');
let host,root;
const row={classroom_id:'c1',room:'203',teacher:'Teacher',record:{number_sent:30,teacher_meal_count:24,teacher_certified:true,packing_submitted_at:'2026-10-07T14:00:00Z',teacher_submitted_at:'2026-10-07T15:00:00Z',worker_submitted_at:'2026-10-07T16:00:00Z',menu_snapshot:{fruit:'Apple'},items_sent:{fruit:30},returned_counts:{fruit:6},updated_at:'2026-10-07T16:00:00Z',review_status:'needs_review'}};
beforeEach(()=>{global.IS_REACT_ACT_ENVIRONMENT=true;jest.clearAllMocks();localStorage.clear();api.dailyDashboard.mockResolvedValue({rows:[row],total:24});api.reviewBreakfast.mockResolvedValue();host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const click=text=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text).click());
test('Refresh fetches the selected school/date again and updates totals',async()=>{await act(async()=>root.render(<DailyDashboard token="manager-session"/>));expect(host.textContent).toContain('Apple: 6');const date=host.querySelector('input[type=date]').value;api.dailyDashboard.mockResolvedValue({rows:[row],total:25});await click('Refresh');expect(api.dailyDashboard).toHaveBeenLastCalledWith('manager-session',date);expect(api.dailyDashboard).toHaveBeenCalledTimes(2);expect(host.querySelector('.ba-totals strong').textContent).toBe('25');});
test('manager review sends the current record version then refreshes',async()=>{await act(async()=>root.render(<DailyDashboard token="manager-session"/>));await click('Review');await act(async()=>host.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(api.reviewBreakfast).toHaveBeenCalledWith('manager-session',row,expect.any(String),'');expect(api.dailyDashboard).toHaveBeenCalledTimes(2);});
test('statuses require all three steps; component warnings never alter meal totals',()=>{expect(breakfastStatus(null)).toBe('Awaiting packing');expect(breakfastStatus({packing_submitted_at:'today'})).toBe('Awaiting teacher');expect(breakfastStatus({...row.record,worker_submitted_at:null})).toBe('Awaiting returns');expect(breakfastStatus({...row.record,review_status:'reviewed',reviewed_at:'today'})).toBe('Reviewed');expect(breakfastFlags({...row.record,teacher_meal_count:31,returned_counts:{fruit:32}})).toEqual(['Apple: returns exceed sent']);});

test('cards and table preserve counts, classroom links open history, and view is remembered',async()=>{
 const open=jest.fn();await act(async()=>root.render(<DailyDashboard token="manager-session" onClassroom={open}/>));expect(host.querySelector('.ba-dashboard-cards')).toBeTruthy();await click('Room 203');expect(open).toHaveBeenCalledWith(expect.objectContaining({id:'c1',room_code:'203'}));await click('Table');expect(host.querySelector('.ba-history-table')).toBeTruthy();expect(host.textContent).toContain('Apple: 6');expect(localStorage.getItem('spark-breakfast-view')).toBe('table');await click('Cards');expect(host.querySelector('.ba-dashboard-cards')).toBeTruthy();
});

test('saved pre-order appears beside student meals, with its target date and without changing served totals',async()=>{api.dailyDashboard.mockResolvedValue({total:24,rows:[{...row,record:{...row.record,preorder_submitted_at:'2026-10-07T16:00:00Z',preorder_date:'2026-10-08',preorder_entree:'Breakfast burrito',preorder_count:12}},{...row,classroom_id:'c2',room:'204'}]});await act(async()=>root.render(<DailyDashboard token="manager-session"/>));const cards=host.querySelectorAll('.ba-class-card');expect(cards[0].querySelector('.ba-card-meals').textContent).toContain('Pre-order · Oct 8');expect(cards[0].querySelector('.ba-preorder-quantity').textContent).toBe('12');expect(cards[0].querySelector('.ba-preorder-name').textContent).toBe('Breakfast burrito');expect(cards[0].querySelector('.ba-card-count strong').textContent).toBe('24');expect(cards[1].querySelector('.ba-card-preorder')).toBeNull();expect(host.querySelector('.ba-totals strong').textContent).toBe('24');});

test('pre-order quantities and menu names have separate aligned rows, including zero',async()=>{
 const record={...row.record,preorder_submitted_at:'saved',preorder_date:'2026-10-22',preorder_count:15,preorder_items:{counts:{entree1:10,entree2:1,vegan:1,other:3,extra:0},menu:{entree1:'Fresh Baked Croissant',entree2:'Yogurt & Crackers',vegan:'Almond milk or Soy milk',other:'Cinnamon Toast Crunch',extra:'Optional item'}}};
 api.dailyDashboard.mockResolvedValue({total:24,rows:[{...row,record}]});await act(async()=>root.render(<DailyDashboard token="manager-session"/>));
 const items=[...host.querySelectorAll('.ba-preorder-items li')];expect(items.map(e=>e.querySelector('.ba-preorder-quantity').textContent)).toEqual(['10','1','1','3','0']);
 expect(items.map(e=>e.querySelector('.ba-preorder-name').textContent)).toEqual(Object.values(record.preorder_items.menu));expect(host.querySelector('.ba-card-count strong').textContent).toBe('24');
});
test('older multi-item summaries display one item per row without repeating the total',async()=>{
 api.dailyDashboard.mockResolvedValue({total:24,rows:[{...row,record:{...row.record,preorder_submitted_at:'saved',preorder_date:'2026-10-22',preorder_count:15,preorder_entree:'Fresh Baked Croissant: 10 · Yogurt&Crackers: 1 · Almond milk or Soy milk: 1 · Cinnamon Toast Crunch: 3'}}]});
 await act(async()=>root.render(<DailyDashboard token="manager-session"/>));expect([...host.querySelectorAll('.ba-preorder-quantity')].map(e=>e.textContent)).toEqual(['10','1','1','3']);
});
test('missing teacher submissions are gray while submitted zero counts remain green',async()=>{
 api.dailyDashboard.mockResolvedValue({total:0,rows:[{...row,record:null},{...row,classroom_id:'c2',record:{...row.record,teacher_submitted_at:null}},{...row,classroom_id:'c3',record:{...row.record,teacher_meal_count:0}}]});
 await act(async()=>root.render(<DailyDashboard token="manager-session"/>));const cards=host.querySelectorAll('.ba-class-card');expect(cards[0].classList.contains('ba-class-card--pending')).toBe(true);expect(cards[1].classList.contains('ba-class-card--pending')).toBe(true);expect(cards[2].classList.contains('ba-class-card--submitted')).toBe(true);expect(cards[2].querySelector('.ba-card-count strong').textContent).toBe('0');
});
