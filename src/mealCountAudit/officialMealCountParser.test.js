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
