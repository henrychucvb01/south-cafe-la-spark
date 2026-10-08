import {buildMealAnalytics,comparisonRows,rangeStart,summarize} from './model';
const schools=[{id:1,school_name:'Alpha'},{id:2,school_name:'Beta'}],rates={breakfast:4.08,lunch:5.9,supper:4.6};
const args={schools,rates,startDate:'2026-09-04',endDate:'2026-09-08',excludedRows:[{location_id:1,service_date:'2026-09-04'},{location_id:2,service_date:'2026-09-04'},{location_id:1,service_date:'2026-09-07'},{location_id:2,service_date:'2026-09-07'}]};
test('removes weekends and configured holidays from all graphs',()=>{expect(buildMealAnalytics(args).overall.map(d=>d.date)).toEqual(['2026-09-08']);});
test('official positive wins, official zero or missing falls back and both zero stay zero',()=>{
 const model=buildMealAnalytics({...args,officialMealRows:[{location_id:1,service_date:'2026-09-08',breakfast_count:100,lunch_count:0,supper_count:0}],mealRows:[{location_id:1,service_date:'2026-09-08',breakfast_count:900,lunch_count:20,supper_count:0},{location_id:2,service_date:'2026-09-08',breakfast_count:5}]});
 expect(model.schools[0].days[0]).toMatchObject({breakfast:100,lunch:20,supper:0,total:120});expect(model.overall[0].total).toBe(125);expect(model.overall[0].revenue).toBeCloseTo(105*4.08+20*5.9);
});
test('closed comparison school is a gap rather than a fake zero; true zero stays visible',()=>{expect(comparisonRows([{date:'2026-09-08',total:0}],[{date:'2026-09-09',total:20}],'total')).toEqual([{date:'2026-09-08',left:0,right:null},{date:'2026-09-09',left:null,right:20}]);});
test('calendar excludes a school independently from area totals',()=>{const model=buildMealAnalytics({...args,excludedRows:[...args.excludedRows,{location_id:1,service_date:'2026-09-08'}],mealRows:[{location_id:1,service_date:'2026-09-08',lunch_count:99},{location_id:2,service_date:'2026-09-08',lunch_count:10}]});expect(model.overall[0].total).toBe(10);expect(model.schools[0].days).toEqual([]);});
test('date presets cross year boundaries correctly',()=>{expect(rangeStart('school-year','2026-02-01')).toBe('2025-07-01');expect(rangeStart('month','2026-10-02')).toBe('2026-10-01');expect(rangeStart('7','2026-10-02')).toBe('2026-09-26');});

test('range averages and low/high include true zeros and use enrollment for participation',()=>{
 const model=buildMealAnalytics({schools:[{id:1,school_name:'Alpha',enrollment:100}],rates,startDate:'2026-09-07',endDate:'2026-09-10',excludedRows:[{location_id:1,service_date:'2026-09-07'}],officialMealRows:[{location_id:1,service_date:'2026-09-08',breakfast_count:60,lunch_count:80},{location_id:1,service_date:'2026-09-09',breakfast_count:0,lunch_count:40}],mealRows:[{location_id:1,service_date:'2026-09-09',breakfast_count:30}]});
 const totals=summarize(model.schools[0].days);expect(totals.stats.breakfast).toEqual({average:30,low:0,high:60,participation:30});expect(totals.stats.lunch).toEqual({average:40,low:0,high:80,participation:40});expect(totals.stats.supper.participation).toBeNull();
});
test('all-school participation weights enrollment and each schools operating dates',()=>{
 const model=buildMealAnalytics({schools:[{id:1,school_name:'Alpha',enrollment:100},{id:2,school_name:'Beta',enrollment:300}],rates,startDate:'2026-09-08',endDate:'2026-09-09',excludedRows:[{location_id:2,service_date:'2026-09-09'}],mealRows:[{location_id:1,service_date:'2026-09-08',lunch_count:50},{location_id:2,service_date:'2026-09-08',lunch_count:150},{location_id:1,service_date:'2026-09-09',lunch_count:50}]});
 expect(summarize(model.overall).stats.lunch.participation).toBe(50);expect(summarize(model.overall).stats.lunch.average).toBe(125);
});
test('empty ranges and missing enrollment are not reported as zero participation',()=>{
 expect(summarize([]).stats.breakfast).toEqual({average:null,low:null,high:null,participation:null});expect(summarize([{breakfast:10,enrollment:null}]).stats.breakfast.participation).toBeNull();
});
