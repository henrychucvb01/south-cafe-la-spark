import React, { useCallback, useEffect, useMemo, useState } from "react";
import { parseMonthlyReport, REPORT_TYPES } from "./monthlyImportParser";
import { checksumText, loadMonthlyImports, loadMonthlyScorecardDataset, saveMonthlyImport } from "./monthlyScorecardService";
import {buildSchoolScorecard} from "./monthlyScorecardCalculations";
import MonthlySchoolScorecard from "./MonthlySchoolScorecard";
import "./monthlyScorecards.css";

const REPORT_ORDER = ["production","cost"];
const monthStart = () => `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}-01`;
const schoolYearFor = (value) => {
  const date = new Date(`${value}T12:00:00`), year = date.getFullYear(), start = date.getMonth() >= 6 ? year : year-1;
  return `${start}-${String(start+1).slice(-2)}`;
};

export default function MonthlyScorecardsPage({ supervisorPin }) {
  const [month,setMonth] = useState(monthStart());
  const [schoolYear,setSchoolYear] = useState(schoolYearFor(monthStart()));
  const [imports,setImports] = useState([]);
  const [dataset,setDataset] = useState(null);
  const [selectedSchoolId,setSelectedSchoolId] = useState(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState("");
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const years = useMemo(() => { const current=Number(schoolYear.slice(0,4)); return [-1,0,1].map((n)=>`${current+n}-${String(current+n+1).slice(-2)}`); },[schoolYear]);

  const refresh = useCallback(async () => {
    if (!supervisorPin) return;
    setLoading(true); setError("");
    try { const [nextImports,nextDataset]=await Promise.all([loadMonthlyImports(supervisorPin,schoolYear,month),loadMonthlyScorecardDataset(supervisorPin,schoolYear,month)]);setImports(nextImports);setDataset(nextDataset); }
    catch (err) { setError(err.message || "Monthly import status could not be loaded."); }
    finally { setLoading(false); }
  },[supervisorPin,schoolYear,month]);
  useEffect(() => { refresh(); },[refresh]);

  async function upload(reportType,file) {
    if (!file) return;
    setBusy(reportType); setError(""); setMessage("");
    try {
      const text=await file.text();
      const parsed=parseMonthlyReport(text,reportType,month);
      const checksum=await checksumText(text);
      await saveMonthlyImport({supervisorPin,reportType,schoolYear,reportingMonth:month,filename:file.name,parsed,checksum});
      setMessage(`${REPORT_TYPES[reportType]} imported: ${parsed.normalizedRows.length} normalized rows, ${parsed.rejectedRows.length} rejected${parsed.ignoredRows.length ? `, ${parsed.ignoredRows.length} outside the selected month` : ""}${parsed.ignoredOutOfAreaRows.length ? `, ${parsed.ignoredOutOfAreaRows.length} out-of-area rows ignored` : ""}.`);
      await refresh();
    } catch (err) { setError(err.message || "Import failed before data was written."); }
    finally { setBusy(""); }
  }

  const cards=(dataset?.schools||[]).map((school)=>buildSchoolScorecard(school,dataset,month));
  const selectedCard=cards.find((card)=>String(card.school.directory_id)===String(selectedSchoolId));
  if(selectedCard) return <section className="monthly-scorecards"><MonthlySchoolScorecard card={selectedCard} onBack={()=>setSelectedSchoolId(null)}/></section>;
  return <section className="monthly-scorecards" aria-labelledby="monthly-scorecards-title">
    <div className="monthly-scorecards-heading">
      <div><span className="monthly-kicker">MONTHLY OPERATIONS</span><h3 id="monthly-scorecards-title">Monthly Scorecards</h3><p>Validate and store the two recurring LAUSD production reports. Uploading a corrected report safely replaces that report for the selected month.</p></div>
      <button type="button" className="command-refresh" onClick={refresh} disabled={loading}>↻ Refresh</button>
    </div>
    <div className="monthly-period-card">
      <label>School Year<select value={schoolYear} onChange={(e)=>setSchoolYear(e.target.value)}>{years.map((year)=><option key={year}>{year}</option>)}</select></label>
      <label>Reporting Month<input type="month" value={month.slice(0,7)} onChange={(e)=>{ const next=`${e.target.value}-01`; setMonth(next); setSchoolYear(schoolYearFor(next)); }} /></label>
    </div>
    {error && <div className="monthly-alert error" role="alert">{error}</div>}
    {message && <div className="monthly-alert success" role="status">{message}</div>}
    <div className="monthly-import-grid">
      {REPORT_ORDER.map((type) => {
        const batch=imports.find((item)=>item.report_type===type);
        return <article className="monthly-import-card" key={type}>
          <div className="monthly-import-title"><span aria-hidden="true">{type==="production"?"📋":"💵"}</span><div><h4>{REPORT_TYPES[type]}</h4><p>{type==="production"?"Menu and production detail":"Breakfast, Lunch, and Supper food cost"}</p></div></div>
          <div className={`monthly-status ${batch?.status || "missing"}`}>{batch ? batch.status : "Not uploaded"}</div>
          {batch ? <dl className="monthly-import-facts"><div><dt>File</dt><dd>{batch.original_filename}</dd></div><div><dt>Imported</dt><dd>{batch.imported_row_count.toLocaleString()} rows</dd></div><div><dt>Rejected</dt><dd>{batch.rejected_row_count.toLocaleString()} rows</dd></div><div><dt>Outside month</dt><dd>{Number(batch.ignored_row_count || 0).toLocaleString()} rows</dd></div><div><dt>Out of area</dt><dd>{Number(batch.out_of_area_row_count || 0).toLocaleString()} rows</dd></div><div><dt>Uploaded</dt><dd>{new Date(batch.uploaded_at).toLocaleString()}</dd></div></dl> : <p className="monthly-empty">No report stored for this month.</p>}
          {Array.isArray(batch?.warnings) && batch.warnings.length>0 && <ul className="monthly-warnings">{batch.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul>}
          <label className={`monthly-upload ${busy===type?"disabled":""}`}>{busy===type?"Processing…":batch?"Replace CSV":"Upload CSV"}<input type="file" accept=".csv,text/csv" disabled={Boolean(busy)} onChange={(e)=>{ upload(type,e.target.files?.[0]); e.target.value=""; }} /></label>
        </article>;
      })}
    </div>
    <div className="monthly-safety-note"><strong>Import safety</strong><span>SPARK checks the report structure, reporting month, site IDs, and supported meals before writing. Snack and Extra Sales are excluded. Existing SPARK meal-count data remains the verification source and is not re-imported here.</span></div>
    <div className="monthly-school-list-heading"><div><h3>School scorecards</h3><p>{cards.length} real schools · Test High School and out-of-area sites excluded</p></div></div>
    {loading?<div className="monthly-scorecard-loading">Loading school readiness…</div>:cards.length===0?<div className="monthly-alert error">No active scorecard schools were returned. Apply the monthly scorecard migration and retry.</div>:<div className="command-table-wrap"><table className="command-table monthly-school-table"><thead><tr><th>School</th><th>Production</th><th>Food cost</th><th>Meal data</th><th>Readiness</th><th></th></tr></thead><tbody>{cards.map((card)=>{const ready=card.current.hasProduction&&card.current.hasCost&&card.current.hasMeals;return <tr key={card.school.directory_id}><td><strong>{card.school.school_name}</strong><small>Location {card.school.location_code||"—"}</small></td><td><span className={`monthly-data-dot ${card.current.hasProduction?"ready":"missing"}`}>{card.current.hasProduction?"Available":"Missing"}</span></td><td><span className={`monthly-data-dot ${card.current.hasCost?"ready":"missing"}`}>{card.current.hasCost?"Available":"Missing"}</span></td><td><span className={`monthly-data-dot ${card.current.hasMeals?"ready":"missing"}`}>{card.current.hasMeals?"Available":"Missing"}</span></td><td><strong className={ready?"monthly-ready":"monthly-needs-data"}>{ready?"Ready":"Needs data"}</strong></td><td><button type="button" className="command-small-button" onClick={()=>setSelectedSchoolId(card.school.directory_id)}>View Scorecard</button></td></tr>})}</tbody></table></div>}
  </section>;
}
