import React, { useEffect } from "react";
import { awardSparkPoints } from "../sparkPoints";

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

          <section className="dashboard-card">
            <div className="school-dashboard-section-title">
              <div>
                <h2>🎯 SPARK Bingo</h2>
                <p>Your current Bingo card will live here.</p>
              </div>
            </div>

            <div className="school-empty-history">
              Bingo card coming next.
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default DailyBitesPage;
