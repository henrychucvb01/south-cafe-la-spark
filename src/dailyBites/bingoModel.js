// Historical fall-card audit model only. Live Bingo uses BingoPanel and the
// spark_bingo_* database functions. Keep this snapshot to reproduce the prior audit.
import { getMplhTarget } from '../mplhTargets.js';
import { isPerfectMonitoring } from '../monitoring/supperSchedule.js';
import { getLocalDateString } from '../sparkPolicy.js';

const CARD_ONE_START = "2026-08-01";
const CARD_ONE_END = "2026-12-31";
const CARD_ONE_KEY = "card1-fall-2026";
const FREE_SPACE_INDEX = 12;

/*
  Card 1 uses a larger approved goal pool.
  Each school gets a deterministic 25-square card based on its location ID.
  That means:
  - different schools get different cards
  - the card does NOT reshuffle on refresh/login
  - FREE SPACE always stays in the center
  - Perfect BIC Run is guaranteed on every Card 1
  - Special Education excludes Supper goals; legacy special_ed cards also omit MPLH goals
*/
const BINGO_GOAL_POOL = [
  { id: "finish-line-3", label: "Finish Line", detail: "Complete 3 days", icon: "✅" },
  { id: "finish-line-5", label: "Finish Line", detail: "Complete 5 days", icon: "✅" },
  { id: "finish-line-7", label: "Finish Line", detail: "Complete 7 days", icon: "🏁" },
  { id: "finish-line-10", label: "Finish Line", detail: "Complete 10 days", icon: "🏁" },
  { id: "finish-line-15", label: "Finish Line", detail: "Complete 15 days", icon: "🏆" },
  { id: "finish-line-20", label: "Finish Line", detail: "Complete 20 days", icon: "🏆" },

  { id: "finish-streak-3", label: "Finish Line", detail: "3-day streak", icon: "🔥" },
  { id: "finish-streak-5", label: "Finish Line", detail: "5-day streak", icon: "🔥" },
  { id: "perfect-week", label: "Perfect Week", detail: "Finish Line", icon: "⭐" },

  { id: "daily-bites-3", label: "Daily Bites", detail: "Visit 3 days", icon: "🍎" },
  { id: "daily-bites-5", label: "Daily Bites", detail: "Visit 5 days", icon: "🍎" },
  { id: "daily-bites-7", label: "Daily Bites", detail: "Visit 7 days", icon: "🥕" },
  { id: "daily-bites-10", label: "Daily Bites", detail: "Visit 10 days", icon: "🥕" },

  { id: "meal-counts-3", label: "Meal Counts", detail: "Enter 3 days", icon: "🍽️" },
  { id: "meal-counts-5", label: "Meal Counts", detail: "Enter 5 days", icon: "🍽️" },
  { id: "meal-counts-7", label: "Meal Counts", detail: "Enter 7 days", icon: "🔢" },
  { id: "meal-counts-10", label: "Meal Counts", detail: "Enter 10 days", icon: "🔢" },
  { id: "meal-counts-15", label: "Meal Counts", detail: "Enter 15 days", icon: "🔢" },

  { id: "production-record-3", label: "Production Record", detail: "Complete 3 days", icon: "📋" },
  { id: "production-record-5", label: "Production Record", detail: "Complete 5 days", icon: "📋" },
  { id: "production-record-10", label: "Production Record", detail: "Complete 10 days", icon: "📋" },
  { id: "production-worksheet-5", label: "Production Worksheet", detail: "Complete 5 days", icon: "📝" },
  { id: "reports-reviewed-5", label: "Reports Reviewed", detail: "Complete 5 days", icon: "🔍" },
  { id: "finish-meal-count-5", label: "Meal Count Check", detail: "Confirm 5 days", icon: "✔️" },

  { id: "perfect-bic", label: "Perfect BIC Run", detail: "Supervisor verified", icon: "🌟", lockedCardOne: true },
  { id: "monitoring-1", label: "Supper 1", detail: "Accepted monitoring", icon: "🔎", requiresSupper: true },
  { id: "perfect-lunch", label: "Perfect Lunch", detail: "Monitoring", icon: "🥗" },
  { id: "all-monitorings", label: "Supper 1", detail: "Manager monitoring accepted", icon: "✔️", requiresSupper: true },

  { id: "labor-adjustment", label: "Labor", detail: "Enter 1 adjustment", icon: "🕒" },
  { id: "labor-adjustment-3", label: "Labor", detail: "Enter 3 adjustments", icon: "🕒" },

  { id: "inventory", label: "Inventory", detail: "Month-end complete", icon: "📦" },
  { id: "monday", label: "Monday Tasks", detail: "Complete all", icon: "M" },
  { id: "tuesday", label: "Tuesday Plan", detail: "Meal plan complete", icon: "T" },
  { id: "wednesday", label: "Wednesday", detail: "Ordering complete", icon: "W" },
  { id: "thursday", label: "Thursday", detail: "Orders complete", icon: "T" },

  { id: "perfect-supper", label: "Perfect Supper", detail: "Monitoring", icon: "🌙", requiresSupper: true },
  { id: "supper-monitoring-1", label: "Supper 1", detail: "Accepted monitoring", icon: "🌙", requiresSupper: true },
  { id: "supper-monitorings-3", label: "Supper 1", detail: "Fall monitoring accepted", icon: "3️⃣", requiresSupper: true },

  { id: "mplh-2", label: "MPLH Target", detail: "Hit target 2 days", icon: "📈", requiresMplh: true },
  { id: "mplh-3", label: "MPLH Target", detail: "Hit target 3 days", icon: "📈", requiresMplh: true },
  { id: "mplh-5", label: "MPLH Target", detail: "Hit target 5 days", icon: "📊", requiresMplh: true },
];

