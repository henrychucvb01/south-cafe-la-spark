import React, { useCallback, useEffect, useState } from "react";
import { changeFeedbackStatus, FEEDBACK_STATUSES, loadSupervisorFeedback } from "./feedbackService";

function SupervisorFeedbackPanel({ supervisorPin }) {
  const [filter, setFilter] = useState("New");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const load = useCallback(async () => { setLoading(true); setError(""); try { setRows(await loadSupervisorFeedback(supervisorPin, filter)); } catch (loadError) { console.error("Feedback load error:", loadError); setError("Could not load feedback."); } finally { setLoading(false); } }, [filter, supervisorPin]);
  useEffect(() => { load(); }, [load]);
  async function update(row, status) { setSavingId(row.id); setError(""); try { await changeFeedbackStatus(supervisorPin, row.id, status); await load(); } catch (updateError) { console.error("Feedback status error:", updateError); setError("Could not update feedback status."); } finally { setSavingId(null); } }
  return <section className="dashboard-card supervisor-feedback-panel">
    <div className="command-section-header"><div><h3>Manager Feedback</h3><p>Review feedback submitted throughout the manager experience.</p></div><button type="button" className="command-refresh" onClick={load}>↻ Refresh</button></div>
    <div className="supervisor-feedback-filters">{["New", "Reviewing", "Resolved", "All"].map((item) => <button type="button" key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
    {error && <div className="command-error">{error}</div>}
    {loading ? <p className="supervisor-feedback-empty">Loading feedback…</p> : rows.length === 0 ? <p className="supervisor-feedback-empty">No {filter === "All" ? "" : filter.toLowerCase()} feedback to show.</p> : <div className="supervisor-feedback-list">{rows.map((row) => <article key={row.id} className="supervisor-feedback-card">
      <div className="supervisor-feedback-card-top"><div><span className={`feedback-category ${row.category.toLowerCase()}`}>{row.category}</span><h4>{row.school_name || "School not listed"}</h4><p>{row.location_code ? `Location ${row.location_code}` : "Location code not assigned"} · {row.employee_name || "Manager not available"}</p></div><select aria-label={`Status for feedback from ${row.school_name || "school"}`} value={row.status} disabled={savingId === row.id} onChange={(event) => update(row, event.target.value)}>{FEEDBACK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></div>
      <blockquote>{row.message}</blockquote><footer><span>Page: {row.page_route}</span><time dateTime={row.submitted_at}>{new Date(row.submitted_at).toLocaleString()}</time></footer>
    </article>)}</div>}
  </section>;
}
export default SupervisorFeedbackPanel;
