import {buildSchoolScorecard,getMplhTarget} from "./monthlyScorecardCalculations";

const n=(value)=>Number(value)||0;

function workerHoursFor(staffingRow){
  const count=n(staffingRow?.filled_count),total=n(staffingRow?.filled_daily_hours);
  if(!count||total<=0)return [];
  const sixPointFive=Math.max(0,Math.min(count,Math.round((total-count*6)/.5)));
  return [...Array(sixPointFive).fill(6.5),...Array(count-sixPointFive).fill(6)];
}

function bestRemoval(hours,minimumWorkerHours){
  let best=[];
  const combinations=1<<hours.length;
  for(let mask=1;mask<combinations;mask+=1){
    const chosen=hours.filter((_,index)=>mask&(1<<index)),remaining=hours.reduce((a,b)=>a+b,0)-chosen.reduce((a,b)=>a+b,0);
    if(remaining+1e-6<minimumWorkerHours)continue;
    if(chosen.length>best.length||(chosen.length===best.length&&chosen.reduce((a,b)=>a+b,0)>best.reduce((a,b)=>a+b,0)))best=chosen;
  }
  return best;
}

function bestAddition(current,minimum,maximum){
  const candidates=[];
  for(let count=1;count<=10;count+=1)for(let half=0;half<=count;half+=1){const hours=[...Array(half).fill(6.5),...Array(count-half).fill(6)],total=current+hours.reduce((a,b)=>a+b,0);if(total>=minimum-1e-6)candidates.push({hours,total,inRange:total<=maximum+1e-6});}
  return candidates.sort((a,b)=>Number(b.inRange)-Number(a.inRange)||a.hours.length-b.hours.length||Math.abs(a.total-(minimum+maximum)/2)-Math.abs(b.total-(minimum+maximum)/2))[0]?.hours||[];
}

export function buildLaborOptimization(dataset,month,startDate,endDate){
  const recommendations=(dataset?.schools||[]).map((school)=>{
    const target=getMplhTarget(school),card=buildSchoolScorecard(school,dataset,{startDate,endDate}),staffing=(dataset.staffing||[]).filter((row)=>String(row.source_site_id)===String(school.source_site_id)),worker=staffing.find((row)=>row.classification_key==="worker"),senior=staffing.find((row)=>row.classification_key==="senior_worker"),workerHours=workerHoursFor(worker),currentWorkerHours=workerHours.reduce((a,b)=>a+b,0),fixedHours=8+n(senior?.filled_daily_hours),days=card.current.operatingDays,averageEquivalents=days?(card.current.totals.breakfast*.66+card.current.totals.lunch+card.current.totals.supper)/days:null;
    if(target.min===null||!staffing.length||!days||averageEquivalents===null)return{school,card,target,status:"insufficient",action:"Insufficient data",workerCount:workerHours.length,currentWorkerHours,fixedHours,add:[],remove:[]};
    const optimizationMplh=fixedHours+currentWorkerHours>0?averageEquivalents/(fixedHours+currentWorkerHours):null,minimumWorkerHours=Math.max(0,averageEquivalents/target.max-fixedHours),maximumWorkerHours=Math.max(0,averageEquivalents/target.min-fixedHours);
    let add=[],remove=[],status="keep";
    if(currentWorkerHours>maximumWorkerHours+.01){remove=bestRemoval(workerHours,minimumWorkerHours);if(remove.length)status="move-out";}
    else if(currentWorkerHours<minimumWorkerHours-.01){add=bestAddition(currentWorkerHours,minimumWorkerHours,maximumWorkerHours);if(add.length)status="add";}
    const recommendedWorkerHours=currentWorkerHours+add.reduce((a,b)=>a+b,0)-remove.reduce((a,b)=>a+b,0),format=(values,verb)=>{const groups=[6,6.5].map((hours)=>({hours,count:values.filter((value)=>value===hours).length})).filter((item)=>item.count);return groups.length?`${verb} ${groups.map((item)=>`${item.count} × ${item.hours.toFixed(1)} hr worker${item.count>1?"s":""}`).join(" + ")}`:"KEEP CURRENT STAFFING";};
    return{school,card,target,status,action:status==="add"?format(add,"ADD"):status==="move-out"?format(remove,"MOVE OUT"):"KEEP CURRENT STAFFING",workerCount:workerHours.length,currentWorkerHours,recommendedWorkerHours,fixedHours,minimumWorkerHours,maximumWorkerHours,add,remove,mplh:optimizationMplh};
  });
  const surplus=[],needs=[];recommendations.forEach((row)=>{row.remove.forEach((hours)=>surplus.push({school:row.school,hours}));row.add.forEach((hours)=>needs.push({school:row.school,hours}));});
  const transfers=[];for(const need of needs){const index=surplus.findIndex((item)=>item.hours===need.hours);if(index>=0){const [from]=surplus.splice(index,1);transfers.push({from:from.school,to:need.school,hours:need.hours});need.matched=true;}}
  return{recommendations,transfers,unmatchedSurplus:surplus,unmatchedNeeds:needs.filter((item)=>!item.matched)};
}