const FREE_SPACE = {
  id: "free",
  label: "FREE SPACE",
  detail: "Already yours",
  icon: "✨",
};

function hashString(value) {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function seededRandom(seed) {
  let value = seed >>> 0;

  return function nextRandom() {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, seedText) {
  const result = [...items];
  const random = seededRandom(hashString(seedText));

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function buildSchoolBingoCard(location) {
  const isSpecialEd = location?.labor_type === "special_ed";
  const excludesSupper = ["special", "special_ed"].includes(location?.labor_type);

  const eligibleGoals = BINGO_GOAL_POOL.filter((goal) => {
    if (excludesSupper && goal.requiresSupper) {
      return false;
    }

    if (isSpecialEd && goal.requiresMplh) {
      return false;
    }

    return true;
  });

  const lockedGoals = eligibleGoals.filter((goal) => goal.lockedCardOne);
  const randomGoals = eligibleGoals.filter((goal) => !goal.lockedCardOne);

  const schoolSeed =
    `${CARD_ONE_KEY}-${location?.id ?? location?.location_code ?? "school"}`;

  const selectedRandomGoals = seededShuffle(
    randomGoals,
    `${schoolSeed}-goal-pool`
  ).slice(0, 24 - lockedGoals.length);

  const selectedNonFree = seededShuffle(
    [...lockedGoals, ...selectedRandomGoals],
    `${schoolSeed}-positions`
  );

  const card = [...selectedNonFree];
  card.splice(FREE_SPACE_INDEX, 0, FREE_SPACE);

  return card;
}

const BINGO_LINES = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

const BINGO_LINE_REWARDS = [10, 20, 30, 40, 50];
const BLACKOUT_BONUS = 100;

function getCompletedBingoLines(completedGoalIds, bingoCard) {
  return BINGO_LINES.reduce((result, line, lineIndex) => {
    const complete = line.every((squareIndex) =>
      completedGoalIds.has(bingoCard[squareIndex].id)
    );

    if (complete) {
      result.push(lineIndex);
    }

    return result;
  }, []);
}

// Keep Card 1 IDs and positions stable. Fall completion is Manager Supper 1.
// A later-year card will use Manager Supper 3; never require Supervisor Supper 2 here.
const CARD_REQUIRED_SUPPER_NUMBER = 1;
const dateString = getLocalDateString;

function longestWeekdayStreak(completedDates, excludedDates = new Set()) {
  const sorted = [...completedDates].sort();
  if (!sorted.length) return 0;
  let current = 0, longest = 0;
  for (const day = new Date(sorted[0]+'T12:00:00Z'); day.toISOString().slice(0,10) <= sorted[sorted.length-1]; day.setUTCDate(day.getUTCDate()+1)) {
    const key = day.toISOString().slice(0,10);
    if ([0,6].includes(day.getUTCDay()) || excludedDates.has(key)) continue;
    current = completedDates.has(key) ? current + 1 : 0;
    longest = Math.max(longest,current);
  }
  return longest;
}

function hasPerfectWeek(completed, excluded) {
  for (const key of [...completed].sort()) {
    const day = new Date(key+'T12:00:00Z');
    const monday = new Date(day); monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay()+6)%7));
    const dates = Array.from({length:5},(_,i)=>{const d=new Date(monday);d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10);});
    if (dates.filter(d=>!excluded.has(d)).length && dates.every(d=>excluded.has(d)||completed.has(d))) return true;
  }
  return false;
}

