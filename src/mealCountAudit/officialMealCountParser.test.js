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
