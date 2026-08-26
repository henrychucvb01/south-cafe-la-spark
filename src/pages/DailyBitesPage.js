import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { awardSparkPoints } from "../sparkPoints";
import DAILY_BITES from "../data/dailyBitesContent";

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
  - Special Ed automatically excludes Supper and MPLH goals
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
  { id: "monitoring-1", label: "Monitoring", detail: "Complete 1", icon: "🔎" },
  { id: "perfect-lunch", label: "Perfect Lunch", detail: "Monitoring", icon: "🥗" },
  { id: "all-monitorings", label: "Monitorings", detail: "Complete required", icon: "✔️" },

  { id: "labor-adjustment", label: "Labor", detail: "Enter 1 adjustment", icon: "🕒" },
  { id: "labor-adjustment-3", label: "Labor", detail: "Enter 3 adjustments", icon: "🕒" },

  { id: "inventory", label: "Inventory", detail: "Month-end complete", icon: "📦" },
  { id: "monday", label: "Monday Tasks", detail: "Complete all", icon: "M" },
  { id: "tuesday", label: "Tuesday Plan", detail: "Meal plan complete", icon: "T" },
  { id: "wednesday", label: "Wednesday", detail: "Ordering complete", icon: "W" },
  { id: "thursday", label: "Thursday", detail: "Orders complete", icon: "T" },

  { id: "perfect-supper", label: "Perfect Supper", detail: "Monitoring", icon: "🌙", requiresSupper: true },
  { id: "supper-monitoring-1", label: "Supper", detail: "Complete 1 monitoring", icon: "🌙", requiresSupper: true },
  { id: "supper-monitorings-3", label: "Supper", detail: "3 monitorings", icon: "3️⃣", requiresSupper: true },

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

  const eligibleGoals = BINGO_GOAL_POOL.filter((goal) => {
    if (isSpecialEd && goal.requiresSupper) {
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

function getBingoGateIndexes() {
  return new Set(BINGO_LINES.map((line) => line[line.length - 1]));
}

function buildVisibleCompletedGoals(
  verifiedGoalIds,
  claimedGateGoalIds,
  bingoCard
) {
  const visible = new Set(verifiedGoalIds);
  const gateIndexes = getBingoGateIndexes();

  gateIndexes.forEach((squareIndex) => {
    const square = bingoCard[squareIndex];

    if (
      square &&
      verifiedGoalIds.has(square.id) &&
      !claimedGateGoalIds.has(square.id)
    ) {
      visible.delete(square.id);
    }
  });

  return visible;
}

function getReadyGateGoalIds(
  verifiedGoalIds,
  visibleCompletedGoalIds,
  claimedGateGoalIds,
  bingoCard
) {
  const ready = new Set();

  BINGO_LINES.forEach((line) => {
    const gateIndex = line[line.length - 1];
    const gateSquare = bingoCard[gateIndex];

    if (!gateSquare) {
      return;
    }

    if (!verifiedGoalIds.has(gateSquare.id)) {
      return;
    }

    if (claimedGateGoalIds.has(gateSquare.id)) {
      return;
    }

    const otherSquaresComplete = line
      .slice(0, -1)
      .every((squareIndex) =>
        visibleCompletedGoalIds.has(bingoCard[squareIndex].id)
      );

    if (otherSquaresComplete) {
      ready.add(gateSquare.id);
    }
  });

  return ready;
}

const LABOR_TARGETS = {
  secondary: { min: 18, max: 20 },
  elementary_prep: { min: 20, max: 22 },
  elementary_nnc: { min: 24, max: 25 },
};

function previousWeekday(date) {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);

  while (previous.getDay() === 0 || previous.getDay() === 6) {
    previous.setDate(previous.getDate() - 1);
  }

  return previous;
}

function dateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function calculateWeekdayStreak(completedDates) {
  if (!completedDates.size) {
    return 0;
  }

  const sorted = Array.from(completedDates).sort().reverse();
  let expected = new Date(`${sorted[0]}T12:00:00`);
  let streak = 0;

  while (streak < 100) {
    const expectedString = dateString(expected);

    if (!completedDates.has(expectedString)) {
      break;
    }

    streak += 1;
    expected = previousWeekday(expected);
  }

  return streak;
}

function hasPerfectFiveDayWeek(completedDates) {
  const dates = Array.from(completedDates).sort();

  for (const serviceDate of dates) {
    const start = new Date(`${serviceDate}T12:00:00`);

    if (start.getDay() !== 1) {
      continue;
    }

    let allFive = true;
    const cursor = new Date(start);

    for (let i = 0; i < 5; i += 1) {
      if (!completedDates.has(dateString(cursor))) {
        allFive = false;
        break;
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    if (allFive) {
      return true;
    }
  }

  return false;
}

const DAILY_BITES_ROTATION_START = new Date("2026-08-03T12:00:00");

function getDailyBiteRotationNumber(today = new Date()) {
  const target = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12,
    0,
    0
  );

  // Monday = 1, Wednesday = 3, Friday = 5.
  // On Tue/Thu/weekends, keep showing the most recent Bite.
  while (![1, 3, 5].includes(target.getDay())) {
    target.setDate(target.getDate() - 1);
  }

  if (target < DAILY_BITES_ROTATION_START) {
    return 0;
  }

  let rotationNumber = 0;
  const cursor = new Date(DAILY_BITES_ROTATION_START);

  while (cursor < target) {
    cursor.setDate(cursor.getDate() + 1);

    if ([1, 3, 5].includes(cursor.getDay())) {
      rotationNumber += 1;
    }
  }

  return rotationNumber;
}

function getTodaysDailyBite() {
  if (!DAILY_BITES.length) {
    return null;
  }

  const rotationNumber = getDailyBiteRotationNumber(new Date());
  return DAILY_BITES[rotationNumber % DAILY_BITES.length];
}

function formatBiteCategory(category) {
  if (!category) {
    return "";
  }

  return category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function DailyBitesPage({ location, employee, onBack }) {
  const todaysBite = useMemo(() => getTodaysDailyBite(), []);

  const schoolBingoCard = useMemo(
    () => buildSchoolBingoCard(location),
    [location?.id, location?.location_code, location?.labor_type]
  );

  const [completedGoalIds, setCompletedGoalIds] = useState(new Set(["free"]));
  const [bingoLoading, setBingoLoading] = useState(true);
  const [bingoError, setBingoError] = useState("");
  const [completedLineIndexes, setCompletedLineIndexes] = useState([]);
  const [earnedMilestones, setEarnedMilestones] = useState(new Set());
  const [blackoutEarned, setBlackoutEarned] = useState(false);
  const [celebratingSquareIndexes, setCelebratingSquareIndexes] = useState(new Set());
  const [celebrationMessage, setCelebrationMessage] = useState("");
  const [readyGateGoalIds, setReadyGateGoalIds] = useState(new Set());
  const [claimingGoalId, setClaimingGoalId] = useState("");

  useEffect(() => {
    async function awardDailyVisitPoint() {
      if (!location?.id) {
        return;
      }

      const today = dateString(new Date());

      await awardSparkPoints({
        locationId: location.id,
        points: 1,
        pointType: "daily_bites_visit",
        description: "Visited Daily Bites",
        serviceDate: today,
        employeeId: employee?.id || null,
        employeeName: employee?.employee_name || "Covering Employee",
        uniqueKey: `daily-bites-${location.id}-${today}`,
      });
    }

    awardDailyVisitPoint();
  }, [location?.id, employee?.id, employee?.employee_name]);

  useEffect(() => {
    if (!location?.id) {
      return;
    }

    loadBingoProgress();
  }, [location?.id, location?.labor_type]);

  useEffect(() => {
    if (!celebrationMessage) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setCelebrationMessage("");
      setCelebratingSquareIndexes(new Set());
    }, 4500);

    return () => window.clearTimeout(timer);
  }, [celebrationMessage]);

  async function claimBingoGateSquare(square, squareIndex) {
    if (!square || !readyGateGoalIds.has(square.id) || claimingGoalId) {
      return;
    }

    setClaimingGoalId(square.id);
    setBingoError("");

    const completedAfterClick = new Set(completedGoalIds);
    completedAfterClick.add(square.id);

    const linesAfterClick = getCompletedBingoLines(
      completedAfterClick,
      schoolBingoCard
    );

    const newlyCompletedLineCount = Math.max(
      0,
      linesAfterClick.length - completedLineIndexes.length
    );

    setCelebratingSquareIndexes(new Set([squareIndex]));

    if (newlyCompletedLineCount > 0) {
      setCelebrationMessage(
        `🎉 BINGO! ${newlyCompletedLineCount} new line${
          newlyCompletedLineCount === 1 ? "" : "s"
        } completed!`
      );
    }

    try {
      const uniqueKey =
        `${CARD_ONE_KEY}-square-claim-${location.id}-${square.id}`;

      const { error } = await supabase.from("spark_points").insert({
        location_id: location.id,
        points: 0,
        point_type: "bingo_square_claim",
        description: square.id,
        service_date: dateString(new Date()),
        source: "bingo",
        awarded_by: employee?.employee_name || "Covering Employee",
        unique_key: uniqueKey,
      });

      if (error && error.code !== "23505") {
        throw error;
      }

      await loadBingoProgress();
    } catch (error) {
      console.error("Bingo square claim error:", error);
      setBingoError(error.message || "Could not complete the Bingo square.");
    } finally {
      setClaimingGoalId("");
    }
  }

  async function awardBingoRewards(completed, existingPointRows, bingoCard) {
    const completedLines = getCompletedBingoLines(completed, bingoCard);
    const milestoneCount = Math.min(completedLines.length, 5);
    const earned = new Set();
    const newlyAwarded = [];

    for (let milestone = 1; milestone <= 5; milestone += 1) {
      const uniqueKey = `${CARD_ONE_KEY}-line-${location.id}-${milestone}`;

      const alreadyExists = existingPointRows.some(
        (row) =>
          row.point_type === "bingo_line_reward" &&
          row.unique_key === uniqueKey
      );

      if (alreadyExists) {
        earned.add(milestone);
      }
    }

    for (let milestone = 1; milestone <= milestoneCount; milestone += 1) {
      if (earned.has(milestone)) {
        continue;
      }

      const points = BINGO_LINE_REWARDS[milestone - 1];
      const uniqueKey = `${CARD_ONE_KEY}-line-${location.id}-${milestone}`;

      await awardSparkPoints({
        locationId: location.id,
        points,
        pointType: "bingo_line_reward",
        description: `SPARK Bingo Card 1 — ${milestone} line${milestone === 1 ? "" : "s"}`,
        serviceDate: dateString(new Date()),
        employeeId: employee?.id || null,
        employeeName: employee?.employee_name || "Covering Employee",
        uniqueKey,
      });

      earned.add(milestone);
      newlyAwarded.push(points);
    }

    const blackoutComplete = bingoCard.every((square) => completed.has(square.id));
    const blackoutKey = `${CARD_ONE_KEY}-blackout-${location.id}`;

    const blackoutAlreadyExists = existingPointRows.some(
      (row) =>
        row.point_type === "bingo_blackout_reward" &&
        row.unique_key === blackoutKey
    );

    let newBlackoutAward = false;

    if (blackoutComplete && !blackoutAlreadyExists) {
      await awardSparkPoints({
        locationId: location.id,
        points: BLACKOUT_BONUS,
        pointType: "bingo_blackout_reward",
        description: "SPARK Bingo Card 1 — BLACKOUT",
        serviceDate: dateString(new Date()),
        employeeId: employee?.id || null,
        employeeName: employee?.employee_name || "Covering Employee",
        uniqueKey: blackoutKey,
      });

      newBlackoutAward = true;
    }

    setCompletedLineIndexes(completedLines);
    setEarnedMilestones(earned);
    setBlackoutEarned(blackoutComplete || blackoutAlreadyExists);

    if (newBlackoutAward) {
      setCelebratingSquareIndexes(
        new Set(bingoCard.map((_, index) => index))
      );
      setCelebrationMessage(
        `🏆 BLACKOUT! All 25 squares complete — +${BLACKOUT_BONUS} SPARK Points`
      );
    } else if (newlyAwarded.length > 0) {
      const newestMilestone = milestoneCount;
      const totalNewPoints = newlyAwarded.reduce(
        (total, points) => total + points,
        0
      );

      const squareIndexes = new Set();

      completedLines.slice(0, newestMilestone).forEach((lineIndex) => {
        BINGO_LINES[lineIndex].forEach((squareIndex) => {
          squareIndexes.add(squareIndex);
        });
      });

      setCelebratingSquareIndexes(squareIndexes);
      setCelebrationMessage(
        `🎉 BINGO! ${newestMilestone} line${newestMilestone === 1 ? "" : "s"} complete — +${totalNewPoints} SPARK Points`
      );
    }
  }

  async function loadBingoProgress() {
    setBingoLoading(true);
    setBingoError("");

    try {
      const [
        finishLineResult,
        mealCountResult,
        pointsResult,
        laborResult,
      ] = await Promise.all([
        supabase
          .from("finish_line_checks")
          .select(
            `
              id,
              service_date,
              status,
              finish_line_items (
                item_key,
                answer
              )
            `
          )
          .eq("location_id", location.id)
          .gte("service_date", CARD_ONE_START)
          .lte("service_date", CARD_ONE_END)
          .order("service_date", { ascending: true }),

        supabase
          .from("meal_counts")
          .select(
            "service_date, breakfast_count, lunch_count, supper_count, supper_status"
          )
          .eq("location_id", location.id)
          .gte("service_date", CARD_ONE_START)
          .lte("service_date", CARD_ONE_END)
          .order("service_date", { ascending: true }),

        supabase
          .from("spark_points")
          .select("point_type, description, service_date, source, unique_key")
          .eq("location_id", location.id)
          .gte("service_date", CARD_ONE_START)
          .lte("service_date", CARD_ONE_END)
          .order("service_date", { ascending: true }),

        supabase
          .from("labor_hours")
          .select(
            "service_date, additional_worker_hours, manager_overtime_hours"
          )
          .eq("location_id", location.id)
          .gte("service_date", CARD_ONE_START)
          .lte("service_date", CARD_ONE_END)
          .order("service_date", { ascending: true }),
      ]);

      if (finishLineResult.error) {
        throw finishLineResult.error;
      }

      if (mealCountResult.error) {
        throw mealCountResult.error;
      }

      if (pointsResult.error) {
        throw pointsResult.error;
      }

      if (laborResult.error) {
        throw laborResult.error;
      }

      const finishRows = finishLineResult.data || [];
      const mealRows = mealCountResult.data || [];
      const pointRows = pointsResult.data || [];
      const laborRows = laborResult.data || [];

      const completed = new Set(["free"]);

      // ---------------------------------------------------------
      // FINISH LINE COUNTS + STREAKS
      // ---------------------------------------------------------
      const completeFinishDates = new Set(
        finishRows
          .filter((row) => row.status === "complete")
          .map((row) => row.service_date)
      );

      const finishCount = completeFinishDates.size;

      if (finishCount >= 3) {
        completed.add("finish-line-3");
      }

      if (finishCount >= 5) {
        completed.add("finish-line-5");
      }

      if (finishCount >= 7) {
        completed.add("finish-line-7");
      }

      if (finishCount >= 10) {
        completed.add("finish-line-10");
      }

      if (finishCount >= 15) {
        completed.add("finish-line-15");
      }

      if (finishCount >= 20) {
        completed.add("finish-line-20");
      }

      const finishStreak = calculateWeekdayStreak(completeFinishDates);

      if (finishStreak >= 3) {
        completed.add("finish-streak-3");
      }

      if (finishStreak >= 5) {
        completed.add("finish-streak-5");
      }

      if (hasPerfectFiveDayWeek(completeFinishDates)) {
        completed.add("perfect-week");
      }

      // ---------------------------------------------------------
      // FINISH LINE ITEM GOALS
      // ---------------------------------------------------------
      function countYesItem(itemKey) {
        return finishRows.filter((row) =>
          (row.finish_line_items || []).some(
            (item) => item.item_key === itemKey && item.answer === "yes"
          )
        ).length;
      }

      function hasYesItem(itemKey) {
        return countYesItem(itemKey) > 0;
      }

      const productionRecordCount = countYesItem("production_record");

      if (productionRecordCount >= 3) {
        completed.add("production-record-3");
      }

      if (productionRecordCount >= 5) {
        completed.add("production-record-5");
      }

      if (productionRecordCount >= 10) {
        completed.add("production-record-10");
      }

      if (countYesItem("production_worksheet") >= 5) {
        completed.add("production-worksheet-5");
      }

      if (countYesItem("reports_reviewed") >= 5) {
        completed.add("reports-reviewed-5");
      }

      if (countYesItem("meal_count_entered") >= 5) {
        completed.add("finish-meal-count-5");
      }

      const mondayMissingMealComplete = hasYesItem(
        "monday_missing_meal_report"
      );
      const mondayMealCountsComplete = hasYesItem(
        "monday_all_meal_counts_entered"
      );

      if (mondayMissingMealComplete && mondayMealCountsComplete) {
        completed.add("monday");
      }

      if (hasYesItem("tuesday_meal_plan")) {
        completed.add("tuesday");
      }

      if (hasYesItem("wednesday_order_status")) {
        completed.add("wednesday");
      }

      if (hasYesItem("thursday_orders_complete")) {
        completed.add("thursday");
      }

      if (hasYesItem("month_end_inventory")) {
        completed.add("inventory");
      }

      // ---------------------------------------------------------
      // MEAL COUNT GOALS
      // A saved meal-count row counts as an entered day.
      // ---------------------------------------------------------
      const mealCountDays = new Set(
        mealRows.map((row) => row.service_date)
      ).size;

      if (mealCountDays >= 3) {
        completed.add("meal-counts-3");
      }

      if (mealCountDays >= 5) {
        completed.add("meal-counts-5");
      }

      if (mealCountDays >= 7) {
        completed.add("meal-counts-7");
      }

      if (mealCountDays >= 10) {
        completed.add("meal-counts-10");
      }

      if (mealCountDays >= 15) {
        completed.add("meal-counts-15");
      }

      // ---------------------------------------------------------
      // DAILY BITES GOALS
      // Unique service dates only.
      // ---------------------------------------------------------
      const dailyBitesDates = new Set(
        pointRows
          .filter((row) => row.point_type === "daily_bites_visit")
          .map((row) => row.service_date)
      );

      if (dailyBitesDates.size >= 3) {
        completed.add("daily-bites-3");
      }

      if (dailyBitesDates.size >= 5) {
        completed.add("daily-bites-5");
      }

      if (dailyBitesDates.size >= 7) {
        completed.add("daily-bites-7");
      }

      if (dailyBitesDates.size >= 10) {
        completed.add("daily-bites-10");
      }

      // ---------------------------------------------------------
      // MONITORING GOALS
      // ---------------------------------------------------------
      const monitoringRows = pointRows.filter((row) =>
        String(row.point_type || "").startsWith("monitoring_")
      );

      if (monitoringRows.length >= 1) {
        completed.add("monitoring-1");
      }

      const perfectBreakfast = monitoringRows.some(
        (row) =>
          row.point_type === "monitoring_breakfast" &&
          String(row.description || "").toLowerCase().includes("perfect")
      );

      const perfectLunch = monitoringRows.some(
        (row) =>
          row.point_type === "monitoring_lunch" &&
          String(row.description || "").toLowerCase().includes("perfect")
      );

      const perfectSupper = monitoringRows.some(
        (row) =>
          row.point_type === "monitoring_supper" &&
          String(row.description || "").toLowerCase().includes("perfect")
      );

      if (perfectBreakfast) {
        completed.add("perfect-bic");
      }

      if (perfectLunch) {
        completed.add("perfect-lunch");
      }

      if (perfectSupper) {
        completed.add("perfect-supper");
      }

      const supperMonitoringCount = monitoringRows.filter(
        (row) => row.point_type === "monitoring_supper"
      ).length;

      if (supperMonitoringCount >= 1) {
        completed.add("supper-monitoring-1");
      }

      if (supperMonitoringCount >= 3) {
        completed.add("supper-monitorings-3");
      }

      const breakfastMonitoringCount = monitoringRows.filter(
        (row) => row.point_type === "monitoring_breakfast"
      ).length;

      const lunchMonitoringCount = monitoringRows.filter(
        (row) => row.point_type === "monitoring_lunch"
      ).length;

      const isSpecialEd = location?.labor_type === "special_ed";

      const allRequiredMonitoringsDone = isSpecialEd
        ? breakfastMonitoringCount >= 1 && lunchMonitoringCount >= 1
        : breakfastMonitoringCount >= 1 &&
          lunchMonitoringCount >= 1 &&
          supperMonitoringCount >= 3;

      if (allRequiredMonitoringsDone) {
        completed.add("all-monitorings");
      }

      // ---------------------------------------------------------
      // LABOR ADJUSTMENT GOAL
      // A saved labor row means the manager entered/reviewed labor.
      // ---------------------------------------------------------
      if (laborRows.length >= 1) {
        completed.add("labor-adjustment");
      }

      if (laborRows.length >= 3) {
        completed.add("labor-adjustment-3");
      }

      // ---------------------------------------------------------
      // MPLH GOALS
      // Count days at or above the minimum target.
      // ---------------------------------------------------------
      const target = LABOR_TARGETS[location?.labor_type] || null;
      const laborByDate = new Map(
        laborRows.map((row) => [row.service_date, row])
      );

      let mplhTargetDays = 0;

      if (target) {
        mealRows.forEach((mealRow) => {
          const laborRow = laborByDate.get(mealRow.service_date);

          const breakfast = Number(mealRow.breakfast_count) || 0;
          const lunch = Number(mealRow.lunch_count) || 0;
          const supper =
            mealRow.supper_status === "pending"
              ? 0
              : Number(mealRow.supper_count) || 0;

          const baselineLabor = Number(location?.budget_labor_hours) || 0;
          const additionalWorkerHours =
            Number(laborRow?.additional_worker_hours) || 0;
          const managerOvertimeHours =
            Number(laborRow?.manager_overtime_hours) || 0;

          const actualLaborHours =
            baselineLabor + additionalWorkerHours + managerOvertimeHours;

          if (actualLaborHours <= 0) {
            return;
          }

          const mealEquivalents = breakfast * 0.66 + lunch + supper;
          const mplh = mealEquivalents / actualLaborHours;

          if (mplh >= target.min) {
            mplhTargetDays += 1;
          }
        });
      }

      if (mplhTargetDays >= 2) {
        completed.add("mplh-2");
      }

      if (mplhTargetDays >= 3) {
        completed.add("mplh-3");
      }

      if (mplhTargetDays >= 5) {
        completed.add("mplh-5");
      }

      const claimedGateGoalIds = new Set(
        pointRows
          .filter((row) => row.point_type === "bingo_square_claim")
          .map((row) => row.description)
          .filter(Boolean)
      );

      const visibleCompleted = buildVisibleCompletedGoals(
        completed,
        claimedGateGoalIds,
        schoolBingoCard
      );

      const readyGates = getReadyGateGoalIds(
        completed,
        visibleCompleted,
        claimedGateGoalIds,
        schoolBingoCard
      );

      setCompletedGoalIds(visibleCompleted);
      setReadyGateGoalIds(readyGates);

      await awardBingoRewards(
        visibleCompleted,
        pointRows,
        schoolBingoCard
      );
    } catch (error) {
      console.error("SPARK Bingo progress error:", error);
      setBingoError(error.message || "Could not load Bingo progress.");
      setCompletedGoalIds(new Set(["free"]));
      setCompletedLineIndexes([]);
      setEarnedMilestones(new Set());
      setBlackoutEarned(false);
      setReadyGateGoalIds(new Set());
    } finally {
      setBingoLoading(false);
    }
  }

  const bingoSquares = useMemo(
    () =>
      schoolBingoCard.map((square) => ({
        ...square,
        completed: completedGoalIds.has(square.id),
        readyToClaim: readyGateGoalIds.has(square.id),
      })),
    [schoolBingoCard, completedGoalIds, readyGateGoalIds]
  );

  const completedSquares = bingoSquares.filter(
    (square) => square.completed
  ).length;

  const progressPercent = Math.round(
    (completedSquares / bingoSquares.length) * 100
  );

  const visibleLineCount = Math.min(completedLineIndexes.length, 5);

  return (
    <div className="login-app">
      <header className="login-header">
        <div className="login-brand">
          <img
            src="/spark-192.png"
            alt="SPARK"
            className="spark-header-logo"
          />

          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>
            <div className="login-brand-subtitle">DAILY BITES</div>
          </div>
        </div>

        <button type="button" className="supervisor-link" onClick={onBack}>
          ← Home Base
        </button>
      </header>

      <main className="login-main">
        <div className="school-dashboard-page">
          <div className="school-dashboard-header">
            <div>
              <div className="dashboard-small-label">
                LOCATION {location?.location_code}
              </div>

              <h1>Daily Bites</h1>

              <p>
                {location?.school_name} • {employee?.employee_name}
              </p>
            </div>
          </div>

          <section className="dashboard-card">
            <div className="school-dashboard-section-title">
              <div>
                <div className="dashboard-small-label">TODAY'S BITE</div>
                <h2>{todaysBite?.title || "Daily Bite"}</h2>
                <p>A quick nutrition fact for your day.</p>
              </div>

              {todaysBite?.category && (
                <div
                  style={{
                    padding: "7px 11px",
                    borderRadius: "999px",
                    background: "#eef7ea",
                    border: "1px solid #d4e8cc",
                    color: "#3f6838",
                    fontSize: "12px",
                    fontWeight: "800",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatBiteCategory(todaysBite.category)}
                </div>
              )}
            </div>

            {todaysBite ? (
              <div
                style={{
                  marginTop: "14px",
                  padding: "20px",
                  borderRadius: "16px",
                  background: "#fbfcf8",
                  border: "1px solid #e1e8dc",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: "#35434a",
                    fontSize: "20px",
                    fontWeight: "700",
                    lineHeight: 1.55,
                  }}
                >
                  {todaysBite.fact}
                </p>
              </div>
            ) : (
              <div className="school-empty-history">
                No Daily Bite is available yet.
              </div>
            )}

            <p
              style={{
                margin: "12px 2px 0",
                color: "#74818a",
                fontSize: "12px",
              }}
            >
              New Daily Bites rotate Monday, Wednesday, and Friday.
            </p>
          </section>

          <section className="dashboard-card spark-bingo-section">
            <div className="spark-bingo-heading">
              <div>
                <div className="dashboard-small-label">CARD 1</div>

                <h2>🎯 SPARK Bingo</h2>

                <p>
                  SPARK fills your card automatically. When the final square
                  of a Bingo line is ready, click that square to complete the
                  line and see the celebration.
                </p>
              </div>

              <div className="spark-bingo-progress-summary">
                <strong>
                  {bingoLoading ? "..." : `${completedSquares} / 25`}
                </strong>
                <span>
                  {blackoutEarned
                    ? "BLACKOUT!"
                    : visibleLineCount > 0
                    ? `${visibleLineCount} Bingo Line${visibleLineCount === 1 ? "" : "s"}`
                    : "Squares Complete"}
                </span>
              </div>
            </div>

            <div className="spark-bingo-progress-track" aria-hidden="true">
              <div
                className="spark-bingo-progress-fill"
                style={{ width: `${bingoLoading ? 0 : progressPercent}%` }}
              />
            </div>

            {celebrationMessage && (
              <div
                className="school-empty-history spark-bingo-line-celebration"
                style={{
                  marginBottom: "16px",
                  fontWeight: "800",
                  color: "#1f6a35",
                  background: "#f0faf2",
                  border: "1px solid #78be7a",
                }}
              >
                {celebrationMessage}
              </div>
            )}

            {bingoError && (
              <div className="login-error" style={{ marginBottom: "14px" }}>
                Bingo progress could not fully load: {bingoError}
              </div>
            )}

            <div className="spark-bingo-board-wrap">
              <div className="spark-bingo-board">
                {bingoSquares.map((square, squareIndex) => {
                  const isComplete = Boolean(square.completed);
                  const isReady = Boolean(square.readyToClaim);
                  const isClaiming = claimingGoalId === square.id;

                  const className = [
                    "spark-bingo-square",
                    isComplete ? "spark-bingo-square-complete" : "",
                    celebratingSquareIndexes.has(squareIndex)
                      ? "spark-bingo-pop"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  const squareContent = (
                    <>
                      <div className="spark-bingo-square-icon">
                        {square.icon}
                      </div>

                      <strong>{square.label}</strong>

                      <span>
                        {isReady
                          ? isClaiming
                            ? "Completing..."
                            : "READY — click to complete"
                          : square.detail}
                      </span>

                      {isComplete && (
                        <div
                          className="spark-bingo-check"
                          aria-label="Complete"
                        >
                          ✓
                        </div>
                      )}

                      {isReady && !isComplete && (
                        <div
                          style={{
                            position: "absolute",
                            top: "7px",
                            right: "7px",
                            padding: "4px 7px",
                            borderRadius: "999px",
                            background: "#e5a92b",
                            color: "#ffffff",
                            fontSize: "10px",
                            fontWeight: "900",
                            letterSpacing: "0.04em",
                          }}
                        >
                          READY
                        </div>
                      )}
                    </>
                  );

                  if (isReady && !isComplete) {
                    return (
                      <button
                        key={square.id}
                        type="button"
                        className={className}
                        disabled={Boolean(claimingGoalId)}
                        onClick={() =>
                          claimBingoGateSquare(square, squareIndex)
                        }
                        style={{
                          width: "100%",
                          font: "inherit",
                          cursor: claimingGoalId ? "wait" : "pointer",
                          appearance: "none",
                          outline: "none",
                          boxShadow: "0 0 0 3px rgba(229, 169, 43, 0.14)",
                        }}
                      >
                        {squareContent}
                      </button>
                    );
                  }

                  return (
                    <div key={square.id} className={className}>
                      {squareContent}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="spark-bingo-rewards">
              {[1, 2, 3, 4, 5].map((milestone) => {
                const earned =
                  earnedMilestones.has(milestone) ||
                  visibleLineCount >= milestone;

                return (
                  <div
                    key={milestone}
                    style={earned ? { background: "#eef8ea" } : undefined}
                  >
                    <strong>
                      {milestone} Line{milestone === 1 ? "" : "s"}
                    </strong>
                    <span>
                      {earned
                        ? "✓ Earned"
                        : `+${BINGO_LINE_REWARDS[milestone - 1]} points`}
                    </span>
                  </div>
                );
              })}
            </div>

            <div
              className="spark-bingo-blackout"
              style={{
                marginTop: "12px",
                padding: "14px",
                borderRadius: "14px",
                textAlign: "center",
                fontWeight: "800",
                border: blackoutEarned
                  ? "1px solid #72b56f"
                  : "1px solid #e2c994",
                background: blackoutEarned ? "#eef8ea" : "#fff8e8",
                color: blackoutEarned ? "#1f6a35" : "#4c3a1e",
              }}
            >
              {blackoutEarned
                ? "🏆 BLACKOUT COMPLETE • +100 points earned"
                : "🏆 BLACKOUT • Complete all 25 squares • +100 points"}
            </div>

            <p className="spark-bingo-note">
              This Card 1 is unique to your school and stays the same through
              December 31. Regular squares complete automatically. A final
              line-completing square waits for your click so you get to see the
              Bingo celebration. Rewards and blackout are still awarded only
              once.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

export default DailyBitesPage;
