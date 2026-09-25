import {supperSequence,supperSchedule,isPerfectMonitoring} from './supperSchedule';
const first={monitoring_type:'supper',monitoring_site_id:'a',school_year:'2026-27',monitoring_slot:'manager_1',status:'accepted',locked:true,monitor_role:'manager',had_correction_requested:false};
const second={...first,monitoring_slot:'supervisor',status:'completed',monitor_role:'supervisor'};
test.each(['draft','submitted','corrections_requested'])('%s Supper 1 keeps later slots locked',status=>{
 expect(supperSequence([{...first,status}],'a','2026-27','supervisor')).toMatch(/Waiting/);
 expect(supperSequence([{...first,status},second],'a','2026-27','manager_2')).toMatch(/Complete/);
});
test('both prior locked completions unlock Supper 3 only for their site and year',()=>{
 expect(supperSequence([first],'a','2026-27','supervisor')).toBe('');
 expect(supperSequence([first],'a','2026-27','manager_2')).toMatch(/Complete/);
 expect(supperSequence([first,second],'a','2026-27','manager_2')).toBe('');
 expect(supperSequence([first,second],'b','2026-27','manager_2')).toMatch(/Complete/);
 expect(supperSequence([first,second],'a','2025-26','manager_2')).toMatch(/Complete/);
 expect(supperSequence([{...first,locked:false},second],'a','2026-27','manager_2')).toMatch(/Complete/);
});
test('published dates remain hidden until sequence unlocks',()=>{
 const options={schedules:[{school_year:'2026-27',monitoring_slot:'manager_2',available_start:'2027-04-01',available_end:'2027-04-30'}],siteId:'a',year:'2026-27',slot:'manager_2'};
 expect(supperSchedule({...options,records:[first]}).dates).toEqual([]);
 expect(supperSchedule({...options,records:[first,second]}).dates.length).toBeGreaterThan(3);
});
test('only known-clean accepted Manager records earn recognition',()=>{
 expect(isPerfectMonitoring(first)).toBe(true);
 for(const record of [second,{...first,had_correction_requested:true},{...first,had_correction_requested:null},{...first,had_correction_requested:undefined},{...first,status:'submitted'},{...first,locked:false}])expect(isPerfectMonitoring(record)).toBe(false);
});
