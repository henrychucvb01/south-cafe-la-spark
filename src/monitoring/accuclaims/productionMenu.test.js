import {formatProductionMenu,loadProductionMenu} from './productionMenu';
import {supabase} from '../../supabaseClient';

jest.mock('../../supabaseClient',()=>({supabase:{rpc:jest.fn()}}));
beforeEach(()=>jest.clearAllMocks());

const date='2026-10-08';
const site={kind:'main',location_code:'2146'};

test('formats concise portions',()=>{
 expect(formatProductionMenu([
  {item_name:'Turkey sausage',mma_oz_eq:2},
  {item_name:'Fruit cup',fruit_cups:0.5},
  {item_name:'Muffin'}
 ])).toBe('Turkey sausage (2 oz)\nFruit cup (0.5 cup)\nMuffin (1)');
});

test('requests only Annalee El lunch for the selected day',async()=>{
 supabase.rpc.mockResolvedValue({data:[{item_name:'Milk',milk_cups:1}]});
 await expect(loadProductionMenu('pin',site,date,'lunch')).resolves.toBe('Milk (1 cup)');
 expect(supabase.rpc).toHaveBeenCalledWith('get_accuclaims_production_menu',{
  p_supervisor_pin:'pin',p_location_code:'2146',p_source_site_id:null,
  p_visit_date:date,p_meal_type:'lunch'
 });
});

test('skips future dates and unmapped offsites',async()=>{
 await expect(loadProductionMenu('pin',site,'2099-07-01','breakfast')).resolves.toBe('');
 await expect(loadProductionMenu('pin',{...site,kind:'offsite',key:'unknown'},date,'lunch')).resolves.toBe('');
 expect(supabase.rpc).not.toHaveBeenCalled();
});

test('groups milk and removes packet, packaging and special-diet details',()=>{
 expect(formatProductionMenu([
  {item_name:'Milk Chocolate Non- Fat, Pouch - Driftwood'},
  {item_name:'Milk White 1% Low Fat Carton - Driftwood',milk_cups:1},
  {item_name:'Milk Strawberry Non-Fat Carton - Driftwood',milk_cups:1},
  {item_name:'Soy Milk Vanilla - Driftwood',milk_cups:1},
  {item_name:'Special Diet- Almond Milk'},
  {item_name:'Ketchup Ind. Pkg'},
  {item_name:'Tapatio Hot Sauce Ind. Pkg'},
  {item_name:'Beef & Cheese Taquitos NNC',mma_oz_eq:2},
  {item_name:'Vegetable Crunchies (1 oz)'}
 ])).toBe('Milk (1 cup)\nBeef & Cheese Taquitos (2 oz)\nVegetable Crunchies (1 oz)');
});
