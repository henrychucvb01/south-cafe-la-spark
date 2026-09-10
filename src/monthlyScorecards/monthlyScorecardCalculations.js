export const MPLH_TARGETS = {
  secondary:{label:"Secondary",min:18,max:20},
  elementary_prep:{label:"Elementary Prep",min:20,max:22},
  elementary_nnc:{label:"Elementary NNC",min:24,max:25},
  special:{label:"Special Education",min:null,max:null},
  special_ed:{label:"Special Education",min:null,max:null},
};

const MEALS=["breakfast","lunch","supper"];
const n=(value)=>Number(value)||0;
const inMonth=(date,month)=>String(date||"").slice(0,7)===month.slice(0,7);
const mean=(values)=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
const round=(value,digits=1)=>value===null||value===undefined?null:Number(value.toFixed(digits));
const componentPattern=/\b(milk|juice|apple|orange|banana|pear|peach|fruit|berries|strawberr|carrot|broccoli|potato|vegetable|salad|lettuce|corn|beans?\s+side|ketchup|mustard|mayonnaise|mayo|sauce|salsa|dressing|condiment|cracker|bread\s+stick)\b/i;

export function isLikelyEntree(row){return n(row?.mma_oz_eq)>=1&&!componentPattern.test(String(row?.item_name||""));}
const leftoverFor=(prepared,served)=>n(prepared)-n(served);
const leftoverPercent=(prepared,served)=>n(prepared)>0?leftoverFor(prepared,served)/n(prepared)*100:null;

function serviceCounts(school,productionRows,mealRows,month){
  const byDay=new Map();
  productionRows.filter((row)=>String(row.location_id)===String(school.directory_id)&&inMonth(row.production_date,month)&&row.meals_served!==null).forEach((row)=>{const k=`${row.production_date}|${row.meal_type}`;if(!byDay.has(k))byDay.set(k,n(row.meals_served));});
  if(!byDay.size&&school.location_id){mealRows.filter((row)=>String(row.location_id)===String(school.location_id)&&inMonth(row.service_date,month)).forEach((row)=>{byDay.set(`${row.service_date}|breakfast`,n(row.breakfast_count));byDay.set(`${row.service_date}|lunch`,n(row.lunch_count));if(row.supper_status!=="pending")byDay.set(`${row.service_date}|supper`,n(row.supper_count));});}
  return [...byDay].map(([key,count])=>{const[date,meal]=key.split("|");return{date,meal,count};});
}

function mondayFor(value){const date=new Date(`${value}T12:00:00`),day=date.getDay();date.setDate(date.getDate()-(day===0?6:day-1));return date.toISOString().slice(0,10);}
function shortDate(value){return new Date(`${value}T12:00:00`).toLocaleDateString("en-US",{month:"short",day:"numeric"});}

function rankEntrees(production,meal){
  const totals=new Map();
  production.filter((row)=>row.meal_type===meal&&isLikelyEntree(row)).forEach((row)=>totals.set(row.item_name,(totals.get(row.item_name)||0)+n(row.served)));
  return [...totals].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([name,served],index)=>({rank:index+1,name,served}));
}

function worstLeftovers(production,totalPrepared){
  const items=new Map();
  production.filter((row)=>row.item_name&&row.prepared!==null&&row.served!==null).forEach((row)=>{const item=items.get(row.item_name)||{name:row.item_name,prepared:0,served:0,dates:new Set()};item.prepared+=n(row.prepared);item.served+=n(row.served);item.dates.add(row.production_date);items.set(row.item_name,item);});
  // Conservative and intentionally adjustable: require two service days and at least
  // 0.2% of the school's monthly prepared volume (never fewer than 10 portions).
  const minimumPrepared=Math.max(10,Math.round(n(totalPrepared)*.002));
  return [...items.values()].filter((item)=>item.dates.size>=2&&item.prepared>=minimumPrepared).map((item)=>({name:item.name,prepared:item.prepared,served:item.served,leftover:leftoverFor(item.prepared,item.served),leftoverPercentage:leftoverPercent(item.prepared,item.served),serviceDays:item.dates.size})).filter((item)=>item.leftover>0).sort((a,b)=>b.leftoverPercentage-a.leftoverPercentage||b.leftover-a.leftover).slice(0,3);
}

