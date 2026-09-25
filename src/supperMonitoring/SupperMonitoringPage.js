import React, { useEffect, useRef, useState } from "react";
import ScheduledMonitoringDate from '../monitoring/ScheduledMonitoringDate';
import { supperSchedule, supperSequence } from '../monitoring/supperSchedule';
import { usePageNavigation } from "../navigation/PageNavigation";
import RestartMonitoringButton from "../monitoring/RestartMonitoringButton";
import { typeLabel, siteLabel, hasCurrentPdf } from "../monitoring/types";
import FinalPdfReview from "./FinalPdfReview";
import GuidedSections from "./GuidedSections";
import MonitoringHome from "./MonitoringHome";
import { editableGuided, canRestart, SLOTS, STATUSES } from "./workflow";
import SignaturePad from "./SignaturePad";
import { SECTIONS, OFFICIAL_FORM, changeDraft, newDraft, resumeDraft, weekDates, validate, findings } from "./model";
import { openSession, openSupervisorSession, getContext, closeSession, listMonitorings, getMonitoring, saveDraft, restartMonitoring, submitMonitoring, downloadReport } from "./service";
import "./supperMonitoring.css";
import { canonicalReport } from "./officialForm";

function Field({ id, label, value, onChange, errors = [], reveal = false, type = "text", multiline = false, ...props }) {
  const [touched, setTouched] = useState(false);
  const messages = reveal || touched ? errors.filter(e => e.field === id) : [];
  const control = { id, value: value ?? "", onChange: e => { setTouched(true); onChange(e.target.value); }, onBlur: () => setTouched(true), "aria-invalid": messages.length > 0, "aria-describedby": messages.length ? `${id}-error` : undefined, ...props };
  return <div className="sm-field"><label htmlFor={id}>{label}</label>{multiline ? <textarea {...control} rows={4} maxLength={4000} /> : <input {...control} type={type} maxLength={type === "text" ? 300 : undefined} />}{messages.length > 0 && <div id={`${id}-error`} className="sm-error">{[...new Set(messages.map(e => e.message))].join(" ")}</div>}</div>;
}

