import { dateParts, supperSchedule } from './supperSchedule';
const setting={school_year:'2026-27',monitoring_slot:'manager_2',due_date:'2027-05-09'};
const first={id:'one',monitoring_type:'supper',monitoring_site_id:'main',school_year:'2026-27',monitoring_slot:'manager_1',monitoring_date:'2026-09-14',status:'accepted',source:'uploaded',locked:true};
const second={...first,id:'two',monitoring_slot:'supervisor',monitoring_date:'2026-09-30',status:'completed',source:'generated'};
const calc=(records=[],overrides={})=>supperSchedule({schedules:[setting],records,siteId:'main',year:'2026-27',slot:'manager_2',...overrides});
test.each([[1,1],[7,1],[8,2],[14,2],[15,3],[21,3],[22,4],[28,4],[29,5],[31,5]])('day %i uses Week %i',(day,week)=>{
 expect(dateParts(`2027-01-${String(day).padStart(2,'0')}`).week).toBe(week);
});
test('real dates, leap years and calendar weekdays use UTC',()=>{
 expect(dateParts('2026-09-14')).toMatchObject({weekday:1,week:2});
 expect(dateParts('2026-09-30')).toMatchObject({weekday:3,week:5});
 expect(dateParts('2028-02-29').week).toBe(5);
 expect(dateParts('2027-02-29')).toBe(null);
});
test('Supper 1 derives its school-year start and includes weekdays through its due date',()=>{
 const s=calc([],{slot:'manager_1',schedules:[{...setting,monitoring_slot:'manager_1'}]});expect(s.dates.length).toBeGreaterThan(3);expect(s.dates[0]).toBe('2026-07-01');expect(s.dates.at(-1)).toBe('2027-05-07');
 expect(s.dates).not.toContain('2027-04-03');
});
test('Supper 1 starts unrestricted; Supper 2 uses only completed Supper 1',()=>{
 expect(calc([first,second],{slot:'manager_1'}).prior).toHaveLength(0);
 const s=calc([first,second],{slot:'supervisor'});expect(s.prior).toEqual([first]);expect([...s.weekdays]).toEqual([1]);expect([...s.weeks]).toEqual([2]);
});
test('Supper 3 excludes both used rows and columns from accepted uploads and guided completions',()=>{
 const s=calc([first,second]);expect([...s.weekdays]).toEqual([1,3]);expect([...s.weeks]).toEqual([2,5]);
 expect(s.dates.length).toBeGreaterThan(3);
 for(const date of s.dates){const p=dateParts(date);expect([1,3]).not.toContain(p.weekday);expect([2,5]).not.toContain(p.week);}
 expect(s.dates).toContain('2027-04-01');expect(s.dates).not.toContain('2027-04-08');
});
test('schools/sites, years, meal types and pending records cannot contaminate a matrix',()=>{
 const ignored=[{...first,monitoring_site_id:'offsite'},{...first,school_year:'2025-26'},{...first,monitoring_type:'lunch'},...['draft','submitted','corrections_requested'].map(status=>({...first,status}))];
 expect(calc(ignored).dates).toEqual(calc().dates);
 expect(calc([],{siteId:'eec'}).configured).toBe(true);
 expect(calc([],{year:'2025-26'}).configured).toBe(false);
});
test('missing/invalid due dates and exhausted ranges do not invent dates',()=>{
 expect(calc([first,second],{schedules:[]}).dates).toEqual([]);
 expect(calc([first,second],{schedules:[{...setting,due_date:'2027-02-29'}]}).configured).toBe(false);
 expect(calc([first,second],{schedules:[{...setting,due_date:'2026-09-29'}]}).dates).toEqual([]);
});
test('Supper 3 starts after Supper 2 and stops at its due date',()=>{
 const s=calc([first,second]);expect(s.rangeStart).toBe('2026-10-01');expect(s.rangeEnd).toBe('2027-05-09');
 expect(s.dates).toContain('2026-10-01');
 expect(s.dates.every(date=>date>'2026-09-30' && date<='2027-05-09')).toBe(true);
 const inclusive=calc([first,second],{schedules:[{...setting,due_date:'2026-10-01'}]});expect(inclusive.dates).toEqual(['2026-10-01']);
 const shifted=calc([first,{...second,monitoring_date:'2026-10-02'}]);expect(shifted.rangeStart).toBe('2026-10-03');expect(shifted.dates).not.toContain('2026-10-01');
});
test('Supper 2 starts after accepted Supper 1; leap days use calendar arithmetic',()=>{
 expect(calc([first],{slot:'supervisor',schedules:[{...setting,monitoring_slot:'supervisor'}]}).rangeStart).toBe('2026-09-15');
 const s=calc([{...first,school_year:'2027-28'}, {...second,school_year:'2027-28',monitoring_date:'2028-02-29'}],{year:'2027-28',schedules:[{...setting,school_year:'2027-28',due_date:'2028-03-31'}]});expect(s.rangeStart).toBe('2028-03-01');
});
