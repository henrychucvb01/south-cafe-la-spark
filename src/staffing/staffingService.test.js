import{isFixedStaff}from"./staffingService";

jest.mock("../supabaseClient",()=>({supabase:{rpc:jest.fn()}}));

test("workers remain movable while managers and seniors are fixed",()=>{
  expect(isFixedStaff({classification_title:"Food Services Worker"})).toBe(false);
  expect(isFixedStaff({classification_title:"Senior Food Service Worker"})).toBe(true);
  expect(isFixedStaff({classification_title:"Food Service Manager IV"})).toBe(true);
});
