const asDate = (value) => new Date(`${value}T12:00:00`);
const dateKey = (date) => date.toISOString().slice(0, 10);

function weekdaysBetween(start, end) {
  const dates=[];
  const cursor=asDate(start);
  const last=asDate(end);
  while(cursor<=last){
    if(cursor.getDay()>=1&&cursor.getDay()<=5)dates.push(dateKey(cursor));
    cursor.setDate(cursor.getDate()+1);
  }
  return dates;
}

function qualifies(requiredDates, completedDates, excludedDates) {
  const applicable=requiredDates.filter((date)=>!excludedDates.has(date));
  return applicable.length>0&&applicable.every((date)=>completedDates.has(date));
}

export function getPerfectWeekCandidates({completedDates,excludedDates,todayString,rewardLaunchDate}) {
  const today=asDate(todayString);
  const oldest=new Date(today);
  oldest.setDate(oldest.getDate()-100);
  const day=oldest.getDay();
  oldest.setDate(oldest.getDate()-(day===0?6:day-1));
  const awards=[];
  for(const monday=new Date(oldest);monday<=today;monday.setDate(monday.getDate()+7)){
    const friday=new Date(monday);friday.setDate(friday.getDate()+4);
    const fridayString=dateKey(friday);
    if(friday>today||fridayString<rewardLaunchDate)continue;
    const mondayString=dateKey(monday);
    if(qualifies(weekdaysBetween(mondayString,fridayString),completedDates,excludedDates)){
      awards.push({period:mondayString,serviceDate:fridayString,points:25,pointType:"perfect_week"});
    }
  }
  return awards;
}

export function getPerfectMonthCandidates({completedDates,excludedDates,todayString,rewardLaunchDate}) {
  const today=asDate(todayString);
  const cursor=asDate(rewardLaunchDate.slice(0,7)+"-01");
  const awards=[];
  while(cursor<today){
    const year=cursor.getFullYear();
    const month=cursor.getMonth();
    const start=dateKey(new Date(year,month,1,12));
    const endDate=new Date(year,month+1,0,12);
    if(endDate>=today)break;
    const end=dateKey(endDate);
    const required=weekdaysBetween(start<rewardLaunchDate?rewardLaunchDate:start,end);
    if(qualifies(required,completedDates,excludedDates)){
      awards.push({period:start.slice(0,7),serviceDate:end,points:100,pointType:"perfect_month"});
    }
    cursor.setMonth(cursor.getMonth()+1);
  }
  return awards;
}

export function calculateDisplayedFinishLineStreak(completedDates,excludedDates,serviceDate,max=100) {
  let expected=asDate(serviceDate);
  let streak=0;
  while(streak<max){
    while(expected.getDay()===0||expected.getDay()===6)expected.setDate(expected.getDate()-1);
    const expectedString=dateKey(expected);
    if(excludedDates.has(expectedString)){expected.setDate(expected.getDate()-1);continue;}
    if(!completedDates.has(expectedString))break;
    streak+=1;
    expected.setDate(expected.getDate()-1);
  }
  return Math.max(streak,1);
}
