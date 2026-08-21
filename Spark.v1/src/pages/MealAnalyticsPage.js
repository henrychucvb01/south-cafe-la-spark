import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import { supabase } from "../supabaseClient";

/* =========================================================
   MPLH TARGETS
========================================================= */

const LABOR_TARGETS = {
  secondary: {
    label: "Secondary",
    min: 18,
    max: 20,
  },

  elementary_prep: {
    label: "Elementary Prep",
    min: 20,
    max: 22,
  },

  elementary_nnc: {
    label: "Elementary NNC",
    min: 24,
    max: 25,
  },

  special: {
    label: "Special Education",
    min: null,
    max: null,
  },
};
const REIMBURSEMENT_RATES = {
  breakfast: 4.08,
  lunch: 5.9,
  supper: 4.6,
  snack: 1.3,
};
function ParticipationDonut({ value, meals, attendance, label }) {
  const percentage = value !== null ? value : 0;

  // Keep the visual ring between 0 and 100,
  // even if estimated participation exceeds 100%.
  const chartPercentage = Math.min(Math.max(percentage, 0), 100);

  const data = [
    {
      name: "Participation",
      value: chartPercentage,
    },
    {
      name: "Remaining",
      value: Math.max(100 - chartPercentage, 0),
    },
  ];

  return (
    <div className="participation-donut-card">
      <span className="participation-donut-label">{label}</span>

      <div className="participation-donut-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="72%"
              outerRadius="94%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              <Cell fill="#2878d0" />
              <Cell fill="#e8edf2" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <div className="participation-donut-center">
          <strong>{value !== null ? `${value.toFixed(1)}%` : "—"}</strong>
        </div>
      </div>

      <small>
        {meals.toLocaleString()} of {Math.round(attendance).toLocaleString()}{" "}
        estimated students
      </small>
    </div>
  );
}
/* =========================================================
   PAGE
========================================================= */

