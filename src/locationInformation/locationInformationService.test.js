import { filterLocationDirectory } from "./locationInformationService";

const locations = [
  { location_code: "8575", school_name: "CARSON HS", manager_name: "SMITH, KAWANE", site_type: "Prep", counting_claiming: "CEP" },
  { location_code: "3452", school_name: "DOLORES EL", manager_name: "SPRAGUE, TAMMY", site_type: "NNC", counting_claiming: "CEP" },
];

test("searches the area directory across manager-facing fields", () => {
  expect(filterLocationDirectory(locations, "8575")).toEqual([locations[0]]);
  expect(filterLocationDirectory(locations, "dolores nnc")).toEqual([locations[1]]);
  expect(filterLocationDirectory(locations, "kawane")).toEqual([locations[0]]);
});

test("returns the full directory for an empty search", () => {
  expect(filterLocationDirectory(locations, "  ")).toEqual(locations);
});
