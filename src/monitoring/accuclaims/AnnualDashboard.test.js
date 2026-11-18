import {annualSites} from './AnnualDashboard';

test('known offsites inherit the right parent and configured sites are not counted twice',()=>{
 const schools=[{id:8,location_code:'8529',school_name:'Banning HS'},{id:16,location_code:8575,school_name:'Carson HS'}];
 const sites=[{id:'a',location_id:8,kind:'offsite',name:'AVALON HS'},{id:'m',location_id:8,kind:'main',name:'Main Site'}];
 const rows=annualSites({schools,sites});
 expect(rows.filter(s=>s.name.toLowerCase()==='avalon hs')).toEqual([expect.objectContaining({id:8,siteId:'a',rosterKey:'roster:avalonhs'})]);
 expect(rows.find(s=>s.name==='Eagle Tree HS')).toEqual(expect.objectContaining({id:16,kind:'offsite'}));
 expect(rows.find(s=>s.name==='Riley HS').id).toBeUndefined();
 expect(rows.find(s=>s.name==='Banning HS').siteId).toBe('m');
});
