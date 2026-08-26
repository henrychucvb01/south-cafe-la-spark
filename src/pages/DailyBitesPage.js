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

          <section
            className="dashboard-card"
            style={{
              overflow: "hidden",
              background: "#ffffff",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "20px",
                flexWrap: "wrap",
                marginBottom: "14px",
              }}
            >
              <div style={{ flex: "1 1 420px" }}>
                <div className="dashboard-small-label">CARD 1</div>

                <h2
                  style={{
                    margin: "4px 0 4px",
                    color: "#243541",
                  }}
                >
                  🎯 SPARK Bingo
                </h2>

                <p
                  style={{
                    margin: 0,
                    color: "#667482",
                    lineHeight: 1.5,
                  }}
                >
                  Complete your regular SPARK work and your Bingo card fills in
                  automatically. No boxes to check.
                </p>
              </div>

              <div
                style={{
                  minWidth: "140px",
                  padding: "12px 16px",
                  border: "1px solid #dce5ed",
                  borderRadius: "12px",
                  background: "#f7fafc",
                  textAlign: "center",
                }}
              >
                <strong
                  style={{
                    display: "block",
                    fontSize: "24px",
                    color: "#243541",
                    lineHeight: 1.1,
                  }}
                >
                  {completedSquares} / 25
                </strong>

                <span
                  style={{
                    display: "block",
                    marginTop: "5px",
                    color: "#667482",
                    fontSize: "12px",
                    fontWeight: 700,
                  }}
                >
                  Squares Complete
                </span>
              </div>
            </div>

            <div
              style={{
                height: "10px",
                borderRadius: "999px",
                background: "#e8eef3",
                overflow: "hidden",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  borderRadius: "999px",
                  background: "#51b749",
                }}
              />
            </div>

            <div
              style={{
                width: "100%",
                overflowX: "auto",
                paddingBottom: "4px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(112px, 1fr))",
                  gap: "10px",
                  minWidth: "600px",
                }}
              >
                {BINGO_CARD_ONE.map((square) => {
                  const isComplete = Boolean(square.completed);

                  return (
                    <div
                      key={square.id}
                      style={{
                        position: "relative",
                        minHeight: "112px",
                        padding: "14px 10px 12px",
                        border: isComplete
                          ? "1px solid #78be7a"
                          : "1px solid #d8e2e9",
                        borderRadius: "12px",
                        background: isComplete ? "#f0faf2" : "#ffffff",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "center",
                        alignItems: "center",
                        textAlign: "center",
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          marginBottom: "7px",
                          fontSize: "22px",
                          lineHeight: 1,
                        }}
                      >
                        {square.icon}
                      </div>

                      <strong
                        style={{
                          color: isComplete ? "#1f6330" : "#243541",
                          fontSize: "14px",
                          lineHeight: 1.2,
                        }}
                      >
                        {square.label}
                      </strong>

                      <span
                        style={{
                          marginTop: "5px",
                          color: "#71808c",
                          fontSize: "12px",
                          lineHeight: 1.25,
                        }}
                      >
                        {square.detail}
                      </span>

                      {isComplete && (
                        <div
                          aria-label="Complete"
                          style={{
                            position: "absolute",
                            top: "7px",
                            right: "7px",
                            width: "23px",
                            height: "23px",
                            borderRadius: "50%",
                            background: "#51b749",
                            color: "#ffffff",
                            display: "grid",
                            placeItems: "center",
                            fontSize: "14px",
                            fontWeight: 900,
                          }}
                        >
                          ✓
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                marginTop: "20px",
                border: "1px solid #dce5ed",
                borderRadius: "12px",
                overflow: "hidden",
                background: "#f8fafb",
              }}
            >
              {[
                ["1 Line", "+10 points"],
                ["2 Lines", "+20 points"],
                ["3 Lines", "+30 points"],
                ["4 Lines", "+40 points"],
                ["5 Lines", "+50 points"],
              ].map(([title, reward]) => (
                <div
                  key={title}
                  style={{
                    padding: "12px 10px",
                    textAlign: "center",
                    borderRight: "1px solid #dce5ed",
                  }}
                >
                  <strong
                    style={{
                      display: "block",
                      color: "#263944",
                      fontSize: "14px",
                    }}
                  >
                    {title}
                  </strong>

                  <span
                    style={{
                      display: "block",
                      marginTop: "3px",
                      color: "#5d6f7b",
                      fontSize: "12px",
                    }}
                  >
                    {reward}
                  </span>
                </div>
              ))}
            </div>

            <p
              style={{
                margin: "14px 0 0",
                color: "#667482",
                fontSize: "13px",
                textAlign: "center",
              }}
            >
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
