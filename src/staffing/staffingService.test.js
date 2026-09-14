import{isFixedStaff,staffingGroupLabel}from"./staffingService";

jest.mock("../supabaseClient",()=>({supabase:{rpc:jest.fn()}}));

test("workers remain movable while managers and seniors are fixed",()=>{
  expect(isFixedStaff({classification_key:"worker"})).toBe(false);
  expect(isFixedStaff({classification_key:"senior_worker"})).toBe(true);
  expect(isFixedStaff({classification_key:"manager_iv"})).toBe(true);
});

test("classification groups have supervisor-facing labels",()=>{
  expect(staffingGroupLabel("worker")).toBe("Worker");
  expect(staffingGroupLabel("manager_vi")).toBe("Manager VI");
});
