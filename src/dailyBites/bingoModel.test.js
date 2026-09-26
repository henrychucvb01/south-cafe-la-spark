import {buildSchoolBingoCard,evaluateBingoGoals,longestWeekdayStreak,getCompletedBingoLines} from './bingoModel';
const location={id:32,location_code:'9999',labor_type:'secondary',budget_labor_hours:10};
const record={location_id:32,monitoring_type:'supper',monitoring_number:1,monitor_role:'manager',status:'accepted',locked:true,monitoring_date:'2026-09-24',had_correction_requested:false};
const goals=(extra={})=>evaluateBingoGoals({location,today:'2026-09-25',...extra});
test('fall card uses accepted Manager Supper 1; Supervisor 2 and future 3 do not block it',()=>{
 const result=goals({monitoringRows:[record]});
 for(const id of ['monitoring-1','supper-monitoring-1','supper-monitorings-3','all-monitorings'])expect(result.has(id)).toBe(true);
 expect(result.has('perfect-supper')).toBe(true);
});
test.each(['draft','submitted','corrections_requested'])('unfinished %s monitoring is not complete',status=>{
 expect(goals({monitoringRows:[{...record,status,locked:false}]}).has('all-monitorings')).toBe(false);
});
test('school, date, lock, role, and monitoring number are respected',()=>{
 for(const change of [{location_id:8},{monitoring_date:'2026-09-30'},{monitoring_date:'2027-03-01'},{locked:false},{monitor_role:'supervisor',monitoring_number:2,status:'completed'},{monitoring_number:3}])expect(goals({monitoringRows:[{...record,...change}]}).has('all-monitorings')).toBe(false);
});
test('Supervisor star removal overrides legacy perfect points; correction invalidates completion',()=>{
 const pointRows=[{point_type:'monitoring_supper',description:'Perfect Supper Monitoring',service_date:'2026-09-24',unique_key:'monitoring-supper-32-2026-07-01-1'}];
 expect(goals({pointRows,monitoringRows:[{...record,perfect_monitoring_override:false}]}).has('perfect-supper')).toBe(false);
 expect(goals({pointRows,monitoringRows:[{...record,status:'corrections_requested',locked:false}]}).has('all-monitorings')).toBe(false);
});
test('legacy monitoring evidence still works when no current record replaces it',()=>{
 expect(goals({pointRows:[{point_type:'monitoring_supper',description:'Pass Supper Monitoring',service_date:'2026-08-26',unique_key:'monitoring-supper-32-2026-07-01-1'}]}).has('all-monitorings')).toBe(true);
});
test('achieved streak survives later gaps and skips excluded weekdays',()=>{
 expect(longestWeekdayStreak(new Set(['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-25']))).toBe(5);
 expect(longestWeekdayStreak(new Set(['2026-09-01','2026-09-02','2026-09-03','2026-09-08','2026-09-09']),new Set(['2026-09-04','2026-09-07']))).toBe(5);
});
test('Monday tasks must be on one checklist; item and meal dates are deduplicated',()=>{
 const finishRows=[{service_date:'2026-09-14',finish_line_items:[{item_key:'monday_missing_meal_report',answer:'yes'}]},{service_date:'2026-09-21',finish_line_items:[{item_key:'monday_all_meal_counts_entered',answer:'yes'}]}];
 expect(goals({finishRows}).has('monday')).toBe(false);
 expect(goals({mealRows:Array(5).fill({service_date:'2026-09-21'})}).has('meal-counts-3')).toBe(false);
});
test('cards remain deterministic with 25 unique IDs, center free space, and 12 possible lines',()=>{
 const card=buildSchoolBingoCard(location);expect(card).toEqual(buildSchoolBingoCard(location));expect(new Set(card.map(s=>s.id)).size).toBe(25);expect(card[12].id).toBe('free');expect(getCompletedBingoLines(new Set(card.map(s=>s.id)),card)).toHaveLength(12);
 expect(card.some(s=>s.detail==='3 monitorings')).toBe(false);
});
test('current school MPLH exception is used',()=>{
 const mealRows=['2026-09-21','2026-09-22'].map(service_date=>({service_date,breakfast_count:0,lunch_count:210,supper_count:0}));
 expect(goals({location:{...location,location_code:'3452',labor_type:'elementary_nnc'},mealRows}).has('mplh-2')).toBe(true);
});

test('Willenberg special classification excludes every Supper goal without removing MPLH targets',()=>{
 const card=buildSchoolBingoCard({id:30,school_name:'Willenberg Special Ed',labor_type:'special',location_code:'1957'});
 expect(card).toHaveLength(25);expect(card.some(s=>s.requiresSupper)).toBe(false);
 expect(card.some(s=>['all-monitorings','monitoring-1','perfect-supper','supper-monitoring-1','supper-monitorings-3'].includes(s.id))).toBe(false);
});

test('every current Bingo goal has a working completion trigger',()=>{
 const dates=[];for(const d=new Date('2026-08-03T12:00:00Z');dates.length<20;d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()>0&&d.getUTCDay()<6)dates.push(d.toISOString().slice(0,10));
 const itemKeys=['production_record','production_worksheet','reports_reviewed','meal_count_entered','monday_missing_meal_report','monday_all_meal_counts_entered','tuesday_meal_plan','wednesday_order_status','thursday_orders_complete','month_end_inventory'];
 const finishRows=dates.map(service_date=>({service_date,status:'complete',finish_line_items:itemKeys.map(item_key=>({item_key,answer:'yes'}))}));
 const mealRows=dates.map(service_date=>({service_date,lunch_count:300}));
 const laborRows=dates.map(service_date=>({service_date,additional_worker_hours:1}));
 const pointRows=dates.map(service_date=>({service_date,point_type:'daily_bites_visit'}));
 const monitoringRows=['breakfast','lunch','supper'].map(monitoring_type=>({...record,monitoring_type,perfect_monitoring_override:true}));
 const completed=goals({finishRows,mealRows,laborRows,pointRows,monitoringRows});
 for(let id=4;id<=32;id++)expect(buildSchoolBingoCard({...location,id}).filter(s=>!completed.has(s.id))).toEqual([]);
});
