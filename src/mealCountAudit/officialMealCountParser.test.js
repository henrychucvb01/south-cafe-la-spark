import { parseOfficialMealCountCsv } from "./officialMealCountParser";

const schools = [{ id: 9, location_code: "8575", source_site_id: "1857501", school_name: "Carson HS" }];

test("parses wide official meal counts and replaces duplicate keys with the newest row", () => {
  const parsed = parseOfficialMealCountCsv(
    "Location Code,Service Date,Breakfast Count,Lunch Count,Supper Count\n8575,9/1/2026,100,200,30\n8575,9/1/2026,101,202,31",
    schools
  );
  expect(parsed.records).toEqual([{ location_id: 9, service_date: "2026-09-01", breakfast_count: 101, lunch_count: 202, supper_count: 31 }]);
});

test("parses long official meal counts and reports unknown sites", () => {
  const parsed = parseOfficialMealCountCsv(
    "Serving Site ID,Date,Meal Type,Meal Count\n1857501,2026-09-02,Breakfast,88\n1857501,2026-09-02,Lunch,177\n9999999,2026-09-02,Lunch,10",
    schools
  );
  expect(parsed.records[0]).toMatchObject({ breakfast_count: 88, lunch_count: 177, supper_count: null });
  expect(parsed.outOfArea).toHaveLength(1);
});

test("mapped main, offsite and EEC stay separate until the database aggregates source rows", () => {
  const mappings = [
    {source_site_id:"1857501",location_id:9,program_type:"main"},
    {source_site_id:"1857801",location_id:9,program_type:"offsite"},
    {source_site_id:"1951401",location_id:9,program_type:"EEC"},
  ];
  const csv="Location Code,Service Date,Breakfast,Lunch,Supper\n8575,9/11/2026,100,200,300\n1857801,9/11/2026,10,20,30\n9514,9/11/2026,5,6,7\n8578,9/11/2026,11,22,33";
  const parsed=parseOfficialMealCountCsv(csv,schools,mappings);
  expect(parsed.records).toHaveLength(3);
  expect(parsed.records.map(r=>r.location_id)).toEqual([9,9,9]);
  expect(parsed.records.map(r=>r.breakfast_count)).toEqual([100,11,5]);
  expect(parseOfficialMealCountCsv(csv,schools,mappings)).toEqual(parsed);
});

test("recognizes NEWTON daily headers and uses Site ID rather than Main Site ID", () => {
  const header = "Date,Main Site ID,Main Site,Site ID,Site Description,RM,AFSS,Breakfast Counts,Lunch Counts,Snack Counts,Supper Counts,Total Student Meals,Incomplete Meals,Second Meals,Employee Meals,Adult Meals,BIC Adult Meals,Breakfast Check,Lunch Check,Snack Check,Supper Check,BIC Adult Check,CheckFLT";
  const csv = header + "\n9/11/2026,1857501,MAIN,1857501,MAIN,,,100,200,999,30,1329,0,0,0,0,0,OK,OK,OK,OK,OK,OK"
    + "\n9/11/2026,1857501,MAIN,1857801,OFFSITE,,,10,20,999,3,1032,0,0,0,0,0,OK,OK,OK,OK,OK,OK";
  const mappings = [{source_site_id:"1857501",location_id:9,program_type:"main"},{source_site_id:"1857801",location_id:9,program_type:"offsite"}];
  const parsed = parseOfficialMealCountCsv(csv, schools, mappings);
  expect(parsed.rejected).toEqual([]);
  expect(parsed.records).toEqual([
    {location_id:9,source_site_id:"1857501",service_date:"2026-09-11",breakfast_count:100,lunch_count:200,supper_count:30},
    {location_id:9,source_site_id:"1857801",service_date:"2026-09-11",breakfast_count:10,lunch_count:20,supper_count:3},
  ]);
});
