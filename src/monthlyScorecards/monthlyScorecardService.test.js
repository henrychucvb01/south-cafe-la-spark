jest.mock("../supabaseClient",()=>({supabase:{rpc:jest.fn(),from:jest.fn()}}));

import {dedupeMonthlyRows} from "./monthlyScorecardService";

test("newest overlapping cost record replaces the earlier value",()=>{
  const rows=[
    {source_site_id:"1857501",production_date:"2026-09-01",meal_type:"lunch",food_cost:100},
    {source_site_id:"1857501",production_date:"2026-09-01",meal_type:"lunch",food_cost:125},
  ];
  expect(dedupeMonthlyRows("cost",rows)).toEqual([expect.objectContaining({food_cost:125})]);
});

test("newest overlapping production record replaces the earlier record without removing other items",()=>{
  const rows=[
    {source_site_id:"1857501",production_date:"2026-09-01",meal_type:"lunch",item_code:"A1",served:100},
    {source_site_id:"1857501",production_date:"2026-09-01",meal_type:"lunch",item_code:"B1",served:50},
    {source_site_id:"1857501",production_date:"2026-09-01",meal_type:"lunch",item_code:"A1",served:110},
  ];
  expect(dedupeMonthlyRows("production",rows)).toEqual([
    expect.objectContaining({item_code:"A1",served:110}),
    expect.objectContaining({item_code:"B1",served:50}),
  ]);
});

test('upload chunks all file dates independently of the selected view month',async()=>{
 const {supabase}=require('../supabaseClient');const {saveMonthlyImport}=require('./monthlyScorecardService');supabase.rpc.mockReset();supabase.rpc.mockImplementation(async(name,args)=>name==='get_monthly_import_scope'?{data:Array.from({length:501},(_,i)=>({source_site_id:String(i)}))}:{data:{saved:args.p_rows.length}});
 const rows=Array.from({length:501},(_,i)=>({source_site_id:String(i),production_date:i%2?'2026-08-12':'2026-10-01',meal_type:'lunch',food_cost:i}));
 const result=await saveMonthlyImport({supervisorPin:'test',reportType:'cost',reportingMonth:'2026-09-01',filename:'test.csv',checksum:'hash',parsed:{normalizedRows:rows,rawRows:Array(10000).fill('layout'),sourceRowCount:10000,rejectedRows:[]}});
 expect(result.saved).toBe(501);expect(result.months).toEqual(['2026-08','2026-10']);expect(supabase.rpc).toHaveBeenCalledTimes(4);
 for(const [name,args] of supabase.rpc.mock.calls.slice(1)){expect(name).toBe('merge_monthly_scorecard_rows');expect(args.p_rows.length).toBeLessThanOrEqual(250);expect(args.p_raw_rows).toBeUndefined();}
});

test('an interrupted upload reports confirmed saves and safe retry',async()=>{
 const {supabase}=require('../supabaseClient');const {saveMonthlyImport}=require('./monthlyScorecardService');supabase.rpc.mockReset();supabase.rpc.mockResolvedValueOnce({data:Array.from({length:251},(_,i)=>({source_site_id:String(i)}))}).mockResolvedValueOnce({data:{saved:250},error:null}).mockResolvedValueOnce({error:{message:'Failed to fetch'}});
 const rows=Array.from({length:251},(_,i)=>({source_site_id:String(i),production_date:'2026-09-01',meal_type:'lunch'}));
 await expect(saveMonthlyImport({supervisorPin:'test',reportType:'cost',parsed:{normalizedRows:rows,sourceRowCount:300,rejectedRows:[]}})).rejects.toThrow('250 records confirmed saved');
});



