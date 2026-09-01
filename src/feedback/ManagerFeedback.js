import React, { useEffect, useRef, useState } from "react";
import { FEEDBACK_CATEGORIES, submitFeedback } from "./feedbackService";

function ManagerFeedback({ location, employee, pageRoute }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("Bug");
  const [message, setMessage] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const messageRef = useRef(null);
  useEffect(() => { if (open) messageRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (message.trim().length < 5) { setError("Please enter at least 5 characters."); return; }
    setState("saving"); setError("");
    try { await submitFeedback({ location, employee, category, message, pageRoute }); setState("sent"); setMessage(""); }
    catch (submitError) { console.error("Feedback submission error:", submitError); setError("SPARK could not submit your feedback. Please try again."); setState("idle"); }
  }
  function close() { setOpen(false); setState("idle"); setError(""); }

  return <>
    <button type="button" className="spark-feedback-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog">Feedback</button>
    {open && <div className="spark-feedback-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="spark-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="spark-feedback-title">
        <button type="button" className="spark-feedback-close" onClick={close} aria-label="Close feedback">×</button>
        {state === "sent" ? <div className="spark-feedback-success"><span aria-hidden="true">✓</span><h2 id="spark-feedback-title">Thank you</h2><p>Your feedback was sent to the supervisor team.</p><button type="button" onClick={close}>Done</button></div> : <>
          <div className="spark-feedback-heading"><span>SPARK FEEDBACK</span><h2 id="spark-feedback-title">Help us improve</h2><p>Report a problem, share an idea, or ask a question.</p></div>
          <form onSubmit={handleSubmit}>
            <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{FEEDBACK_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Message<textarea ref={messageRef} value={message} onChange={(event) => { setMessage(event.target.value); setError(""); }} maxLength="2000" rows="5" placeholder="Tell us what happened or what would help…" /></label>
            <div className="spark-feedback-meta">Location {location?.location_code || "not assigned"} · {employee?.employee_name || "Manager"}</div>
            {error && <div className="spark-feedback-error" role="alert">{error}</div>}
            <button type="submit" className="spark-feedback-submit" disabled={state === "saving"}>{state === "saving" ? "Sending…" : "Submit Feedback"}</button>
          </form>
        </>}
      </section>
    </div>}
  </>;
}
export default ManagerFeedback;
