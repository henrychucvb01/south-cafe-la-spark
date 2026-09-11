jest.mock("../supabaseClient",()=>({supabase:{rpc:jest.fn()}}));

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
