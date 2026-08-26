import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

function isFinishLineCommentItem(item) {
  return String(item?.item_key || "").endsWith("_comment");
}

function getFinishLineExplanation(items, itemKey) {
  if (!itemKey || !Array.isArray(items)) {
    return "";
  }

  const commentItem = items.find(
    (item) => item.item_key === `${itemKey}_comment`
  );

  return commentItem?.answer || "";
}

function formatFinishLineAnswer(answer) {
  const value = String(answer || "").toLowerCase();

  if (value === "yes") return "YES";
  if (value === "no") return "NO";
  if (value === "na") return "N/A";

  return String(answer || "—").toUpperCase();
}

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isWeekday(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDay();

  return day >= 1 && day <= 5;
}

function getMonday(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  const day = date.getDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;

  date.setDate(date.getDate() - distanceFromMonday);

  return getLocalDateString(date);
}

function addDays(dateString, numberOfDays) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + numberOfDays);

  return getLocalDateString(date);
}

function SchoolDashboard({ location, employee, onBack, onEditFinishLine }) {
  const [todayCheck, setTodayCheck] = useState(null);
  const [history, setHistory] = useState([]);
  const [excludedDays, setExcludedDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // History filters
  const [historyPeriod, setHistoryPeriod] = useState("month");
  const [historyStatus, setHistoryStatus] = useState("all");
  const [weekOf, setWeekOf] = useState(getLocalDateString());
  const [monthValue, setMonthValue] = useState(
    getLocalDateString().slice(0, 7)
  );
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  useEffect(() => {
    loadDashboard();
  }, [location?.id]);

  async function loadDashboard() {
    if (!location?.id) {
      setError("Location information is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const today = getLocalDateString();

      // Today's Finish Line with detail items
      const { data: todayData, error: todayError } = await supabase
        .from("finish_line_checks")
        .select(
          `
          *,
          finish_line_items (*)
        `
        )
        .eq("location_id", location.id)
        .eq("service_date", today)
        .maybeSingle();

      if (todayError) {
        throw todayError;
      }

      setTodayCheck(todayData || null);

      // Load the location's full Finish Line history.
      // We generate missing service-day rows from this history below.
      const { data: historyData, error: historyError } = await supabase
        .from("finish_line_checks")
        .select(
          `
          id,
          service_date,
          submitted_at,
          employee_name,
          status
        `
        )
        .eq("location_id", location.id)
        .order("service_date", {
          ascending: true,
        });

      if (historyError) {
        throw historyError;
      }

      const { data: excludedData, error: excludedError } = await supabase
        .from("spark_excluded_days")
        .select("id, service_date, reason, notes, created_by")
        .eq("location_id", location.id)
        .order("service_date", {
          ascending: true,
        });

      if (excludedError) {
        throw excludedError;
      }

      setHistory(historyData || []);
      setExcludedDays(excludedData || []);
    } catch (err) {
      console.error("School dashboard error:", err);
      setError(err.message || "Could not load school dashboard.");
    } finally {
      setLoading(false);
    }
  }

  const attentionCount =
    todayCheck?.finish_line_items?.filter(
      (item) => item.requires_attention === true
    ).length || 0;

  function formatDate(dateString) {
    if (!dateString) {
      return "—";
    }

    return new Date(`${dateString}T12:00:00`).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatTime(dateString) {
    if (!dateString) {
      return "—";
    }

    return new Date(dateString).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  /*
  Build the real service-day history.

  Rules:
  - Existing Finish Line submissions always appear.
  - Existing weekend submissions remain visible if they already exist.
  - Past weekdays with no Finish Line appear as Not Completed.
  - Excluded / Unassigned dates appear as Excluded.
  - Weekends do not generate Not Completed rows.
  - Today does not become Not Completed until the day has passed.
  */
  const serviceDayHistory = useMemo(() => {
    const today = getLocalDateString();

    const checksByDate = new Map(
      history.map((check) => [check.service_date, check])
    );

    const excludedByDate = new Map(
      excludedDays.map((row) => [row.service_date, row])
    );

    const knownDates = [
      ...history.map((row) => row.service_date),
      ...excludedDays.map((row) => row.service_date),
    ].filter(Boolean);

    if (knownDates.length === 0) {
      return [];
    }

    knownDates.sort();

    // Start the calendar at the first real Finish Line/excluded record for
    // this location. This avoids inventing missing days before SPARK began.
    const firstDate = knownDates[0];

    const calendarDates = new Set(knownDates);

    let cursor = firstDate;

    while (cursor <= today) {
      if (isWeekday(cursor)) {
        calendarDates.add(cursor);
      }

      cursor = addDays(cursor, 1);
    }

    return Array.from(calendarDates)
      .filter((dateString) => dateString <= today)
      .sort((a, b) => b.localeCompare(a))
      .map((dateString) => {
        const check = checksByDate.get(dateString);
        const excluded = excludedByDate.get(dateString);

        if (check) {
          return {
            ...check,
            historyStatus: check.status,
            isMissing: false,
            isExcluded: false,
          };
        }

        if (excluded) {
          return {
            id: `excluded-${excluded.id}`,
            service_date: dateString,
            submitted_at: null,
            employee_name: excluded.created_by || "Supervisor",
            status: "excluded",
            historyStatus: "excluded",
            isMissing: false,
            isExcluded: true,
            excludedReason: excluded.reason || excluded.notes || "",
          };
        }

        // Only a PAST weekday becomes Not Completed.
        if (dateString < today && isWeekday(dateString)) {
          return {
            id: `missing-${dateString}`,
            service_date: dateString,
            submitted_at: null,
            employee_name: "",
            status: "missing",
            historyStatus: "missing",
            isMissing: true,
            isExcluded: false,
          };
        }

        return null;
      })
      .filter(Boolean);
  }, [history, excludedDays]);

  const filteredHistory = useMemo(() => {
    let rows = [...serviceDayHistory];

    if (historyPeriod === "week") {
      const monday = getMonday(weekOf);
      const friday = addDays(monday, 4);

      rows = rows.filter(
        (row) =>
          row.service_date >= monday && row.service_date <= friday
      );
    }

    if (historyPeriod === "month") {
      rows = rows.filter((row) =>
        row.service_date.startsWith(monthValue)
      );
    }

    if (historyPeriod === "range") {
      if (rangeStart) {
        rows = rows.filter((row) => row.service_date >= rangeStart);
      }

      if (rangeEnd) {
        rows = rows.filter((row) => row.service_date <= rangeEnd);
      }
    }

    if (historyStatus !== "all") {
      rows = rows.filter(
        (row) => row.historyStatus === historyStatus
      );
    }

    return rows;
  }, [
    serviceDayHistory,
    historyPeriod,
    historyStatus,
    weekOf,
    monthValue,
    rangeStart,
    rangeEnd,
  ]);

  function getHistoryVisual(row) {
    if (row.historyStatus === "complete") {
      return {
        icon: "✓",
        label: "Complete",
        background: "#e6f7ec",
        color: "#169c55",
        iconBackground: "#16ad64",
      };
    }

    if (row.historyStatus === "attention") {
      return {
        icon: "!",
        label: "Needs Attention",
        background: "#fff1e7",
        color: "#a85b18",
        iconBackground: "#e79032",
      };
    }

    if (row.historyStatus === "excluded") {
      return {
        icon: "—",
        label: "Excluded",
        background: "#eef2f6",
        color: "#667482",
        iconBackground: "#8b98a5",
      };
    }

    return {
      icon: "×",
      label: "Not Completed",
      background: "#fff0f0",
      color: "#a63d3d",
      iconBackground: "#d95c5c",
    };
  }

  function openHistoryRow(row) {
    if (row.isExcluded) {
      return;
    }

    if (row.isMissing) {
      // FinishLinePage already uses existingCheck.service_date as its
      // active service date. Passing a date-only object opens a blank
      // checklist for that historical date.
      onEditFinishLine({
        service_date: row.service_date,
        backfillMode: true,
      });

      return;
    }

    onEditFinishLine(row);
  }

  if (loading) {
    return (
      <div className="login-app">
        <main className="login-main">
          <div className="login-card">Loading school dashboard...</div>
        </main>
      </div>
    );
  }

  return (
    <div className="login-app">
      <header className="login-header">
        <div className="login-brand">
          <img src="/spark-192.png" alt="SPARK" className="spark-header-logo" />

          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>
            <div className="login-brand-subtitle">FINISH LINE OVERVIEW</div>
          </div>
        </div>

        <button className="supervisor-link" onClick={onBack}>
          ← School Dashboard
        </button>
      </header>

      <main className="login-main">
        <div className="school-dashboard-page">
          <div className="school-dashboard-header">
            <div>
              <div className="dashboard-small-label">
                LOCATION {location?.location_code}
              </div>

              <h1>{location?.school_name}</h1>
              <p>Signed in as {employee?.employee_name}</p>
            </div>

            <button className="dashboard-exit" onClick={loadDashboard}>
              ↻ Refresh
            </button>
          </div>

          {error && <div className="command-error">{error}</div>}

          <section
            className={`school-status-banner ${
              todayCheck?.status === "attention"
                ? "school-status-attention"
                : ""
            }`}
          >
            <div className="status-banner-icon">
              {todayCheck
                ? todayCheck.status === "attention"
                  ? "!"
                  : "✓"
                : "🏁"}
            </div>

            <div>
              <strong>Today's Finish Line Checklist</strong>

              <span>
                {!todayCheck && "Not submitted today"}
                {todayCheck?.status === "complete" && "Completed successfully"}
                {todayCheck?.status === "attention" &&
                  `${attentionCount} item${
                    attentionCount === 1 ? "" : "s"
                  } need attention`}
              </span>
            </div>

            {todayCheck && (
              <div className="school-status-time">
                <small>Submitted by</small>
                <strong>{todayCheck.employee_name}</strong>
                <small>{formatTime(todayCheck.submitted_at)}</small>
              </div>
            )}
          </section>

          {todayCheck && (
            <section className="dashboard-card">
              <div className="school-dashboard-section-title">
                <div>
                  <h2>Today's Finish Line</h2>
                  <p>End-of-day verification details</p>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  <span
                    className={`school-dashboard-status ${todayCheck.status}`}
                  >
                    {todayCheck.status === "complete"
                      ? "Complete"
                      : "Needs Attention"}
                  </span>

                  <button
                    type="button"
                    className="dashboard-exit"
                    onClick={() => onEditFinishLine(todayCheck)}
                  >
                    Edit Finish Line Checklist
                  </button>
                </div>
              </div>

              <div className="school-check-list">
                {todayCheck.finish_line_items
                  ?.filter((item) => !isFinishLineCommentItem(item))
                  .map((item) => {
                    const explanation = getFinishLineExplanation(
                      todayCheck.finish_line_items,
                      item.item_key
                    );

                    return (
                      <div
                        className="school-check-row"
                        key={item.id}
                        style={{ alignItems: "flex-start" }}
                      >
                        <div
                          className="school-check-label"
                          style={{ flex: 1, minWidth: 0 }}
                        >
                          <span
                            className={`school-check-dot ${
                              item.requires_attention ? "bad" : "good"
                            }`}
                          >
                            {item.requires_attention ? "!" : "✓"}
                          </span>

                          <div style={{ minWidth: 0 }}>
                            <span>{item.item_label}</span>

                            {explanation && (
                              <div
                                style={{
                                  marginTop: "5px",
                                  padding: "6px 8px",
                                  background: item.requires_attention
                                    ? "#fff4f4"
                                    : "#f5f7f9",
                                  borderRadius: "6px",
                                  color: item.requires_attention
                                    ? "#8f3535"
                                    : "#667482",
                                  fontSize: "11px",
                                  lineHeight: "1.4",
                                }}
                              >
                                <strong>Explanation:</strong> {explanation}
                              </div>
                            )}
                          </div>
                        </div>

                        <strong>
                          {formatFinishLineAnswer(item.answer)}
                        </strong>
                      </div>
                    );
                  })}
              </div>

              {todayCheck.comments && (
                <div className="school-dashboard-comments">
                  <h3>Comments</h3>
                  <p>{todayCheck.comments}</p>
                </div>
              )}
            </section>
          )}

          {!todayCheck && (
            <section className="dashboard-card">
              <div className="school-empty-history">
                No Finish Line Check has been submitted today.
              </div>
            </section>
          )}

          <section className="dashboard-card">
            <div className="school-dashboard-section-title">
              <div>
                <h2>Finish Line Checklist History</h2>
                <p>
                  Review completed, missed, and excluded service days. Past
                  missed days can be completed to correct the record.
                </p>
              </div>
            </div>

            {/* HISTORY FILTERS */}
            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                alignItems: "end",
                padding: "14px",
                marginBottom: "14px",
                border: "1px solid #e1e7ec",
                borderRadius: "10px",
                background: "#f8fafc",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "800",
                    marginBottom: "5px",
                  }}
                >
                  HISTORY
                </label>

                <select
                  value={historyPeriod}
                  onChange={(e) => setHistoryPeriod(e.target.value)}
                  style={{
                    padding: "9px 10px",
                    border: "1px solid #d6dfe7",
                    borderRadius: "7px",
                  }}
                >
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="range">Date Range</option>
                  <option value="all">All History</option>
                </select>
              </div>

              {historyPeriod === "week" && (
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: "800",
                      marginBottom: "5px",
                    }}
                  >
                    WEEK OF
                  </label>

                  <input
                    type="date"
                    value={weekOf}
                    onChange={(e) => setWeekOf(e.target.value)}
                    style={{
                      padding: "8px 10px",
                      border: "1px solid #d6dfe7",
                      borderRadius: "7px",
                    }}
                  />
                </div>
              )}

              {historyPeriod === "month" && (
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "11px",
                      fontWeight: "800",
                      marginBottom: "5px",
                    }}
                  >
                    MONTH
                  </label>

                  <input
                    type="month"
                    value={monthValue}
                    onChange={(e) => setMonthValue(e.target.value)}
                    style={{
                      padding: "8px 10px",
                      border: "1px solid #d6dfe7",
                      borderRadius: "7px",
                    }}
                  />
                </div>
              )}

              {historyPeriod === "range" && (
                <>
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "11px",
                        fontWeight: "800",
                        marginBottom: "5px",
                      }}
                    >
                      FROM
                    </label>

                    <input
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        border: "1px solid #d6dfe7",
                        borderRadius: "7px",
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "11px",
                        fontWeight: "800",
                        marginBottom: "5px",
                      }}
                    >
                      TO
                    </label>

                    <input
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        border: "1px solid #d6dfe7",
                        borderRadius: "7px",
                      }}
                    />
                  </div>
                </>
              )}

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: "800",
                    marginBottom: "5px",
                  }}
                >
                  STATUS
                </label>

                <select
                  value={historyStatus}
                  onChange={(e) => setHistoryStatus(e.target.value)}
                  style={{
                    padding: "9px 10px",
                    border: "1px solid #d6dfe7",
                    borderRadius: "7px",
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="complete">Complete</option>
                  <option value="attention">Needs Attention</option>
                  <option value="missing">Not Completed</option>
                  <option value="excluded">Excluded</option>
                </select>
              </div>

              <div
                style={{
                  marginLeft: "auto",
                  color: "#667482",
                  fontSize: "12px",
                  paddingBottom: "8px",
                }}
              >
                {filteredHistory.length} service day
                {filteredHistory.length === 1 ? "" : "s"}
              </div>
            </div>

            {filteredHistory.length === 0 ? (
              <div className="school-empty-history">
                No Finish Line history matches these filters.
              </div>
            ) : (
              <div className="school-history-list">
                {filteredHistory.map((row) => {
                  const visual = getHistoryVisual(row);
                  const canOpen = !row.isExcluded;

                  return (
                    <div
                      className="school-history-row"
                      key={row.id}
                      onClick={() => {
                        if (canOpen) {
                          openHistoryRow(row);
                        }
                      }}
                      role={canOpen ? "button" : undefined}
                      tabIndex={canOpen ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (
                          canOpen &&
                          (e.key === "Enter" || e.key === " ")
                        ) {
                          openHistoryRow(row);
                        }
                      }}
                      style={{
                        cursor: canOpen ? "pointer" : "default",
                        opacity: row.isExcluded ? 0.85 : 1,
                      }}
                    >
                      <div className="school-history-date">
                        <span
                          style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "50%",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            background: visual.iconBackground,
                            color: "#ffffff",
                            fontWeight: "900",
                          }}
                        >
                          {visual.icon}
                        </span>

                        <div>
                          <strong>{formatDate(row.service_date)}</strong>

                          {row.isMissing && (
                            <small>
                              Missed Finish Line — click to complete
                            </small>
                          )}

                          {row.isExcluded && (
                            <small>
                              {row.excludedReason || "Excluded / Unassigned day"}
                            </small>
                          )}

                          {!row.isMissing && !row.isExcluded && (
                            <small>{row.employee_name}</small>
                          )}
                        </div>
                      </div>

                      <div className="school-history-right">
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: "6px",
                            padding: "5px 8px",
                            background: visual.background,
                            color: visual.color,
                            fontWeight: "800",
                            fontSize: "11px",
                          }}
                        >
                          {visual.label}
                        </span>

                        {row.isMissing && (
                          <button
                            type="button"
                            className="dashboard-exit"
                            onClick={(e) => {
                              e.stopPropagation();
                              openHistoryRow(row);
                            }}
                          >
                            Complete Now
                          </button>
                        )}

                        {!row.isMissing &&
                          !row.isExcluded &&
                          row.submitted_at && (
                            <small>{formatTime(row.submitted_at)}</small>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default SchoolDashboard;
