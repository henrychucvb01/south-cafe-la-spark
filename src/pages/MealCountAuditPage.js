import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";

export default function MealCountAuditPage({ onBack, locations: propLocations, schools: propSchools, dataset }) {
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("2026-08");

  const [loading, setLoading] = useState(true);
  const [savingDate, setSavingDate] = useState(null);
  const [allDistrictData, setAllDistrictData] = useState([]);
  const [allFinishLineData, setAllFinishLineData] = useState([]);
  const [schoolFilter, setSchoolFilter] = useState("needs_review"); // 'needs_review' | 'all' | 'clean'

  const [editingRow, setEditingRow] = useState(null);
  const [editValues, setEditValues] = useState({ breakfast: 0, lunch: 0, supper: 0 });
  const [feedback, setFeedback] = useState("");

  // 1. Month Date Range
  const { startDate, endDate, operatingDates } = useMemo(() => {
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
    return { startDate: start, endDate: end, operatingDates: dates };
  }, [selectedMonth]);

  // 2. Load Schools
  useEffect(() => {
    async function loadSchools() {
      const existing = propLocations || propSchools || dataset?.schools;
      if (existing && existing.length > 0) {
        const mapped = existing.map((loc) => ({
          id: String(loc.id || loc.location_id || loc.source_site_id),
          school_name: loc.school_name || loc.name || loc.site_name || "Unknown School",
          source_site_id: String(loc.source_site_id || loc.location_id || loc.id),
        }));
        setLocations(mapped);
        return;
      }

      try {
        let { data } = await supabase.from("locations").select("*");
        if (!data || data.length === 0) {
          const res = await supabase.from("schools").select("*");
          data = res.data;
        }
        if (data) {
          const mapped = data.map((loc) => ({
            id: String(loc.id || loc.location_id || loc.source_site_id),
            school_name: loc.school_name || loc.name || loc.site_name || `School ${loc.id}`,
            source_site_id: String(loc.source_site_id || loc.location_id || loc.id),
          }));
          setLocations(mapped);
        }
      } catch (err) {
        console.error("Error loading schools:", err);
      }
    }
    loadSchools();
  }, [propLocations, propSchools, dataset]);

  // 3. Load All Data for Selected Month
  useEffect(() => {
    async function loadMonthData() {
      setLoading(true);
      try {
        // Fetch district upload records
        let { data: dData } = await supabase
          .from("daily_meal_counts")
          .select("*")
          .gte("date", startDate)
          .lte("date", endDate);

        // Fetch manager Finish Line records
        let { data: fData } = await supabase
          .from("meal_counts")
          .select("*")
          .gte("service_date", startDate)
          .lte("service_date", endDate);

        setAllDistrictData(dData || []);
        setAllFinishLineData(fData || []);
      } catch (err) {
        console.error("Failed to load audit data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadMonthData();
  }, [startDate, endDate]);

  // 4. Calculate Audit Summaries (ONLY flag real conflicts, not future unuploaded days!)
  const schoolAuditSummaries = useMemo(() => {
    return locations.map((school) => {
      const siteId = String(school.source_site_id);
      const locId = String(school.id);

      const schoolDist = allDistrictData.filter(
        (r) => String(r.source_site_id) === siteId || String(r.location_id) === locId
      );
      const distMap = new Map();
      schoolDist.forEach((r) => {
        const d = String(r.date || r.service_date).slice(0, 10);
        distMap.set(d, {
          lunch: Number(r.lunch ?? r.lunch_count ?? 0),
          breakfast: Number(r.breakfast ?? r.breakfast_count ?? 0),
        });
      });

      const schoolFL = allFinishLineData.filter(
        (r) => String(r.location_id) === locId || String(r.source_site_id) === siteId
      );
      const flMap = new Map();
      schoolFL.forEach((r) => {
        const d = String(r.service_date || r.date).slice(0, 10);
        flMap.set(d, {
          lunch: Number(r.lunch_count ?? r.lunch ?? 0),
          breakfast: Number(r.breakfast_count ?? r.breakfast ?? 0),
        });
      });

      let mismatches = 0;
      let matched = 0;
      let activeDays = 0;

      operatingDates.forEach((date) => {
        const d = distMap.get(date);
        const f = flMap.get(date);

        // Only evaluate days that have at least one record
        if (d || f) {
          activeDays++;
          if (d && f) {
            const diffL = Math.abs(d.lunch - f.lunch);
            const diffB = Math.abs(d.breakfast - f.breakfast);
            if (diffL >= 5 || diffB >= 5) {
              mismatches++;
            } else {
              matched++;
            }
          }
        }
      });

      // Needs attention ONLY if numbers conflict
      const needsAttention = mismatches > 0;

      return {
        ...school,
        mismatches,
        matched,
        activeDays,
        needsAttention,
      };
    }).sort((a, b) => {
      // Sort real mismatches to the top
      if (a.needsAttention && !b.needsAttention) return -1;
      if (!a.needsAttention && b.needsAttention) return 1;
      return b.mismatches - a.mismatches;
    });
  }, [locations, allDistrictData, allFinishLineData, operatingDates]);

  useEffect(() => {
    if (!selectedLocationId && schoolAuditSummaries.length > 0) {
      setSelectedLocationId(schoolAuditSummaries[0].id);
    }
  }, [schoolAuditSummaries, selectedLocationId]);

  const currentSchool = schoolAuditSummaries.find((s) => String(s.id) === String(selectedLocationId));

  // 5. Build comparison rows for selected school (Filter out empty future dates)
  const comparisonRows = useMemo(() => {
    if (!currentSchool) return [];

    const siteId = String(currentSchool.source_site_id);
    const locId = String(currentSchool.id);

    const distMap = new Map();
    allDistrictData
      .filter((r) => String(r.source_site_id) === siteId || String(r.location_id) === locId)
      .forEach((r) => {
        const d = String(r.date || r.service_date).slice(0, 10);
        distMap.set(d, {
          breakfast: Number(r.breakfast ?? r.breakfast_count ?? 0),
          lunch: Number(r.lunch ?? r.lunch_count ?? 0),
          supper: Number(r.supper ?? r.supper_count ?? 0),
        });
      });

    const flMap = new Map();
    allFinishLineData
      .filter((r) => String(r.location_id) === locId || String(r.source_site_id) === siteId)
      .forEach((r) => {
        const d = String(r.service_date || r.date).slice(0, 10);
        flMap.set(d, {
          breakfast: Number(r.breakfast_count ?? r.breakfast ?? 0),
          lunch: Number(r.lunch_count ?? r.lunch ?? 0),
          supper: Number(r.supper_count ?? r.supper ?? 0),
          entered_by: r.entered_by,
        });
      });

    // Find latest date with any activity
    let latestActiveDate = "";
    operatingDates.forEach((date) => {
      if (distMap.has(date) || flMap.has(date)) {
        if (date > latestActiveDate) latestActiveDate = date;
      }
    });

    return operatingDates
      .filter((date) => {
        // Show all active days, and up to the latest recorded date
        return distMap.has(date) || flMap.has(date) || (latestActiveDate && date <= latestActiveDate);
      })
      .map((date) => {
        const dist = distMap.get(date) || null;
        const fl = flMap.get(date) || null;

        const diffLunch = (dist?.lunch || 0) - (fl?.lunch || 0);
        const diffBreakfast = (dist?.breakfast || 0) - (fl?.breakfast || 0);

        const hasMismatch = dist && fl && (Math.abs(diffLunch) >= 5 || Math.abs(diffBreakfast) >= 5);
        const isDistrictPending = !dist && fl;
        const isDistrictOnly = dist && !fl;

        let status = "clean";
        let statusLabel = "Match";

        if (hasMismatch) {
          status = "mismatch";
          statusLabel = `Diff: ${diffLunch >= 0 ? "+" : ""}${diffLunch} lunch`;
        } else if (isDistrictPending) {
          status = "pending_dist";
          statusLabel = "District Upload Pending";
        } else if (isDistrictOnly) {
          status = "clean";
          statusLabel = "District Verified";
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
        };
      });
  }, [currentSchool, allDistrictData, allFinishLineData, operatingDates]);

  // Actions
  async function handleCopyDistrict(row) {
    if (!row.dist) return;
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

      setAllFinishLineData((prev) => [
        ...prev.filter((r) => !(r.service_date === row.date && String(r.location_id) === currentSchool.id)),
        {
          location_id: currentSchool.id,
          service_date: row.date,
          breakfast_count: row.dist.breakfast,
          lunch_count: row.dist.lunch,
          supper_count: row.dist.supper,
        },
      ]);
      setFeedback(`Synced ${row.date} with District count.`);
    } catch (err) {
      setFeedback(`Error: ${err.message}`);
    } finally {
      setSavingDate(null);
    }
  }

  async function handleSaveEdit(date) {
    setSavingDate(date);
    try {
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

      setAllDistrictData((prev) => [
        ...prev.filter((r) => !(r.date === date && String(r.source_site_id) === currentSchool.source_site_id)),
        { date, source_site_id: currentSchool.source_site_id, breakfast: editValues.breakfast, lunch: editValues.lunch, supper: editValues.supper },
      ]);

      setAllFinishLineData((prev) => [
        ...prev.filter((r) => !(r.service_date === date && String(r.location_id) === currentSchool.id)),
        { service_date: date, location_id: currentSchool.id, breakfast_count: editValues.breakfast, lunch_count: editValues.lunch, supper_count: editValues.supper },
      ]);

      setEditingRow(null);
      setFeedback(`Saved verified count for ${date}!`);
    } catch (err) {
      setFeedback(`Save failed: ${err.message}`);
    } finally {
      setSavingDate(null);
    }
  }

  const filteredSchools = schoolAuditSummaries.filter((s) => {
    if (schoolFilter === "needs_review") return s.needsAttention;
    if (schoolFilter === "clean") return !s.needsAttention;
    return true;
  });

  const totalProblemSchools = schoolAuditSummaries.filter((s) => s.needsAttention).length;

  return (
    <div style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto", fontFamily: "sans-serif" }}>
      {/* TOP HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          {onBack && (
            <button
              onClick={onBack}
              style={{ background: "none", border: "none", color: "#1b4332", fontWeight: "700", cursor: "pointer", marginBottom: "6px", display: "block" }}
            >
              ← Back to Scorecards
            </button>
          )}
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: "800", color: "#111827" }}>
            District Meal Count Audit & Reconciliation
          </h1>
          <p style={{ margin: "3px 0 0 0", fontSize: "13px", color: "#6b7280" }}>
            Identifies schools with count discrepancies. Approve or correct numbers directly.
          </p>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: "#374151", marginBottom: "4px" }}>
            REPORTING MONTH
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
        <div style={{ padding: "8px 14px", background: feedback.includes("failed") ? "#fee2e2" : "#dcfce7", color: feedback.includes("failed") ? "#991b1b" : "#166534", borderRadius: "6px", marginBottom: "14px", fontSize: "12px", fontWeight: "700" }}>
          {feedback}
        </div>
      )}

      {/* TWO COLUMN MASTER-DETAIL LAYOUT */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "18px", alignItems: "start" }}>
        {/* LEFT COLUMN: TRIAGE LIST */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "10px", overflow: "hidden" }}>
          <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
            <button
              onClick={() => setSchoolFilter("needs_review")}
              style={{
                flex: 1,
                padding: "10px 6px",
                border: "none",
                background: schoolFilter === "needs_review" ? "#fff" : "transparent",
                borderBottom: schoolFilter === "needs_review" ? "2px solid #ef4444" : "none",
                fontWeight: "700",
                fontSize: "11px",
                color: schoolFilter === "needs_review" ? "#b91c1c" : "#6b7280",
                cursor: "pointer",
              }}
            >
              ⚠️ Mismatches ({totalProblemSchools})
            </button>
            <button
              onClick={() => setSchoolFilter("all")}
              style={{
                flex: 1,
                padding: "10px 6px",
                border: "none",
                background: schoolFilter === "all" ? "#fff" : "transparent",
                borderBottom: schoolFilter === "all" ? "2px solid #1b4332" : "none",
                fontWeight: "700",
                fontSize: "11px",
                color: schoolFilter === "all" ? "#1b4332" : "#6b7280",
                cursor: "pointer",
              }}
            >
              All Schools ({schoolAuditSummaries.length})
            </button>
          </div>

          <div style={{ maxHeight: "650px", overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#6b7280", fontSize: "12px" }}>
                Scanning district...
              </div>
            ) : filteredSchools.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#059669", fontSize: "12px", fontWeight: "700" }}>
                🎉 No mismatches found!
              </div>
            ) : (
              filteredSchools.map((school) => {
                const isSelected = String(school.id) === String(selectedLocationId);
                return (
                  <div
                    key={school.id}
                    onClick={() => setSelectedLocationId(school.id)}
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid #f3f4f6",
                      cursor: "pointer",
                      background: isSelected ? "#eef6ff" : school.needsAttention ? "#fffcf5" : "#fff",
                      borderLeft: isSelected ? "4px solid #2563eb" : school.needsAttention ? "4px solid #f59e0b" : "4px solid transparent",
                    }}
                  >
                    <strong style={{ fontSize: "13px", color: isSelected ? "#1d4ed8" : "#111827", display: "block" }}>
                      {school.school_name}
                    </strong>

                    <div style={{ marginTop: "4px" }}>
                      {school.mismatches > 0 ? (
                        <span style={{ fontSize: "10px", fontWeight: "800", background: "#fef3c7", color: "#92400e", padding: "2px 6px", borderRadius: "4px" }}>
                          ⚠️ {school.mismatches} Mismatch{school.mismatches === 1 ? "" : "es"}
                        </span>
                      ) : (
                        <span style={{ fontSize: "10px", fontWeight: "700", background: "#d1fae5", color: "#065f46", padding: "2px 6px", borderRadius: "4px" }}>
                          ✓ Clean
                        </span>
                      )}
                    </div>
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
                {currentSchool.mismatches > 0 && (
                  <span style={{ background: "#fef3c7", color: "#92400e", fontSize: "11px", fontWeight: "800", padding: "4px 8px", borderRadius: "6px" }}>
                    ⚠️ {currentSchool.mismatches} Mismatches
                  </span>
                )}
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
                  {comparisonRows.map((row) => {
                    const isEditingThis = editingRow === row.date;
                    const rowBg = row.status === "mismatch" ? "#fffbeb" : "#fff";

                    return (
                      <tr key={row.date} style={{ borderBottom: "1px solid #f3f4f6", background: rowBg }}>
                        <td style={{ padding: "10px 14px", fontWeight: "700" }}>{row.dayLabel}</td>

                        {/* DISTRICT */}
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
                          ) : row.dist ? (
                            <div>
                              <strong>{row.dist.lunch}</strong> Lunch &bull; <strong>{row.dist.breakfast}</strong> Brk
                            </div>
                          ) : (
                            <span style={{ color: "#6b7280", fontStyle: "italic", fontSize: "12px" }}>Not Uploaded</span>
                          )}
                        </td>

                        {/* FINISH LINE */}
                        <td style={{ padding: "10px 14px" }}>
                          {row.fl ? (
                            <div>
                              <strong>{row.fl.lunch}</strong> Lunch &bull; <strong>{row.fl.breakfast}</strong> Brk
                            </div>
                          ) : (
                            <span style={{ color: "#d97706", fontStyle: "italic", fontSize: "12px" }}>Not Entered</span>
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
                                row.status === "clean"
                                  ? "#d1fae5"
                                  : row.status === "mismatch"
                                  ? "#fef3c7"
                                  : "#f3f4f6",
                              color:
                                row.status === "clean"
                                  ? "#065f46"
                                  : row.status === "mismatch"
                                  ? "#92400e"
                                  : "#4b5563",
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
              Select a school from the left to view its meal counts.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