test('range loads August and September audit data for every school without duplicate records',async()=>{
 const {supabase}=require('../supabaseClient');const {loadScorecardRange}=require('./monthlyScorecardService');supabase.rpc.mockReset();
 const schools=Array.from({length:28},(_,i)=>({directory_id:i+100,location_id:i+1}));
 const august=schools.map(s=>({id:s.location_id,location_id:s.location_id,service_date:'2026-08-31',breakfast_count:300,lunch_count:400}));
 const september=schools.map(s=>({id:s.location_id+100,location_id:s.location_id,service_date:'2026-09-01',breakfast_count:379,lunch_count:441}));
 supabase.rpc.mockImplementation(async(name,args)=>({data:{schools,official_meal_counts:args.p_reporting_month==='2026-08-01'?august:[...august,...september],excluded_days:[{location_id:1,service_date:'2026-09-07'}],cost_rows:[{id:1,food_cost:100}]},error:null}));
 const data=await loadScorecardRange('test','2026-08-12','2026-09-30');
 expect(supabase.rpc.mock.calls.map(c=>c[1].p_reporting_month)).toEqual(['2026-08-01','2026-09-01']);expect(data.schools).toHaveLength(28);expect(data.official_meal_counts).toHaveLength(56);expect(data.cost_rows).toHaveLength(1);expect(data.excluded_days).toHaveLength(1);
 for(const school of schools)expect(data.official_meal_counts.filter(r=>r.location_id===school.location_id).map(r=>r.service_date)).toEqual(['2026-08-31','2026-09-01']);
 const {buildSchoolScorecard}=require('./monthlyScorecardCalculations');
 for(const school of schools){const card=buildSchoolScorecard({...school,enrollment:584},data,{startDate:'2026-08-12',endDate:'2026-09-30'});expect(card.current.totals).toEqual({breakfast:679,lunch:841,supper:0});expect(card.current.participationTrend.find(r=>r.date==='2026-09-01')).toEqual(expect.objectContaining({breakfast:379,lunch:441}));}

});
test('date-range loading spans three months and the school year boundary',async()=>{
 const {supabase}=require('../supabaseClient');const {loadScorecardRange}=require('./monthlyScorecardService');supabase.rpc.mockReset();supabase.rpc.mockResolvedValue({data:{schools:[]},error:null});
 await loadScorecardRange('test','2026-06-15','2026-08-31');expect(supabase.rpc.mock.calls.map(c=>[c[1].p_school_year,c[1].p_reporting_month])).toEqual([['2025-26','2026-06-01'],['2026-27','2026-07-01'],['2026-27','2026-08-01']]);
});
test('later month failure does not return a partial scorecard',async()=>{
 const {supabase}=require('../supabaseClient');const {loadScorecardRange}=require('./monthlyScorecardService');supabase.rpc.mockReset();supabase.rpc.mockResolvedValueOnce({data:{schools:[]},error:null}).mockResolvedValueOnce({error:{message:'Connection failed'}});
 await expect(loadScorecardRange('test','2026-08-12','2026-09-30')).rejects.toEqual({message:'Connection failed'});
});

test('unmapped records never leave the browser and the server count is checked',async()=>{
 const {supabase}=require('../supabaseClient');const {saveMonthlyImport}=require('./monthlyScorecardService');supabase.rpc.mockReset();
 const input={supervisorPin:'test',reportType:'cost',filename:'district.csv',parsed:{normalizedRows:[{source_site_id:'MAPPED',production_date:'2026-09-01',meal_type:'lunch',food_cost:20},{source_site_id:'OTHER',production_date:'2026-09-01',meal_type:'lunch',food_cost:999}],sourceRowCount:100,rejectedRows:[]}};
 supabase.rpc.mockResolvedValueOnce({data:[{source_site_id:'MAPPED'}]}).mockResolvedValueOnce({data:{saved:1}});
 const result=await saveMonthlyImport(input);expect(result.excluded).toBe(1);expect(result.saved).toBe(1);expect(supabase.rpc.mock.calls[1][1].p_rows).toEqual([input.parsed.normalizedRows[0]]);
 supabase.rpc.mockResolvedValueOnce({data:[{source_site_id:'MAPPED'}]}).mockResolvedValueOnce({data:{saved:0}});
 await expect(saveMonthlyImport(input)).rejects.toThrow(/mappings changed/);
 supabase.rpc.mockResolvedValueOnce({error:{message:'scope unavailable'}});
 await expect(saveMonthlyImport(input)).rejects.toEqual({message:'scope unavailable'});
});