export default function SupperMonitoringPage({ location, employee, managerPin, supervisorPin, onBack, monitoringType = "supper" }) {
  const [token, setToken] = useState("");
  const initialOpen = useRef(false);
  const [context, setContext] = useState(null);
  const [reviewActive, setReviewActive] = useState(false);
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
  const readonly = !!record && !editableGuided(record, context);
  const [pdfReady, setPdfReady] = useState(false);
  const [serverIssues, setServerIssues] = useState([]);
  const schedule = supperSchedule({schedules:context?.supper_schedules,records,siteId:data?.monitoringSiteId || record?.monitoring_site_id || context?.monitoring_sites?.find(s=>s.kind==='main')?.id,year:data?.schoolYear,slot:data?.monitoringSlot});
  const scheduleErrors = data && !readonly && data.monitoringDate && !schedule.dates.includes(data.monitoringDate) ? [{section:0,field:'monitoringDate',message:'Select an eligible date from the published Supper schedule.'}] : [];
  const errors = data ? [...validate(data), ...scheduleErrors, ...serverIssues] : [];
  const visibleErrors = showErrors ? errors : [];
  function returnToParent() { if (data) return leaveEditor(); return run(async () => { if (token) await closeSession(token); onBack(); }); }
  usePageNavigation({ level: 1, title: data ? `Supper ${data.monitoringSlot === 'manager_1' ? '1' : data.monitoringSlot === 'supervisor' ? '2' : '3'}` : (supervisorPin ? 'Monitoring' : 'Monitorings'), destination: data ? (supervisorPin ? 'Monitoring' : 'Monitorings') : supervisorPin ? 'Supervisor Monitoring' : 'Manager Hub', disabled: busy || reviewActive, onNavigate: returnToParent });

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
      if (!managerPin && !supervisorPin) throw new Error("Your SPARK sign-in has ended. Return to Manager Hub and sign in again.");
      const session = supervisorPin ? await openSupervisorSession(location, supervisorPin) : await openSession(location, employee, managerPin);
      const latest = await listMonitorings(session);
      setContext(await getContext(session)); setToken(session); setRecords(latest);
    });
  }
  async function save(nextSection = section) {
    setShowErrors(true);
    const saved = await saveDraft(token, record, data, nextSection);
    setRecord(saved); setDirty(false); setNotice("Draft saved. You can return from any device.");
    return saved;
  }
  function change(field, value) {
    setServerIssues([]);
    setPdfReady(false);
    setData(current => changeDraft(current, field, value));
    setDirty(true); setNotice(field === "monitorName" || field === "coordinatorName" ? "Printed name updated. Only this signer needs to accept their signature." : field !== "signatures" && field !== "questionCursor" && (data.signatures.monitor || data.signatures.coordinator) ? "Report changed. Both signers must review and accept their signatures again." : "Unsaved changes — choose Save Draft or Continue.");
  }

  async function navigate(next, enforce = false) {
    if (enforce && !readonly && errors.some(e => e.section === section)) { setShowErrors(true); return; }
    setPdfReady(false);
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
  async function refresh() {
    const [latest, access] = await Promise.all([listMonitorings(token), getContext(token)]);
    setRecords(latest); setContext(access);
  }
  function openRecord(loaded) {
    const reason=supperSequence(records,loaded.monitoring_site_id,loaded.school_year,loaded.monitoring_slot);
    if(editableGuided(loaded,context) && reason){setError(reason);return;}
    setRecord(loaded); setData({ ...(editableGuided(loaded, context) ? resumeDraft(loaded.payload) : { ...newDraft(), ...loaded.payload }), schoolYear: loaded.school_year, monitoringSlot: loaded.monitoring_slot });
    setSection(editableGuided(loaded, context) ? loaded.current_section : 8); setDirty(false); setNotice(editableGuided(loaded, context) && !loaded.payload.milks ? "Enter two milk fat types and review the required menu components. Accept both signatures again after correcting the report." : editableGuided(loaded, context) && loaded.payload.guidedVersion !== 3 ? "Service times have been updated to 30 minutes. Review the report and accept both signatures again." : ""); setShowErrors(false);
  }
  async function acceptSignature(role, value) {
    if (!value) { change("signatures", { ...data.signatures, [role]: null }); return; }
    await run(async () => {
      const bytes = new TextEncoder().encode(canonicalReport(data));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const contentHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
      setData(current => ({...current, signatures: {...current.signatures, [role]: {...value, contentHash}}}));
      setDirty(true); setPdfReady(false); setNotice("Signature accepted. Save Draft or Continue to preserve it.");
    });
  }
  function choices(id, label, value, update) {
    return <div className="sm-field"><p>{label}</p><div role="group" aria-label={label} className="sm-answers">{[true,false].map(choice => <button key={String(choice)} type="button" aria-pressed={value === choice} onClick={() => update(choice)}>{choice ? "Yes" : "No"}</button>)}</div>{showErrors && errors.filter(e => e.field === id).map((e,i) => <p key={i} className="sm-error">{e.message}</p>)}</div>;
  }
  async function reportAction(action) {
    await run(async () => {
      const saved = dirty || !record ? await save() : record;
      if (action === "submit") {
        const completed = await submitMonitoring(token, saved);
        setRecord(completed); setData(completed.payload); setSection(8); setDirty(false); setNotice(completed.monitor_role === "supervisor" ? "Supervisor monitoring completed and locked. The official PDF is stored." : "Monitoring submitted for Supervisor review. The official PDF is stored.");
      } else await downloadReport(token, saved, action);
    });
  }
  function actionFields(q) { const action = data.correctiveActions[q.id] || {}; return <section className="sm-subcard" key={q.id}><h3>Question {q.id} — corrective action and follow-up required</h3>{[["description", "Description of non-compliance"], ["action", "Corrective action taken"], ["training", "Training and/or communication"], ["followUpPlan", "Follow-up plan"]].map(([key, label]) => <Field key={key} id={`action-${q.id}-${key}`} label={label} multiline value={action[key]} onChange={value => actionChange(q.id, key, value)} errors={errors} reveal={showErrors} />)}<div className="sm-grid">{[["actionDate", "Action / training date"], ["followUpDue", "Follow-up due date — within 60 operating days"]].map(([key, label]) => <Field key={key} id={`action-${q.id}-${key}`} label={label} type="date" value={action[key]} onChange={value => actionChange(q.id, key, value)} errors={errors} reveal={showErrors} />)}</div><Field id={`action-${q.id}-operatingDays`} label="Operating days from monitoring to planned follow-up" value={action.operatingDays} onChange={value => actionChange(q.id,"operatingDays",value)} errors={errors} reveal={showErrors} {...countOptions} /><label className="sm-check"><input type="checkbox" checked={!!action.calendarConfirmed} onChange={event => actionChange(q.id,"calendarConfirmed",event.target.checked)} />I checked the school operating calendar. The follow-up date is within 60 operating days, excluding closures.</label><label className="sm-check"><input type="checkbox" checked={!!action.followUpComplete} onChange={event => actionChange(q.id, "followUpComplete", event.target.checked)} />Follow-up has already been completed</label>{action.followUpComplete && <><Field id={`action-${q.id}-followUpDate`} label="Follow-up date" type="date" value={action.followUpDate} onChange={value => actionChange(q.id, "followUpDate", value)} errors={errors} reveal={showErrors} /><Field id={`action-${q.id}-followUpNotes`} label="Follow-up results" multiline value={action.followUpNotes} onChange={value => actionChange(q.id, "followUpNotes", value)} errors={errors} reveal={showErrors} /></>}</section>; }
  function renderSection() {
    if (section <= 4) return <GuidedSections {...{ section, data, change, field, errors, showErrors, countOptions, historyWeek, location, actionFields }} Field={Field} monitoringDateControl={<ScheduledMonitoringDate value={data.monitoringDate} onChange={value=>change('monitoringDate',value)} schedule={schedule} readonly={readonly}/>} slots={Object.fromEntries(Object.entries(SLOTS).filter(([slot]) => (slot === "supervisor") === ((record?.monitor_role || context?.actor_role) === "supervisor") && (slot===data.monitoringSlot || !supperSequence(records,data.monitoringSiteId || record?.monitoring_site_id,data.schoolYear,slot))))} />;
    if (section === 5) return <>{choices("followUpRequired", "Is follow-up required?", data.followUpRequired, value => change("followUpRequired", value))}{findings(data).length > 0 && field("correctiveActionDue", "Complete corrective action by", { type: "date" })}{data.followUpRequired && findings(data).length === 0 && field("extraFollowUp", "Follow-up details", { multiline: true })}<p>A No response requires corrective action and follow-up within 60 operating days, except 18a and 19. A Yes response to 19 requires corrective action and follow-up. Operating days are not calendar days.</p>{!OFFICIAL_FORM.ready && <p className="sm-notice">Findings cannot be determined until the official questions are available.</p>}{findings(data).filter(q => !["18b","19","20"].includes(q.id)).map(actionFields)}</>;
    if (section === 6) return <><p>A comment is always required. If there are no findings, you may enter “No Findings”.</p>{field("comments", "Comments", { multiline: true })}<button type="button" onClick={() => change("comments", "No Findings")} disabled={!!data.comments || findings(data).length > 0}>Use “No Findings”</button></>;
    if (section === 7) return <><p>Each signer should confirm their printed name, sign, and explicitly accept applying the signature to both official pages.</p>{["monitor", "coordinator"].map(role => <section className="sm-subcard" key={role}><h3>{role === "monitor" ? ((record?.monitor_role || context?.actor_role) === "supervisor" ? "Supervisor / AFSS" : "Manager / Monitor") : "After School Program Coordinator"}</h3>{field(`${role}Name`, `${role === "monitor" ? ((record?.monitor_role || context?.actor_role) === "supervisor" ? "Supervisor / AFSS" : "Manager / Monitor") : "After School Program Coordinator"} printed name`)}<SignaturePad key={`${record?.id}-${role}-${data.signatures[role]?.acceptedAt || "unsigned"}`} label={role === "monitor" ? ((record?.monitor_role || context?.actor_role) === "supervisor" ? "Supervisor / AFSS" : "Manager / Monitor") : "After School Program Coordinator"} name={data[`${role}Name`]} value={data.signatures[role]} disabled={readonly} onChange={value => acceptSignature(role, value)} />{visibleErrors.filter(e => e.field === `${role}Signature`).map((e, i) => <p className="sm-error" key={i}>{e.message}</p>)}</section>)}</>;
    if (section === 8) return <><p>Review each section. Select an item to see its details or fix a problem.</p><ul className="sm-review">{SECTIONS.slice(0, 8).map((label, i) => { const issues = errors.filter(e => e.section === i); return <li key={label}><button type="button" onClick={() => navigate(i)}>{issues.length ? "○" : "✓"} {label}<span>{issues.length ? `${issues.length} item(s) to review` : "Complete"}</span></button>{issues.length > 0 && <p>{issues[0].message}</p>}</li>; })}</ul><p><strong>School:</strong> {location.school_name}<br /><strong>Monitoring:</strong> {data.monitoringDate || "Not entered"}<br /><strong>Comments:</strong> {data.comments || "Not entered"}</p>{readonly && <><p>This monitoring is read-only. Status: {STATUSES[record.status]}.</p>{hasCurrentPdf(record) && <button type="button" onClick={() => reportAction("download")}>Download Official PDF</button>}</>}</>;
    return <><p>{(record?.monitor_role || context?.actor_role) === "supervisor" ? "Submission completes and locks your Supervisor monitoring." : "Submission sends this monitoring to the Supervisor for review."} Review the official report below before submitting.</p>{errors.length > 0 ? <div className="sm-notice"><h3>Needs Attention</h3><ul>{[...new Map(errors.map(e => [`${e.section}:${e.message}`,e])).values()].map((e,i) => <li key={i}><button type="button" onClick={() => navigate(e.section)}>{e.message}</button></li>)}</ul></div> : <><p role="status">✓ Monitoring Ready to Submit</p>{record && !dirty && !readonly && <FinalPdfReview key={`${record.id}-${record.revision}`} token={token} record={record} onReady={setPdfReady} onIssues={setServerIssues}/>}</>}<div className="sm-actions"><button className="sm-primary" type="button" disabled={busy || errors.length > 0 || readonly || dirty || !pdfReady} onClick={() => reportAction("submit")}>Submit Monitoring</button><button type="button" onClick={() => navigate(8)}>Return to Final Review</button></div></>;

  }

  return <div className="login-app sm-app"><header className="login-header"><div className="login-brand"><div className="login-logo spark-login-logo"><img src="/spark-192.png" alt="SPARK" /></div><div><div className="login-brand-name">SOUTH CAFÉ LA</div><div className="login-brand-subtitle">MONITORING</div></div></div><button type="button" disabled={busy || reviewActive} onClick={() => { if (data) leaveEditor(); else run(async () => { if (token) await closeSession(token); onBack(); }); }}>{data ? (readonly ? "Return to Monitorings" : "Save & Return to Monitorings") : supervisorPin ? "← School Overview" : "← Manager Hub"}</button></header>
    <main className="sm-main"><div className={!data && !supervisorPin ? "sm-title location-info-hero" : "sm-title"}><div><p className="homebase-eyebrow">{location?.school_name} · {location?.location_code}</p><h1>{data ? "Supper Monitoring" : supervisorPin ? "Monitoring" : "Monitorings"}</h1></div>{data && !readonly && <button className="sm-primary" type="button" disabled={busy} onClick={() => run(() => save())}>{busy ? "Saving…" : "Save Draft"}</button>}</div>
    {error && <div role="alert" className="sm-error sm-card">{error}{serverIssues.map((issue,i) => <button key={i} type="button" onClick={() => navigate(issue.section)}>Review {SECTIONS[issue.section]}</button>)}<p>Your unsaved work remains on this screen. Retry saving when the connection is restored. If your session expired, select Reconnect to continue with your current SPARK sign-in.</p>{data && <button type="button" disabled={busy} onClick={unlock}>Reconnect</button>}{record && !readonly && <button type="button" disabled={busy} onClick={() => run(async () => { const latest = await getMonitoring(token, record.id); setRecord(latest); setData(resumeDraft(latest.payload)); setSection(latest.current_section); setDirty(false); setNotice("Saved draft reopened; local unsaved changes discarded."); })}>Discard local changes and reopen saved draft</button>}</div>}
    {notice && <p role="status" className="sm-save-status">{notice}</p>}
    {!token ? <section className="sm-card sm-unlock"><h2>Opening your school's monitorings</h2><p>{busy ? "Connecting…" : "Connect using your current SPARK sign-in."}</p>{!busy && <button type="button" onClick={unlock}>Retry Connection</button>}</section> : !data ? <MonitoringHome initialType={monitoringType} onReviewActive={setReviewActive} token={token} records={records} context={context} location={location} onRefresh={refresh} onOpen={openRecord} onStart={(year,slot,identity) => { const reason=supperSequence(records,identity.monitoringSiteId,year,slot);if(reason){setError(reason);return;}setRecord(null); setData({ ...newDraft(supervisorPin ? "" : employee.employee_name, context.actor_role), schoolYear: year, monitoringSlot: slot, ...identity }); setSection(0); setDirty(true); setShowErrors(false); }} /> : <>
    <p><strong>{typeLabel(record?.monitoring_type || data.monitoringType)}</strong> · {record ? siteLabel(record) : context?.monitoring_sites?.find(s=>s.id===data.monitoringSiteId)?.name || "Main Site"}</p>
    {canRestart(record,context) && <RestartMonitoringButton disabled={busy} onRestart={()=>run(async()=>{const fresh=await restartMonitoring(token,record);openRecord(fresh);setServerIssues([]);setNotice("Monitoring restarted. Complete the guided form again.");})}/>}
    {record?.review_comments && <div className="sm-notice"><strong>Supervisor comments</strong><p>{record.review_comments}</p></div>}
    <nav className="sm-progress" aria-label="Monitoring progress"><p>Section {section + 1} of {SECTIONS.length} · {SECTIONS[section]}{readonly ? " · Read-only" : ""}</p><progress max={SECTIONS.length} value={section + 1} /><select aria-label="Go to section" value={section} disabled={busy} onChange={e => navigate(Number(e.target.value))}>{SECTIONS.map((label, i) => <option key={label} value={i}>{i + 1}. {label}</option>)}</select></nav>
    <section className="sm-card"><h2 ref={heading} tabIndex={-1}>{SECTIONS[section]}</h2><fieldset className="sm-editor" disabled={busy || (readonly && section !== 8)}>{renderSection()}</fieldset>{showErrors && <div role="status">{errors.filter(e => e.section === section).length === 0 ? <p>✓ This section is complete.</p> : <ul className="sm-errors">{errors.filter(e => e.section === section).map((e, i) => <li key={i}>{e.message}</li>)}</ul>}</div>}</section>
    <div className="sm-actions sm-bottom"><button type="button" disabled={busy || section === 0} onClick={() => navigate(section - 1)}>← Previous</button>{section < 9 && <button className="sm-primary" type="button" disabled={busy} onClick={() => navigate(section + 1, true)}>{readonly ? "Next →" : "Save & Continue →"}</button>}</div><p className="sm-save-status">{readonly ? "" : dirty ? "Changes have not been saved yet." : "Draft saved."} {readonly ? "This record is read-only until returned or unlocked for correction." : "Save Draft and Save & Continue preserve your work and current section."}</p>
    </>}</main></div>;
}
