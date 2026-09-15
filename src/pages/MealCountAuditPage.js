import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { loadOfficialMealCounts } from "../monthlyScorecards/monthlyScorecardService";

function isDemoSchool(school) {
  return String((school && school.school_name) || "").trim().toLowerCase() === "test high school";
}

export default function MealCountAuditPage({ supervisorPin, schools: propSchools = [] }) {
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("2026-09");

  const [loading, setLoading] = useState(false);
  const [savingDate, setSavingDate] = useState(null);
  const [officialMealCounts, setOfficialMealCounts] = useState([]);
  const [officialLoadError, setOfficialLoadError] = useState("");
  const [managerMealCounts, setManagerMealCounts] = useState([]);
  const [excludedDates, setExcludedDates] = useState(new Set());
  const [showNonOperating, setShowNonOperating] = useState(false);

  const [editingRow, setEditingRow] = useState(null);
  const [editValues, setEditValues] = useState({ breakfast: 0, lunch: 0, supper: 0 });
  const [feedback, setFeedback] = useState("");

  // 1. Exact 28 Schools (demo filtered out)
  const schools = useMemo(() => {
    return (propSchools || [])
      .filter((s) => !isDemoSchool(s))
      .map((s) => ({
        ...s,
        id: String(s.id),
        school_name: s.school_name || s.name || `Location ${s.id}`,
        location_code: String(s.location_code || s.source_site_id || s.id),
        source_site_id: String(s.source_site_id || s.location_code || s.id),
        directory_id: String(s.directory_id || s.location_id || s.id),
      }));
  }, [propSchools]);

  useEffect(() => {
    if (schools.length > 0 && !selectedLocationId) {
      setSelectedLocationId(schools[0].id);
    }
  }, [schools, selectedLocationId]);

  // 2. Month Weekdays & Formats
  const { startDate, endDate, allMonthWeekdays } = useMemo(() => {
    const parts = selectedMonth.split("-").map(Number);
    const y = parts[0];
    const m = parts[1];
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const dates = [];
    const curr = new Date(`${start}T12:00:00`);
    const final = new Date(`${end}T12:00:00`);
    while (curr <= final) {
      const day = curr.getDay();
      if (day !== 0 && day !== 6) {
        dates.push(curr.toISOString().split("T")[0]);
      }
      curr.setDate(curr.getDate() + 1);
    }
    return { startDate: start, endDate: end, allMonthWeekdays: dates };
  }, [selectedMonth]);

  // 3. Load the separate, authoritative Official Meal Count upload.
  useEffect(() => {
    let active = true;
    async function loadOfficialUpload() {
      if (!supervisorPin) return;
      try {
        setOfficialLoadError("");
        const data = await loadOfficialMealCounts(supervisorPin, startDate, endDate);
        if (active) setOfficialMealCounts(data);
      } catch (err) {
        if (active) {
          setOfficialMealCounts([]);
          setOfficialLoadError(err.message || "Official Meal Count upload could not be loaded.");
        }
      }
    }
    loadOfficialUpload();
    return () => { active = false; };
  }, [supervisorPin, startDate, endDate]);

  // 4. Load Manager Entries from meal_counts
  useEffect(() => {
    if (!selectedLocationId) return;

    async function loadManagerCounts() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("meal_counts")
          .select("*")
          .eq("location_id", selectedLocationId)
          .gte("service_date", startDate)
          .lte("service_date", endDate)
          .order("service_date", { ascending: true });

        if (!error && data) {
          setManagerMealCounts(data.filter((row) =>
            String(row.entered_by || "").toLowerCase() !== "historical workbook import"
          ));
        } else {
          setManagerMealCounts([]);
        }
      } catch (err) {
        console.error("Manager counts error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadManagerCounts();
  }, [selectedLocationId, startDate, endDate]);

  const currentSchool = schools.find((s) => String(s.id) === String(selectedLocationId));

  // 5. Match Official Meal Count Upload against Manager Counts
  const comparisonRows = useMemo(() => {
    if (!currentSchool) return [];

    const locId = String(currentSchool.id);

    // A. One official row per locations.id + service_date. The database unique
    // constraint prevents duplicate representations of the same official count.
    const distMap = new Map();
    officialMealCounts
      .filter((row) => String(row.location_id) === locId)
      .forEach((row) => {
        const date = String(row.service_date || "").slice(0, 10);
        distMap.set(date, {
          breakfast: Number(row.breakfast_count || 0),
          lunch: Number(row.lunch_count || 0),
          supper: Number(row.supper_count || 0),
          hasUpload: true,
          source: row.source_label,
        });
    });

    // B. Manager Entries (from meal_counts)
    const managerMap = new Map();
    managerMealCounts.forEach((row) => {
      const d = String(row.service_date || row.date || "").slice(0, 10);
      managerMap.set(d, {
        breakfast: Number(row.breakfast_count != null ? row.breakfast_count : 0),
        lunch: Number(row.lunch_count != null ? row.lunch_count : 0),
        supper: Number(row.supper_count != null ? row.supper_count : 0),
        entered_by: row.entered_by,
      });
    });

    return allMonthWeekdays.map((date) => {
      const distEntry = distMap.get(date);
      const dist = distEntry && distEntry.hasUpload ? distEntry : null;
      const mgr = managerMap.get(date) || null;
      const isExcluded = excludedDates.has(date);

      const hasDist = Boolean(dist);
      const hasMgr = Boolean(mgr);
      const isNonOperating = !hasDist && !hasMgr;

      const distLunch = dist ? dist.lunch : 0;
      const mgrLunch = mgr ? mgr.lunch : 0;
      const distBreakfast = dist ? dist.breakfast : 0;
      const mgrBreakfast = mgr ? mgr.breakfast : 0;

      const diffLunch = distLunch - mgrLunch;
      const diffBreakfast = distBreakfast - mgrBreakfast;
      const distSupper = dist ? dist.supper : 0;
      const mgrSupper = mgr ? mgr.supper : 0;
      const diffSupper = distSupper - mgrSupper;
      const hasMismatch = hasDist && hasMgr && (diffBreakfast !== 0 || diffLunch !== 0 || diffSupper !== 0);

      let status = "clean";
      let statusLabel = "Match";

      if (isExcluded) {
        status = "excluded";
        statusLabel = "Excluded";
      } else if (isNonOperating) {
        status = "non_operating";
        statusLabel = "Non-Operating Day";
      } else if (hasMismatch) {
        status = "mismatch";
        statusLabel = `B ${diffBreakfast >= 0 ? "+" : ""}${diffBreakfast} · L ${diffLunch >= 0 ? "+" : ""}${diffLunch} · S ${diffSupper >= 0 ? "+" : ""}${diffSupper}`;
      } else if (hasDist && !hasMgr) {
        status = "clean";
        statusLabel = "Official count available";
      } else if (!hasDist && hasMgr) {
        status = "pending_dist";
        statusLabel = "Official count pending";
      }

      return {
        date,
        dayLabel: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
        dist,
        mgr,
        status,
        statusLabel,
        isExcluded,
        isNonOperating,
      };
    });
  }, [currentSchool, officialMealCounts, managerMealCounts, allMonthWeekdays, excludedDates]);

  function toggleExcludeDate(date) {
    setExcludedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
        setFeedback(`Restored ${date} to report.`);
      } else {
        next.add(date);
        setFeedback(`Excluded ${date} from calculations.`);
      }
      return next;
    });
  }

  async function handleCopyDistrict(row) {
    if (!row.dist || !currentSchool) return;
    setSavingDate(row.date);
    try {
      await supabase.from("meal_counts").upsert(
        {
          location_id: currentSchool.id,
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

      setManagerMealCounts((prev) => [
        ...prev.filter((r) => r.service_date !== row.date),
        {
          service_date: row.date,
          location_id: currentSchool.id,
          breakfast_count: row.dist.breakfast,
          lunch_count: row.dist.lunch,
          supper_count: row.dist.supper,
        },
      ]);
      setFeedback(`Synced ${row.date} with District upload.`);
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setSavingDate(null);
    }
  }

  async function handleSaveEdit(date) {
    setSavingDate(date);
    try {
      await supabase.from("meal_counts").upsert(
        {
          location_id: currentSchool.id,
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

      setManagerMealCounts((prev) => [
        ...prev.filter((r) => r.service_date !== date),
        {
          service_date: date,
          location_id: currentSchool.id,
          breakfast_count: editValues.breakfast,
          lunch_count: editValues.lunch,
          supper_count: editValues.supper,
        },
      ]);

      setEditingRow(null);
      setFeedback(`Saved count for ${date}!`);
    } catch (err) {
      setFeedback(`Save failed: ${err.message}`);
    } finally {
      setSavingDate(null);
    }
  }

  const visibleRows = comparisonRows.filter((row) => {
    if (showNonOperating) return true;
    return !row.isNonOperating || row.isExcluded;
  });

  const mismatchCount = comparisonRows.filter((r) => r.status === "mismatch" && !r.isExcluded).length;

  return (
    <div style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto", fontFamily: "sans-serif" }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: "800", color: "#111827" }}>
            Meal Count Audit & Reconciliation
          </h1>
          <p style={{ margin: "3px 0 0 0", fontSize: "13px", color: "#6b7280" }}>
            Compares the Official Meal Count upload with manager-entered SPARK counts.
          </p>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#374151", marginBottom: "4px" }}>
            MONTH
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontWeight: "700" }}
          />
        </div>
      </div>

      {feedback && (
        <div style={{ padding: "8px 14px", background: feedback.indexOf("failed") !== -1 || feedback.indexOf("Error") !== -1 ? "#fee2e2" : "#dcfce7", color: feedback.indexOf("failed") !== -1 || feedback.indexOf("Error") !== -1 ? "#991b1b" : "#166534", borderRadius: "6px", marginBottom: "14px", fontSize: "12px", fontWeight: "700" }}>
          {feedback}
        </div>
      )}
      {officialLoadError && (
        <div style={{ padding: "8px 14px", background: "#fee2e2", color: "#991b1b", borderRadius: "6px", marginBottom: "14px", fontSize: "12px", fontWeight: "700" }}>
          Official Meal Count data is unavailable. The Use District action remains disabled. {officialLoadError}
        </div>
      )}

      {/* TWO COLUMN MASTER-DETAIL */}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "18px", alignItems: "start" }}>
        {/* LEFT COLUMN: SCHOOLS */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontWeight: "800", fontSize: "12px", color: "#374151" }}>
            ALL SCHOOLS ({schools.length})
          </div>

          <div style={{ maxHeight: "680px", overflowY: "auto" }}>
            {schools.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#6b7280", fontSize: "12px" }}>
                No schools found.
              </div>
            ) : (
              schools.map((school) => {
                const isSelected = String(school.id) === String(selectedLocationId);
                return (
                  <div
                    key={school.id}
                    onClick={() => setSelectedLocationId(String(school.id))}
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid #f3f4f6",
                      cursor: "pointer",
                      background: isSelected ? "#eef6ff" : "#fff",
                      borderLeft: isSelected ? "4px solid #2563eb" : "4px solid transparent",
                    }}
                  >
                    <strong style={{ fontSize: "13px", color: isSelected ? "#1d4ed8" : "#111827", display: "block" }}>
                      {school.school_name}
                    </strong>
                    <small style={{ color: "#6b7280" }}>Location {school.location_code || school.id}</small>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: CALENDAR BREAKDOWN */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden" }}>
          {currentSchool ? (
            <div>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "#111827" }}>
                    {currentSchool.school_name}
                  </h2>
                  <small style={{ color: "#6b7280" }}>Location {currentSchool.location_code || currentSchool.id}</small>
                </div>

                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  {mismatchCount > 0 && (
                    <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "11px", fontWeight: "800", padding: "4px 8px", borderRadius: "6px" }}>
                      ⚠️ {mismatchCount} Mismatches
                    </span>
                  )}
                  <label style={{ fontSize: "12px", color: "#4b5563", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "5px" }}>
                    <input
                      type="checkbox"
                      checked={showNonOperating}
                      onChange={(e) => setShowNonOperating(e.target.checked)}
                    />
                    Show non-school days
                  </label>
                </div>
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", color: "#4b5563", fontSize: "11px" }}>
                    <th style={{ padding: "10px 14px" }}>DATE</th>
                    <th style={{ padding: "10px 14px" }}>OFFICIAL MEAL COUNT</th>
                    <th style={{ padding: "10px 14px" }}>MANAGER ENTRY</th>
                    <th style={{ padding: "10px 14px" }}>STATUS</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="5" style={{ padding: "30px", textAlign: "center", color: "#6b7280" }}>
                        Loading counts...
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((row) => {
                      const isEditingThis = editingRow === row.date;
                      const rowBg = row.isExcluded
                        ? "#f3f4f6"
                        : row.status === "mismatch"
                        ? "#fffbeb"
                        : row.isNonOperating
                        ? "#fafafa"
                        : "#fff";

                      const editBrk = (row.dist && row.dist.breakfast != null) ? row.dist.breakfast : ((row.mgr && row.mgr.breakfast != null) ? row.mgr.breakfast : 0);
                      const editLun = (row.dist && row.dist.lunch != null) ? row.dist.lunch : ((row.mgr && row.mgr.lunch != null) ? row.mgr.lunch : 0);
                      const editSup = (row.dist && row.dist.supper != null) ? row.dist.supper : ((row.mgr && row.mgr.supper != null) ? row.mgr.supper : 0);

                      return (
                        <tr
                          key={row.date}
                          style={{
                            borderBottom: "1px solid #f3f4f6",
                            background: rowBg,
                            opacity: row.isExcluded ? 0.45 : 1,
                          }}
                        >
                          <td style={{ padding: "10px 14px", fontWeight: "700", textDecoration: row.isExcluded ? "line-through" : "none" }}>
                            {row.dayLabel}
                          </td>

                          {/* OFFICIAL MEAL COUNT UPLOAD */}
                          <td style={{ padding: "10px 14px" }}>
                            {row.dist ? (
                              <div>
                                <strong>{row.dist.breakfast}</strong> Breakfast &bull; <strong>{row.dist.lunch}</strong> Lunch &bull; <strong>{row.dist.supper}</strong> Supper
                              </div>
                            ) : (
                              <span style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "12px" }}>—</span>
                            )}
                          </td>

                          {/* MANAGER ENTRY */}
                          <td style={{ padding: "10px 14px" }}>
                            {isEditingThis ? (
                              <div style={{ display: "flex", gap: "6px" }}>
                                <input
                                  type="number"
                                  placeholder="Brk"
                                  value={editValues.breakfast}
                                  onChange={(e) => setEditValues({ ...editValues, breakfast: e.target.value })}
                                  style={{ width: "60px", padding: "3px", fontSize: "12px", border: "1px solid #ccc", borderRadius: "4px" }}
                                />
                                <input
                                  type="number"
                                  placeholder="Lun"
                                  value={editValues.lunch}
                                  onChange={(e) => setEditValues({ ...editValues, lunch: e.target.value })}
                                  style={{ width: "60px", padding: "3px", fontSize: "12px", border: "1px solid #ccc", borderRadius: "4px" }}
                                />
                              </div>
                            ) : row.mgr ? (
                              <div>
                                <strong>{row.mgr.breakfast}</strong> Breakfast &bull; <strong>{row.mgr.lunch}</strong> Lunch &bull; <strong>{row.mgr.supper}</strong> Supper
                              </div>
                            ) : (
                              <span style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "12px" }}>—</span>
                            )}
                          </td>

                          {/* STATUS */}
                          <td style={{ padding: "10px 14px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 7px",
                                borderRadius: "4px",
                                fontSize: "10px",
                                fontWeight: "800",
                                backgroundColor:
                                  row.isExcluded
                                    ? "#e5e7eb"
                                    : row.status === "clean"
                                    ? "#d1fae5"
                                    : row.status === "mismatch"
                                    ? "#fef3c7"
                                    : "#f3f4f6",
                                color:
                                  row.isExcluded
                                    ? "#4b5563"
                                    : row.status === "clean"
                                    ? "#065f46"
                                    : row.status === "mismatch"
                                    ? "#92400e"
                                    : "#6b7280",
                              }}
                            >
                              {row.statusLabel}
                            </span>
                          </td>

                          {/* ACTIONS */}
                          <td style={{ padding: "10px 14px", textAlign: "right" }}>
                            {isEditingThis ? (
                              <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                                <button
                                  onClick={() => handleSaveEdit(row.date)}
                                  disabled={savingDate === row.date}
                                  style={{ padding: "4px 8px", borderRadius: "4px", background: "#059669", color: "#fff", border: "none", fontWeight: "700", cursor: "pointer", fontSize: "11px" }}
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingRow(null)}
                                  style={{ padding: "4px 6px", borderRadius: "4px", background: "#e5e7eb", border: "none", cursor: "pointer", fontSize: "11px" }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                                {row.status === "mismatch" && (
                                  <button
                                    onClick={() => handleCopyDistrict(row)}
                                    disabled
                                    title="Disabled until the separate Official Meal Count source has been verified after migration"
                                    style={{ padding: "3px 8px", borderRadius: "4px", background: "#f3f4f6", border: "1px solid #d1d5db", color: "#6b7280", fontWeight: "700", cursor: "not-allowed", fontSize: "11px", opacity: 0.7 }}
                                  >
                                    Use District
                                  </button>
                                )}

                                <button
                                  onClick={() => toggleExcludeDate(row.date)}
                                  title={row.isExcluded ? "Restore Date to Report" : "Exclude Date from Report"}
                                  style={{
                                    padding: "3px 8px",
                                    borderRadius: "4px",
                                    background: row.isExcluded ? "#dbeafe" : "#fee2e2",
                                    border: row.isExcluded ? "1px solid #93c5fd" : "1px solid #fca5a5",
                                    color: row.isExcluded ? "#1e40af" : "#991b1b",
                                    fontWeight: "700",
                                    cursor: "pointer",
                                    fontSize: "11px",
                                  }}
                                >
                                  {row.isExcluded ? "Restore" : "🚫 Exclude"}
                                </button>

                                <button
                                  onClick={() => {
                                    setEditingRow(row.date);
                                    setEditValues({
                                      breakfast: editBrk,
                                      lunch: editLun,
                                      supper: editSup,
                                    });
                                  }}
                                  style={{ padding: "3px 8px", borderRadius: "4px", background: "#f3f4f6", border: "1px solid #d1d5db", color: "#374151", fontWeight: "700", cursor: "pointer", fontSize: "11px" }}
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
          ) : (
            <div style={{ padding: "40px", textAlign: "center", color: "#6b7280" }}>
              Select a school to view meal counts.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
