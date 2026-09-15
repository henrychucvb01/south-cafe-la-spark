import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";

export default function MealCountAuditPage() {
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("2026-08");

  const [loading, setLoading] = useState(true);
  const [savingDate, setSavingDate] = useState(null);
  const [districtData, setDistrictData] = useState([]);
  const [finishLineData, setFinishLineData] = useState([]);
  const [excludedDates, setExcludedDates] = useState(new Set());
  const [showNonOperating, setShowNonOperating] = useState(false);

  const [editingRow, setEditingRow] = useState(null);
  const [editValues, setEditValues] = useState({ breakfast: 0, lunch: 0, supper: 0 });
  const [feedback, setFeedback] = useState("");

  // 1. Month Weekdays
  const { startDate, endDate, allMonthWeekdays } = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
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

  // 2. Load the 29 Schools on mount
  useEffect(() => {
    async function loadSchools() {
      try {
        const { data, error } = await supabase
          .from("locations")
          .select("id, school_name, source_site_id, labor_type")
          .order("school_name", { ascending: true });

        if (error) throw error;
        setLocations(data || []);
        if (data?.length > 0) {
          setSelectedLocationId(String(data[0].id));
        }
      } catch (err) {
        console.error("Error loading schools:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSchools();
  }, []);

  // 3. Load District Uploads (daily_meal_counts) & Finish Line (meal_counts) for selected school
  useEffect(() => {
    if (!selectedLocationId || locations.length === 0) return;

    async function loadAuditData() {
      setLoading(true);
      setFeedback("");
      setEditingRow(null);

      const selectedLoc = locations.find((l) => String(l.id) === String(selectedLocationId));
      const locId = String(selectedLoc?.id || "");
      const siteId = String(selectedLoc?.source_site_id || "");

      try {
        // 1. FETCH UPLOADED DISTRICT COUNTS (daily_meal_counts)
        let filterOr = [];
        if (siteId) filterOr.push(`source_site_id.eq.${siteId}`, `location_id.eq.${siteId}`);
        if (locId) filterOr.push(`location_id.eq.${locId}`, `source_site_id.eq.${locId}`);

        const { data: dData, error: dError } = await supabase
          .from("daily_meal_counts")
          .select("*")
          .or(filterOr.join(","))
          .gte("date", startDate)
          .lte("date", endDate);

        if (!dError && dData) {
          setDistrictData(dData);
        } else {
          setDistrictData([]);
        }

        // 2. FETCH FINISH LINE COUNTS (meal_counts)
        const { data: fData, error: fError } = await supabase
          .from("meal_counts")
          .select("*")
          .or(filterOr.join(","))
          .gte("service_date", startDate)
          .lte("service_date", endDate);

        if (!fError && fData) {
          setFinishLineData(fData);
        } else {
          setFinishLineData([]);
        }
      } catch (err) {
        console.error("Audit load error:", err);
        setFeedback(`Error loading counts: ${err.message}`);
      } finally {
        setLoading(false);
      }
    }

    loadAuditData();
  }, [selectedLocationId, startDate, endDate, locations]);

  const currentSchool = locations.find((s) => String(s.id) === String(selectedLocationId));

  // 4. Build Daily Comparison
  const comparisonRows = useMemo(() => {
    if (!currentSchool) return [];

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

    return allMonthWeekdays.map((date) => {
      const dist = distMap.get(date) || null;
      const fl = flMap.get(date) || null;
      const isExcluded = excludedDates.has(date);

      const hasDist = dist && (dist.lunch > 0 || dist.breakfast > 0);
      const hasFl = fl && (fl.lunch > 0 || fl.breakfast > 0);
      const isNonOperating = !hasDist && !hasFl;

      const diffLunch = (dist?.lunch || 0) - (fl?.lunch || 0);
      const diffBreakfast = (dist?.breakfast || 0) - (fl?.breakfast || 0);
      const hasMismatch = hasDist && hasFl && (Math.abs(diffLunch) >= 5 || Math.abs(diffBreakfast) >= 5);

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
        statusLabel = `Diff: ${diffLunch >= 0 ? "+" : ""}${diffLunch} lunch`;
      } else if (hasDist && !hasFl) {
        status = "clean";
        statusLabel = "District Verified";
      } else if (!hasDist && hasFl) {
        status = "pending_dist";
        statusLabel = "District Pending";
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
        status,
        statusLabel,
        isExcluded,
        isNonOperating,
      };
    });
  }, [currentSchool, districtData, finishLineData, allMonthWeekdays, excludedDates]);

  // Toggle Exclude Date
  function toggleExcludeDate(date) {
    setExcludedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
        setFeedback(`Restored ${date} to report.`);
      } else {
        next.add(date);
        setFeedback(`Excluded ${date} from report.`);
      }
      return next;
    });
  }

  // Quick Copy: Sync Finish Line count to District count
  async function handleCopyDistrict(row) {
    if (!row.dist || !currentSchool) return;
    setSavingDate(row.date);
    try {
      const { error } = await supabase.from("meal_counts").upsert(
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

      if (error) throw error;

      setFinishLineData((prev) => [
        ...prev.filter((r) => (r.service_date || r.date) !== row.date),
        {
          service_date: row.date,
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

  // Save manual edit directly to both tables
  async function handleSaveEdit(date) {
    setSavingDate(date);
    try {
      // 1. Update District Table (daily_meal_counts)
      await supabase.from("daily_meal_counts").upsert(
        {
          source_site_id: currentSchool.source_site_id,
          location_id: currentSchool.id,
          date,
          breakfast: Number(editValues.breakfast),
          lunch: Number(editValues.lunch),
          supper: Number(editValues.supper),
        },
        { onConflict: "source_site_id,date" }
      );

      // 2. Update Finish Line Table (meal_counts)
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
            District Meal Count Audit & Reconciliation
          </h1>
          <p style={{ margin: "3px 0 0 0", fontSize: "13px", color: "#6b7280" }}>
            Audits district-imported meals (daily_meal_counts) against Finish Line manager entries.
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
        <div style={{ padding: "8px 14px", background: feedback.includes("failed") || feedback.includes("Error") ? "#fee2e2" : "#dcfce7", color: feedback.includes("failed") || feedback.includes("Error") ? "#991b1b" : "#166534", borderRadius: "6px", marginBottom: "14px", fontSize: "12px", fontWeight: "700" }}>
          {feedback}
        </div>
      )}

      {/* TWO COLUMN MASTER-DETAIL */}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "18px", alignItems: "start" }}>
        {/* LEFT COLUMN: SCHOOLS */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontWeight: "800", fontSize: "12px", color: "#374151" }}>
            ALL SCHOOLS ({locations.length})
          </div>

          <div style={{ maxHeight: "680px", overflowY: "auto" }}>
            {locations.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#6b7280", fontSize: "12px" }}>
                Loading schools...
              </div>
            ) : (
              locations.map((school) => {
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
                    <small style={{ color: "#6b7280" }}>Location {school.source_site_id}</small>
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
                  <small style={{ color: "#6b7280" }}>Location ID: {currentSchool.source_site_id}</small>
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
                    <th style={{ padding: "10px 14px" }}>DISTRICT (UPLOADED)</th>
                    <th style={{ padding: "10px 14px" }}>FINISH LINE (MANAGER)</th>
                    <th style={{ padding: "10px 14px" }}>STATUS</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const isEditingThis = editingRow === row.date;
                    const rowBg = row.isExcluded
                      ? "#f3f4f6"
                      : row.status === "mismatch"
                      ? "#fffbeb"
                      : row.isNonOperating
                      ? "#fafafa"
                      : "#fff";

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

                        {/* DISTRICT UPLOAD */}
                        <td style={{ padding: "10px 14px" }}>
                          {row.dist ? (
                            <div>
                              <strong>{row.dist.lunch}</strong> Lunch &bull; <strong>{row.dist.breakfast}</strong> Brk
                            </div>
                          ) : (
                            <span style={{ color: "#9ca3af", fontStyle: "italic", fontSize: "12px" }}>—</span>
                          )}
                        </td>

                        {/* FINISH LINE */}
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
                          ) : row.fl ? (
                            <div>
                              <strong>{row.fl.lunch}</strong> Lunch &bull; <strong>{row.fl.breakfast}</strong> Brk
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
                                  disabled={savingDate === row.date}
                                  title="Sync Finish Line count to match District upload"
                                  style={{ padding: "3px 8px", borderRadius: "4px", background: "#fef3c7", border: "1px solid #f59e0b", color: "#92400e", fontWeight: "700", cursor: "pointer", fontSize: "11px" }}
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
                                    breakfast: row.dist?.breakfast ?? row.fl?.breakfast ?? 0,
                                    lunch: row.dist?.lunch ?? row.fl?.lunch ?? 0,
                                    supper: row.dist?.supper ?? row.fl?.supper ?? 0,
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
                  })}
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
