import {buildSchoolScorecard,getMplhTarget} from "./monthlyScorecardCalculations";

const n=(value)=>Number(value)||0;
const isVacant=(position)=>String(position?.employee_name||"").trim().toUpperCase()==="VACANT";
const isManager=(position)=>/food service manager/i.test(String(position?.classification_title||""));
const isSenior=(position)=>/senior food service worker/i.test(String(position?.classification_title||""));
const isMovableWorker=(position)=>!isVacant(position)&&!isManager(position)&&!isSenior(position)&&/food services? worker/i.test(String(position?.classification_title||""));
const distanceToRange=(value,target)=>value<target.min?target.min-value:value>target.max?value-target.max:0;
const mplhFor=(equivalents,hours)=>hours>0?equivalents/hours:null;

function makeSchoolState(school,dataset,startDate,endDate){
  const target=getMplhTarget(school),card=buildSchoolScorecard(school,dataset,{startDate,endDate});
  const positions=(dataset.staffing_positions||[]).filter((position)=>String(position.source_site_id)===String(school.source_site_id)&&position.active!==false&&!isVacant(position));
  const fixedPositions=positions.filter((position)=>isManager(position)||isSenior(position));
  const movableWorkers=positions.filter(isMovableWorker);
  const assignedHours=positions.reduce((sum,position)=>sum+n(position.assigned_daily_hours),0);
  const fixedHours=fixedPositions.reduce((sum,position)=>sum+n(position.assigned_daily_hours),0);
  const movableHours=movableWorkers.reduce((sum,position)=>sum+n(position.assigned_daily_hours),0);
  const days=card.current.operatingDays;
  const averageEquivalents=days?(card.current.totals.breakfast*.66+card.current.totals.lunch+card.current.totals.supper)/days:null;
  const currentMplh=averageEquivalents!==null?mplhFor(averageEquivalents,assignedHours):null;
  return{school,card,target,positions,fixedPositions,movableWorkers,assignedHours,fixedHours,movableHours,averageEquivalents,currentMplh,projectedHours:assignedHours,projectedMplh:currentMplh,incoming:[],outgoing:[]};
}

const validState=(state)=>state.target.min!==null&&state.averageEquivalents!==null&&state.assignedHours>0;

function findBestMove(states,usedEmployees){
  let best=null;
  const senders=states.filter((state)=>validState(state)&&state.projectedMplh<state.target.min);
  const receivers=states.filter((state)=>validState(state)&&state.projectedMplh>state.target.max);
  for(const sender of senders)for(const employee of sender.movableWorkers){
    if(usedEmployees.has(String(employee.id)))continue;
    const hours=n(employee.assigned_daily_hours);
    if(hours<=0||sender.projectedHours-hours<=0)continue;
    const sendingProjectedMplh=mplhFor(sender.averageEquivalents,sender.projectedHours-hours);
    if(sendingProjectedMplh>sender.target.max+1e-6)continue;
    for(const receiver of receivers){
      if(receiver===sender)continue;
      const receivingProjectedMplh=mplhFor(receiver.averageEquivalents,receiver.projectedHours+hours);
      if(receivingProjectedMplh<receiver.target.min-1e-6)continue;
      const before=distanceToRange(sender.projectedMplh,sender.target)+distanceToRange(receiver.projectedMplh,receiver.target);
      const after=distanceToRange(sendingProjectedMplh,sender.target)+distanceToRange(receivingProjectedMplh,receiver.target);
      const improvement=before-after;
      if(improvement<=1e-6)continue;
      const bothImprove=distanceToRange(sendingProjectedMplh,sender.target)<distanceToRange(sender.projectedMplh,sender.target)&&distanceToRange(receivingProjectedMplh,receiver.target)<distanceToRange(receiver.projectedMplh,receiver.target);
      const candidate={employee,hours,sender,receiver,sendingCurrentMplh:sender.projectedMplh,sendingProjectedMplh,receivingCurrentMplh:receiver.projectedMplh,receivingProjectedMplh,improvement,bothImprove};
      if(!best||Number(candidate.bothImprove)>Number(best.bothImprove)||(candidate.bothImprove===best.bothImprove&&candidate.improvement>best.improvement))best=candidate;
    }
  }
  return best;
}

export function buildLaborOptimization(dataset,month,startDate,endDate){
  const states=(dataset?.schools||[]).map((school)=>makeSchoolState(school,dataset,startDate,endDate));
  const transfers=[],usedEmployees=new Set();
  while(true){
    const move=findBestMove(states,usedEmployees);
    if(!move)break;
    usedEmployees.add(String(move.employee.id));
    move.sender.projectedHours-=move.hours;move.receiver.projectedHours+=move.hours;
    move.sender.projectedMplh=move.sendingProjectedMplh;move.receiver.projectedMplh=move.receivingProjectedMplh;
    move.sender.outgoing.push(move);move.receiver.incoming.push(move);
    transfers.push({employee:move.employee,employeeName:move.employee.employee_name,classification:move.employee.classification_title,hours:move.hours,from:move.sender.school,to:move.receiver.school,sendingCurrentMplh:move.sendingCurrentMplh,sendingProjectedMplh:move.sendingProjectedMplh,receivingCurrentMplh:move.receivingCurrentMplh,receivingProjectedMplh:move.receivingProjectedMplh});
  }
  const recommendations=states.map((state)=>{const insufficient=!validState(state),status=insufficient?"insufficient":state.outgoing.length?"move-out":state.incoming.length?"add":"keep";return{...state,status,action:insufficient?"Insufficient data":status==="move-out"?`SEND ${state.outgoing.length} WORKER${state.outgoing.length===1?"":"S"}`:status==="add"?`RECEIVE ${state.incoming.length} WORKER${state.incoming.length===1?"":"S"}`:"KEEP STAFFING UNCHANGED",workerCount:state.movableWorkers.length,currentWorkerHours:state.movableHours,recommendedWorkerHours:state.movableHours-state.outgoing.reduce((sum,item)=>sum+item.hours,0)+state.incoming.reduce((sum,item)=>sum+item.hours,0),mplh:state.currentMplh};});
  return{recommendations,transfers};
}

export{isMovableWorker};
