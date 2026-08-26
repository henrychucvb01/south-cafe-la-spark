import React, { useEffect } from "react";
import { awardSparkPoints } from "../sparkPoints";

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
  { id: "free", label: "FREE SPACE", detail: "Already yours", icon: "✨", completed: true },
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

function DailyBitesPage({ location, employee, onBack }) {
  useEffect(() => {
    async function awardDailyVisitPoint() {
      if (!location?.id) {
        return;
      }

      const today = new Date().toISOString().split("T")[0];

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

  const completedSquares = BINGO_CARD_ONE.filter(
    (square) => square.completed
  ).length;

  const progressPercent = Math.round(
    (completedSquares / BINGO_CARD_ONE.length) * 100
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
                <strong>{completedSquares} / 25</strong>
                <span>Squares Complete</span>
              </div>
            </div>

            <div className="spark-bingo-progress-track" aria-hidden="true">
              <div
                className="spark-bingo-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="spark-bingo-board-wrap">
              <div className="spark-bingo-board">
                {BINGO_CARD_ONE.map((square) => {
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
              SPARK will automatically verify completed activities. Line rewards
              will be added automatically in the next step.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

export default DailyBitesPage;
