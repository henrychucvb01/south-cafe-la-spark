export const MPLH_TARGETS = {
  secondary:{label:"Secondary",min:18,max:20},
  elementary_prep:{label:"Elementary Prep",min:20,max:22},
  elementary_nnc:{label:"Elementary NNC",min:24,max:25},
  special:{label:"Special Education",min:null,max:null},
  special_ed:{label:"Special Education",min:null,max:null},
};

const n=(value)=>Number(value)||0;
const inMonth=(date,month)=>String(date||"").slice(0,7)===month.slice(0,7);
const mean=(values)=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
const round=(value,digits=1)=>value===null?null:Number(value.toFixed(digits));
const componentPattern=/\b(milk|juice|apple|orange|banana|pear|peach|fruit|berries|strawberr|carrot|broccoli|potato|vegetable|salad|lettuce|corn|beans?\s+side|ketchup|mustard|mayonnaise|mayo|sauce|salsa|dressing|condiment|cracker|bread\s+stick)\b/i;

export function isLikelyEntree(row){
  return n(row?.mma_oz_eq)>=1 && !componentPattern.test(String(row?.item_name||""));
}

function serviceCounts(school,productionRows,mealRows,month){
  const byDay=new Map();
  productionRows.filter((row)=>String(row.location_id)===String(school.directory_id)&&inMonth(row.production_date,month)&&row.meals_served!==null).forEach((row)=>{
    const k=`${row.production_date}|${row.meal_type}`;
    if(!byDay.has(k)) byDay.set(k,n(row.meals_served));
  });
  if(!byDay.size&&school.location_id){
    mealRows.filter((row)=>String(row.location_id)===String(school.location_id)&&inMonth(row.service_date,month)).forEach((row)=>{
      byDay.set(`${row.service_date}|breakfast`,n(row.breakfast_count));
      byDay.set(`${row.service_date}|lunch`,n(row.lunch_count));
      if(row.supper_status!=="pending") byDay.set(`${row.service_date}|supper`,n(row.supper_count));
    });
  }
  return [...byDay].map(([key,count])=>{const [date,meal]=key.split("|");return{date,meal,count};});
}

function calculateMonth(school,dataset,month){
  const services=serviceCounts(school,dataset.production_rows||[],dataset.meal_counts||[],month);
  const dates=[...new Set(services.map((row)=>row.date))].sort();
  const totals={breakfast:0,lunch:0,supper:0};services.forEach((row)=>{totals[row.meal]+=row.count;});
  const averages=Object.fromEntries(Object.entries(totals).map(([meal,total])=>[meal,dates.length?total/dates.length:0]));
  const enrollment=n(school.enrollment)||null;
  const participation={breakfast:enrollment?averages.breakfast/enrollment*100:null,lunch:enrollment?averages.lunch/enrollment*100:null};
  const lunchTrend=dates.map((date)=>{const count=services.find((row)=>row.date===date&&row.meal==="lunch")?.count||0;return{date,lunch:count,participation:enrollment?count/enrollment*100:null};});
  const laborByDate=new Map((dataset.labor_hours||[]).filter((row)=>String(row.location_id)===String(school.location_id)&&inMonth(row.service_date,month)).map((row)=>[row.service_date,row]));
  const dailyMplh=dates.map((date)=>{
    const rows=services.filter((row)=>row.date===date), counts=Object.fromEntries(rows.map((row)=>[row.meal,row.count]));
    const adjustment=laborByDate.get(date), hours=n(school.budget_labor_hours)+n(adjustment?.additional_worker_hours)+n(adjustment?.manager_overtime_hours);
    const equivalents=n(counts.breakfast)*.66+n(counts.lunch)+n(counts.supper);
    return{date,hours,mplh:hours>0?equivalents/hours:null};
  }).filter((row)=>row.mplh!==null);
  const target=MPLH_TARGETS[school.labor_type]||{label:"Not Classified",min:null,max:null};
  const costs={breakfast:0,lunch:0,supper:0},costRowCounts={breakfast:0,lunch:0,supper:0};
  (dataset.cost_rows||[]).filter((row)=>String(row.location_id)===String(school.directory_id)&&inMonth(row.production_date,month)).forEach((row)=>{costs[row.meal_type]+=n(row.food_cost);costRowCounts[row.meal_type]+=1;});
  const costAvailable=Object.fromEntries(Object.keys(costs).map((meal)=>[meal,costRowCounts[meal]>0]));
  const totalMeals=Object.values(totals).reduce((a,b)=>a+b,0);
  const completeCostCoverage=Object.keys(totals).every((meal)=>totals[meal]===0||costAvailable[meal]);
  const recordedFoodCost=Object.values(costs).reduce((a,b)=>a+b,0),totalCost=completeCostCoverage?recordedFoodCost:null;
  const rates=Object.fromEntries((dataset.rates||[]).map((row)=>[row.meal_type,n(row.rate)]));
  const revenues={breakfast:totals.breakfast*n(rates.breakfast),lunch:totals.lunch*n(rates.lunch),supper:totals.supper*n(rates.supper)};
  const revenue=Object.values(revenues).reduce((a,b)=>a+b,0);
  const production=(dataset.production_rows||[]).filter((row)=>String(row.location_id)===String(school.directory_id)&&inMonth(row.production_date,month));
  const productionTotals=production.reduce((acc,row)=>({planned:acc.planned+n(row.planned),prepared:acc.prepared+n(row.prepared),served:acc.served+n(row.served),leftover:acc.leftover+n(row.leftover)}),{planned:0,prepared:0,served:0,leftover:0});
  const entreeTotals=new Map();production.filter(isLikelyEntree).forEach((row)=>{const prior=entreeTotals.get(row.item_name)||0;entreeTotals.set(row.item_name,prior+n(row.served));});
  const topEntrees=[...entreeTotals].sort((a,b)=>b[1]-a[1]).slice(0,3);
  const topEntree=topEntrees[0]||null;
  const menuFallback=production.map((row)=>row.menu_name).filter(Boolean).reduce((counts,name)=>counts.set(name,(counts.get(name)||0)+1),new Map());
  const topMenu=[...menuFallback].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
  return{month,operatingDays:dates.length,totals,averages,participation,lunchTrend,lunchAverage:participation.lunch,
    laborHours:dailyMplh.reduce((sum,row)=>sum+row.hours,0),averageMplh:mean(dailyMplh.map((row)=>row.mplh)),daysMeetingTarget:target.min===null?null:dailyMplh.filter((row)=>row.mplh>=target.min).length,daysBelowTarget:target.min===null?null:dailyMplh.filter((row)=>row.mplh<target.min).length,target,
    dataThrough:dates.at(-1)||null,costs,costAvailable,recordedFoodCost,totalCost,foodCostPerMeal:totalMeals&&totalCost!==null?totalCost/totalMeals:null,revenues,revenue,operatingMargin:null,productionTotals,menuPerformance:topEntree?{label:"Top entrée",name:topEntree[0],served:topEntree[1],topItems:topEntrees.map(([name,served])=>({name,served}))}:topMenu?{label:"Most-used menu plan",name:topMenu,served:null,topItems:[]}:null,
    hasProduction:production.length>0,hasCost:Object.values(costAvailable).some(Boolean),hasCompleteCost:completeCostCoverage,hasMeals:services.length>0};
}

