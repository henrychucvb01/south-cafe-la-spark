import {calculateDisplayedFinishLineStreak,getPerfectMonthCandidates,getPerfectWeekCandidates} from "./finishLineStreaks";

const launch="2026-08-12";
const set=(...dates)=>new Set(dates);

test("Perfect Week awards 25",()=>{
  const awards=getPerfectWeekCandidates({completedDates:set("2026-08-17","2026-08-18","2026-08-19","2026-08-20","2026-08-21"),excludedDates:new Set(),todayString:"2026-08-21",rewardLaunchDate:launch});
  expect(awards).toContainEqual(expect.objectContaining({points:25,pointType:"perfect_week",period:"2026-08-17"}));
});

test("excluded weekday does not break Perfect Week",()=>{
  const awards=getPerfectWeekCandidates({completedDates:set("2026-08-17","2026-08-18","2026-08-20","2026-08-21"),excludedDates:set("2026-08-19"),todayString:"2026-08-21",rewardLaunchDate:launch});
  expect(awards).toContainEqual(expect.objectContaining({points:25,pointType:"perfect_week",period:"2026-08-17"}));
});

const completedAugust=()=>{const completed=new Set();for(let day=12;day<=31;day++){const d=`2026-08-${day}`;const dow=new Date(`${d}T12:00:00`).getDay();if(dow>0&&dow<6)completed.add(d);}return completed;};

test("completed qualifying month awards 100",()=>{
  const awards=getPerfectMonthCandidates({completedDates:completedAugust(),excludedDates:new Set(),todayString:"2026-09-01",rewardLaunchDate:launch});
  expect(awards).toEqual([expect.objectContaining({points:100,pointType:"perfect_month",period:"2026-08"})]);
});

test("excluded weekday does not break Perfect Month",()=>{
  const completed=set("2026-08-12","2026-08-13","2026-08-14","2026-08-17","2026-08-18","2026-08-20","2026-08-21","2026-08-24","2026-08-25","2026-08-26","2026-08-27","2026-08-28","2026-08-31");
  const awards=getPerfectMonthCandidates({completedDates:completed,excludedDates:set("2026-08-19"),todayString:"2026-09-01",rewardLaunchDate:launch});
  expect(awards).toEqual([expect.objectContaining({points:100,pointType:"perfect_month",period:"2026-08"})]);
});

test("Perfect Month key is deterministic so duplicate ledger awards are prevented",()=>{
  const input={completedDates:completedAugust(),excludedDates:new Set(),todayString:"2026-09-01",rewardLaunchDate:launch};
  const keys=[...getPerfectMonthCandidates(input),...getPerfectMonthCandidates(input)].map((award)=>`perfect-month-1-${award.period}`);
  expect(new Set(keys).size).toBe(1);
});

test("Perfect Month cannot award before the month is complete",()=>{
  expect(getPerfectMonthCandidates({completedDates:new Set(),excludedDates:new Set(),todayString:"2026-08-31",rewardLaunchDate:launch})).toEqual([]);
});

test("displayed streak skips excluded weekdays",()=>{
  expect(calculateDisplayedFinishLineStreak(set("2026-08-21","2026-08-20","2026-08-18"),set("2026-08-19"),"2026-08-21")).toBe(3);
});
