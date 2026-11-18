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

test('Bridges SPAN resolves to the SPARK main school and retains old tracker entries',()=>{
 const rows=annualSites({schools:[{id:10,location_code:'6867',school_name:'Harry Bridges El'}],sites:[
  {id:'main-10',location_id:10,kind:'main',name:'Main Site'},
  {id:'duplicate',location_id:10,kind:'offsite',name:'Bridges SPAN'}
 ]});
 expect(rows.filter(r=>/bridges/i.test(r.name))).toEqual([
  expect.objectContaining({name:'Harry Bridges El',kind:'main',siteId:'main-10',rosterKey:'roster:bridgesspan'})
 ]);
});

test('Riley is an offsite of 186th and departed schools are excluded',()=>{
 const rows=annualSites({schools:[
  {id:4,location_code:'5753',school_name:'186th St El'},
  {id:40,school_name:'Peary MS'},{id:41,school_name:'Hawthorne Academy'},
  {id:42,school_name:'Riley HS'}
 ]});
 expect(rows.filter(s=>s.name==='Riley HS')).toEqual([expect.objectContaining({id:4,kind:'offsite',school_name:'186th St El'})]);
 expect(rows.map(s=>s.name)).not.toEqual(expect.arrayContaining(['Peary MS']));
 expect(rows.map(s=>s.name)).not.toEqual(expect.arrayContaining(['Hawthorne Academy']));
});
