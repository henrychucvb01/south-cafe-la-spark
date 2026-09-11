import React, { useCallback, useEffect, useMemo, useState } from "react";
import { parseMonthlyReport, REPORT_TYPES } from "./monthlyImportParser";
import {
  checksumText,
  loadMonthlyImports,
  loadMonthlyScorecardDataset,
  saveMonthlyImport,
} from "./monthlyScorecardService";
import { buildSchoolScorecard } from "./monthlyScorecardCalculations";
import {
  exportSingleSchoolPdf,
  exportAllSchoolsPdf,
  isExcludedSchool,
} from "./scorecardPdfGenerator";
import MonthlySchoolScorecard from "./MonthlySchoolScorecard";
import "./monthlyScorecards.css";

const REPORT_ORDER = ["production", "cost"];
const todayString = () => new Date().toISOString().slice(0, 10);
const firstDayOfMonth = (date = new Date()) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
};
const schoolYearFor = (value) => {
  const date = new Date(`${value}T12:00:00`);
  const year = date.getFullYear();
  const start = date.getMonth() >= 6 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
};

export default function MonthlyScorecardsPage({ supervisorPin }) {
  // Date Range Controls
  const [startDate, setStartDate] = useState(firstDayOfMonth());
  const [endDate, setEndDate] = useState(todayString());
  const [appliedRange, setAppliedRange] = useState({
    startDate: firstDayOfMonth(),
    endDate: todayString(),
  });

  const [schoolYear, setSchoolYear] = useState(schoolYearFor(firstDayOfMonth()));
  const [imports, setImports] = useState([]);
  const [dataset, setDataset] = useState(null);
  const [selectedSchoolId, setSelectedSchoolId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [exportStatus, setExportStatus] = useState("");
  const [exportingAll, setExportingAll] = useState(false);
  const [exportingSingleId, setExportingSingleId] = useState(null);
  const [dragging, setDragging] = useState("");

  const refresh = useCallback(async () => {
    if (!supervisorPin) return;
    setLoading(true);
    setError("");

    try {
      const reportingMonth = `${appliedRange.startDate.slice(0, 7)}-01`;
      const [nextImports, nextDataset] = await Promise.all([
        loadMonthlyImports(supervisorPin, schoolYear, reportingMonth),
        loadMonthlyScorecardDataset(supervisorPin, schoolYear, reportingMonth),
      ]);
      setImports(nextImports);
      setDataset(nextDataset);
    } catch (err) {
      setError(err.message || "Scorecard data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [supervisorPin, schoolYear, appliedRange]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Date Validation & Apply
  function handleApplyRange() {
    setError("");
    setMessage("");

    if (!startDate || !endDate) {
      setError("Please provide both a Start Date and an End Date.");
      return;
    }
    if (endDate < startDate) {
      setError("End Date cannot be before Start Date.");
      return;
    }
    if (endDate > todayString()) {
      setError("End Date cannot be in the future beyond available data.");
      return;
    }

    setAppliedRange({ startDate, endDate });
    setSchoolYear(schoolYearFor(startDate));
  }

  // Upload handler for CSV production / cost files
  async function upload(reportType, file) {
    if (!file) return;
    setBusy(reportType);
    setError("");
    setMessage("");

    try {
      const reportingMonth = `${appliedRange.startDate.slice(0, 7)}-01`;
      const text = await file.text();
      const parsed = parseMonthlyReport(text, reportType, reportingMonth);
      const checksum = await checksumText(text);
      await saveMonthlyImport({
        supervisorPin,
        reportType,
        schoolYear,
        reportingMonth,
        filename: file.name,
        parsed,
        checksum,
      });
      setMessage(
        `${REPORT_TYPES[reportType]} imported: ${parsed.normalizedRows.length} normalized rows.`
      );
      await refresh();
    } catch (err) {
      setError(err.message || "Import failed before data was written.");
    } finally {
      setBusy("");
    }
  }

  // Build cards for all schools
  const cards = useMemo(() => {
    return (dataset?.schools || [])
      .filter((school) => !isExcludedSchool(school))
      .map((school) =>
        buildSchoolScorecard(school, dataset, appliedRange)
      );
  }, [dataset, appliedRange]);

  // Individual PDF Export Handler
  async function handleExportSingle(card) {
    if (!card.current.hasMeals && !card.current.hasProduction && !card.current.hasCost) {
      setError(`No valid scorecard data exists for ${card.school.school_name} in this date range.`);
      return;
    }

    setExportingSingleId(card.school.directory_id);
    setError("");
    setMessage("");

    try {
      await exportSingleSchoolPdf(card, appliedRange);
      setMessage(`Exported PDF for ${card.school.school_name}.`);
    } catch (err) {
      setError(err.message || `Failed to export PDF for ${card.school.school_name}.`);
    } finally {
      setExportingSingleId(null);
    }
  }

  // Export All Schools Combined Multi-Page PDF
  async function handleExportAll() {
    if (exportingAll) return;
    setExportingAll(true);
    setError("");
    setMessage("");
    setExportStatus("Preparing combined PDF export...");

    try {
      const result = await exportAllSchoolsPdf(
        cards,
        appliedRange,
        (current, total, schoolName) => {
          setExportStatus(`Generating ${current} of ${total} school scorecards (${schoolName})...`);
        }
      );
      setMessage(
        `Successfully exported combined PDF for ${result.exportedCount} school scorecards.${
          result.skippedCount > 0 ? ` (${result.skippedCount} skipped due to missing data or demo status)` : ""
        }`
      );
    } catch (err) {
      setError(err.message || "Combined PDF export failed.");
    } finally {
      setExportingAll(false);
      setExportStatus("");
    }
  }

  // If a school's scorecard is being viewed on screen
  const selectedCard = cards.find(
    (card) => String(card.school.directory_id) === String(selectedSchoolId)
  );
  if (selectedCard) {
    return (
      <section className="monthly-scorecards">
        <MonthlySchoolScorecard
          card={selectedCard}
          onBack={() => setSelectedSchoolId(null)}
        />
      </section>
    );
  }

  return (
    <section className="monthly-scorecards" aria-labelledby="monthly-scorecards-title">
      <div className="monthly-scorecards-heading">
        <div>
          <span className="monthly-kicker">MONTHLY OPERATIONS</span>
          <h3 id="monthly-scorecards-title">Monthly Scorecards</h3>
          <p>
            Review supervisor schools for the selected reporting range, view scorecards, or export individual and combined multi-page PDFs.
          </p>
        </div>
        <button
          type="button"
          className="command-refresh"
          onClick={refresh}
          disabled={loading}
        >
          ↻ Refresh
        </button>
      </div>

      {/* Date Range Selector & Actions Bar */}
      <div className="monthly-period-card" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: "14px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "12px" }}>
          <label style={{ display: "flex", flexDirection: "column", fontSize: "11px", fontWeight: "800" }}>
            Start Date
            <input
              type="date"
              value={startDate}
              max={todayString()}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid #d4dde5", marginTop: "4px" }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", fontSize: "11px", fontWeight: "800" }}>
            End Date
            <input
              type="date"
              value={endDate}
              max={todayString()}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: "8px 10px", borderRadius: "6px", border: "1px solid #d4dde5", marginTop: "4px" }}
            />
          </label>

          <button
            type="button"
            className="command-small-button"
            onClick={handleApplyRange}
            style={{ padding: "9px 18px", fontWeight: "800", height: "38px" }}
          >
            Apply
          </button>
        </div>

        <div>
          <button
            type="button"
            className="finish-line-submit finish-line-ready"
            onClick={handleExportAll}
            disabled={exportingAll || loading || cards.length === 0}
            style={{ padding: "9px 18px", fontWeight: "800", height: "38px" }}
          >
            {exportingAll ? (exportStatus || "Generating scorecards...") : "Export All Schools to PDF"}
          </button>
        </div>
      </div>

      {exportStatus && (
        <div style={{ margin: "10px 0", color: "#16593b", fontWeight: "700" }}>
          ⏳ {exportStatus}
        </div>
      )}

      {error && (
        <div className="monthly-alert error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="monthly-alert success" role="status">
          {message}
        </div>
      )}

      {/* File Upload Dropzones */}
      <div className="monthly-upload-guidance">
        <strong>Report Imports ({appliedRange.startDate.slice(0, 7)})</strong>
        <span>Drop monthly production and daily food cost CSV files below to refresh source records.</span>
      </div>

      <div className="monthly-import-grid">
        {REPORT_ORDER.map((type) => {
          const batch = imports.find((item) => item.report_type === type);
          return (
            <article
              className={`monthly-import-card ${dragging === type ? "dragging" : ""}`}
              key={type}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(type);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) setDragging("");
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging("");
                if (!busy) upload(type, e.dataTransfer.files?.[0]);
              }}
            >
              <div className="monthly-import-title">
                <span aria-hidden="true">{type === "production" ? "📋" : "💵"}</span>
                <div>
                  <h4>{REPORT_TYPES[type]}</h4>
                  <p>{type === "production" ? "Menu & production detail" : "Food cost detail"}</p>
                </div>
              </div>
              <div className={`monthly-status ${batch?.status || "missing"}`}>
                {batch ? batch.status : "Not uploaded"}
              </div>
              <label className={`monthly-upload ${busy === type ? "disabled" : ""}`}>
                <span>{busy === type ? "Processing…" : "Drag & drop CSV here"}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  disabled={Boolean(busy)}
                  onChange={(e) => {
                    upload(type, e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </article>
          );
        })}
      </div>

      {/* School List Table with Actions */}
      <div className="monthly-school-list-heading" style={{ marginTop: "24px" }}>
        <div>
          <h3>Supervisor School List</h3>
          <p>
            Showing {cards.length} eligible schools for reporting period {appliedRange.startDate} to {appliedRange.endDate}.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="monthly-scorecard-loading">Loading school scorecards...</div>
      ) : cards.length === 0 ? (
        <div className="monthly-alert error">
          No schools found. Please ensure active schools exist in the directory.
        </div>
      ) : (
        <div className="command-table-wrap">
          <table className="command-table monthly-school-table">
            <thead>
              <tr>
                <th>School Name</th>
                <th>Location Code</th>
                <th>School Type</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => {
                const hasData =
                  card.current.hasMeals ||
                  card.current.hasProduction ||
                  card.current.hasCost;
                const isSingleExporting = exportingSingleId === card.school.directory_id;

                return (
                  <tr key={card.school.directory_id}>
                    <td>
                      <strong>{card.school.school_name}</strong>
                    </td>
                    <td>{card.school.location_code || "—"}</td>
                    <td>{card.school.site_type || card.school.labor_type || "—"}</td>
                    <td>
                      <span
                        className={`monthly-data-dot ${hasData ? "ready" : "missing"}`}
                        style={{ display: "inline-block", padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "700" }}
                      >
                        {hasData ? "Data Available" : "No Data"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "8px" }}>
                        <button
                          type="button"
                          className="command-small-button"
                          onClick={() => setSelectedSchoolId(card.school.directory_id)}
                        >
                          View Scorecard
                        </button>
                        <button
                          type="button"
                          className="command-small-button"
                          disabled={!hasData || isSingleExporting || exportingAll}
                          onClick={() => handleExportSingle(card)}
                        >
                          {isSingleExporting ? "Exporting..." : "Export PDF"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
