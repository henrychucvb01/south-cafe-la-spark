import React, { useEffect, useRef, useState } from "react";
import SignaturePad from "./SignaturePad";
import { SECTIONS, DAYS, OFFICIAL_FORM, newDraft, weekDates, average, schoolYear, localDate, validate, applicableQuestions, findings } from "./model";
import { openSession, closeSession, listMonitorings, getMonitoring, saveDraft, submitMonitoring, downloadReport } from "./service";
import "./supperMonitoring.css";
import { canonicalReport } from "./officialForm";

function Field({ id, label, value, onChange, errors = [], reveal = false, type = "text", multiline = false, ...props }) {
  const [touched, setTouched] = useState(false);
  const messages = reveal || touched ? errors.filter(e => e.field === id) : [];
  const control = { id, value: value ?? "", onChange: e => { setTouched(true); onChange(e.target.value); }, onBlur: () => setTouched(true), "aria-invalid": messages.length > 0, "aria-describedby": messages.length ? `${id}-error` : undefined, ...props };
  return <div className="sm-field"><label htmlFor={id}>{label}</label>{multiline ? <textarea {...control} rows={4} maxLength={4000} /> : <input {...control} type={type} maxLength={type === "text" ? 300 : undefined} />}{messages.length > 0 && <div id={`${id}-error`} className="sm-error">{[...new Set(messages.map(e => e.message))].join(" ")}</div>}</div>;
}

