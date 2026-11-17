import {resolveMealCounts} from './resolveMealCounts';
test('district counts win for all 28 schools without mutating manager audit entries',()=>{
 const managers=Array.from({length:28},(_,i)=>({location_id:i+4,service_date:'2026-09-25',breakfast_count:200,lunch_count:163,supper_count:40,supper_status:'pending'}));
 const official=managers.map(r=>({...r,breakfast_count:0,lunch_count:243,supper_count:50}));
 const before=JSON.stringify(managers);
 const resolved=resolveMealCounts(managers,official);
 expect(resolved).toHaveLength(28);
 resolved.forEach(r=>expect(r).toMatchObject({breakfast_count:0,lunch_count:243,supper_count:50,supper_status:'complete'}));
 expect(JSON.stringify(managers)).toBe(before);
});
test('each meal falls back only if district data is missing; official-only dates and ID types work',()=>{
 const result=resolveMealCounts([{location_id:12,service_date:'2026-09-25',breakfast_count:20,lunch_count:30,supper_count:40}],
 [{location_id:'12',service_date:'2026-09-25',breakfast_count:null,lunch_count:163}, {location_id:12,service_date:'2026-09-24',lunch_count:120}]);
 expect(result).toHaveLength(2);
 expect(result[1]).toMatchObject({breakfast_count:20,lunch_count:163,supper_count:40});
 expect(result[0].lunch_count).toBe(120);
});
