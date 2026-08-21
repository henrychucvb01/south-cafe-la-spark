import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
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
function SchoolHub({
  location,
  employee,
  onFinishLine,
  onDashboard,
  onExit,
  onMealAnalytics,
}) {
  const [mealCounts, setMealCounts] = useState([]);

  // Weekly / Monthly
  const [range, setRange] = useState("weekly");

  // all | breakfast | lunch | supper | total
  const [chartView, setChartView] = useState("all");

  const [loadingMeals, setLoadingMeals] = useState(true);
  const [mealError, setMealError] = useState("");

  // Pending Supper
  const [pendingSupper, setPendingSupper] = useState(null);
  const [supperInput, setSupperInput] = useState("");
  const [savingSupper, setSavingSupper] = useState(false);
  const [supperMessage, setSupperMessage] = useState("");
  // Labor Productivity
  const [additionalWorkerHours, setAdditionalWorkerHours] = useState("");
  const [managerOvertimeHours, setManagerOvertimeHours] = useState("");

  const [savedLaborAdjustments, setSavedLaborAdjustments] = useState(null);

  const [loadingLabor, setLoadingLabor] = useState(false);
  const [savingLabor, setSavingLabor] = useState(false);
  const [laborMessage, setLaborMessage] = useState("");
  const [laborHistory, setLaborHistory] = useState([]);
  /* =========================================================
     LOAD DATA
  ========================================================= */

  useEffect(() => {
    if (!location?.id) {
      return;
    }

    loadMealCounts();
    loadPendingSupper();
  }, [location?.id, range]);

  /* =========================================================
     DATE HELPERS
  ========================================================= */

  function getDateString(date) {
    return date.toISOString().split("T")[0];
  }

  function formatServiceDate(value) {
    if (!value) {
      return "";
    }

    return new Date(`${value}T12:00:00`).toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatShortDate(value) {
    if (!value) {
      return "";
    }

    return new Date(`${value}T12:00:00`).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  }

  /* =========================================================
     LOAD MEAL COUNTS
  ========================================================= */

  async function loadMealCounts() {
    if (!location?.id) {
      return;
    }

    setLoadingMeals(true);
    setMealError("");

    try {
      const daysBack = range === "weekly" ? 14 : 45;

      const startDate = new Date();

      startDate.setDate(startDate.getDate() - daysBack);

      const startString = getDateString(startDate);

      const { data, error } = await supabase
        .from("meal_counts")
        .select("*")
        .eq("location_id", location.id)
        .gte("service_date", startString)
        .order("service_date", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      setMealCounts(data || []);
    } catch (error) {
      console.error("Meal count load error:", error);

      setMealError(error.message || "Could not load meal counts.");
    } finally {
      setLoadingMeals(false);
    }
  }

  /* =========================================================
     FIND PENDING SUPPER
  ========================================================= */

  async function loadPendingSupper() {
    if (!location?.id) {
      return;
    }

    setSupperMessage("");

    try {
      const today = getDateString(new Date());

      const { data, error } = await supabase
        .from("meal_counts")
        .select("*")
        .eq("location_id", location.id)
        .eq("supper_status", "pending")
        .lt("service_date", today)
        .order("service_date", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      setPendingSupper(data || null);

      setSupperInput(data?.supper_count ?? "");
    } catch (error) {
      console.error("Pending Supper load error:", error);

      setSupperMessage(
        `Could not check pending Supper counts: ${error.message}`
      );
    }
  }

  /* =========================================================
     SAVE PENDING SUPPER
  ========================================================= */

  function handleSupperChange(value) {
    const clean = value.replace(/\D/g, "");

    setSupperInput(clean);
    setSupperMessage("");
  }

  async function savePendingSupper() {
    if (!pendingSupper) {
      return;
    }

    if (supperInput === "") {
      setSupperMessage("Enter the final Supper count.");

      return;
    }

    setSavingSupper(true);
    setSupperMessage("");

    try {
      const { error } = await supabase
        .from("meal_counts")
        .update({
          supper_count: Number(supperInput),

          supper_status: "complete",

          entered_by: employee?.employee_name || "Covering Employee",

          updated_at: new Date().toISOString(),
        })
        .eq("id", pendingSupper.id);

      if (error) {
        throw error;
      }

      setPendingSupper(null);
      setSupperInput("");

      await loadMealCounts();
      await loadPendingSupper();
    } catch (error) {
      console.error("Supper save error:", error);

      setSupperMessage(`Could not save Supper count: ${error.message}`);
    } finally {
      setSavingSupper(false);
    }
  }

  /* =========================================================
     CHART VIEW
  ========================================================= */

  function handleChartView(view) {
    setChartView((current) => (current === view ? "all" : view));
  }

  /* =========================================================
     CHART DATA
  ========================================================= */

  const chartData = useMemo(() => {
    let rows = [...mealCounts];

    if (range === "weekly") {
      rows = rows.slice(-5);
    }

    if (range === "monthly") {
      rows = rows.slice(-22);
    }

    return rows.map((row) => {
      const breakfast = row.breakfast_count ?? 0;

      const lunch = row.lunch_count ?? 0;

      const supper =
        row.supper_status === "pending" ? null : row.supper_count ?? 0;

      const total = breakfast + lunch + (supper ?? 0);

      return {
        date: formatShortDate(row.service_date),

        breakfast,
        lunch,
        supper,
        total,

        supperPending: row.supper_status === "pending",
      };
    });
  }, [mealCounts, range]);

  /* =========================================================
     LATEST COUNTS
  ========================================================= */

  const latest =
    mealCounts.length > 0 ? mealCounts[mealCounts.length - 1] : null;

  const latestBreakfast = latest?.breakfast_count ?? 0;

  const latestLunch = latest?.lunch_count ?? 0;

  const latestSupper = latest?.supper_count;

  const latestTotal = latestBreakfast + latestLunch + (latestSupper ?? 0);

  useEffect(() => {
    if (!location?.id || !latest?.service_date) {
      setAdditionalWorkerHours("");
      setManagerOvertimeHours("");
      setSavedLaborAdjustments(null);
      return;
    }

    loadLaborHours();
  }, [location?.id, latest?.service_date]);

  async function loadLaborHours() {
    if (!location?.id || !latest?.service_date) {
      return;
    }

    setLoadingLabor(true);
    setLaborMessage("");

    try {
      const { data, error } = await supabase
        .from("labor_hours")
        .select("*")
        .eq("location_id", location.id)
        .eq("service_date", latest.service_date)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        const workerHours = Number(data.additional_worker_hours) || 0;

        const managerOt = Number(data.manager_overtime_hours) || 0;

        setAdditionalWorkerHours(workerHours === 0 ? "" : String(workerHours));

        setManagerOvertimeHours(managerOt === 0 ? "" : String(managerOt));

        setSavedLaborAdjustments({
          additionalWorkerHours: workerHours,
          managerOvertimeHours: managerOt,
        });
        await loadLaborHours();
      } else {
        setAdditionalWorkerHours("");
        setManagerOvertimeHours("");
        setSavedLaborAdjustments(null);
      }
      const { data: historyData, error: historyError } = await supabase
        .from("labor_hours")
        .select("*")
        .eq("location_id", location.id)
        .order("service_date", {
          ascending: true,
        });

      if (historyError) {
        throw historyError;
      }

      setLaborHistory(historyData || []);
    } catch (error) {
      console.error("Labor hours load error:", error);

      setLaborMessage(error.message || "Could not load labor information.");
    } finally {
      setLoadingLabor(false);
    }
  }
  async function saveLaborHours() {
    if (!location?.id || !latest?.service_date) {
      setLaborMessage("No meal-count date is available.");
      return;
    }

    const workerHours = Number(additionalWorkerHours) || 0;
    const managerOt = Number(managerOvertimeHours) || 0;

    setSavingLabor(true);
    setLaborMessage("");

    try {
      const { error } = await supabase.from("labor_hours").upsert(
        {
          location_id: location.id,
          service_date: latest.service_date,
          additional_worker_hours: workerHours,
          manager_overtime_hours: managerOt,
          entered_by: employee?.employee_name || "Covering Employee",
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "location_id,service_date",
        }
      );

      if (error) {
        throw error;
      }

      setSavedLaborAdjustments({
        additionalWorkerHours: workerHours,
        managerOvertimeHours: managerOt,
      });

      setLaborMessage("Labor hours saved.");
    } catch (error) {
      console.error("Labor save error:", error);

      setLaborMessage(error.message || "Could not save labor hours.");
    } finally {
      setSavingLabor(false);
    }
  }

  /* =========================================================
   MPLH CALCULATIONS
========================================================= */

  const laborTarget = LABOR_TARGETS[location?.labor_type] || {
    label: "Not Classified",
    min: null,
    max: null,
  };

  const budgetLaborHours = Number(location?.budget_labor_hours) || 0;

  const savedAdditionalWorkerHours =
    savedLaborAdjustments?.additionalWorkerHours ?? 0;

  const savedManagerOvertimeHours =
    savedLaborAdjustments?.managerOvertimeHours ?? 0;

  const actualLaborHours =
    budgetLaborHours + savedAdditionalWorkerHours + savedManagerOvertimeHours;

  // Supper should not count until the final Supper count is complete.
  const supperForMplh =
    latest?.supper_status === "pending" ? 0 : Number(latestSupper) || 0;

  const mealEquivalents =
    Number(latestBreakfast) * 0.66 + Number(latestLunch) + supperForMplh;

  const mplh = actualLaborHours > 0 ? mealEquivalents / actualLaborHours : null;

  let mplhStatus = {
    label: "No Target",
    type: "neutral",
    message:
      "This location does not have an MPLH target yet. You can still use the MPLH number to track productivity over time.",
  };

  if (mplh !== null && laborTarget.min !== null && laborTarget.max !== null) {
    if (mplh < laborTarget.min) {
      mplhStatus = {
        label: "Below Target",
        type: "low",
        message:
          "Your meals per labor hour are below the target. Focus on increasing meal participation and review labor hours, since continued low productivity may affect staffing.",
      };
    } else if (mplh <= laborTarget.max) {
      mplhStatus = {
        label: "On Target",
        type: "good",
        message:
          "Your meals and labor hours are in the target range. Staffing appears to match the current meal volume.",
      };
    } else {
      mplhStatus = {
        label: "High Productivity",
        type: "high",
        message:
          "Your team is serving more meals per labor hour than the target. This shows strong productivity, but make sure the team has enough help to run the operation smoothly.",
      };
    }
  }
  const laborHistoryByDate = new Map(
    laborHistory.map((row) => [row.service_date, row])
  );

  let totalHistoricalMealEquivalents = 0;
  let totalHistoricalLaborHours = 0;

  mealCounts.forEach((row) => {
    const laborRow = laborHistoryByDate.get(row.service_date);

    if (!laborRow) {
      return;
    }

    const breakfast = Number(row.breakfast_count) || 0;
    const lunch = Number(row.lunch_count) || 0;

    const supper =
      row.supper_status === "pending" ? 0 : Number(row.supper_count) || 0;

    const dailyMealEquivalents = breakfast * 0.66 + lunch + supper;

    const extraWorkerHours = Number(laborRow.additional_worker_hours) || 0;

    const managerOt = Number(laborRow.manager_overtime_hours) || 0;

    const dailyLaborHours = budgetLaborHours + extraWorkerHours + managerOt;

    if (dailyLaborHours > 0) {
      totalHistoricalMealEquivalents += dailyMealEquivalents;
      totalHistoricalLaborHours += dailyLaborHours;
    }
  });

  const averageMplh =
    totalHistoricalLaborHours > 0
      ? totalHistoricalMealEquivalents / totalHistoricalLaborHours
      : null;
  /* =========================================================
     PAGE
  ========================================================= */

  return (
    <div className="login-app">
      {/* HEADER */}

      <header className="login-header">
        <div className="login-brand">
          <img
            src="/spark-192.png"
            alt="SPARK"
            className="school-hub-spark-logo"
          />
          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>

            <div className="login-brand-subtitle">OPERATIONS</div>
          </div>
        </div>
      </header>

      <main className="login-main">
        <div className="school-dashboard-page">
          {/* =================================================
              SCHOOL HEADER
          ================================================= */}
          <div className="school-dashboard-header">
            <div>
              <div className="dashboard-small-label">
                LOCATION {location?.location_code}
              </div>

              <h1>{location?.school_name}</h1>

              <p>
                Signed in as <strong>{employee?.employee_name}</strong>
              </p>
            </div>

            <button className="dashboard-exit" onClick={onExit}>
              Exit Location
            </button>
          </div>
          {/* =================================================
              PENDING SUPPER
          ================================================= */}
          {pendingSupper && (
            <section
              className="dashboard-card"
              style={{
                border: "1px solid #e7cb70",

                background: "#fffaf0",
              }}
            >
              <div className="school-dashboard-section-title">
                <div>
                  <h2>Action Needed — Supper Count</h2>

                  <p>
                    Enter the final Supper count from the previous service day.
                  </p>
                </div>

                <span
                  style={{
                    background: "#fff0bd",

                    color: "#775a00",

                    borderRadius: "6px",

                    padding: "5px 8px",

                    fontSize: "9px",

                    fontWeight: "800",
                  }}
                >
                  PENDING
                </span>
              </div>

              <div
                style={{
                  display: "grid",

                  gridTemplateColumns: "1fr 180px auto",

                  gap: "12px",

                  alignItems: "end",
                }}
              >
                <div>
                  <small
                    style={{
                      display: "block",
                      color: "#7c8792",
                      marginBottom: "4px",
                    }}
                  >
                    Service Date
                  </small>

                  <strong>
                    {formatServiceDate(pendingSupper.service_date)}
                  </strong>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "10px",
                      fontWeight: "800",
                      marginBottom: "5px",
                    }}
                  >
                    Final Supper Count
                  </label>

                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Enter count"
                    value={supperInput}
                    onChange={(e) => handleSupperChange(e.target.value)}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      border: "1px solid #d6dfe7",
                      borderRadius: "7px",
                      padding: "10px",
                      fontSize: "14px",
                      fontWeight: "700",
                    }}
                  />
                </div>

                <button
                  type="button"
                  className="finish-line-submit finish-line-ready"
                  disabled={savingSupper || supperInput === ""}
                  onClick={savePendingSupper}
                >
                  {savingSupper ? "Saving..." : "Save Supper Count"}
                </button>
              </div>

              {supperMessage && (
                <div
                  className="login-error"
                  style={{
                    marginTop: "10px",
                  }}
                >
                  {supperMessage}
                </div>
              )}
            </section>
          )}
          {/* =================================================
              TODAY'S OPERATIONS
          ================================================= */}
          <section className="dashboard-card">
            <div className="school-dashboard-section-title">
              <div>
                <h2>Today's Operations</h2>

                <p>Complete your daily Finish Line.</p>
              </div>
            </div>

            <button className="hub-action primary" onClick={onFinishLine}>
              <div className="hub-action-icon">🏁</div>

              <div>
                <strong>Finish Line Check</strong>

                <small>Complete today's end-of-day verification</small>
              </div>

              <span>›</span>
            </button>

            <button className="hub-action" onClick={onDashboard}>
              <div className="hub-action-icon">📋</div>

              <div>
                <strong>Finish Line History</strong>

                <small>Review today's status and previous submissions</small>
              </div>

              <span>›</span>
            </button>
          </section>

          {/* =================================================
    LABOR PRODUCTIVITY
================================================= */}

          <section className="dashboard-card">
            <div className="school-dashboard-section-title">
              <div>
                <h2>Labor Productivity</h2>
                <p>Compare meal volume with today's labor.</p>
              </div>

              {mplh !== null && (
                <span
                  className={`labor-status labor-status-${mplhStatus.type}`}
                >
                  {mplhStatus.label}
                </span>
              )}
            </div>

            {/* MPLH SUMMARY */}

            <div className="labor-productivity-summary">
              <div className="labor-mplh-main">
                <span>Today's MPLH</span>

                <strong>{mplh !== null ? mplh.toFixed(1) : "—"}</strong>

                <small>
                  Target:{" "}
                  {laborTarget.min !== null
                    ? `${laborTarget.min}–${laborTarget.max} MPLH`
                    : "No target assigned"}
                </small>

                <small>{laborTarget.label}</small>
              </div>

              <div className="labor-stat">
                <span>Avg MPLH to Date</span>

                <strong>
                  {averageMplh !== null ? averageMplh.toFixed(1) : "—"}
                </strong>

                <small>Saved labor days</small>
              </div>

              <div className="labor-stat">
                <span>Meal Equivalents</span>

                <strong>{mealEquivalents.toFixed(1)}</strong>
              </div>

              <div className="labor-stat">
                <span>Actual Labor</span>

                <strong>{actualLaborHours.toFixed(1)}</strong>

                <small>Baseline {budgetLaborHours.toFixed(1)} hrs</small>
              </div>
            </div>

            <div className="labor-status-message">{mplhStatus.message}</div>

            {/* LABOR ADJUSTMENTS */}

            <div className="labor-adjustment-heading">
              Today's Labor Adjustments
            </div>

            <p className="labor-adjustment-help">
              Enter only hours added above the school's normal labor allocation.
            </p>

            <div className="labor-adjustment-grid">
              <div>
                <label>Additional Worker Hours</label>

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={additionalWorkerHours}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9.]/g, "");

                    if ((value.match(/\./g) || []).length <= 1) {
                      setAdditionalWorkerHours(value);
                      setLaborMessage("");
                    }
                  }}
                />
              </div>

              <div>
                <label>Manager Overtime Hours</label>

                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={managerOvertimeHours}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9.]/g, "");

                    if ((value.match(/\./g) || []).length <= 1) {
                      setManagerOvertimeHours(value);
                      setLaborMessage("");
                    }
                  }}
                />
              </div>
            </div>

            <div className="labor-save-row">
              <button
                type="button"
                className="finish-line-submit finish-line-ready"
                disabled={savingLabor || loadingLabor}
                onClick={saveLaborHours}
              >
                {savingLabor ? "Saving..." : "Save Labor Hours"}
              </button>

              {laborMessage && (
                <span
                  className={
                    laborMessage.toLowerCase().includes("saved")
                      ? "labor-message-success"
                      : "labor-message-error"
                  }
                >
                  {laborMessage}
                </span>
              )}
            </div>
          </section>
          {/* =================================================
    LATEST MEAL COUNTS
================================================= */}
          <section className="dashboard-card">
            <div className="school-dashboard-section-title">
              <div>
                <h2>Latest Meal Counts</h2>
                <p>Most recent meal service counts.</p>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  flexWrap: "wrap",
                }}
              >
                {latest && (
                  <span className="school-dashboard-status complete">
                    {formatShortDate(latest.service_date)}
                  </span>
                )}

                <button
                  type="button"
                  className="meal-analytics-button"
                  onClick={onMealAnalytics}
                >
                  View Meal Analytics →
                </button>
              </div>
            </div>

            {!latest ? (
              <div className="school-empty-history">
                No meal-count data yet.
              </div>
            ) : (
              <div className="meal-summary-grid">
                {/* BREAKFAST */}

                <button
                  type="button"
                  className={`meal-summary-card meal-summary-button ${
                    chartView === "breakfast" ? "selected" : ""
                  }`}
                  onClick={() => handleChartView("breakfast")}
                >
                  <span>Breakfast</span>
                  <strong>{latestBreakfast.toLocaleString()}</strong>
                </button>

                {/* LUNCH */}

                <button
                  type="button"
                  className={`meal-summary-card meal-summary-button ${
                    chartView === "lunch" ? "selected" : ""
                  }`}
                  onClick={() => handleChartView("lunch")}
                >
                  <span>Lunch</span>
                  <strong>{latestLunch.toLocaleString()}</strong>
                </button>

                {/* SUPPER */}

                <button
                  type="button"
                  className={`meal-summary-card meal-summary-button ${
                    chartView === "supper" ? "selected" : ""
                  }`}
                  onClick={() => handleChartView("supper")}
                >
                  <span>Supper</span>

                  <strong>
                    {latestSupper === null
                      ? "Pending"
                      : latestSupper.toLocaleString()}
                  </strong>
                </button>

                {/* TOTAL */}

                <button
                  type="button"
                  className={`meal-summary-card meal-summary-button ${
                    chartView === "total" ? "selected" : ""
                  }`}
                  onClick={() => handleChartView("total")}
                >
                  <span>Total</span>

                  <strong>{latestTotal.toLocaleString()}</strong>

                  {latestSupper === null && <small>Supper pending</small>}
                </button>
              </div>
            )}
          </section>
          {/* =================================================
              MEAL COUNT TREND
          ================================================= */}
          <section className="dashboard-card">
            <div className="school-dashboard-section-title">
              <div>
                <h2>Meal Count Trend</h2>

                <p>
                  {chartView === "all" && "Breakfast, Lunch & Supper"}

                  {chartView === "breakfast" && "Breakfast trend"}

                  {chartView === "lunch" && "Lunch trend"}

                  {chartView === "supper" && "Supper trend"}

                  {chartView === "total" && "Daily total trend"}

                  {" • "}

                  {range === "weekly"
                    ? "Last 5 service days"
                    : "Last 22 service days"}
                </p>
              </div>

              {/* WEEKLY / MONTHLY */}

              <div className="meal-range-toggle">
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

            {mealError && <div className="login-error">{mealError}</div>}

            {loadingMeals ? (
              <div className="school-empty-history">Loading meal trends...</div>
            ) : chartData.length === 0 ? (
              <div className="school-empty-history">
                No meal-count history available yet.
              </div>
            ) : (
              <div className="meal-chart-wrap">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={chartData}
                    margin={{
                      top: 15,
                      right: 25,
                      left: 0,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />

                    <XAxis dataKey="date" />

                    <YAxis />

                    <Tooltip />

                    <Legend />

                    {/* =================================
                        ALL SERVICES
                    ================================= */}

                    {chartView === "all" && (
                      <>
                        <Line
                          type="monotone"
                          dataKey="breakfast"
                          name="Breakfast"
                          stroke="#2878d0"
                          strokeWidth={3}
                          connectNulls={false}
                          dot={{
                            r: 5,
                            fill: "#2878d0",
                            stroke: "#2878d0",
                          }}
                          activeDot={{
                            r: 7,
                          }}
                        />

                        <Line
                          type="monotone"
                          dataKey="lunch"
                          name="Lunch"
                          stroke="#1b9b62"
                          strokeWidth={3}
                          connectNulls={false}
                          dot={{
                            r: 5,
                            fill: "#1b9b62",
                            stroke: "#1b9b62",
                          }}
                          activeDot={{
                            r: 7,
                          }}
                        />

                        <Line
                          type="monotone"
                          dataKey="supper"
                          name="Supper"
                          stroke="#e58b23"
                          strokeWidth={3}
                          connectNulls={false}
                          dot={{
                            r: 5,
                            fill: "#e58b23",
                            stroke: "#e58b23",
                          }}
                          activeDot={{
                            r: 7,
                          }}
                        />
                      </>
                    )}

                    {/* =================================
                        BREAKFAST ONLY
                    ================================= */}

                    {(chartView === "all" || chartView === "breakfast") && (
                      <Line
                        type="monotone"
                        dataKey="breakfast"
                        name="Breakfast"
                        stroke="#2878d0"
                        strokeWidth={3}
                        connectNulls={false}
                        dot={{
                          r: 5,
                          fill: "#2878d0",
                          stroke: "#2878d0",
                        }}
                        activeDot={{
                          r: 7,
                        }}
                      />
                    )}

                    {/* =================================
                        LUNCH ONLY
                    ================================= */}

                    {(chartView === "all" || chartView === "lunch") && (
                      <Line
                        type="monotone"
                        dataKey="lunch"
                        name="Lunch"
                        stroke="#1b9b62"
                        strokeWidth={3}
                        connectNulls={false}
                        dot={{
                          r: 5,
                          fill: "#1b9b62",
                          stroke: "#1b9b62",
                        }}
                        activeDot={{
                          r: 7,
                        }}
                      />
                    )}

                    {/* =================================
                        SUPPER ONLY
                    ================================= */}

                    {(chartView === "all" || chartView === "supper") && (
                      <Line
                        type="monotone"
                        dataKey="supper"
                        name="Supper"
                        stroke="#e58b23"
                        strokeWidth={3}
                        connectNulls={false}
                        dot={{
                          r: 5,
                          fill: "#e58b23",
                          stroke: "#e58b23",
                        }}
                        activeDot={{
                          r: 7,
                        }}
                      />
                    )}

                    {/* =================================
                        DAILY TOTAL
                    ================================= */}

                    {chartView === "total" && (
                      <Line
                        type="monotone"
                        dataKey="total"
                        name="Daily Total"
                        stroke="#5b4bb7"
                        strokeWidth={3}
                        connectNulls={false}
                        dot={{
                          r: 5,
                          fill: "#5b4bb7",
                          stroke: "#5b4bb7",
                        }}
                        activeDot={{
                          r: 7,
                        }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default SchoolHub;
