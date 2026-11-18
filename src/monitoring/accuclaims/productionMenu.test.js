import {formatProductionMenu,loadProductionMenu} from './productionMenu';
import {loadMonthlyScorecardDatasetWithRetry} from '../../monthlyScorecards/monthlyScorecardService';

jest.mock('../../monthlyScorecards/monthlyScorecardService',()=>({
 loadMonthlyScorecardDatasetWithRetry:jest.fn()
}));

const date='2026-11-18';
const site={kind:'main',location_code:'8529'};
const row={source_site_id:'1852901',production_date:date,meal_type:'breakfast',served:20};
const dataset={
 schools:[{location_code:'8529',source_site_id:'1852901'}],
 production_rows:[
  {...row,item_name:'Turkey sausage',mma_oz_eq:2},
  {...row,item_name:'Fruit cup',fruit_cups:0.5},
  {...row,item_name:'Muffin'},
  {...row,item_name:'Unserved item',served:0},
  {...row,item_name:'Lunch item',meal_type:'lunch'},
  {...row,item_name:'Earlier item',production_date:'2026-11-17'},
  {...row,item_name:'Avalon item',source_site_id:'1853101'}
 ]
};

test('formats concise portions and matches the exact site, date and meal',()=>{
 expect(formatProductionMenu(dataset,site,date,'breakfast')).toBe('Turkey sausage (2 oz), Fruit cup (0.5 cup), Muffin (1)');
 expect(formatProductionMenu(dataset,{kind:'offsite',rosterKey:'roster:avalonhs'},date,'breakfast')).toBe('Avalon item (1)');
 expect(formatProductionMenu(dataset,{kind:'offsite',key:'unmapped'},date,'breakfast')).toBe('');
 expect(formatProductionMenu(dataset,site,'2026-11-16','breakfast')).toBe('');
});

test('skips future menu lookups',async()=>{
 await expect(loadProductionMenu('pin',site,'2099-07-01','breakfast')).resolves.toBe('');
 expect(loadMonthlyScorecardDatasetWithRetry).not.toHaveBeenCalled();
});
