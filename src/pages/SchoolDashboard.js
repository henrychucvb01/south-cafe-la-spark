import React, { useEffect, useState } from "react";
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

function SchoolDashboard({ location, employee, onBack, onEditFinishLine }) {
  const [todayCheck, setTodayCheck] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDashboard();
  }, [location]);

  async function loadDashboard() {
    if (!location?.id) {
      setError("Location information is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const today = new Date().toISOString().split("T")[0];

      // Today's Finish Line
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

      // Recent Finish Line history
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
          ascending: false,
        })
        .limit(10);

      if (historyError) {
        throw historyError;
      }

      setHistory(historyData || []);
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
            <div className="login-brand-subtitle">SCHOOL HUB</div>
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
              <strong>Today's Finish Line Check</strong>

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
                    Edit Finish Line
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
                <h2>Finish Line History</h2>
                <p>Most recent submissions</p>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="school-empty-history">
                No Finish Line history yet.
              </div>
            ) : (
              <div className="school-history-list">
                {history.map((check) => (
                  <div
                    className="school-history-row"
                    key={check.id}
                    onClick={() => onEditFinishLine(check)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        onEditFinishLine(check);
                      }
                    }}
                  >
                    <div className="school-history-date">
                      <span className={`school-history-status ${check.status}`}>
                        {check.status === "complete" ? "✓" : "!"}
                      </span>

                      <div>
                        <strong>{formatDate(check.service_date)}</strong>
                        <small>{check.employee_name}</small>
                      </div>
                    </div>

                    <div className="school-history-right">
                      <span className={`school-history-pill ${check.status}`}>
                        {check.status === "complete" ? "Complete" : "Attention"}
                      </span>

                      <small>{formatTime(check.submitted_at)}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

export default SchoolDashboard;
