import {shiftDate} from './returnsDates';
// Missing fields are not zero. Match deliveries and returns by the saved item slot.
const quantity = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export function returnSeries(rows, from, to, classroom='', item='') {
 const days=new Map();
 for(const row of rows){
  if(row.date<from||row.date>to||(classroom&&row.classroom_id!==classroom))continue;
  for(const [key,name] of Object.entries(row.menu||{})){
   if(!name||(item&&name!==item))continue;
   const group=days.get(row.date)||[];
   group.push({returned:quantity(row.counts?.[key]),delivered:quantity(row.sent?.[key])});
   days.set(row.date,group);
  }
 }
 const series=[];
 for(let date=from;date<=to;date=shiftDate(date,1)){
  const records=days.get(date)||[],known=records.filter(r=>r.returned!==null);
  const returned=known.length?known.reduce((n,r)=>n+r.returned,0):null;
  const complete=records.length>0&&records.every(r=>r.delivered!==null);
  const delivered=complete?records.reduce((n,r)=>n+r.delivered,0):null;
  const rate=complete&&known.length===records.length&&records.every(r=>r.delivered>0)?100*returned/delivered:null;
  series.push({date,returned,delivered,rate,partial:known.length>0&&known.length<records.length});
 }
 return series;
}
