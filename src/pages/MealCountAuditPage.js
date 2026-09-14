import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";

export default function MealCountAuditPage({ onBack }) {
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const [loading, setLoading] = useState(true);
  const [savingDate, setSavingDate] = useState(null);
  const [districtData, setDistrictData] = useState([]);
  const [finishLineData, setFinishLineData] = useState([]);
  const [filterMode, setFilterMode] = useState("all"); // 'all' | 'needs_review' | 'clean'
  const [editingRow, setEditingRow] = useState(null);
  const [editValues, setEditValues] = useState({ breakfast: 0, lunch: 0, supper: 0 });
  const [feedback, setFeedback] = useState("");

  // Load Locations on mount
  useEffect(() => {
    async function loadLocations() {
      try {
        const { data, error } = await supabase
          .from("locations")
          .select("id, school_name, source_site_id, labor_type")
          .order("school_name", { ascending: true });

        if (error) throw error;
        setLocations(data || []);
        if (data?.length > 0) {
          setSelectedLocationId(data[0].id);
        }
      } catch (err) {
        console.error("Error loading locations:", err);
      } finally {
        setLoading(false);
      }
    }
    loadLocations();
  }, []);

  // Compute month start & end
  const { startDate, endDate, operatingDates } = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const dates = [];
    const curr = new Date(`${start}T12:00:00`);
    const final = new Date(`${end}T12:00:00`);
    while (curr <= final) {
      const dayOfWeek = curr.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        // Weekdays only
        dates.push(curr.toISOString().split("T")[0]);
      }
      curr.setDate(curr.getDate() + 1);
    }

    return { startDate: start, endDate: end, operatingDates: dates };
  }, [selectedMonth]);

  // Load District & Finish Line data when location or month changes
  useEffect(() => {
    if (!selectedLocationId) return;

    async function loadAuditData() {
      setLoading(true);
      setFeedback("");
      setEditingRow(null);

      const selectedLoc = locations.find((l) => String(l.id) === String(selectedLocationId));
      const locId = selectedLoc?.id;
      const siteId = selectedLoc?.source_site_id;

      try {
        // 1. Fetch Uploaded District Counts (from daily_meal_counts or meal_counts fallback)
        let distRows = [];
        const { data: dData, error: dError } = await supabase
          .from("daily_meal_counts")
          .select("*")
          .or(`source_site_id.eq.${siteId},location_id.eq.${locId}`)
          .gte("date", startDate)
          .lte("date", endDate);

        if (!dError && dData) {
          distRows = dData;
        }

        // 2. Fetch Finish Line Checklist Meal Counts (from meal_counts)
        const { data: fData, error: fError } = await supabase
          .from("meal_counts")
          .select("*")
          .eq("location_id", locId)
          .gte("service_date", startDate)
          .lte("service_date", endDate);

        if (fError) throw fError;

        setDistrictData(distRows || []);
        setFinishLineData(fData || []);
      } catch (err) {
        console.error("Audit load error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAuditData();
  }, [selectedLocationId, startDate, endDate, locations]);

  // Build daily comparison rows
  const comparisonRows = useMemo(() => {
    const distMap = new Map();
    districtData.forEach((row) => {
      const d = String(row.date || row.service_date).slice(0, 10);
      distMap.set(d, {
        breakfast: Number(row.breakfast ?? row.breakfast_count ?? 0),
        lunch: Number(row.lunch ?? row.lunch_count ?? 0),
        supper: Number(row.supper ?? row.supper_count ?? 0),
        raw: row,
      });
    });

    const flMap = new Map();
    finishLineData.forEach((row) => {
      const d = String(row.service_date || row.date).slice(0, 10);
      flMap.set(d, {
        breakfast: Number(row.breakfast_count ?? row.breakfast ?? 0),
        lunch: Number(row.lunch_count ?? row.lunch ?? 0),
        supper: Number(row.supper_count ?? row.supper ?? 0),
        entered_by: row.entered_by,
        raw: row,
      });
    });

    return operatingDates.map((date) => {
      const dist = distMap.get(date) || null;
      const fl = flMap.get(date) || null;

      const diffLunch = (dist?.lunch || 0) - (fl?.lunch || 0);
      const diffBreakfast = (dist?.breakfast || 0) - (fl?.breakfast || 0);

      const hasMismatch =
        dist && fl && (Math.abs(diffLunch) >= 5 || Math.abs(diffBreakfast) >= 5);
      const isMissingDistrict = !dist && fl;
      const isMissingFinishLine = dist && !fl;
      const isMissingBoth = !dist && !fl;

      let status = "clean";
      let statusLabel = "Match";
      if (isMissingBoth) {
        status = "missing";
        statusLabel = "No Counts Recorded";
      } else if (isMissingDistrict) {
        status = "missing_dist";
        statusLabel = "Missing District Upload";
      } else if (isMissingFinishLine) {
        status = "missing_fl";
        statusLabel = "No Finish Line Check";
      } else if (hasMismatch) {
        status = "mismatch";
        statusLabel = `Diff: ${diffLunch >= 0 ? "+" : ""}${diffLunch} lunch`;
      }

      return {
        date,
        dayLabel: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        dist,
        fl,
        diffLunch,
        diffBreakfast,
        status,
        statusLabel,
      };
    });
  }, [operatingDates, districtData, finishLineData]);

  // Highlighting: Count issues for the current school
  const summary = useMemo(() => {
    let mismatches = 0;
    let missingDistrict = 0;
    let matched = 0;

    comparisonRows.forEach((r) => {
      if (r.status === "mismatch") mismatches++;
      else if (r.status === "missing_dist" || r.status === "missing") missingDistrict++;
      else if (r.status === "clean") matched++;
    });

    return { mismatches, missingDistrict, matched, total: comparisonRows.length };
  }, [comparisonRows]);

  // Start inline editing
  function handleStartEdit(row) {
    setEditingRow(row.date);
    setEditValues({
      breakfast: row.dist?.breakfast ?? row.fl?.breakfast ?? 0,
      lunch: row.dist?.lunch ?? row.fl?.lunch ?? 0,
      supper: row.dist?.supper ?? row.fl?.supper ?? 0,
    });
    setFeedback("");
  }

  // Quick Copy: Set Finish Line count to District count
  async function handleCopyDistrict(row) {
    if (!row.dist) return;
    setSavingDate(row.date);
    try {
      const { error } = await supabase.from("meal_counts").upsert(
        {
          location_id: selectedLocationId,
          service_date: row.date,
          breakfast_count: row.dist.breakfast,
          lunch_count: row.dist.lunch,
          supper_count: row.dist.supper,
          supper_status: "complete",
          entered_by: "Reconciliation Audit",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_id,service_date" }
      );

      if (error) throw error;

      // Update local state
      setFinishLineData((prev) => [
        ...prev.filter((r) => r.service_date !== row.date),
        {
          location_id: selectedLocationId,
          service_date: row.date,
          breakfast_count: row.dist.breakfast,
          lunch_count: row.dist.lunch,
          supper_count: row.dist.supper,
        },
      ]);
      setFeedback(`Updated ${row.date} to match District counts.`);
    } catch (err) {
      setFeedback(`Error saving: ${err.message}`);
    } finally {
      setSavingDate(null);
    }
  }

  // Save manual edit directly to Supabase
  async function handleSaveEdit(date) {
    setSavingDate(date);
    try {
      const selectedLoc = locations.find((l) => String(l.id) === String(selectedLocationId));

      // 1. Update District Table
      await supabase.from("daily_meal_counts").upsert(
        {
          source_site_id: selectedLoc?.source_site_id,
          location_id: selectedLoc?.id,
          date,
          breakfast: Number(editValues.breakfast),
          lunch: Number(editValues.lunch),
          supper: Number(editValues.supper),
        },
        { onConflict: "source_site_id,date" }
      );

      // 2. Update Finish Line Table
      await supabase.from("meal_counts").upsert(
        {
          location_id: selectedLoc?.id,
          service_date: date,
          breakfast_count: Number(editValues.breakfast),
          lunch_count: Number(editValues.lunch),
          supper_count: Number(editValues.supper),
          supper_status: "complete",
          entered_by: "Reconciliation Audit",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "location_id,service_date" }
      );

      // Refresh in-memory row
      setDistrictData((prev) => [
        ...prev.filter((r) => (r.date || r.service_date) !== date),
        { date, breakfast: editValues.breakfast, lunch: editValues.lunch, supper: editValues.supper },
      ]);
      setFinishLineData((prev) => [
        ...prev.filter((r) => (r.service_date || r.date) !== date),
        { service_date: date, breakfast_count: editValues.breakfast, lunch_count: editValues.lunch, supper_count: editValues.supper },
      ]);

      setEditingRow(null);
      setFeedback(`Saved verified count for ${date}!`);
    } catch (err) {
      setFeedback(`Failed to save: ${err.message}`);
    } finally {
      setSavingDate(null);
    }
  }

  const filteredRows = comparisonRows.filter((r) => {
    if (filterMode === "needs_review") return r.status !== "clean";
    if (filterMode === "clean") return r.status === "clean";
    return true;
  });

  return (
    <div style={{ padding: "24px", maxWidth: "1250px", margin: "0 auto", fontFamily: "sans-serif" }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <div>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: "none",
                border: "none",
                color: "#1b4332",
                fontWeight: "700",
                cursor: "pointer",
                marginBottom: "8px",
                display: "block",
              }}
            >
              ← Back to Scorecards
            </button>
          )}
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "800", color: "#111827" }}>
            Meal Count Audit & Reconciliation
          </h1>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#6b7280" }}>
            Compare uploaded district claims against Finish Line checklist counts. Fix discrepancies in real time.
          </p>
        </div>

        {/* CONTROLS */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#374151", marginBottom: "4px" }}>
              MONTH
            </label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontWeight: "600" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#374151", marginBottom: "4px" }}>
              SCHOOL
            </label>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid #d1d5db",
                fontWeight: "700",
                minWidth: "240px",
                backgroundColor: "#fff",
              }}
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.school_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* FEEDBACK TOAST */}
      {feedback && (
        <div
          style={{
            padding: "10px 16px",
            background: feedback.includes("Failed") ? "#fee2e2" : "#dcfce7",
            color: feedback.includes("Failed") ? "#991b1b" : "#166534",
            borderRadius: "8px",
            marginBottom: "16px",
            fontSize: "13px",
            fontWeight: "700",
          }}
        >
          {feedback}
        </div>
      )}

      {/* SUMMARY BANNER */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "20px" }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#6b7280" }}>TOTAL SERVICE DAYS</div>
          <div style={{ fontSize: "22px", fontWeight: "800", color: "#111827", marginTop: "4px" }}>{summary.total}</div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#059669" }}>VERIFIED & MATCHED</div>
          <div style={{ fontSize: "22px", fontWeight: "800", color: "#059669", marginTop: "4px" }}>{summary.matched}</div>
        </div>

        <div
          style={{
            background: summary.mismatches > 0 ? "#fef3c7" : "#fff",
            border: summary.mismatches > 0 ? "1px solid #f59e0b" : "1px solid #e5e7eb",
            borderRadius: "10px",
            padding: "14px",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#b45309" }}>COUNT MISMATCHES</div>
          <div style={{ fontSize: "22px", fontWeight: "800", color: "#b45309", marginTop: "4px" }}>{summary.mismatches}</div>
        </div>

        <div
          style={{
            background: summary.missingDistrict > 0 ? "#fee2e2" : "#fff",
            border: summary.missingDistrict > 0 ? "1px solid #ef4444" : "1px solid #e5e7eb",
            borderRadius: "10px",
            padding: "14px",
          }}
        >
          <div style={{ fontSize: "11px", fontWeight: "700", color: "#b91c1c" }}>MISSING DISTRICT DAYS</div>
          <div style={{ fontSize: "22px", fontWeight: "800", color: "#b91c1c", marginTop: "4px" }}>{summary.missingDistrict}</div>
        </div>
      </div>

      {/* FILTER BUTTONS */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <button
          onClick={() => setFilterMode("all")}
          style={{
            padding: "6px 14px",
            borderRadius: "6px",
            border: "1px solid #d1d5db",
            background: filterMode === "all" ? "#1b4332" : "#fff",
            color: filterMode === "all" ? "#fff" : "#374151",
            fontWeight: "700",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          All Days ({comparisonRows.length})
        </button>

        <button
          onClick={() => setFilterMode("needs_review")}
          style={{
            padding: "6px 14px",
            borderRadius: "6px",
            border: "1px solid #f59e0b",
            background: filterMode === "needs_review" ? "#f59e0b" : "#fff",
            color: filterMode === "needs_review" ? "#fff" : "#b45309",
            fontWeight: "700",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          ⚠️ Needs Review ({summary.mismatches + summary.missingDistrict})
        </button>

        <button
          onClick={() => setFilterMode("clean")}
          style={{
            padding: "6px 14px",
            borderRadius: "6px",
            border: "1px solid #10b981",
            background: filterMode === "clean" ? "#10b981" : "#fff",
            color: filterMode === "clean" ? "#fff" : "#065f46",
            fontWeight: "700",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          🟢 Clean Only ({summary.matched})
        </button>
      </div>

      {/* RECONCILIATION TABLE */}
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", color: "#4b5563", fontSize: "11px" }}>
              <th style={{ padding: "12px 16px" }}>DATE</th>
              <th style={{ padding: "12px 16px" }}>DISTRICT (UPLOADED)</th>
              <th style={{ padding: "12px 16px" }}>FINISH LINE (MANAGER)</th>
              <th style={{ padding: "12px 16px" }}>STATUS</th>
              <th style={{ padding: "12px 16px", textAlign: "right" }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="5" style={{ padding: "30px", textAlign: "center", color: "#6b7280" }}>
                  Loading reconciliation data...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: "30px", textAlign: "center", color: "#6b7280" }}>
                  No dates matching this filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const isEditingThis = editingRow === row.date;
                const rowBg =
                  row.status === "mismatch"
                    ? "#fffbeb"
                    : row.status === "missing_dist" || row.status === "missing"
                    ? "#fef2f2"
                    : "#fff";

                return (
                  <tr key={row.date} style={{ borderBottom: "1px solid #f3f4f6", background: rowBg }}>
                    {/* DATE */}
                    <td style={{ padding: "12px 16px", fontWeight: "700", color: "#1f2937" }}>
                      {row.dayLabel}
                    </td>

                    {/* DISTRICT UPLOAD */}
                    <td style={{ padding: "12px 16px" }}>
                      {isEditingThis ? (
                        <div style={{ display: "flex", gap: "6px" }}>
                          <input
                            type="number"
                            value={editValues.breakfast}
                            placeholder="Brk"
                            onChange={(e) => setEditValues({ ...editValues, breakfast: e.target.value })}
                            style={{ width: "65px", padding: "4px", fontSize: "12px", borderRadius: "4px", border: "1px solid #ccc" }}
                          />
                          <input
                            type="number"
                            value={editValues.lunch}
                            placeholder="Lun"
                            onChange={(e) => setEditValues({ ...editValues, lunch: e.target.value })}
                            style={{ width: "65px", padding: "4px", fontSize: "12px", borderRadius: "4px", border: "1px solid #ccc" }}
                          />
                        </div>
                      ) : row.dist ? (
                        <div>
                          <strong>{row.dist.lunch}</strong> <span style={{ color: "#6b7280" }}>Lunch</span> &bull;{" "}
                          <strong>{row.dist.breakfast}</strong> <span style={{ color: "#6b7280" }}>Brk</span>
                        </div>
                      ) : (
                        <span style={{ color: "#dc2626", fontStyle: "italic", fontSize: "12px" }}>Missing Upload</span>
                      )}
                    </td>

                    {/* FINISH LINE CHECKLIST */}
                    <td style={{ padding: "12px 16px" }}>
                      {row.fl ? (
                        <div>
                          <strong>{row.fl.lunch}</strong> <span style={{ color: "#6b7280" }}>Lunch</span> &bull;{" "}
                          <strong>{row.fl.breakfast}</strong> <span style={{ color: "#6b7280" }}>Brk</span>
                          {row.fl.entered_by && (
                            <small style={{ display: "block", color: "#9ca3af", fontSize: "10px" }}>
                              by {row.fl.entered_by}
                            </small>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "#d97706", fontStyle: "italic", fontSize: "12px" }}>Not Entered</span>
                      )}
                    </td>

                    {/* STATUS BADGE */}
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: "800",
                          backgroundColor:
                            row.status === "clean"
                              ? "#d1fae5"
                              : row.status === "mismatch"
                              ? "#fef3c7"
                              : "#fee2e2",
                          color:
                            row.status === "clean"
                              ? "#065f46"
                              : row.status === "mismatch"
                              ? "#92400e"
                              : "#991b1b",
                        }}
                      >
                        {row.statusLabel}
                      </span>
                    </td>

                    {/* ACTIONS */}
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {isEditingThis ? (
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button
                            onClick={() => handleSaveEdit(row.date)}
                            disabled={savingDate === row.date}
                            style={{
                              padding: "4px 10px",
                              borderRadius: "6px",
                              background: "#059669",
                              color: "#fff",
                              border: "none",
                              fontWeight: "700",
                              cursor: "pointer",
                              fontSize: "11px",
                            }}
                          >
                            {savingDate === row.date ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingRow(null)}
                            style={{
                              padding: "4px 8px",
                              borderRadius: "6px",
                              background: "#e5e7eb",
                              border: "none",
                              cursor: "pointer",
                              fontSize: "11px",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          {row.status === "mismatch" && (
                            <button
                              onClick={() => handleCopyDistrict(row)}
                              disabled={savingDate === row.date}
                              title="Sync Finish Line count to match District upload"
                              style={{
                                padding: "4px 9px",
                                borderRadius: "6px",
                                background: "#fef3c7",
                                border: "1px solid #f59e0b",
                                color: "#92400e",
                                fontWeight: "700",
                                cursor: "pointer",
                                fontSize: "11px",
                              }}
                            >
                              Use District
                            </button>
                          )}
                          <button
                            onClick={() => handleStartEdit(row)}
                            style={{
                              padding: "4px 9px",
                              borderRadius: "6px",
                              background: "#f3f4f6",
                              border: "1px solid #d1d5db",
                              color: "#374151",
                              fontWeight: "700",
                              cursor: "pointer",
                              fontSize: "11px",
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
