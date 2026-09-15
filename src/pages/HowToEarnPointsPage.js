import React from "react";

function HowToEarnPointsPage({ onBack }) {
  return (
    <div className="login-app" style={{ minHeight: "100vh", background: "#f5f7fa" }}>
      {/* HEADER */}
      <header className="login-header">
        <div className="login-brand">
          <div className="login-logo spark-login-logo">
            <img src="/spark-192.png" alt="Spark" />
          </div>
          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>
            <div className="login-brand-subtitle">SPARK REWARDS GUIDE</div>
          </div>
        </div>
        <button type="button" className="homebase-exit-button" onClick={onBack}>
          ← Back to Manager Resources
        </button>
      </header>

      {/* CONTENT */}
      <main style={{ maxWidth: "860px", margin: "0 auto", padding: "24px 16px 60px" }}>
        
        {/* HERO */}
        <div style={{
          background: "linear-gradient(135deg, #183b56 0%, #0d233a 100%)",
          borderRadius: "14px",
          padding: "28px 24px",
          color: "#fff",
          marginBottom: "24px",
          boxShadow: "0 6px 18px rgba(0,0,0,0.12)"
        }}>
          <span style={{ fontSize: "11px", letterSpacing: "1.5px", fontWeight: "800", color: "#f7b731", textTransform: "uppercase" }}>
            REWARDS &amp; RECOGNITION
          </span>
          <h1 style={{ margin: "6px 0 10px", fontSize: "28px", fontWeight: "900", color: "#fff" }}>
            How to Earn SPARK Points
          </h1>
          <p style={{ margin: 0, fontSize: "15px", lineHeight: "1.5", color: "#dbe4ee", maxWidth: "700px" }}>
            SPARK points belong to your <strong>school</strong>. Earn points by completing daily operations, maintaining strong performance, participating in SPARK activities, and building streaks throughout the year.
          </p>
        </div>

        {/* SECTION 1: DAILY OPERATIONS & FINISH LINE */}
        <div style={{
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e1e6ed",
          padding: "22px",
          marginBottom: "20px"
        }}>
          <h2 style={{ fontSize: "18px", margin: "0 0 16px", color: "#192a3e", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📋</span> Daily Operations
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
            {/* Meal Counts */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
              <strong style={{ display: "block", color: "#2d3748", marginBottom: "10px", fontSize: "15px" }}>
                Meal Counts
              </strong>
              <ul style={{ margin: 0, paddingLeft: "18px", color: "#4a5568", lineHeight: "1.8", fontSize: "14px" }}>
                <li>Breakfast Meal Count — <strong style={{ color: "#2b6cb0" }}>5 points</strong></li>
                <li>Lunch Meal Count — <strong style={{ color: "#2b6cb0" }}>5 points</strong></li>
                <li>Supper Meal Count — <strong style={{ color: "#2b6cb0" }}>5 points</strong></li>
              </ul>
            </div>

            {/* Finish Line */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
              <strong style={{ display: "block", color: "#2d3748", marginBottom: "10px", fontSize: "15px" }}>
                Finish Line Checklist
              </strong>
              <ul style={{ margin: 0, paddingLeft: "18px", color: "#4a5568", lineHeight: "1.8", fontSize: "14px" }}>
                <li>Completed on time — <strong style={{ color: "#2b6cb0" }}>5 points</strong></li>
                <li>Completed late — <strong style={{ color: "#718096" }}>2 points</strong></li>
              </ul>
            </div>
          </div>
        </div>

        {/* SECTION 2: STREAK BONUSES */}
        <div style={{
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e1e6ed",
          padding: "22px",
          marginBottom: "20px"
        }}>
          <h2 style={{ fontSize: "18px", margin: "0 0 8px", color: "#192a3e", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🔥</span> Finish Line Streak Bonuses
          </h2>
          <p style={{ margin: "0 0 14px", color: "#4a5568", fontSize: "14px" }}>
            Consistency pays off!
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
            <div style={{
              background: "#fffdf5",
              border: "1px solid #f6e05e",
              borderRadius: "10px",
              padding: "16px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "15px", color: "#744210" }}>Perfect Week</strong>
                <span style={{ background: "#ecc94b", color: "#744210", fontWeight: "800", fontSize: "12px", padding: "3px 8px", borderRadius: "6px" }}>
                  +25 PTS
                </span>
              </div>
              <p style={{ margin: "8px 0 0", color: "#744210", fontSize: "13px", lineHeight: "1.5" }}>
                Complete every required Finish Line Checklist on time for the entire operating week.
              </p>
            </div>

            <div style={{
              background: "#f7fafc",
              border: "1px solid #cbd5e0",
              borderRadius: "10px",
              padding: "16px"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: "15px", color: "#2d3748" }}>Perfect Month</strong>
                <span style={{ background: "#4299e1", color: "#fff", fontWeight: "800", fontSize: "12px", padding: "3px 8px", borderRadius: "6px" }}>
                  +100 PTS
                </span>
              </div>
              <p style={{ margin: "8px 0 0", color: "#4a5568", fontSize: "13px", lineHeight: "1.5" }}>
                Complete every required Finish Line Checklist on time for the entire operating month.
              </p>
            </div>
          </div>

          <div style={{
            marginTop: "14px",
            background: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "8px",
            padding: "10px 14px",
            fontSize: "13px",
            color: "#166534"
          }}>
            ✓ <strong>Streak Protection:</strong> Holidays, school closures, approved N/A days, and other excluded non-operating days <strong>do not break your streak</strong>.
          </div>
        </div>

        {/* SECTION 3: OTHER WAYS TO EARN */}
        <div style={{
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e1e6ed",
          padding: "22px",
          marginBottom: "20px"
        }}>
          <h2 style={{ fontSize: "18px", margin: "0 0 16px", color: "#192a3e" }}>
            Additional Ways to Earn Points
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Monitoring */}
            <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #edf2f7" }}>
              <strong style={{ fontSize: "14px", color: "#1a202c" }}>🔍 Monitoring Points</strong>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#4a5568", lineHeight: "1.5" }}>
                Schools can earn additional points from monitoring results (Breakfast, Lunch, and Supper). Bonus points may also be earned for perfect or passing monitoring results.
              </p>
            </div>

            {/* Daily Bites */}
            <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #edf2f7" }}>
              <strong style={{ fontSize: "14px", color: "#1a202c" }}>🍎 Daily Bites</strong>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#4a5568", lineHeight: "1.5" }}>
                Visit <strong>Daily Bites</strong> and participate in available activities to earn additional SPARK points.
              </p>
            </div>

            {/* SPARK Wordle */}
            <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #edf2f7" }}>
              <strong style={{ fontSize: "14px", color: "#1a202c" }}>🟩 SPARK Wordle</strong>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#4a5568", lineHeight: "1.5" }}>
                Play the daily SPARK Wordle. Solve it quickly to earn the most points (up to <strong>5 points maximum</strong>; points decrease with additional attempts).
              </p>
            </div>

            {/* SPARK Bingo */}
            <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #edf2f7" }}>
              <strong style={{ fontSize: "14px", color: "#1a202c" }}>🎯 SPARK Bingo (Jan – May)</strong>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#4a5568", lineHeight: "1.5" }}>
                During Bingo season, complete activities on your SPARK Bingo card. Each completed line awards <strong>10 points</strong>.
              </p>
            </div>

            {/* Bonus Opportunities */}
            <div style={{ padding: "12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #edf2f7" }}>
              <strong style={{ fontSize: "14px", color: "#1a202c" }}>✨ Bonus Opportunities</strong>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#4a5568", lineHeight: "1.5" }}>
                Throughout the year, surprise SPARK bonus opportunities will appear for special challenges, achievements, participation, and performance. Keep checking in!
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 4: WHAT ARE WE PLAYING FOR? */}
        <div style={{
          background: "linear-gradient(135deg, #2b6cb0 0%, #1a365d 100%)",
          borderRadius: "14px",
          padding: "24px",
          color: "#fff"
        }}>
          <h2 style={{ fontSize: "20px", margin: "0 0 14px", color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🏆</span> What Are We Playing For?
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginBottom: "18px" }}>
            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "10px", padding: "16px" }}>
              <strong style={{ display: "block", color: "#fbd38d", fontSize: "15px", marginBottom: "6px" }}>
                🏆 Monthly Champion
              </strong>
              <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.5", color: "#e2e8f0" }}>
                Compete for the top spot on the SPARK Leaderboard. The champion receives the traveling <strong>Championship Belt and Golden Apron</strong>.
              </p>
            </div>

            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "10px", padding: "16px" }}>
              <strong style={{ display: "block", color: "#fbd38d", fontSize: "15px", marginBottom: "6px" }}>
                🏆 Season Champion
              </strong>
              <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.5", color: "#e2e8f0" }}>
                Points earned all year long lead to the ultimate prize: winning the <strong>SPARK Cup</strong> and becoming season champion!
              </p>
            </div>

            <div style={{ background: "rgba(255,255,255,0.12)", borderRadius: "10px", padding: "16px" }}>
              <strong style={{ display: "block", color: "#fbd38d", fontSize: "15px", marginBottom: "6px" }}>
                🎁 SPARK Store &amp; Raffles
              </strong>
              <p style={{ margin: 0, fontSize: "13px", lineHeight: "1.5", color: "#e2e8f0" }}>
                Higher season points unlock earlier access to the <strong>SPARK Store</strong> and end-of-season raffles to pick the best rewards.
              </p>
            </div>
          </div>

          <p style={{ margin: 0, textAlign: "center", fontSize: "15px", fontWeight: "700", color: "#fefcbf" }}>
            Earn points. Climb the leaderboard. Become a SPARK Champion!
          </p>
        </div>

      </main>
    </div>
  );
}

export default HowToEarnPointsPage;
