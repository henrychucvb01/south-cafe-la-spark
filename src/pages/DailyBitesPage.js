import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { awardSparkPoints } from "../sparkPoints";

const CARD_ONE_START = "2026-08-01";
const CARD_ONE_END = "2026-12-31";

const BINGO_CARD_ONE = [
  { id: "finish-line-5", label: "Finish Line", detail: "Complete 5 days", icon: "✅" },
  { id: "daily-bites-5", label: "Daily Bites", detail: "Visit 5 days", icon: "🍎" },
  { id: "meal-counts-5", label: "Meal Counts", detail: "Enter 5 days", icon: "🍽️" },
  { id: "mplh-3", label: "MPLH Target", detail: "Hit target 3 days", icon: "📈" },
  { id: "finish-streak-5", label: "Finish Line", detail: "5-day streak", icon: "🔥" },

  { id: "perfect-week", label: "Perfect Week", detail: "Finish Line", icon: "⭐" },
  { id: "production-record-5", label: "Production Record", detail: "Complete 5 days", icon: "📋" },
  { id: "perfect-bic", label: "Perfect BIC Run", detail: "Supervisor verified", icon: "🌟" },
  { id: "monitoring-1", label: "Monitoring", detail: "Complete 1", icon: "🔎" },
  { id: "perfect-lunch", label: "Perfect Lunch", detail: "Monitoring", icon: "🥗" },

  { id: "perfect-supper", label: "Perfect Supper", detail: "Monitoring", icon: "🌙" },
  { id: "supper-monitorings-3", label: "Supper", detail: "3 monitorings", icon: "3️⃣" },
  { id: "free", label: "FREE SPACE", detail: "Already yours", icon: "✨" },
  { id: "labor-adjustment", label: "Labor", detail: "Enter adjustment", icon: "🕒" },
  { id: "inventory", label: "Inventory", detail: "Month-end complete", icon: "📦" },

  { id: "monday", label: "Monday Tasks", detail: "Complete all", icon: "M" },
  { id: "tuesday", label: "Tuesday Plan", detail: "Meal plan complete", icon: "T" },
  { id: "wednesday", label: "Wednesday", detail: "Ordering complete", icon: "W" },
  { id: "thursday", label: "Thursday", detail: "Orders complete", icon: "T" },
  { id: "finish-line-10", label: "Finish Line", detail: "Complete 10 days", icon: "🏁" },

  { id: "meal-counts-10", label: "Meal Counts", detail: "Enter 10 days", icon: "🔢" },
  { id: "daily-bites-10", label: "Daily Bites", detail: "Visit 10 days", icon: "🥕" },
  { id: "mplh-5", label: "MPLH Target", detail: "Hit target 5 days", icon: "📊" },
  { id: "finish-line-15", label: "Finish Line", detail: "Complete 15 days", icon: "🏆" },
  { id: "all-monitorings", label: "Monitorings", detail: "Complete required", icon: "✔️" },
];

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

function DailyBitesPage({ location, employee, onBack }) {
  const [completedGoalIds, setCompletedGoalIds] = useState(new Set(["free"]));
  const [bingoLoading, setBingoLoading] = useState(true);
  const [bingoError, setBingoError] = useState("");

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
  }, [location?.id]);

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
          .select("point_type, description, service_date, source")
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

      if (finishCount >= 5) {
        completed.add("finish-line-5");
      }

      if (finishCount >= 10) {
        completed.add("finish-line-10");
      }

      if (finishCount >= 15) {
        completed.add("finish-line-15");
      }

      if (calculateWeekdayStreak(completeFinishDates) >= 5) {
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

      if (countYesItem("production_record") >= 5) {
        completed.add("production-record-5");
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

      if (mealCountDays >= 5) {
        completed.add("meal-counts-5");
      }

      if (mealCountDays >= 10) {
        completed.add("meal-counts-10");
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

      if (dailyBitesDates.size >= 5) {
        completed.add("daily-bites-5");
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

      if (mplhTargetDays >= 3) {
        completed.add("mplh-3");
      }

      if (mplhTargetDays >= 5) {
        completed.add("mplh-5");
      }

      setCompletedGoalIds(completed);
    } catch (error) {
      console.error("SPARK Bingo progress error:", error);
      setBingoError(error.message || "Could not load Bingo progress.");
      setCompletedGoalIds(new Set(["free"]));
    } finally {
      setBingoLoading(false);
    }
  }

  const bingoSquares = useMemo(
    () =>
      BINGO_CARD_ONE.map((square) => ({
        ...square,
        completed: completedGoalIds.has(square.id),
      })),
    [completedGoalIds]
  );

  const completedSquares = bingoSquares.filter(
    (square) => square.completed
  ).length;

  const progressPercent = Math.round(
    (completedSquares / bingoSquares.length) * 100
  );

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
                <h2>Today's Bite</h2>
                <p>Quick ideas, reminders, and cafeteria inspiration.</p>
              </div>
            </div>

            <div className="school-empty-history">
              Daily Bites content coming next.
            </div>
          </section>

          <section className="dashboard-card spark-bingo-section">
            <div className="spark-bingo-heading">
              <div>
                <div className="dashboard-small-label">CARD 1</div>

                <h2>🎯 SPARK Bingo</h2>

                <p>
                  Complete your regular SPARK work and your Bingo card fills in
                  automatically. No boxes to check.
                </p>
              </div>

              <div className="spark-bingo-progress-summary">
                <strong>
                  {bingoLoading ? "..." : `${completedSquares} / 25`}
                </strong>
                <span>Squares Complete</span>
              </div>
            </div>

            <div className="spark-bingo-progress-track" aria-hidden="true">
              <div
                className="spark-bingo-progress-fill"
                style={{ width: `${bingoLoading ? 0 : progressPercent}%` }}
              />
            </div>

            {bingoError && (
              <div className="login-error" style={{ marginBottom: "14px" }}>
                Bingo progress could not fully load: {bingoError}
              </div>
            )}

            <div className="spark-bingo-board-wrap">
              <div className="spark-bingo-board">
                {bingoSquares.map((square) => {
                  const isComplete = Boolean(square.completed);

                  return (
                    <div
                      key={square.id}
                      className={
                        isComplete
                          ? "spark-bingo-square spark-bingo-square-complete"
                          : "spark-bingo-square"
                      }
                    >
                      <div className="spark-bingo-square-icon">
                        {square.icon}
                      </div>

                      <strong>{square.label}</strong>
                      <span>{square.detail}</span>

                      {isComplete && (
                        <div
                          className="spark-bingo-check"
                          aria-label="Complete"
                        >
                          ✓
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="spark-bingo-rewards">
              <div>
                <strong>1 Line</strong>
                <span>+10 points</span>
              </div>

              <div>
                <strong>2 Lines</strong>
                <span>+20 points</span>
              </div>

              <div>
                <strong>3 Lines</strong>
                <span>+30 points</span>
              </div>

              <div>
                <strong>4 Lines</strong>
                <span>+40 points</span>
              </div>

              <div>
                <strong>5 Lines</strong>
                <span>+50 points</span>
              </div>
            </div>

            <p className="spark-bingo-note">
              SPARK automatically verifies completed activities. Bingo line
              rewards come next.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

export default DailyBitesPage;
