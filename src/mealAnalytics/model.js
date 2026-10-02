export const MEALS = ['breakfast','lunch','supper'];
export function rangeStart(preset,end){
 if(!end)return ''; 
 const d=new Date(`${end}T12:00:00Z`);
 if(preset==='month')d.setUTCDate(1);
 else if(preset==='school-year'){d.setUTCFullYear(d.getUTCMonth()>=6?d.getUTCFullYear():d.getUTCFullYear()-1,6,1);}
 else d.setUTCDate(d.getUTCDate()-Number(preset)+1);
 return d.toISOString().slice(0,10);
}
export function buildMealAnalytics({schools,officialMealRows=[],mealRows=[],excludedRows=[],startDate,endDate,rates}){
 const official=new Map(officialMealRows.map(r=>[`${r.location_id}|${r.service_date}`,r]));
 const finish=new Map(mealRows.map(r=>[`${r.location_id}|${r.service_date}`,r]));
 const excluded=new Set(excludedRows.map(r=>`${r.location_id}|${r.service_date}`));
 const dates=[];for(let d=new Date(`${startDate}T12:00:00Z`);d<=new Date(`${endDate}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()>0&&d.getUTCDay()<6)dates.push(d.toISOString().slice(0,10));
 const perSchool=schools.filter(s=>s.school_name?.trim().toLowerCase()!=='test high school').map(school=>({school,days:dates.filter(date=>!excluded.has(`${school.id}|${date}`)).map(date=>{
  const key=`${school.id}|${date}`,a=official.get(key),f=finish.get(key),row={date,total:0,revenue:0};
  for(const meal of MEALS){const count=Number(a?.[`${meal}_count`]);row[meal]=count>0?count:Math.max(0,Number(f?.[`${meal}_count`])||0);row[`${meal}Revenue`]=row[meal]*rates[meal];row.total+=row[meal];row.revenue+=row[`${meal}Revenue`];}
  return row;
 })}));
 const grouped=new Map();for(const {days} of perSchool)for(const day of days){const total=grouped.get(day.date)||{date:day.date,total:0,revenue:0};for(const key of [...MEALS,...MEALS.map(m=>`${m}Revenue`),'total','revenue'])total[key]=(total[key]||0)+day[key];grouped.set(day.date,total);}
 return {schools:perSchool,overall:[...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date))};
}
export function summarize(days){return days.reduce((a,d)=>{for(const k of [...MEALS,...MEALS.map(m=>`${m}Revenue`),'total','revenue'])a[k]=(a[k]||0)+d[k];return a;},{total:0,revenue:0});}
export function comparisonRows(a,b,key){const left=new Map(a.map(d=>[d.date,d[key]])),right=new Map(b.map(d=>[d.date,d[key]]));return [...new Set([...left.keys(),...right.keys()])].sort().map(date=>({date,left:left.get(date)??null,right:right.get(date)??null}));}