function normalize(value,values,higherIsBetter=true){const usable=values.filter((item)=>item!==null&&item!==undefined);if(!usable.length||value===null||value===undefined)return null;const min=Math.min(...usable),max=Math.max(...usable);if(max===min)return .5;const result=(value-min)/(max-min);return higherIsBetter?result:1-result;}

function weeklyPerformance({dates,services,production,dailyMplh,enrollment,target}){
  const groups=new Map();
  dates.forEach((date)=>{const key=mondayFor(date),week=groups.get(key)||{weekStart:key,dates:[]};week.dates.push(date);groups.set(key,week);});
  const weeks=[...groups.values()].sort((a,b)=>a.weekStart.localeCompare(b.weekStart)).map((week)=>{const rows=production.filter((row)=>week.dates.includes(row.production_date)),prepared=rows.reduce((sum,row)=>sum+n(row.prepared),0),served=rows.reduce((sum,row)=>sum+n(row.served),0),lunch=services.filter((row)=>week.dates.includes(row.date)&&row.meal==="lunch").reduce((sum,row)=>sum+row.count,0),labor=dailyMplh.filter((row)=>week.dates.includes(row.date)),hours=labor.reduce((sum,row)=>sum+row.hours,0),equivalents=labor.reduce((sum,row)=>sum+row.equivalents,0);return{weekStart:week.weekStart,startDate:week.dates[0],endDate:week.dates.at(-1),label:`${shortDate(week.dates[0])}–${shortDate(week.dates.at(-1))}`,operatingDays:week.dates.length,prepared,served,leftover:leftoverFor(prepared,served),leftoverPercentage:leftoverPercent(prepared,served),lunchParticipation:enrollment&&week.dates.length?lunch/(enrollment*week.dates.length)*100:null,mplh:hours>0?equivalents/hours:null};});
  const maxDays=Math.max(0,...weeks.map((week)=>week.operatingDays)),eligible=weeks.filter((week)=>week.operatingDays>=(maxDays>=3?3:1)&&week.leftoverPercentage!==null&&week.lunchParticipation!==null&&week.mplh!==null),participations=eligible.map((week)=>week.lunchParticipation),leftovers=eligible.map((week)=>week.leftoverPercentage);
  // Equal weight for normalized participation, target attainment, and inverse
  // leftover percentage prevents any metric's raw scale from dominating.
  eligible.forEach((week)=>{const participationScore=normalize(week.lunchParticipation,participations),leftoverScore=normalize(week.leftoverPercentage,leftovers,false),mplhScore=target.min===null?null:Math.min(1,week.mplh/target.min),parts=[participationScore,mplhScore,leftoverScore].filter((value)=>value!==null);week.performanceScore=parts.length?mean(parts):null;});
  const ranked=eligible.filter((week)=>week.performanceScore!==null).sort((a,b)=>b.performanceScore-a.performanceScore);
  return{weeks,bestWeek:ranked.length>1?ranked[0]:null,watchWeek:ranked.length>1?ranked.at(-1):null};
}