function managerSummary(current,previous){
  const pp=current.participation.lunch!==null&&previous?.participation.lunch!==null?current.participation.lunch-previous.participation.lunch:null;
  const mplh=current.averageMplh!==null&&previous?.averageMplh!==null?current.averageMplh-previous.averageMplh:null;
  const win=pp!==null&&pp>0?`Lunch participation increased ${round(pp)} percentage points.`:current.menuPerformance?`${current.menuPerformance.name} was a strong menu performer.`:"Monthly operating data is available for review.";
  const watch=current.daysBelowTarget>0?`${current.daysBelowTarget} operating days were below the MPLH target.`:current.foodCostPerMeal!==null?`Monitor food cost per meal at $${current.foodCostPerMeal.toFixed(2)}.`:"Watch for missing cost or labor records.";
  const action=current.daysBelowTarget>0?"Review staffing adjustments on below-target days.":"Review high- and low-participation days with the menu plan.";
  const participationGoal=current.participation.lunch===null?null:Math.max(1,Math.floor(current.participation.lunch));
  const belowTargetGoal=current.daysBelowTarget===null?null:Math.max(0,current.daysBelowTarget-1);
  const goal=participationGoal!==null&&belowTargetGoal!==null?`Keep lunch participation at or above ${participationGoal}% while reducing below-target MPLH days from ${current.daysBelowTarget} to ${belowTargetGoal} or fewer.`:pp!==null&&pp<0?"Recover lunch participation toward the prior-month average.":mplh!==null&&mplh<0?"Return MPLH to at least the prior-month average.":"Maintain participation while meeting the school MPLH target.";
  return{win,watch,action,goal};
}

export function buildSchoolScorecard(school,dataset,month){
  const previousDate=new Date(`${month}T12:00:00`);previousDate.setMonth(previousDate.getMonth()-1);const previousMonth=previousDate.toISOString().slice(0,7)+"-01";
  const current=calculateMonth(school,dataset,month),previous=calculateMonth(school,dataset,previousMonth);
  const changes={breakfastParticipation:current.participation.breakfast!==null&&previous.participation.breakfast!==null?current.participation.breakfast-previous.participation.breakfast:null,lunchParticipation:current.participation.lunch!==null&&previous.participation.lunch!==null?current.participation.lunch-previous.participation.lunch:null,mplh:current.averageMplh!==null&&previous.averageMplh!==null?current.averageMplh-previous.averageMplh:null,
    totalMeals:previous.operatingDays?Object.values(current.totals).reduce((a,b)=>a+b,0)-Object.values(previous.totals).reduce((a,b)=>a+b,0):null,
    foodCostPerMeal:current.foodCostPerMeal!==null&&previous.foodCostPerMeal!==null?current.foodCostPerMeal-previous.foodCostPerMeal:null,
    revenue:previous.hasMeals?current.revenue-previous.revenue:null};
  return{school,current,previous:previous.hasMeals||previous.hasProduction||previous.hasCost?previous:null,changes,summary:managerSummary(current,previous)};
}
