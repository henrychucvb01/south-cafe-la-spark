import React, { useEffect, useMemo, useState } from "react";
import { buildSchoolScorecard } from "./monthlyScorecardCalculations";
import { loadManagerMonthlyScorecardDataset } from "./monthlyScorecardService";
import MonthlySchoolScorecard from "./MonthlySchoolScorecard";
import "./monthlyScorecards.css";

const dateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const monthLabel = (month) => new Date(`${month.slice(0, 7)}-01T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

const schoolYearFor = (month) => {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const start = monthNumber >= 7 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
};

export function getManagerMonthRange(month, dataset, today = new Date()) {
  const prefix = month.slice(0, 7);
  const currentPrefix = dateString(today).slice(0, 7);
  const candidates = [
    ...(dataset.meal_counts || []).map((row) => row.service_date),
    ...(dataset.labor_hours || []).map((row) => row.service_date),
    ...(dataset.production_rows || []).map((row) => row.production_date),
    ...(dataset.cost_rows || []).map((row) => row.production_date),
  ].filter((value) => String(value || "").slice(0, 7) === prefix).sort();
  const lastDay = new Date(Number(prefix.slice(0, 4)), Number(prefix.slice(5, 7)), 0).getDate();
  if (prefix === currentPrefix) {
    return { startDate: candidates[0] || `${prefix}-01`, endDate: dateString(today) };
  }
  return {
    startDate: candidates[0] || `${prefix}-01`,
    endDate: candidates[candidates.length - 1] || `${prefix}-${String(lastDay).padStart(2, "0")}`,
  };
}

export default function ManagerMonthlyScorecardPage({ location, employee, managerPin, onBack }) {
  const currentMonth = dateString(new Date()).slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    loadManagerMonthlyScorecardDataset({
      managerPin,
      employeeId: employee?.id,
      locationId: location?.id,
      schoolYear: schoolYearFor(selectedMonth),
      reportingMonth: `${selectedMonth}-01`,
    }).then((result) => {
      if (!active) return;
      setDataset(result);
    }).catch((reason) => {
      if (!active) return;
      setError(reason.message || "Your monthly scorecard could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [employee?.id, location?.id, managerPin, selectedMonth]);

  const months = useMemo(() => {
    const values = new Set([currentMonth, ...((dataset?.available_months || []).map((value) => String(value).slice(0, 7)))]);
    return [...values].filter((value) => value <= currentMonth).sort().reverse();
  }, [currentMonth, dataset]);
  const range = useMemo(() => dataset ? getManagerMonthRange(selectedMonth, dataset) : null, [dataset, selectedMonth]);
  const card = useMemo(() => {
    const school = dataset?.schools?.[0];
    return school && range ? buildSchoolScorecard(school, dataset, range) : null;
  }, [dataset, range]);

  return (
    <div className="login-app" style={{ minHeight: "100vh", background: "#f4f7fa" }}>
      <header className="login-header">
        <div className="login-brand">
          <div className="login-logo spark-login-logo"><img src="/spark-192.png" alt="SPARK" /></div>
          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>
            <div className="login-brand-subtitle">MONTHLY SCORECARD</div>
          </div>
        </div>
        <button type="button" className="homebase-exit-button" onClick={onBack}>← Back to Home Base</button>
      </header>
      <main>
        <section className="monthly-scorecards">
          <div className="monthly-scorecards-heading">
            <div>
              <span className="monthly-kicker">MANAGER TOOLS</span>
              <h3>Monthly Scorecard</h3>
              <p>{location?.school_name || "Your school"} performance and management focus.</p>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, fontWeight: 800 }}>
              Month
              <select value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} style={{ padding: "9px 12px", borderRadius: 6, border: "1px solid #d4dde5" }}>
                {months.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}
              </select>
            </label>
          </div>
          {loading && <div className="monthly-scorecard-loading">Loading your monthly scorecard...</div>}
          {error && <div className="monthly-alert error" role="alert">{error}</div>}
          {!loading && !error && card && <MonthlySchoolScorecard card={card} onBack={onBack} showToolbar={false} />}
          {!loading && !error && !card && <div className="monthly-alert error">No scorecard data is available for this location.</div>}
        </section>
      </main>
    </div>
  );
}