export default function SupperMonitoringPage({ location, employee, managerPin, onBack }) {
  const [token, setToken] = useState("");
  const initialOpen = useRef(false);
  const [records, setRecords] = useState([]);
  const [record, setRecord] = useState(null);
  const [data, setData] = useState(null);
  const [section, setSection] = useState(0);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const heading = useRef(null);
  const readonly = record?.status === "completed";
  const [serverIssues, setServerIssues] = useState([]);
  const errors = data ? [...validate(data), ...serverIssues] : [];
  const visibleErrors = showErrors ? errors : [];

  useEffect(() => {
    const warn = event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { heading.current?.focus(); }, [section, !!data]);

  async function run(task) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { await task(); } catch (err) { setError(err.message || "SPARK could not save your work. Keep this page open and try again."); setServerIssues(err.errors || []); }
    finally { lock.current = false; setBusy(false); }
  }
  // Reuse the existing SPARK sign-in; never ask for a second PIN.
  useEffect(() => {
    if (initialOpen.current) return;
    initialOpen.current = true;
    unlock();
  });
  async function unlock() {
    await run(async () => {
      if (!managerPin) throw new Error("Your SPARK sign-in has ended. Return to Manager Hub and sign in again.");
      const session = await openSession(location, employee, managerPin);
      const latest = await listMonitorings(session);
      setToken(session); setRecords(latest);
    });
  }
  async function save(nextSection = section) {
    const saved = await saveDraft(token, record, data, nextSection);
    setRecord(saved); setDirty(false); setNotice("Draft saved. You can return from any device.");
    return saved;
  }
  function change(field, value) {
    setServerIssues([]);
    const invalidatesSignatures = field !== "signatures" && field !== "questionCursor" && (data.signatures.monitor || data.signatures.coordinator);
    setData(current => ({ ...current, [field]: value, ...(invalidatesSignatures ? { signatures: { monitor: null, coordinator: null } } : {}) }));
    setDirty(true); setNotice(invalidatesSignatures ? "Report changed. Both signers must review and accept their signatures again. Save Draft to preserve these changes." : "Unsaved changes — choose Save Draft or Continue.");
  }
  async function navigate(next) {
    await run(async () => {
      if (!readonly) await save(next);
      setSection(next); setShowErrors(false);
    });
  }
  async function leaveEditor() {
    await run(async () => {
      if (!readonly) await save();
      const latest = await listMonitorings(token);
      setRecords(latest); setData(null); setRecord(null); setNotice(""); setShowErrors(false);
    });
  }
  function field(id, label, options = {}) { return <Field key={id} id={id} label={label} value={data[id]} onChange={value => change(id, value)} errors={errors} reveal={showErrors} {...options} />; }
  const countOptions = { type: "number", min: "0", max: "1000000", step: "1", inputMode: "numeric" };
  function historyWeek(value) {
    const dates = weekDates(value);
    // Preserve counts by date only; never relabel a count with a different date.
    change("weekStart", dates[0] || "");
    change("history", dates.map(date => data.history.find(day => day.date === date) || { date, meals: "", attendance: "" }));
  }
  function actionChange(id, fieldName, value) { change("correctiveActions", { ...data.correctiveActions, [id]: { ...data.correctiveActions[id], [fieldName]: value } }); }
  function recordList(title, rows) {
    return <section className="sm-card"><h2>{title}</h2>{!rows.length ? <p>No monitorings in this group.</p> : <ul className="sm-records">{rows.map(item => <li key={item.id}><div><strong>{item.monitoring_date || "Monitoring date not entered"}</strong><span>{item.school_year || "School year pending"} · {item.status === "draft" ? "Draft" : "Completed"}</span><span>Monitor: {item.monitor_name}</span><span>{item.submitted_at ? `Submitted: ${new Date(item.submitted_at).toLocaleString()}` : `Saved: ${new Date(item.updated_at).toLocaleString()}`}</span></div><button type="button" disabled={busy} onClick={() => run(async () => { const loaded = await getMonitoring(token, item.id); setRecord(loaded); setData({ ...newDraft(), ...loaded.payload }); setSection(loaded.status === "completed" ? 8 : loaded.current_section); setDirty(false); setNotice(""); })}>{item.status === "draft" ? "Resume" : "View"}</button></li>)}</ul>}</section>;
  }
  async function acceptSignature(role, value) {
    if (!value) { change("signatures", { ...data.signatures, [role]: null }); return; }
    await run(async () => {
      const bytes = new TextEncoder().encode(canonicalReport(data));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const contentHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      change("signatures", { ...data.signatures, [role]: { ...value, contentHash } });
    });
  }
  function choices(id, label, value, update) {
    return <div className="sm-field"><p>{label}</p><div role="group" aria-label={label} className="sm-answers">{[true,false].map(choice => <button key={String(choice)} type="button" aria-pressed={value === choice} onClick={() => update(choice)}>{choice ? "Yes" : "No"}</button>)}</div>{showErrors && errors.filter(e => e.field === id).map((e,i) => <p key={i} className="sm-error">{e.message}</p>)}</div>;
  }
  async function questionStep(next) {
    await run(async () => {
      const updated = { ...data, questionCursor: next };
      if (!readonly) { const saved = await saveDraft(token, record, updated, section); setRecord(saved); setDirty(false); }
      setData(updated);
    });
  }
  async function reportAction(action) {
    await run(async () => {
      const saved = dirty || !record ? await save() : record;
      if (action === "submit") {
        const completed = await submitMonitoring(token, saved);
        setRecord(completed); setData(completed.payload); setSection(8); setDirty(false); setNotice("Monitoring submitted. The official PDF is stored and this record is read-only.");
      } else await downloadReport(token, saved, action);
    });
  }
  function renderSection() {
    if (section === 0) return <><p>Confirm the date and the time you arrived and left. Your school is fixed to your authorized location.</p><p><strong>{location.school_name}</strong> · {location.location_code}</p><div className="sm-grid">{field("monitoringDate", "Monitoring date", { type: "date" })}{field("arrivalTime", "Arrival time", { type: "time" })}{field("departureTime", "Departure time", { type: "time" })}</div>{choices("unannounced", "Was this visit unannounced?", data.unannounced, value => change("unannounced", value))}<p>School year: {schoolYear(data.monitoringDate) || "Choose a monitoring date"}</p></>;
    if (section === 1) return <><p>Select any date in the history week. SPARK fills Monday through Friday. Changing the week preserves entries only for matching dates.</p><Field id="weekStart" label="Choose a Monday–Friday week" type="date" value={data.weekStart} onChange={historyWeek} errors={errors} reveal={showErrors} />{data.history.length > 0 && <><p><strong>{data.history[0].date} through {data.history[4]?.date}</strong></p><div className="sm-history"><div className="sm-history-heading"><span>Day / Date</span><span>Supper Meal Count</span><span>Attendance</span></div>{data.history.map((day, index) => <div className="sm-history-row" key={day.date}><strong>{DAYS[index]}<small>{day.date}</small></strong>{["meals", "attendance"].map(key => <Field key={key} id={`${key}-${index}`} label={`${DAYS[index]} ${key === "meals" ? "Supper Meal Count" : "attendance"}`} value={day[key]} errors={errors} reveal={showErrors} {...countOptions} onChange={value => change("history", data.history.map((row, i) => i === index ? { ...row, [key]: value } : row))} />)}</div>)}</div></>}<p className="sm-summary">Five-day meal-count average: <strong>{average(data.history) === null ? "Enter all five meal counts" : average(data.history).toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong></p><p>Attendance must be higher than the Supper Meal Count on every day. The monitoring date cannot be in this week.</p></>;
    if (section === 2) return <><p>Enter the service details and counts observed today.</p><div className="sm-grid">{field("approvedServiceTime", "CDE-approved service time")}{field("adultMeals", "Adult meals", countOptions)}{field("programName", "ASP / Program name")}{field("programType", "Program information / type (if applicable)")}{field("serviceStart", "Service start time", { type: "time" })}{field("serviceEnd", "Service end time", { type: "time" })}{field("todayMeals", "Today's Supper Meal Count", countOptions)}{field("todayAttendance", "Today's attendance", countOptions)}</div></>;
    if (section === 3) return <><p>Enter the specific food and serving size for each applicable category. Include units, such as cups, ounces, or each.</p>{data.menu.map((item, index) => <section className="sm-subcard" key={item.category}><h3>{item.category}</h3><label className="sm-check"><input type="checkbox" checked={item.applicable} onChange={event => change("menu", data.menu.map((row, i) => i === index ? { ...row, applicable: event.target.checked } : row))} />This category applies</label>{item.applicable && <div className="sm-grid">{["item", "serving"].map(key => <Field key={key} id={key === "item" ? `menu-${index}` : `serving-${index}`} label={key === "item" ? `${item.category} food/menu item` : `${item.category} serving size`} value={item[key]} errors={errors} reveal={showErrors} onChange={value => change("menu", data.menu.map((row, i) => i === index ? { ...row, [key]: value } : row))} />)}</div>}</section>)}</>;
    if (section === 4) {
      const questions = applicableQuestions(data);
      const index = Math.max(0, Math.min(data.questionCursor || 0, questions.length - 1));
      const q = questions[index];
      return <><p>Question {index + 1} of {questions.length}. Answers are mapped to the official report.</p><section className="sm-subcard"><h3>Question {q.id}</h3><p>{q.text}</p>{q.tip && <p className="sm-notice">{q.tip}</p>}{q.id === "20" && data.answers["20"] === "yes" && findings(data).length > 0 && <p className="sm-notice">You reported findings elsewhere. Review this overall assessment after documenting the corrective actions.</p>}<div role="group" aria-label={`Question ${q.id}`} className="sm-answers">{q.options.map(option => <button type="button" key={option} aria-pressed={data.answers[q.id] === option} onClick={() => change("answers", { ...data.answers, [q.id]: option, ...(q.id === "18a" && option === "no" ? { "18b": "na" } : {}) })}>{option === "na" ? "N/A" : option === "yes" ? "Yes" : "No"}</button>)}</div></section><div className="sm-actions"><button type="button" disabled={index === 0} onClick={() => questionStep(index-1)}>Previous Question</button><button type="button" disabled={index === questions.length-1} onClick={() => questionStep(index+1)}>Save & Next Question</button></div>{data.answers["18a"] === "no" && <p>18b is marked N/A because 18a is No.</p>}</>;
    }
    if (section === 5) return <>{choices("followUpRequired", "Is follow-up required?", data.followUpRequired, value => change("followUpRequired", value))}{findings(data).length > 0 && field("correctiveActionDue", "Complete corrective action by", { type: "date" })}{data.followUpRequired && findings(data).length === 0 && field("extraFollowUp", "Follow-up details", { multiline: true })}<p>A No response requires corrective action and follow-up within 60 operating days, except 18a and 19. A Yes response to 19 requires corrective action and follow-up. Operating days are not calendar days.</p>{!OFFICIAL_FORM.ready && <p className="sm-notice">Findings cannot be determined until the official questions are available.</p>}{data.answers["18a"] === "yes" && data.answers["18b"] === "no" && <>{field("repeatedFindings", "Repeated findings for 18b", { multiline: true })}{field("repeatedAction", "Action taken for repeated findings", { multiline: true })}</>}{findings(data).map(q => { const action = data.correctiveActions[q.id] || {}; return <section className="sm-subcard" key={q.id}><h3>Question {q.id} — corrective action and follow-up required</h3>{[["description", "Description of non-compliance"], ["action", "Corrective action taken"], ["training", "Training and/or communication"], ["followUpPlan", "Follow-up plan"]].map(([key, label]) => <Field key={key} id={`action-${q.id}-${key}`} label={label} multiline value={action[key]} onChange={value => actionChange(q.id, key, value)} errors={errors} reveal={showErrors} />)}<div className="sm-grid">{[["actionDate", "Action / training date"], ["followUpDue", "Follow-up due date — within 60 operating days"]].map(([key, label]) => <Field key={key} id={`action-${q.id}-${key}`} label={label} type="date" value={action[key]} onChange={value => actionChange(q.id, key, value)} errors={errors} reveal={showErrors} />)}</div><Field id={`action-${q.id}-operatingDays`} label="Operating days from monitoring to planned follow-up" value={action.operatingDays} onChange={value => actionChange(q.id,"operatingDays",value)} errors={errors} reveal={showErrors} {...countOptions} /><label className="sm-check"><input type="checkbox" checked={!!action.calendarConfirmed} onChange={event => actionChange(q.id,"calendarConfirmed",event.target.checked)} />I checked the school operating calendar. The follow-up date is within 60 operating days, excluding closures.</label><label className="sm-check"><input type="checkbox" checked={!!action.followUpComplete} onChange={event => actionChange(q.id, "followUpComplete", event.target.checked)} />Follow-up has already been completed</label>{action.followUpComplete && <><Field id={`action-${q.id}-followUpDate`} label="Follow-up date" type="date" value={action.followUpDate} onChange={value => actionChange(q.id, "followUpDate", value)} errors={errors} reveal={showErrors} /><Field id={`action-${q.id}-followUpNotes`} label="Follow-up results" multiline value={action.followUpNotes} onChange={value => actionChange(q.id, "followUpNotes", value)} errors={errors} reveal={showErrors} /></>}</section>; })}</>;
    if (section === 6) return <><p>A comment is always required. If there are no findings, you may enter “No Findings”.</p>{field("comments", "Comments", { multiline: true })}<button type="button" onClick={() => change("comments", "No Findings")} disabled={!!data.comments || findings(data).length > 0}>Use “No Findings”</button></>;
    if (section === 7) return <><p>Each signer should confirm their printed name, sign, and explicitly accept applying the signature to both official pages.</p>{["monitor", "coordinator"].map(role => <section className="sm-subcard" key={role}><h3>{role === "monitor" ? "Manager / Monitor" : "ASP Coordinator"}</h3>{field(`${role}Name`, `${role === "monitor" ? "Manager / Monitor" : "ASP Coordinator"} printed name`)}<SignaturePad key={`${record?.id}-${role}-${data.signatures[role]?.acceptedAt || "unsigned"}`} label={role === "monitor" ? "Manager / Monitor" : "ASP Coordinator"} name={data[`${role}Name`]} value={data.signatures[role]} disabled={readonly} onChange={value => acceptSignature(role, value)} />{visibleErrors.filter(e => e.field === `${role}Signature`).map((e, i) => <p className="sm-error" key={i}>{e.message}</p>)}</section>)}</>;
    if (section === 8) return <><p>Review each section. Select an item to see its details or fix a problem.</p><ul className="sm-review">{SECTIONS.slice(0, 8).map((label, i) => { const issues = errors.filter(e => e.section === i); return <li key={label}><button type="button" onClick={() => navigate(i)}>{issues.length ? "○" : "✓"} {label}<span>{issues.length ? `${issues.length} item(s) to review` : "Complete"}</span></button>{issues.length > 0 && <p>{issues[0].message}</p>}</li>; })}</ul><p><strong>School:</strong> {location.school_name}<br /><strong>Monitoring:</strong> {data.monitoringDate || "Not entered"}<br /><strong>Comments:</strong> {data.comments || "Not entered"}</p>{readonly && <><p>This completed monitoring is read-only.</p><button type="button" onClick={() => reportAction("download")}>Download Official PDF</button></>}</>;
    return <><p>Submission locks this monitoring and stores the completed official two-page report. Leave a copy with the FSM and ASP coordinator at the time of the review.</p>{errors.length > 0 && <p className="sm-notice">{errors.length} item(s) need attention. Return to Final Review to correct them.</p>}<div className="sm-actions"><button type="button" disabled={busy || errors.length > 0 || readonly} onClick={() => reportAction("preview")}>Preview Official PDF</button><button className="sm-primary" type="button" disabled={busy || errors.length > 0 || readonly} onClick={() => reportAction("submit")}>Submit Monitoring</button><button type="button" onClick={() => navigate(8)}>Return to Final Review</button></div></>;

  }

  return <div className="login-app sm-app"><header className="login-header"><div className="login-brand"><div className="login-logo spark-login-logo"><img src="/spark-192.png" alt="SPARK" /></div><div><div className="login-brand-name">SOUTH CAFÉ LA</div><div className="login-brand-subtitle">SUPPER MONITORING</div></div></div><button type="button" disabled={busy} onClick={() => { if (data) leaveEditor(); else run(async () => { if (token) await closeSession(token); onBack(); }); }}>{data ? (readonly ? "Return to Monitorings" : "Save & Return to Monitorings") : "← Manager Hub"}</button></header>
    <main className="sm-main"><div className="sm-title"><div><p className="homebase-eyebrow">{location?.school_name} · {location?.location_code}</p><h1>Supper Monitoring</h1></div>{data && !readonly && <button className="sm-primary" type="button" disabled={busy} onClick={() => run(() => save())}>{busy ? "Saving…" : "Save Draft"}</button>}</div>
    {error && <div role="alert" className="sm-error sm-card">{error}{serverIssues.map((issue,i) => <button key={i} type="button" onClick={() => navigate(issue.section)}>Review {SECTIONS[issue.section]}</button>)}<p>Your unsaved work remains on this screen. Retry saving when the connection is restored. If your session expired, select Reconnect to continue with your current SPARK sign-in.</p>{data && <button type="button" disabled={busy} onClick={unlock}>Reconnect</button>}{record && !readonly && <button type="button" disabled={busy} onClick={() => run(async () => { const latest = await getMonitoring(token, record.id); setRecord(latest); setData({ ...newDraft(), ...latest.payload }); setSection(latest.current_section); setDirty(false); setNotice("Saved draft reopened; local unsaved changes discarded."); })}>Discard local changes and reopen saved draft</button>}</div>}
    {notice && <p role="status" className="sm-save-status">{notice}</p>}
    {!token ? <section className="sm-card sm-unlock"><h2>Opening your school's monitorings</h2><p>{busy ? "Connecting…" : "Connect using your current SPARK sign-in."}</p>{!busy && <button type="button" onClick={unlock}>Retry Connection</button>}</section> : !data ? <><div className="sm-notice">Prepare a monitoring at your own pace. Save drafts and return from any device. Submitted reports are read-only.</div><div className="sm-actions"><button className="sm-primary" type="button" disabled={busy} onClick={() => { setRecord(null); setData(newDraft(employee.employee_name)); setSection(0); setDirty(true); setShowErrors(false); }}>+ Start New Monitoring</button><button type="button" disabled={busy} onClick={() => run(async () => setRecords(await listMonitorings(token)))}>Refresh</button></div>{recordList("Drafts / In Progress", records.filter(r => r.status === "draft"))}{recordList("Completed Monitorings", records.filter(r => r.status === "completed" && r.school_year === schoolYear(localDate())))}{recordList("Previous Monitorings", records.filter(r => r.status === "completed" && r.school_year !== schoolYear(localDate())))}</> : <>
    <nav className="sm-progress" aria-label="Monitoring progress"><p>Section {section + 1} of {SECTIONS.length} · {SECTIONS[section]}{readonly ? " · Read-only" : ""}</p><progress max={SECTIONS.length} value={section + 1} /><select aria-label="Go to section" value={section} disabled={busy} onChange={e => navigate(Number(e.target.value))}>{SECTIONS.map((label, i) => <option key={label} value={i}>{i + 1}. {label}</option>)}</select></nav>
    <section className="sm-card"><h2 ref={heading} tabIndex={-1}>{SECTIONS[section]}</h2><fieldset className="sm-editor" disabled={busy || (readonly && section !== 8)}>{renderSection()}</fieldset>{!readonly && section < 8 && <button type="button" disabled={busy} onClick={() => setShowErrors(true)}>Check This Section</button>}{showErrors && <div role="status">{errors.filter(e => e.section === section).length === 0 ? <p>✓ This section is complete.</p> : <ul className="sm-errors">{errors.filter(e => e.section === section).map((e, i) => <li key={i}>{e.message}</li>)}</ul>}</div>}</section>
    <div className="sm-actions sm-bottom"><button type="button" disabled={busy || section === 0} onClick={() => navigate(section - 1)}>← Previous</button>{section < 9 && <button className="sm-primary" type="button" disabled={busy} onClick={() => navigate(section + 1)}>{readonly ? "Next →" : "Save & Continue →"}</button>}</div><p className="sm-save-status">{readonly ? "" : dirty ? "Changes have not been saved yet." : "Draft saved."} {readonly ? "Completed records cannot be edited." : "Save Draft and Save & Continue preserve your work and current section."}</p>
    </>}</main></div>;
}
