import {returnSeries} from './returnsSeries';
const row=(date,counts,sent,id='a')=>({date,counts,sent,classroom_id:id,menu:{entree:'Toast'}});
test('chronological ranges preserve recorded zeros and missing dates across months',()=>{
 const data=returnSeries([row('2026-11-01',{entree:2},{entree:10}),row('2026-10-30',{entree:0},{entree:10})],'2026-10-30','2026-11-02');
 expect(data.map(r=>r.returned)).toEqual([0,null,2,null]);expect(data.map(r=>r.rate)).toEqual([0,null,20,null]);
});
test('matched weighted rate and combined school totals respect classroom and item filters',()=>{
 const rows=[row('2026-10-13',{entree:2},{entree:10}),row('2026-10-13',{entree:3},{entree:30},'b')];
 expect(returnSeries(rows,'2026-10-13','2026-10-13')[0]).toMatchObject({returned:5,delivered:40,rate:12.5});
 expect(returnSeries(rows,'2026-10-13','2026-10-13','b','Toast')[0]).toMatchObject({returned:3,delivered:30,rate:10});
 expect(returnSeries(rows,'2026-10-13','2026-10-13','','Apple')[0].returned).toBeNull();
});
test('missing, zero and incomplete deliveries never produce misleading rates or partial delivery totals',()=>{
 for(const sent of [{},{entree:0},{entree:null}]){
  const result=returnSeries([row('2026-10-13',{entree:2},{entree:10}),row('2026-10-13',{entree:0},sent,'b')],'2026-10-13','2026-10-13')[0];
  expect(result.rate).toBeNull();expect(result.delivered).toBe(sent.entree===0?10:null);
 }
 const result=returnSeries([row('2026-10-13',{},{entree:12})],'2026-10-13','2026-10-13')[0];expect(result).toMatchObject({returned:null,delivered:12,rate:null});
});
test('missing item counts are not converted to zero and partial returns are identified',()=>{
 const rows=[{date:'2026-10-13',classroom_id:'a',menu:{entree:'Toast',fruit:'Apple'},counts:{entree:0},sent:{entree:10,fruit:10}}];
 expect(returnSeries(rows,'2026-10-13','2026-10-13')[0]).toMatchObject({returned:0,partial:true,rate:null});
 expect(returnSeries(rows,'2026-10-13','2026-10-13','','Apple')[0].returned).toBeNull();
});
