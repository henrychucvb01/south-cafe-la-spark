import {buildSchoolScorecard,isLikelyEntree} from "./monthlyScorecardCalculations";

const school={directory_id:1,location_id:10,school_name:"CARSON HS",location_code:"8575",enrollment:100,budget_labor_hours:10,labor_type:"secondary"};
const dataset={rates:[{meal_type:"breakfast",rate:4.08},{meal_type:"lunch",rate:5.9},{meal_type:"supper",rate:5.9}],meal_counts:[],labor_hours:[],cost_rows:[{location_id:1,production_date:"2026-09-01",meal_type:"lunch",food_cost:100}],production_rows:[
  {location_id:1,production_date:"2026-09-01",meal_type:"breakfast",meals_served:50,item_name:"Bean Burrito",mma_oz_eq:1,served:45,planned:50,prepared:50,leftover:5},
  {location_id:1,production_date:"2026-09-01",meal_type:"lunch",meals_served:80,item_name:"Milk White",mma_oz_eq:0,served:75,planned:80,prepared:80,leftover:5},
  {location_id:1,production_date:"2026-09-01",meal_type:"lunch",meals_served:80,item_name:"Chicken Sandwich",mma_oz_eq:2,served:70,planned:75,prepared:75,leftover:5},
]};

test("calculates participation, revenue, costs and production",()=>{const card=buildSchoolScorecard(school,dataset,"2026-09-01");expect(card.current.operatingDays).toBe(1);expect(card.current.participation.lunch).toBe(80);expect(card.current.totalCost).toBe(100);expect(card.current.revenue).toBeCloseTo(676);expect(card.current.menuPerformance.name).toBe("Chicken Sandwich");expect(card.current.operatingMargin).toBeNull();});
test("does not classify components as entrees",()=>{expect(isLikelyEntree({item_name:"Chocolate Milk",mma_oz_eq:2})).toBe(false);expect(isLikelyEntree({item_name:"Chicken Sandwich",mma_oz_eq:2})).toBe(true);});
