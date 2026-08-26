import React from "react";

function HomeBase({
  location,
  employee,
  onSchoolHub,
  onIncidentHelper,
  onDailyBites,
  onExit,
}) {
  return (
    <div className="login-app">
      <header className="login-header">
        <div className="login-brand">
          <div className="login-logo spark-login-logo">
            <img src="/spark-192.png" alt="Spark" />
          </div>

          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>
            <div className="login-brand-subtitle">SPARK</div>
          </div>
        </div>

        <button type="button" className="homebase-exit-button" onClick={onExit}>
          Exit Location
        </button>
      </header>

      <main className="homebase-main">
        <section className="homebase-shell">
          <div className="homebase-welcome">
            <div>
              <div className="homebase-eyebrow">
                LOCATION {location?.location_code || ""}
              </div>

              <h1>Welcome, {employee?.employee_name || "Manager"}</h1>

              <p>{location?.school_name || "School"}</p>
            </div>

            <div className="homebase-spark-mark">✦</div>
          </div>

          <div className="homebase-intro">
            <h2>Manager Tools</h2>
            <p>
              Tools to help you stay organized and understand your operation.
            </p>
          </div>

          <div className="homebase-grid">
            <button
              type="button"
              className="homebase-card homebase-card-primary"
              onClick={onSchoolHub}
            >
              <div className="homebase-card-icon">🏫</div>

              <div className="homebase-card-body">
                <strong>School Dashboard</strong>

                <span>
                  Meal counts, trends, Finish Line Check, and daily operations.
                </span>
              </div>

              <div className="homebase-card-arrow">›</div>
            </button>

            <button
              type="button"
              className="homebase-card"
              onClick={onIncidentHelper}
            >
              <div className="homebase-card-icon">📄</div>

              <div className="homebase-card-body">
                <strong>Incident Record Helper</strong>

                <span>
                  Organize and prepare clear employee incident documentation.
                </span>
              </div>

              <div className="homebase-card-arrow">›</div>
            </button>

            <button
              type="button"
              className="homebase-card"
              onClick={onDailyBites}
            >
              <div className="homebase-card-icon">🍎</div>

              <div className="homebase-card-body">
                <strong>Daily Bites</strong>

                <span>
                  Quick tips, comics, SPARK Bingo, and school engagement.
                </span>
              </div>

              <div className="homebase-card-arrow">›</div>
            </button>

            <div className="homebase-card homebase-card-coming">
              <div className="homebase-card-icon">📚</div>

              <div className="homebase-card-body">
                <strong>Manager Resources</strong>

                <span>
                  Quick access to operational guidance and manager tools.
                </span>
              </div>

              <span className="homebase-coming-soon">Coming Soon</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="login-footer">
        SPARK • South Café LA Operations Assistant
      </footer>
    </div>
  );
}

export default HomeBase;