function evaluateBingoGoals({location,finishRows=[],mealRows=[],pointRows=[],laborRows=[],monitoringRows=[],excludedRows=[],today=getLocalDateString()}) {
  const inCard = date => date >= CARD_ONE_START && date <= CARD_ONE_END && date <= today;
  const atSchool = row => row.location_id == null || String(row.location_id) === String(location.id);
  const filter = rows => rows.filter(r=>atSchool(r)&&inCard(r.service_date));
  finishRows=filter(finishRows);mealRows=filter(mealRows);pointRows=filter(pointRows);laborRows=filter(laborRows);
  const currentMonitorings=monitoringRows.filter(r=>atSchool(r)&&inCard(r.monitoring_date));
  const finalMonitorings=currentMonitorings.filter(r=>r.locked===true&&['accepted','completed'].includes(r.status));
  const completed=new Set(['free']);
  const addCounts=(prefix,count,thresholds)=>thresholds.forEach(n=>{if(count>=n)completed.add(`${prefix}-${n}`);});
  const completeDates=new Set(finishRows.filter(r=>r.status==='complete').map(r=>r.service_date));
  const excluded=new Set(filter(excludedRows).map(r=>r.service_date));
  addCounts('finish-line',completeDates.size,[3,5,7,10,15,20]);
  // Bingo records an achieved task streak, not just the school's current streak.
  addCounts('finish-streak',longestWeekdayStreak(completeDates,excluded),[3,5]);
  if(hasPerfectWeek(completeDates,excluded)||pointRows.some(r=>['perfect_week','weekly_streak_bonus'].includes(r.point_type)))completed.add('perfect-week');
  const yes=(row,key)=>(row.finish_line_items||[]).some(i=>i.item_key===key&&i.answer==='yes');
  const countYes=key=>new Set(finishRows.filter(r=>yes(r,key)).map(r=>r.service_date)).size;
  addCounts('production-record',countYes('production_record'),[3,5,10]);
  for(const [goal,key] of [['production-worksheet-5','production_worksheet'],['reports-reviewed-5','reports_reviewed'],['finish-meal-count-5','meal_count_entered']])if(countYes(key)>=5)completed.add(goal);
  if(finishRows.some(r=>yes(r,'monday_missing_meal_report')&&yes(r,'monday_all_meal_counts_entered')))completed.add('monday');
  for(const [goal,key] of [['tuesday','tuesday_meal_plan'],['wednesday','wednesday_order_status'],['thursday','thursday_orders_complete'],['inventory','month_end_inventory']])if(countYes(key))completed.add(goal);
  addCounts('meal-counts',new Set(mealRows.map(r=>r.service_date)).size,[3,5,7,10,15]);
  addCounts('daily-bites',new Set(pointRows.filter(r=>r.point_type==='daily_bites_visit').map(r=>r.service_date)).size,[3,5,7,10]);

  // Current records win over legacy point-based evidence for the same type/slot.
  // This prevents a stale point entry from overriding a return or removed star.
  const legacyMonitorings=pointRows.filter(r=>/^monitoring_(breakfast|lunch|supper|snack)$/.test(r.point_type)).filter(r=>{
    const type=r.point_type.replace('monitoring_','');
    const number=Number(String(r.unique_key||'').match(/-(\d+)$/)?.[1]);
    return !currentMonitorings.some(m=>m.monitoring_type===type&&(!number||m.monitoring_number===number));
  });
  const supperDone=finalMonitorings.some(r=>r.monitoring_type==='supper'&&r.monitor_role==='manager'&&r.status==='accepted'&&r.monitoring_number===CARD_REQUIRED_SUPPER_NUMBER)
    || legacyMonitorings.some(r=>r.point_type==='monitoring_supper'&&Number(String(r.unique_key||'').match(/-(\d+)$/)?.[1])===CARD_REQUIRED_SUPPER_NUMBER);
  if(supperDone)for(const id of ['monitoring-1','all-monitorings','supper-monitoring-1','supper-monitorings-3'])completed.add(id);
  for(const [type,goal] of [['breakfast','perfect-bic'],['lunch','perfect-lunch'],['supper','perfect-supper']]) {
    if(finalMonitorings.some(r=>r.monitoring_type===type&&isPerfectMonitoring(r))||legacyMonitorings.some(r=>r.point_type===`monitoring_${type}`&&/^perfect\b/i.test(r.description||'')))completed.add(goal);
  }
  const laborDays=new Set(laborRows.map(r=>r.service_date)).size;
  if(laborDays>=1)completed.add('labor-adjustment');
  if(laborDays>=3)completed.add('labor-adjustment-3');
  const target=getMplhTarget(location),laborByDate=new Map(laborRows.map(r=>[r.service_date,r]));
  const targetDates=new Set();
  if(target?.min>0)for(const meal of mealRows){
    const labor=laborByDate.get(meal.service_date);
    const hours=(Number(location.budget_labor_hours)||0)+(Number(labor?.additional_worker_hours)||0)+(Number(labor?.manager_overtime_hours)||0);
    const equivalents=(Number(meal.breakfast_count)||0)*0.66+(Number(meal.lunch_count)||0)+(meal.supper_status==='pending'?0:Number(meal.supper_count)||0);
    if(hours>0&&equivalents/hours>=target.min)targetDates.add(meal.service_date);
  }
  addCounts('mplh',targetDates.size,[2,3,5]);
  return completed;
}

export { CARD_ONE_START, CARD_ONE_END, CARD_ONE_KEY, CARD_REQUIRED_SUPPER_NUMBER, BINGO_LINES, BINGO_LINE_REWARDS, BLACKOUT_BONUS, buildSchoolBingoCard, getCompletedBingoLines, evaluateBingoGoals, dateString, longestWeekdayStreak };
