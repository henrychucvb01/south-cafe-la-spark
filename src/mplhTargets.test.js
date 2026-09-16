import { getMplhTarget } from "./mplhTargets";

test("Dolores uses the school-specific 20-22 target despite its NNC classification", () => {
  expect(getMplhTarget({ location_code: "3452", labor_type: "elementary_nnc" })).toMatchObject({ min: 20, max: 22 });
});

test("Willenberg uses 20-22 through its location and source identifiers", () => {
  expect(getMplhTarget({ location_code: "1957", labor_type: "special" })).toMatchObject({ min: 20, max: 22 });
  expect(getMplhTarget({ source_site_id: "1195701", labor_type: "special" })).toMatchObject({ min: 20, max: 22 });
});

test("a normal Elementary NNC school remains 24-25", () => {
  expect(getMplhTarget({ location_code: "2530", labor_type: "elementary_nnc" })).toMatchObject({ min: 24, max: 25 });
});