function calculateMonth(school,dataset,month){
  const services=serviceCounts(school,dataset.production_rows||[],dataset.meal_counts||[],month),dates=[...new Set(services.map((row)=>row.date))].sort(),totals={breakfast:0,lunch:0,supper:0};services.forEach((row)=>{totals[row.meal]+=row.count;});
  const averages=Object.fromEntries(MEALS.map((meal)=>[meal,dates.length?totals[meal]/dates.length:0])),enrollment=n(school.enrollment)||null,participation={breakfast:enrollment?averages.breakfast/enrollment*100:null,lunch:enrollment?averages.lunch/enrollment*100:null,supper:enrollment?averages.supper/enrollment*100:null},lunchTrend=dates.map((date)=>{const count=services.find((row)=>row.date===date&&row.meal==="lunch")?.count||0;return{date,lunch:count,participation:enrollment?count/enrollment*100:null};});
  const laborByDate=new Map((dataset.labor_hours||[]).filter((row)=>String(row.location_id)===String(school.location_id)&&inMonth(row.service_date,month)).map((row)=>[row.service_date,row]));
  const dailyMplh=dates.map((date)=>{const rows=services.filter((row)=>row.date===date),counts=Object.fromEntries(rows.map((row)=>[row.meal,row.count])),adjustment=laborByDate.get(date),hours=n(school.budget_labor_hours)+n(adjustment?.additional_worker_hours)+n(adjustment?.manager_overtime_hours),equivalents=n(counts.breakfast)*.66+n(counts.lunch)+n(counts.supper);return{date,hours,equivalents,mplh:hours>0?equivalents/hours:null};}).filter((row)=>row.mplh!==null),target=MPLH_TARGETS[school.labor_type]||{label:"Not Classified",min:null,max:null};
  const costs={breakfast:0,lunch:0,supper:0},costRowCounts={breakfast:0,lunch:0,supper:0};(dataset.cost_rows||[]).filter((row)=>String(row.location_id)===String(school.directory_id)&&inMonth(row.production_date,month)).forEach((row)=>{costs[row.meal_type]+=n(row.food_cost);costRowCounts[row.meal_type]+=1;});
  const costAvailable=Object.fromEntries(MEALS.map((meal)=>[meal,costRowCounts[meal]>0&&(totals[meal]===0||costs[meal]>0)])),totalMeals=Object.values(totals).reduce((a,b)=>a+b,0),completeCostCoverage=MEALS.every((meal)=>totals[meal]===0||costAvailable[meal]),recordedFoodCost=Object.values(costs).reduce((a,b)=>a+b,0),totalCost=completeCostCoverage?recordedFoodCost:null,rates=Object.fromEntries((dataset.rates||[]).map((row)=>[row.meal_type,n(row.rate)])),revenues={breakfast:totals.breakfast*n(rates.breakfast),lunch:totals.lunch*n(rates.lunch),supper:totals.supper*n(rates.supper)},revenue=Object.values(revenues).reduce((a,b)=>a+b,0);
  const production=(dataset.production_rows||[]).filter((row)=>String(row.location_id)===String(school.directory_id)&&inMonth(row.production_date,month)),productionTotals=production.reduce((acc,row)=>({planned:acc.planned+n(row.planned),prepared:acc.prepared+n(row.prepared),served:acc.served+n(row.served)}),{planned:0,prepared:0,served:0});productionTotals.leftover=leftoverFor(productionTotals.prepared,productionTotals.served);productionTotals.leftoverPercentage=leftoverPercent(productionTotals.prepared,productionTotals.served);
  const menuRankings={breakfast:rankEntrees(production,"breakfast"),lunch:rankEntrees(production,"lunch")},worstItems=worstLeftovers(production,productionTotals.prepared),forecastObservation=worstItems[0]?`${worstItems[0].name} averaged ${round(worstItems[0].leftoverPercentage)}% leftover across ${worstItems[0].serviceDays} service days. Review its planned quantity before the next service.`:null,weekly=weeklyPerformance({dates,services,production,dailyMplh,enrollment,target});
  return{month,operatingDays:dates.length,totals,averages,participation,lunchTrend,lunchAverage:participation.lunch,laborHours:dailyMplh.reduce((sum,row)=>sum+row.hours,0),laborCost:null,averageMplh:mean(dailyMplh.map((row)=>row.mplh)),daysMeetingTarget:target.min===null?null:dailyMplh.filter((row)=>row.mplh>=target.min).length,daysBelowTarget:target.min===null?null:dailyMplh.filter((row)=>row.mplh<target.min).length,target,dataThrough:dates.at(-1)||null,costs,costAvailable,recordedFoodCost,totalCost,foodCostPerMeal:totalMeals&&totalCost!==null?totalCost/totalMeals:null,revenues,revenue,operatingMargin:null,productionTotals,menuRankings,worstItems,forecastObservation,weekly:weekly.weeks,bestWeek:weekly.bestWeek,watchWeek:weekly.watchWeek,hasProduction:production.length>0,hasCost:Object.values(costAvailable).some(Boolean),hasCompleteCost:completeCostCoverage,hasMeals:services.length>0};
}