function MealAnalyticsPage({ location, employee, onBack }) {
  const [range, setRange] = useState("weekly");
  const [chartView, setChartView] = useState("total");

  const [mealCounts, setMealCounts] = useState([]);
  const [laborRows, setLaborRows] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyticsView, setAnalyticsView] = useState("meals");
  const [selectedRevenueDate, setSelectedRevenueDate] = useState(null);

  /* =========================================================
     LOAD DATA
  ========================================================= */

  useEffect(() => {
    if (!location?.id) {
      return;
    }

    loadAnalytics();
  }, [location?.id, range]);

  async function loadAnalytics() {
    setLoading(true);
    setError("");

    try {
      const daysBack = range === "weekly" ? 14 : 45;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);

      const startDateString = startDate.toISOString().split("T")[0];

      const { data: mealData, error: mealError } = await supabase
        .from("meal_counts")
        .select("*")
        .eq("location_id", location.id)
        .gte("service_date", startDateString)
        .order("service_date", {
          ascending: true,
        });

      if (mealError) {
        throw mealError;
      }

      const { data: laborData, error: laborError } = await supabase
        .from("labor_hours")
        .select("*")
        .eq("location_id", location.id)
        .gte("service_date", startDateString)
        .order("service_date", {
          ascending: true,
        });

      if (laborError) {
        throw laborError;
      }

      setMealCounts(mealData || []);
      setLaborRows(laborData || []);
    } catch (err) {
      console.error("Meal Analytics load error:", err);

      setError(err.message || "Could not load meal analytics.");
    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     BASIC SCHOOL INFORMATION
  ========================================================= */

  const enrollment = Number(location?.enrollment) || 0;

  const estimatedAttendance = enrollment > 0 ? enrollment * 0.93 : 0;

  const budgetLaborHours = Number(location?.budget_labor_hours) || 0;

  const laborTarget = LABOR_TARGETS[location?.labor_type] || {
    label: "Not Classified",
    min: null,
    max: null,
  };

  /* =========================================================
   TODAY'S DAY
========================================================= */

  const todayString = new Date().toISOString().split("T")[0];

  const latest =
    mealCounts.find((row) => row.service_date === todayString) || null;

  const latestBreakfast = Number(latest?.breakfast_count) || 0;

  const latestLunch = Number(latest?.lunch_count) || 0;

  const latestSupper =
    latest?.supper_status === "pending" ? 0 : Number(latest?.supper_count) || 0;

  const latestTotal = latestBreakfast + latestLunch + latestSupper;

  /* =========================================================
     PARTICIPATION
  ========================================================= */

  const breakfastParticipation =
    estimatedAttendance > 0
      ? (latestBreakfast / estimatedAttendance) * 100
      : null;

  const lunchParticipation =
    estimatedAttendance > 0 ? (latestLunch / estimatedAttendance) * 100 : null;

  /* =========================================================
     TODAY'S MPLH
  ========================================================= */

  const latestLaborRow = latest
    ? laborRows.find((row) => row.service_date === latest.service_date)
    : null;

  const additionalWorkerHours =
    Number(latestLaborRow?.additional_worker_hours) || 0;

  const managerOvertimeHours =
    Number(latestLaborRow?.manager_overtime_hours) || 0;

  const actualLaborHours =
    budgetLaborHours + additionalWorkerHours + managerOvertimeHours;

  const latestMealEquivalents =
    latestBreakfast * 0.66 + latestLunch + latestSupper;

  const todayMplh =
    latest && actualLaborHours > 0
      ? latestMealEquivalents / actualLaborHours
      : null;

  /* =========================================================
     CHART DATA
  ========================================================= */

  const chartData = useMemo(() => {
    return mealCounts.map((row) => {
      const breakfast = Number(row.breakfast_count) || 0;

      const lunch = Number(row.lunch_count) || 0;

      const supper =
        row.supper_status === "pending" ? 0 : Number(row.supper_count) || 0;

      return {
        service_date: row.service_date,

        dateLabel: new Date(`${row.service_date}T12:00:00`).toLocaleDateString(
          [],
          {
            month: "short",
            day: "numeric",
          }
        ),

        breakfast,
        lunch,
        supper,

        total: breakfast + lunch + supper,
      };
    });
  }, [mealCounts]);
  const reimbursementData = useMemo(() => {
    return chartData.map((row) => {
      const breakfastRevenue = row.breakfast * REIMBURSEMENT_RATES.breakfast;

      const lunchRevenue = row.lunch * REIMBURSEMENT_RATES.lunch;

      const supperRevenue = row.supper * REIMBURSEMENT_RATES.supper;

      const totalRevenue = breakfastRevenue + lunchRevenue + supperRevenue;

      return {
        ...row,
        breakfastRevenue,
        lunchRevenue,
        supperRevenue,
        totalRevenue,
      };
    });
  }, [chartData]);
  const selectedRevenueRow =
    reimbursementData.find((row) => row.service_date === selectedRevenueDate) ||
    reimbursementData[reimbursementData.length - 1] ||
    null;
  const reimbursementTotals = useMemo(() => {
    return reimbursementData.reduce(
      (total, row) => {
        total.breakfast += row.breakfastRevenue;
        total.lunch += row.lunchRevenue;
        total.supper += row.supperRevenue;
        total.total += row.totalRevenue;

        return total;
      },
      {
        breakfast: 0,
        lunch: 0,
        supper: 0,
        total: 0,
      }
    );
  }, [reimbursementData]);
  const selectedPerformanceRow = selectedRevenueRow;

  const selectedBreakfast = Number(selectedPerformanceRow?.breakfast) || 0;

  const selectedLunch = Number(selectedPerformanceRow?.lunch) || 0;

  const selectedSupper = Number(selectedPerformanceRow?.supper) || 0;

  const selectedTotal = selectedBreakfast + selectedLunch + selectedSupper;

  const selectedBreakfastParticipation =
    estimatedAttendance > 0
      ? (selectedBreakfast / estimatedAttendance) * 100
      : null;

  const selectedLunchParticipation =
    estimatedAttendance > 0
      ? (selectedLunch / estimatedAttendance) * 100
      : null;
  const selectedLaborRow = selectedPerformanceRow
    ? laborRows.find(
        (row) => row.service_date === selectedPerformanceRow.service_date
      )
    : null;

  const selectedAdditionalWorkerHours =
    Number(selectedLaborRow?.additional_worker_hours) || 0;

  const selectedManagerOvertimeHours =
    Number(selectedLaborRow?.manager_overtime_hours) || 0;

  const selectedActualLaborHours =
    budgetLaborHours +
    selectedAdditionalWorkerHours +
    selectedManagerOvertimeHours;

  const selectedMealEquivalents =
    selectedBreakfast * 0.66 + selectedLunch + selectedSupper;

  const selectedMplh =
    selectedPerformanceRow && selectedActualLaborHours > 0
      ? selectedMealEquivalents / selectedActualLaborHours
      : null;
  /* =========================================================
     PERIOD AVERAGES
  ========================================================= */

  const averages = useMemo(() => {
    if (chartData.length === 0) {
      return {
        breakfast: 0,
        lunch: 0,
        supper: 0,
        total: 0,
      };
    }

    const totals = chartData.reduce(
      (sum, row) => {
        sum.breakfast += row.breakfast;
        sum.lunch += row.lunch;
        sum.supper += row.supper;
        sum.total += row.total;

        return sum;
      },
      {
        breakfast: 0,
        lunch: 0,
        supper: 0,
        total: 0,
      }
    );

    return {
      breakfast: totals.breakfast / chartData.length,

      lunch: totals.lunch / chartData.length,

      supper: totals.supper / chartData.length,

      total: totals.total / chartData.length,
    };
  }, [chartData]);

  /* =========================================================
     5 SERVICE DAY TREND
  ========================================================= */

  function getFiveDayChange(field) {
    const rows = chartData.slice(-5);

    if (rows.length < 2) {
      return null;
    }

    const first = Number(rows[0][field]) || 0;

    const last = Number(rows[rows.length - 1][field]) || 0;

    if (first === 0) {
      return null;
    }

    return ((last - first) / first) * 100;
  }

  const breakfastFiveDayChange = getFiveDayChange("breakfast");

  const lunchFiveDayChange = getFiveDayChange("lunch");

  /* =========================================================
     SUPPER DECLINE CHECK
  ========================================================= */

  const supperDeclining = useMemo(() => {
    const rows = chartData.filter((row) => row.supper > 0).slice(-3);

    if (rows.length < 3) {
      return false;
    }

    return rows[0].supper > rows[1].supper && rows[1].supper > rows[2].supper;
  }, [chartData]);

  /* =========================================================
     PARTICIPATION INSIGHTS
  ========================================================= */

  const participationInsights = [];

  if (breakfastParticipation !== null) {
    participationInsights.push(
      `Breakfast participation is ${breakfastParticipation.toFixed(
        1
      )}% of estimated attendance.`
    );
  }

  if (lunchParticipation !== null) {
    participationInsights.push(
      `Lunch participation is ${lunchParticipation.toFixed(
        1
      )}% of estimated attendance.`
    );
  }

  if (breakfastFiveDayChange !== null) {
    if (breakfastFiveDayChange > 0) {
      participationInsights.push(
        `Breakfast participation increased ${Math.abs(
          breakfastFiveDayChange
        ).toFixed(1)}% over the last 5 service days.`
      );
    } else if (breakfastFiveDayChange < 0) {
      participationInsights.push(
        `Breakfast participation decreased ${Math.abs(
          breakfastFiveDayChange
        ).toFixed(1)}% over the last 5 service days.`
      );
    }
  }

  if (lunchFiveDayChange !== null) {
    if (lunchFiveDayChange > 0) {
      participationInsights.push(
        `Lunch participation increased ${Math.abs(lunchFiveDayChange).toFixed(
          1
        )}% over the last 5 service days.`
      );
    } else if (lunchFiveDayChange < 0) {
      participationInsights.push(
        `Lunch participation decreased ${Math.abs(lunchFiveDayChange).toFixed(
          1
        )}% over the last 5 service days.`
      );
    }
  }

  if (averages.breakfast > 0) {
    participationInsights.push(
      `Breakfast is averaging ${Math.round(
        averages.breakfast
      ).toLocaleString()} meals per service day.`
    );
  }

  if (averages.lunch > 0) {
    participationInsights.push(
      `Lunch is averaging ${Math.round(
        averages.lunch
      ).toLocaleString()} meals per service day.`
    );
  }

  if (supperDeclining) {
    participationInsights.push(
      "Supper participation has declined for 3 consecutive service days."
    );
  }

  /* =========================================================
     CHART HELPERS
  ========================================================= */

  function getChartLabel() {
    if (chartView === "breakfast") {
      return "Breakfast";
    }

    if (chartView === "lunch") {
      return "Lunch";
    }

    if (chartView === "supper") {
      return "Supper";
    }

    return "Total Meals";
  }

  /* =========================================================
     LOADING
  ========================================================= */

  if (loading) {
    return (
      <div className="login-app">
        <main className="login-main">
          <div className="login-card">Loading Meal Analytics...</div>
        </main>
      </div>
    );
  }

  /* =========================================================
     PAGE
  ========================================================= */

  return (
    <div className="login-app">
      {/* HEADER */}

      <header className="login-header">
        <div className="login-brand">
          <img src="/spark-192.png" alt="SPARK" className="spark-header-logo" />

          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>

            <div className="login-brand-subtitle">MEAL ANALYTICS</div>
          </div>
        </div>

        <button type="button" className="supervisor-link" onClick={onBack}>
          ← School Hub
        </button>
      </header>

      {/* MAIN */}

      <main className="login-main">
        <div className="school-hub-page">
          {/* SCHOOL HEADING */}

          <div className="school-hub-heading">
            <div>
              <div className="school-hub-location-code">
                LOCATION {location?.location_code}
              </div>

              <h1>{location?.school_name}</h1>

              <p>
                Signed in as <strong>{employee?.employee_name}</strong>
              </p>
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          {/* =================================================
              TODAY'S PERFORMANCE
          ================================================= */}

          <section className="dashboard-card">
            <div className="school-dashboard-section-title">
              <div>
                <h2>Today's Performance</h2>

                <p>Meal participation and labor productivity for today.</p>
              </div>

              <span className="school-dashboard-status complete">
                {new Date().toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>

            <div className="meal-analytics-summary-grid">
              {/* TOTAL */}

              <div className="meal-analytics-stat">
                <span>Total Meals</span>

                <strong>{latestTotal.toLocaleString()}</strong>

                <small>
                  {latest ? "Today's meal count" : "No meal counts entered yet"}
                </small>
              </div>

              {/* BREAKFAST */}

              <ParticipationDonut
                label="Breakfast Participation"
                value={breakfastParticipation}
                meals={latestBreakfast}
                attendance={estimatedAttendance}
              />

              {/* LUNCH */}

              <ParticipationDonut
                label="Lunch Participation"
                value={lunchParticipation}
                meals={latestLunch}
                attendance={estimatedAttendance}
              />

              {/* MPLH */}

              <div className="meal-analytics-stat">
                <span>Today's MPLH</span>

                <strong>
                  {todayMplh !== null ? todayMplh.toFixed(1) : "—"}
                </strong>

                <small>
                  {laborTarget.min !== null
                    ? `Target ${laborTarget.min}–${laborTarget.max}`
                    : "No target assigned"}
                </small>
              </div>
            </div>

            <div className="meal-analytics-attendance-note">
              Enrollment: <strong>{enrollment.toLocaleString()}</strong>
              <span>•</span>
              Estimated Attendance (93%):{" "}
              <strong>
                {Math.round(estimatedAttendance).toLocaleString()}
              </strong>
            </div>
          </section>

          {/* =================================================
              PARTICIPATION INSIGHTS
          ================================================= */}

          <section className="dashboard-card">
            <div className="school-dashboard-section-title">
              <div>
                <h2>Participation Insights</h2>

                <p>What SPARK sees in your meal participation.</p>
              </div>
            </div>

            {participationInsights.length === 0 ? (
              <div className="school-empty-history">
                More meal-count history is needed to create insights.
              </div>
            ) : (
              <div className="meal-insight-list">
                {participationInsights.slice(0, 5).map((insight, index) => (
                  <div className="meal-insight-row" key={index}>
                    <span className="meal-insight-icon">✦</span>

                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
          <div className="meal-view-toggle">
            <button
              type="button"
              className={analyticsView === "meals" ? "active" : ""}
              onClick={() => setAnalyticsView("meals")}
            >
              Meals
            </button>

            <button
              type="button"
              className={analyticsView === "reimbursement" ? "active" : ""}
              onClick={() => setAnalyticsView("reimbursement")}
            >
              $ Reimbursement
            </button>
          </div>
          {/* =================================================
              MEAL TRENDS
          ================================================= */}

          {analyticsView === "meals" ? (
            <section className="dashboard-card">
              <div className="school-dashboard-section-title">
                <div>
                  <h2>Meal Trends</h2>

                  <p>Review participation over time.</p>
                </div>

                <div className="trend-range-buttons">
                  <button
                    type="button"
                    className={range === "weekly" ? "active" : ""}
                    onClick={() => setRange("weekly")}
                  >
                    Weekly
                  </button>

                  <button
                    type="button"
                    className={range === "monthly" ? "active" : ""}
                    onClick={() => setRange("monthly")}
                  >
                    Monthly
                  </button>
                </div>
              </div>

              {/* MEAL FILTERS */}

              <div className="meal-analytics-filter-row">
                {[
                  ["breakfast", "Breakfast"],
                  ["lunch", "Lunch"],
                  ["supper", "Supper"],
                  ["total", "Total"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={chartView === key ? "active" : ""}
                    onClick={() => setChartView(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* GRAPH */}

              {chartData.length === 0 ? (
                <div className="school-empty-history">
                  No meal-count history yet.
                </div>
              ) : (
                <>
                  <div className="meal-analytics-chart-title">
                    <strong>{getChartLabel()}</strong>

                    <span>
                      Average:{" "}
                      {Math.round(averages[chartView]).toLocaleString()}
                    </span>
                  </div>

                  <div className="meal-analytics-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{
                          top: 10,
                          right: 20,
                          left: 0,
                          bottom: 10,
                        }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#e7ebef"
                        />

                        <XAxis
                          dataKey="dateLabel"
                          tick={{
                            fontSize: 11,
                          }}
                          axisLine={false}
                          tickLine={false}
                        />

                        <YAxis
                          tick={{
                            fontSize: 11,
                          }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                        />

                        <Tooltip />

                        <Line
                          type="monotone"
                          dataKey={chartView}
                          stroke="#2878d0"
                          strokeWidth={3}
                          dot={{
                            r: 3,
                          }}
                          activeDot={{
                            r: 5,
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </section>
          ) : (
            <>
              {/* =========================================
    ESTIMATED MEAL REVENUE
========================================= */}

              <section className="dashboard-card">
                <div className="school-dashboard-section-title">
                  <div>
                    <h2>Estimated Meal Revenue</h2>

                    <p>
                      Estimated reimbursement generated from the selected
                      meal-count date.
                    </p>
                  </div>

                  {selectedRevenueRow && (
                    <span className="school-dashboard-status complete">
                      {selectedRevenueRow.dateLabel}
                    </span>
                  )}
                </div>

                <div className="revenue-summary-grid">
                  {/* BREAKFAST */}

                  <div className="revenue-summary-card">
                    <span>Breakfast</span>

                    <strong>
                      $
                      {(
                        selectedRevenueRow?.breakfastRevenue || 0
                      ).toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })}
                    </strong>

                    <small>
                      {(selectedRevenueRow?.breakfast || 0).toLocaleString()}{" "}
                      meals
                    </small>
                  </div>

                  {/* LUNCH */}

                  <div className="revenue-summary-card">
                    <span>Lunch</span>

                    <strong>
                      $
                      {(selectedRevenueRow?.lunchRevenue || 0).toLocaleString(
                        undefined,
                        {
                          maximumFractionDigits: 0,
                        }
                      )}
                    </strong>

                    <small>
                      {(selectedRevenueRow?.lunch || 0).toLocaleString()} meals
                    </small>
                  </div>

                  {/* SUPPER */}

                  <div className="revenue-summary-card">
                    <span>Supper</span>

                    <strong>
                      $
                      {(selectedRevenueRow?.supperRevenue || 0).toLocaleString(
                        undefined,
                        {
                          maximumFractionDigits: 0,
                        }
                      )}
                    </strong>

                    <small>
                      {(selectedRevenueRow?.supper || 0).toLocaleString()} meals
                    </small>
                  </div>

                  {/* TOTAL */}

                  <div className="revenue-summary-card revenue-summary-total">
                    <span>Total</span>

                    <strong>
                      $
                      {(selectedRevenueRow?.totalRevenue || 0).toLocaleString(
                        undefined,
                        {
                          maximumFractionDigits: 0,
                        }
                      )}
                    </strong>

                    <small>Estimated reimbursement</small>
                  </div>
                </div>
              </section>

              {/* =========================================
                  SELECTED DATE PERFORMANCE
              ========================================= */}

              <section className="dashboard-card">
                <div className="school-dashboard-section-title">
                  <div>
                    <h2>Performance for Selected Date</h2>

                    <p>
                      Meal participation and labor productivity for the date
                      selected in Revenue Detail.
                    </p>
                  </div>

                  {selectedPerformanceRow && (
                    <span className="school-dashboard-status complete">
                      {selectedPerformanceRow.dateLabel}
                    </span>
                  )}
                </div>

                <div className="meal-analytics-summary-grid">
                  {/* TOTAL */}

                  <div className="meal-analytics-stat">
                    <span>Total Meals</span>

                    <strong>{selectedTotal.toLocaleString()}</strong>

                    <small>Selected service day</small>
                  </div>

                  {/* BREAKFAST */}

                  <ParticipationDonut
                    label="Breakfast Participation"
                    value={selectedBreakfastParticipation}
                    meals={selectedBreakfast}
                    attendance={estimatedAttendance}
                  />

                  {/* LUNCH */}

                  <ParticipationDonut
                    label="Lunch Participation"
                    value={selectedLunchParticipation}
                    meals={selectedLunch}
                    attendance={estimatedAttendance}
                  />

                  {/* MPLH */}

                  <div className="meal-analytics-stat">
                    <span>MPLH</span>

                    <strong>
                      {selectedMplh !== null ? selectedMplh.toFixed(1) : "—"}
                    </strong>

                    <small>
                      {laborTarget.min !== null
                        ? `Target ${laborTarget.min}–${laborTarget.max}`
                        : "No target assigned"}
                    </small>
                  </div>
                </div>

                <div className="meal-analytics-attendance-note">
                  Enrollment: <strong>{enrollment.toLocaleString()}</strong>
                  <span>•</span>
                  Estimated Attendance (93%):{" "}
                  <strong>
                    {Math.round(estimatedAttendance).toLocaleString()}
                  </strong>
                </div>
              </section>

              {/* =========================================
                  REVENUE DETAIL
              ========================================= */}

              <section className="dashboard-card">
                <div className="school-dashboard-section-title">
                  <div>
                    <h2>Revenue Detail</h2>

                    <p>Estimated reimbursement by service day.</p>
                  </div>

                  <div className="trend-range-buttons">
                    <button
                      type="button"
                      className={range === "weekly" ? "active" : ""}
                      onClick={() => setRange("weekly")}
                    >
                      Weekly
                    </button>

                    <button
                      type="button"
                      className={range === "monthly" ? "active" : ""}
                      onClick={() => setRange("monthly")}
                    >
                      Monthly
                    </button>
                  </div>
                </div>

                <div className="revenue-table-wrap">
                  <table className="revenue-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Breakfast</th>
                        <th>Lunch</th>
                        <th>Supper</th>
                        <th>Total</th>
                      </tr>
                    </thead>

                    <tbody>
                      {[...reimbursementData].reverse().map((row) => (
                        <tr
                          key={row.service_date}
                          className={
                            selectedRevenueRow?.service_date ===
                            row.service_date
                              ? "revenue-selected-row"
                              : ""
                          }
                          onClick={() =>
                            setSelectedRevenueDate(row.service_date)
                          }
                        >
                          <td>
                            <strong>{row.dateLabel}</strong>
                          </td>

                          <td>
                            $
                            {row.breakfastRevenue.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </td>

                          <td>
                            $
                            {row.lunchRevenue.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </td>

                          <td>
                            $
                            {row.supperRevenue.toLocaleString(undefined, {
                              maximumFractionDigits: 0,
                            })}
                          </td>

                          <td>
                            <strong>
                              $
                              {row.totalRevenue.toLocaleString(undefined, {
                                maximumFractionDigits: 0,
                              })}
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>

                    <tfoot>
                      <tr>
                        <th>Period Total</th>

                        <th>
                          $
                          {reimbursementTotals.breakfast.toLocaleString(
                            undefined,
                            {
                              maximumFractionDigits: 0,
                            }
                          )}
                        </th>

                        <th>
                          $
                          {reimbursementTotals.lunch.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}
                        </th>

                        <th>
                          $
                          {reimbursementTotals.supper.toLocaleString(
                            undefined,
                            {
                              maximumFractionDigits: 0,
                            }
                          )}
                        </th>

                        <th>
                          $
                          {reimbursementTotals.total.toLocaleString(undefined, {
                            maximumFractionDigits: 0,
                          })}
                        </th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </>
          )}
          {/* =================================================
              LABOR CONNECTION
          ================================================= */}

          <section className="dashboard-card">
            <div className="school-dashboard-section-title">
              <div>
                <h2>Today's Meals & Labor</h2>

                <p>See how today's meal volume connects to staffing.</p>
              </div>
            </div>

            <div className="meal-labor-grid">
              <div>
                <span>Meal Equivalents</span>

                <strong>{latestMealEquivalents.toFixed(1)}</strong>
              </div>

              <div>
                <span>Baseline Labor</span>

                <strong>{budgetLaborHours.toFixed(1)}</strong>

                <small>hours</small>
              </div>

              <div>
                <span>Added Labor</span>

                <strong>
                  {(additionalWorkerHours + managerOvertimeHours).toFixed(1)}
                </strong>

                <small>hours</small>
              </div>

              <div>
                <span>Actual Labor</span>

                <strong>{actualLaborHours.toFixed(1)}</strong>

                <small>hours</small>
              </div>

              <div>
                <span>MPLH</span>

                <strong>
                  {todayMplh !== null ? todayMplh.toFixed(1) : "—"}
                </strong>

                <small>{laborTarget.label}</small>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default MealAnalyticsPage;
