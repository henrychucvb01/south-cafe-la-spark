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
 const {supabase}=require('../supabaseClient');const {saveMonthlyImport}=require('./monthlyScorecardService');supabase.rpc.mockResolvedValue({data:{saved:250},error:null});
 const rows=Array.from({length:501},(_,i)=>({source_site_id:String(i),production_date:i%2?'2026-08-12':'2026-10-01',meal_type:'lunch',food_cost:i}));
 const result=await saveMonthlyImport({supervisorPin:'test',reportType:'cost',reportingMonth:'2026-09-01',filename:'test.csv',checksum:'hash',parsed:{normalizedRows:rows,rawRows:Array(10000).fill('layout'),sourceRowCount:10000,rejectedRows:[]}});
 expect(result.saved).toBe(501);expect(result.months).toEqual(['2026-08','2026-10']);expect(supabase.rpc).toHaveBeenCalledTimes(3);
 for(const [name,args] of supabase.rpc.mock.calls){expect(name).toBe('merge_monthly_scorecard_rows');expect(args.p_rows.length).toBeLessThanOrEqual(250);expect(args.p_raw_rows).toBeUndefined();}
});

test('an interrupted upload reports confirmed saves and safe retry',async()=>{
 const {supabase}=require('../supabaseClient');const {saveMonthlyImport}=require('./monthlyScorecardService');supabase.rpc.mockResolvedValueOnce({error:null}).mockResolvedValueOnce({error:{message:'Failed to fetch'}});
 const rows=Array.from({length:251},(_,i)=>({source_site_id:String(i),production_date:'2026-09-01',meal_type:'lunch'}));
 await expect(saveMonthlyImport({supervisorPin:'test',reportType:'cost',parsed:{normalizedRows:rows,sourceRowCount:300,rejectedRows:[]}})).rejects.toThrow('250 records confirmed saved');
});


test('scorecards load every configured exclusion, including the comparison month',async()=>{
 const {supabase}=require('../supabaseClient');
 const {loadMonthlyScorecardDataset}=require('./monthlyScorecardService');
 supabase.rpc.mockResolvedValue({data:{schools:[{location_id:10}]}});
 const query={};for(const name of ['select','in','gte','lt','order'])query[name]=jest.fn(()=>query);
 query.range=jest.fn().mockResolvedValueOnce({data:Array.from({length:100},()=>({location_id:10,service_date:'2026-09-04'}))}).mockResolvedValueOnce({data:[{location_id:10,service_date:'2026-09-07'}]});
 supabase.from.mockReturnValue(query);
 const result=await loadMonthlyScorecardDataset('test','2026-27','2026-09-01');
 expect(result.excluded_days).toHaveLength(101);
 expect(query.gte).toHaveBeenCalledWith('service_date','2026-08-01');
 expect(query.lt).toHaveBeenCalledWith('service_date','2026-10-01');
 expect(query.range).toHaveBeenLastCalledWith(100,199);
 query.range.mockResolvedValue({error:{message:'Cannot load school calendar'}});
 await expect(loadMonthlyScorecardDataset('test','2026-27','2026-09-01')).rejects.toEqual({message:'Cannot load school calendar'});
});