function managerSummary(current,previous){
  const pp=current.participation.lunch!==null&&previous?.participation?.lunch!=null?current.participation.lunch-previous.participation.lunch:null;
  const win=pp!==null&&pp>0?`Lunch participation increased ${round(pp)} percentage points.`:current.bestWeek?`${current.bestWeek.label} was the strongest balanced operating week.`:"Monthly operating data is available for review.";
  const watch=current.watchWeek&&current.watchWeek.leftoverPercentage!==null?`${current.watchWeek.label} needs attention: ${round(current.watchWeek.leftoverPercentage)}% leftover and ${round(current.watchWeek.lunchParticipation)}% lunch participation.`:current.daysBelowTarget>0?`${current.daysBelowTarget} operating days were below the MPLH target.`:"Continue monitoring participation, MPLH, and production.";
  const action=current.worstItems.length?`Review production quantities for ${current.worstItems.slice(0,3).map((item)=>item.name).join(", ")} before their next menu cycle.`:current.daysBelowTarget>0?"Review staffing adjustments on below-target days.":"Review high- and low-participation days with the menu plan.";
  const participationGoal=current.participation.lunch===null?null:Math.max(1,Math.floor(current.participation.lunch)),belowTargetGoal=current.daysBelowTarget===null?null:Math.max(0,current.daysBelowTarget-1);
  const goal=participationGoal!==null&&belowTargetGoal!==null?`Keep lunch participation at or above ${participationGoal}% while reducing below-target MPLH days from ${current.daysBelowTarget} to ${belowTargetGoal} or fewer.`:"Maintain participation while meeting the school MPLH target.";
  return{win,watch,action,goal};
}

export function buildSchoolScorecard(school,dataset,month){
  const previousDate=new Date(`${month}T12:00:00`);previousDate.setMonth(previousDate.getMonth()-1);const previousMonth=previousDate.toISOString().slice(0,7)+"-01",current=calculateMonth(school,dataset,month),previous=calculateMonth(school,dataset,previousMonth),previousExists=previous.hasMeals||previous.hasProduction||previous.hasCost;
  const changes={breakfastParticipation:current.participation.breakfast!==null&&previous.participation.breakfast!==null?current.participation.breakfast-previous.participation.breakfast:null,lunchParticipation:current.participation.lunch!==null&&previous.participation.lunch!==null?current.participation.lunch-previous.participation.lunch:null,supperParticipation:current.participation.supper!==null&&previous.participation.supper!==null?current.participation.supper-previous.participation.supper:null,mplh:current.averageMplh!==null&&previous.averageMplh!==null?current.averageMplh-previous.averageMplh:null,laborCost:current.laborCost!==null&&previous.laborCost!==null?current.laborCost-previous.laborCost:null,foodCost:current.totalCost!==null&&previous.totalCost!==null?current.totalCost-previous.totalCost:null,foodCostPerMeal:current.foodCostPerMeal!==null&&previous.foodCostPerMeal!==null?current.foodCostPerMeal-previous.foodCostPerMeal:null,leftoverPercentage:current.productionTotals.leftoverPercentage!==null&&previous.productionTotals.leftoverPercentage!==null?current.productionTotals.leftoverPercentage-previous.productionTotals.leftoverPercentage:null,revenue:previous.hasMeals?current.revenue-previous.revenue:null};
  return{school,current,previous:previousExists?previous:null,changes,summary:managerSummary(current,previousExists?previous:null)};
}
