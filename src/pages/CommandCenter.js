import React, { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "../supabaseClient";

function isFinishLineCommentItem(item) {
  return String(item?.item_key || "").endsWith("_comment");
}

function getFinishLineExplanation(items, itemKey) {
  if (!itemKey || !Array.isArray(items)) {
    return "";
  }

  const commentItem = items.find(
    (item) => item.item_key === `${itemKey}_comment`
  );

  return commentItem?.answer || "";
}

function formatFinishLineAnswer(answer) {
  const value = String(answer || "").toLowerCase();

  if (value === "yes") return "YES";
  if (value === "no") return "NO";
  if (value === "na") return "N/A";

  return String(answer || "—").toUpperCase();
}

const REIMBURSEMENT_RATES = {
  breakfast: 4.08,
  lunch: 5.9,
  supper: 4.6,
};

function CommandCenter({ onExit, onPreviewFinishLine, onOpenSchoolAnalytics, supervisorPin }) {
  const [schools, setSchools] = useState([]);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("dashboard");

  // =========================================
  // SPARK POINTS SUPERVISOR CONTROLS
  // =========================================
  const [pointsSchoolId, setPointsSchoolId] = useState("");
  const [pointsTotal, setPointsTotal] = useState(0);
  const [pointsHistory, setPointsHistory] = useState([]);
  const [pointsAmount, setPointsAmount] = useState("");
  const [pointsDirection, setPointsDirection] = useState("add");
  const [pointsReason, setPointsReason] = useState("");
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsSaving, setPointsSaving] = useState(false);
  const [pointsMessage, setPointsMessage] = useState("");
  const [pointsError, setPointsError] = useState("");
  const [excludedDate, setExcludedDate] = useState("");
  const [excludedReason, setExcludedReason] = useState("");
  const [excludedDays, setExcludedDays] = useState([]);
  const [excludedSaving, setExcludedSaving] = useState(false);

  // =========================================
  // MONITORING POINTS
  // Breakfast: 1 required
  // Lunch: 1 required
  // Supper: 3 required
  // Pass = +10 | Perfect = +20
  // Monitoring cycle resets July 1 each year.
  // =========================================
  const [monitoringSaving, setMonitoringSaving] = useState("");

  // Manager PIN reset
  const [pinResetSchoolId, setPinResetSchoolId] = useState("");
  const [pinResetEmployees, setPinResetEmployees] = useState([]);
  const [pinResetEmployeeId, setPinResetEmployeeId] = useState("");
  const [pinResetLoading, setPinResetLoading] = useState(false);
  const [pinResetMessage, setPinResetMessage] = useState("");
  const [pinResetError, setPinResetError] = useState("");

  // =========================================
  // DASHBOARD DATE
  // =========================================

  const getLocalDateString = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayString = getLocalDateString();
  const [dashboardDate, setDashboardDate] = useState(todayString);

  // =========================================
  // RECENT CHANGES
  // =========================================

  const [recentChanges, setRecentChanges] = useState([]);
  const [recentChangesLoading, setRecentChangesLoading] = useState(false);
  const [recentChangesError, setRecentChangesError] = useState("");
  const [historySchoolId, setHistorySchoolId] = useState("all");
  const [historyDate, setHistoryDate] = useState("");

  // =========================================
  // MEAL TRENDS
  // =========================================

  const [mealTrendData, setMealTrendData] = useState([]);
  const [mealTrendLoading, setMealTrendLoading] = useState(false);
  const [mealTrendError, setMealTrendError] = useState("");
  const [trendSchoolId, setTrendSchoolId] = useState("all");
  const [trendDays, setTrendDays] = useState(30);
  const [mealAnalyticsEndDate, setMealAnalyticsEndDate] = useState(
    getLocalDateString()
  );
  const [mealAnalyticsMode, setMealAnalyticsMode] = useState("meals");

  // Finish Line page controls
  const [priorityExceptionsOpen, setPriorityExceptionsOpen] = useState(true);
  const [visibleMeals, setVisibleMeals] = useState({
    breakfast: true,
    lunch: true,
    supper: true,
    total: false,
  });

  // =========================================
  // SUPERVISOR TEST MODE
  // =========================================

  const [testDay, setTestDay] = useState("live");
  const [testMonthEnd, setTestMonthEnd] = useState(false);

  useEffect(() => {
    loadCommandCenter();
  }, [dashboardDate]);

  async function loadCommandCenter() {
    setLoading(true);
    setError("");

    try {
      const selectedDate = dashboardDate;
      // SELECTED DATE'S MEAL COUNTS
      const { data: mealCounts, error: mealCountError } = await supabase
        .from("meal_counts")
        .select("*")
        .eq("service_date", selectedDate);

      if (mealCountError) {
        throw mealCountError;
      }

      // SELECTED DATE'S LABOR ADJUSTMENTS
      const { data: laborRows, error: laborError } = await supabase
        .from("labor_hours")
        .select("*")
        .eq("service_date", selectedDate);

      if (laborError) {
        throw laborError;
      }

      // ACTIVE LOCATIONS
      const { data: locations, error: locationError } = await supabase
        .from("locations")
        .select("*")
        .eq("active", true)
        .order("school_name");

      if (locationError) {
        throw locationError;
      }

      // SELECTED DATE'S FINISH LINE CHECKS
      const { data: checks, error: checkError } = await supabase
        .from("finish_line_checks")
        .select(
          `
          *,
          finish_line_items (*)
        `
        )
        .eq("service_date", selectedDate);

      if (checkError) {
        throw checkError;
      }

      const merged = (locations || []).map((location) => {
        const check = (checks || []).find(
          (item) => item.location_id === location.id
        );
        const mealRow = (mealCounts || []).find(
          (item) => item.location_id === location.id
        );

        const laborRow = (laborRows || []).find(
          (item) => item.location_id === location.id
        );

        const breakfast = Number(mealRow?.breakfast_count) || 0;
        const lunch = Number(mealRow?.lunch_count) || 0;

        const supper =
          mealRow?.supper_status === "pending"
            ? 0
            : Number(mealRow?.supper_count) || 0;

        const mealEquivalents = breakfast * 0.66 + lunch + supper;

        const baselineLabor = Number(location.budget_labor_hours) || 0;

        const extraWorkerHours = Number(laborRow?.additional_worker_hours) || 0;

        const managerOt = Number(laborRow?.manager_overtime_hours) || 0;

        const actualLaborHours = baselineLabor + extraWorkerHours + managerOt;

        const mplh =
          mealRow && actualLaborHours > 0
            ? mealEquivalents / actualLaborHours
            : null;

        const targets = {
          secondary: {
            min: 18,
            max: 20,
          },
          elementary_prep: {
            min: 20,
            max: 22,
          },
          elementary_nnc: {
            min: 24,
            max: 25,
          },
        };

        const target = targets[location.labor_type] || null;

        let mplhStatus = "no-data";

        if (mplh !== null && target) {
          if (mplh < target.min) {
            mplhStatus = "below";
          } else if (mplh <= target.max) {
            mplhStatus = "target";
          } else {
            mplhStatus = "high";
          }
        }
        const attentionItems =
          check?.finish_line_items?.filter(
            (item) => item.requires_attention === true
          ) || [];

        let overall = "not-submitted";

        if (check) {
          overall = check.status === "attention" ? "attention" : "good";
        }

        return {
          ...location,
          check,
          attentionItems,
          overall,

          mealRow,
          laborRow,

          mealEquivalents,
          baselineLabor,
          actualLaborHours,
          mplh,
          mplhTarget: target,
          mplhStatus,
        };
      });

      setSchools(merged);

      setSelectedSchool((current) => {
        if (!merged.length) {
          return null;
        }

        if (current) {
          return merged.find((school) => school.id === current.id) || merged[0];
        }

        const firstAttention = merged.find(
          (school) => school.overall === "attention"
        );

        const firstMissing = merged.find(
          (school) => school.overall === "not-submitted"
        );

        return firstAttention || firstMissing || merged[0];
      });
    } catch (err) {
      console.error("Command Center error:", err);

      setError(err.message || "Could not load Command Center.");
    } finally {
      setLoading(false);
    }
  }

  // =========================================
  // MEAL TRENDS
  // =========================================

  useEffect(() => {
    if (view === "meal-trends") {
      loadMealTrends();
    }
  }, [view, trendSchoolId, trendDays, mealAnalyticsEndDate]);

  async function loadMealTrends() {
    setMealTrendLoading(true);
    setMealTrendError("");

    try {
      const endDateString = mealAnalyticsEndDate || todayString;
      const endDate = new Date(`${endDateString}T12:00:00`);
      const startDate = new Date(endDate);

      if (trendDays === "ytd") {
        startDate.setMonth(0, 1);
      } else {
        startDate.setDate(startDate.getDate() - (Number(trendDays) - 1));
      }

      const startDateString = getLocalDateString(startDate);

      let query = supabase
        .from("meal_counts")
        .select(
          `
          location_id,
          service_date,
          breakfast_count,
          lunch_count,
          supper_count
        `
        )
        .gte("service_date", startDateString)
        .lte("service_date", endDateString)
        .order("service_date", { ascending: true });

      if (trendSchoolId !== "all") {
        query = query.eq("location_id", trendSchoolId);
      }

      const { data, error: trendError } = await query;

      if (trendError) {
        throw trendError;
      }

      const grouped = {};

      (data || []).forEach((row) => {
        if (!grouped[row.service_date]) {
          grouped[row.service_date] = {
            service_date: row.service_date,
            breakfast: 0,
            lunch: 0,
            supper: 0,
          };
        }

        grouped[row.service_date].breakfast += Number(row.breakfast_count) || 0;
        grouped[row.service_date].lunch += Number(row.lunch_count) || 0;
        grouped[row.service_date].supper += Number(row.supper_count) || 0;
      });

      const formatted = Object.values(grouped)
        .sort((a, b) => new Date(a.service_date) - new Date(b.service_date))
        .map((day) => ({
          ...day,
          total: day.breakfast + day.lunch + day.supper,
          dateLabel: new Date(
            `${day.service_date}T12:00:00`
          ).toLocaleDateString([], {
            month: "short",
            day: "numeric",
          }),
        }));

      setMealTrendData(formatted);
    } catch (err) {
      console.error("Meal Analytics error:", err);
      setMealTrendError(err.message || "Could not load meal trends.");
    } finally {
      setMealTrendLoading(false);
    }
  }

  function toggleMealLine(meal) {
    setVisibleMeals((current) => ({
      ...current,
      [meal]: !current[meal],
    }));
  }

  function openDashboard() {
    setView("dashboard");
    setFilter("all");
  }

  function openFinishLine(filterName = "all") {
    setView("finish-line");
    setFilter(filterName);
  }

  function openMealTrends() {
    setView("meal-trends");
  }
  function openMplhReport() {
    setView("mplh-report");
  }

  function openRecentChanges() {
    setView("recent-changes");
  }

  function openSparkPoints() {
    setView("spark-points");
    setPointsMessage("");
    setPointsError("");
  }

  async function loadSparkPointsSupervisor(locationId) {
    setPointsSchoolId(locationId);
    setPointsMessage("");
    setPointsError("");
    setPointsAmount("");
    setPointsReason("");

    if (!locationId) {
      setPointsTotal(0);
      setPointsHistory([]);
      return;
    }

    setPointsLoading(true);

    try {
      const { data: totalData, error: totalError } = await supabase
        .from("spark_school_point_totals")
        .select("total_points")
        .eq("location_id", locationId)
        .maybeSingle();

      if (totalError) {
        throw totalError;
      }

      const { data: historyData, error: historyError } = await supabase
        .from("spark_points")
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (historyError) {
        throw historyError;
      }

      const { data: excludedData, error: excludedError } = await supabase
        .from("spark_excluded_days")
        .select("*")
        .eq("location_id", locationId)
        .order("service_date", { ascending: false });

      if (excludedError) {
        throw excludedError;
      }

      setPointsTotal(totalData?.total_points || 0);
      setPointsHistory(historyData || []);
      setExcludedDays(excludedData || []);
    } catch (error) {
      console.error("SPARK Points supervisor load error:", error);
      setPointsError(error.message || "Could not load SPARK Points.");
    } finally {
      setPointsLoading(false);
    }
  }

  async function saveSparkPointsAdjustment() {
    const numericAmount = Number(pointsAmount);

    if (!pointsSchoolId) {
      setPointsError("Select a school first.");
      return;
    }

    if (!Number.isInteger(numericAmount) || numericAmount <= 0) {
      setPointsError("Enter a whole-number point amount greater than zero.");
      return;
    }

    if (!pointsReason.trim()) {
      setPointsError("Enter a reason for the point adjustment.");
      return;
    }

    setPointsSaving(true);
    setPointsMessage("");
    setPointsError("");

    try {
      const signedPoints =
        pointsDirection === "subtract" ? -numericAmount : numericAmount;

      const now = new Date();
      const uniqueKey =
        `supervisor-adjustment-${pointsSchoolId}-${now.getTime()}-` +
        Math.random().toString(36).slice(2, 8);

      const { error } = await supabase.from("spark_points").insert({
        location_id: Number(pointsSchoolId),
        points: signedPoints,
        point_type: "supervisor_adjustment",
        description:
          pointsDirection === "subtract"
            ? "Supervisor point correction"
            : "Supervisor point award",
        service_date: getLocalDateString(now),
        source: "supervisor",
        awarded_by: "Supervisor",
        adjustment_reason: pointsReason.trim(),
        unique_key: uniqueKey,
      });

      if (error) {
        throw error;
      }

      setPointsMessage(
        `${signedPoints > 0 ? "+" : ""}${signedPoints} points saved successfully.`
      );
      setPointsAmount("");
      setPointsReason("");

      await loadSparkPointsSupervisor(pointsSchoolId);
    } catch (error) {
      console.error("SPARK Points adjustment error:", error);
      setPointsError(error.message || "Could not save the point adjustment.");
    } finally {
      setPointsSaving(false);
    }
  }

  function getMonitoringCycleStart() {
    const now = new Date();
    const year = now.getFullYear();

    // July 1 through June 30
    const startYear = now.getMonth() >= 6 ? year : year - 1;

    return `${startYear}-07-01`;
  }

  function getMonitoringCycleEnd() {
    const startYear = Number(getMonitoringCycleStart().slice(0, 4));
    return `${startYear + 1}-06-30`;
  }

  function getMonitoringCount(serviceType) {
    return pointsHistory.filter((row) => {
      if (row.point_type !== `monitoring_${serviceType}`) {
        return false;
      }

      const serviceDate = row.service_date;

      return (
        serviceDate >= getMonitoringCycleStart() &&
        serviceDate <= getMonitoringCycleEnd()
      );
    }).length;
  }

  function getMonitoringLimit(serviceType) {
    if (serviceType === "supper") {
      return 3;
    }

    return 1;
  }

  async function awardMonitoringPoints(serviceType, result) {
    if (!pointsSchoolId) {
      setPointsError("Select a school first.");
      return;
    }

    const currentCount = getMonitoringCount(serviceType);
    const limit = getMonitoringLimit(serviceType);

    if (currentCount >= limit) {
      setPointsError(
        `${serviceType.charAt(0).toUpperCase() + serviceType.slice(1)} monitoring requirement is already complete for this cycle.`
      );
      return;
    }

    const isPerfect = result === "perfect";
    const points = isPerfect ? 20 : 10;
    const serviceLabel =
      serviceType.charAt(0).toUpperCase() + serviceType.slice(1);
    const resultLabel = isPerfect ? "Perfect" : "Pass";

    const confirmMessage =
      `Award ${points} points to this school for a ${resultLabel} ` +
      `${serviceLabel} monitoring?`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    setMonitoringSaving(`${serviceType}-${result}`);
    setPointsError("");
    setPointsMessage("");

    try {
      const now = new Date();
      const cycleStart = getMonitoringCycleStart();

      // The sequence number makes each required monitoring unique.
      // Breakfast/Lunch will only ever be #1. Supper can be #1, #2, or #3.
      const sequence = currentCount + 1;

      const { error } = await supabase.from("spark_points").insert({
        location_id: Number(pointsSchoolId),
        points,
        point_type: `monitoring_${serviceType}`,
        description: `${resultLabel} ${serviceLabel} Monitoring`,
        service_date: getLocalDateString(now),
        source: "supervisor_monitoring",
        awarded_by: "Supervisor",
        adjustment_reason: `${resultLabel} ${serviceLabel} monitoring`,
        unique_key:
          `monitoring-${serviceType}-${pointsSchoolId}-` +
          `${cycleStart}-${sequence}`,
      });

      if (error) {
        throw error;
      }

      setPointsMessage(
        `+${points} points awarded for ${resultLabel} ${serviceLabel} Monitoring.`
      );

      await loadSparkPointsSupervisor(pointsSchoolId);
    } catch (error) {
      console.error("Monitoring points error:", error);

      if (error?.code === "23505") {
        setPointsError(
          "These monitoring points were already awarded for this requirement."
        );
      } else {
        setPointsError(
          error.message || "Could not award monitoring points."
        );
      }
    } finally {
      setMonitoringSaving("");
    }
  }

  async function saveExcludedDay() {
    if (!pointsSchoolId) {
      setPointsError("Select a school first.");
      return;
    }

    if (!excludedDate) {
      setPointsError("Select the unassigned/excluded date.");
      return;
    }

    if (!excludedReason.trim()) {
      setPointsError("Enter a reason for excluding this date.");
      return;
    }

    setExcludedSaving(true);
    setPointsError("");
    setPointsMessage("");

    try {
      const { error } = await supabase.from("spark_excluded_days").upsert(
        {
          location_id: Number(pointsSchoolId),
          service_date: excludedDate,
          reason: excludedReason.trim(),
          created_by: "Supervisor",
        },
        {
          onConflict: "location_id,service_date",
        }
      );

      if (error) {
        throw error;
      }

      setExcludedDate("");
      setExcludedReason("");
      setPointsMessage("Excluded/unassigned day saved.");
      await loadSparkPointsSupervisor(pointsSchoolId);
    } catch (error) {
      console.error("Excluded day save error:", error);
      setPointsError(error.message || "Could not save the excluded day.");
    } finally {
      setExcludedSaving(false);
    }
  }

  async function removeExcludedDay(rowId) {
    if (!window.confirm("Remove this excluded/unassigned day?")) {
      return;
    }

    setPointsError("");
    setPointsMessage("");

    try {
      const { error } = await supabase
        .from("spark_excluded_days")
        .delete()
        .eq("id", rowId);

      if (error) {
        throw error;
      }

      setPointsMessage("Excluded/unassigned day removed.");
      await loadSparkPointsSupervisor(pointsSchoolId);
    } catch (error) {
      console.error("Excluded day remove error:", error);
      setPointsError(error.message || "Could not remove the excluded day.");
    }
  }

  useEffect(() => {
    if (view === "recent-changes") {
      loadRecentChanges();
    }
  }, [view, historySchoolId, historyDate]);

  async function loadRecentChanges() {
    setRecentChangesLoading(true);
    setRecentChangesError("");

    try {
      let query = supabase.from("finish_line_audit_log").select("*");

      if (historySchoolId !== "all") {
        query = query.eq("location_id", historySchoolId);
      }

      if (historyDate) {
        query = query.eq("service_date", historyDate);
      }

      const { data, error: historyError } = await query.limit(500);

      if (historyError) {
        throw historyError;
      }

      const locationMap = new Map(
        schools.map((school) => [String(school.id), school])
      );

      const sorted = (data || [])
        .map((row) => ({
          ...row,
          school: locationMap.get(String(row.location_id)) || null,
        }))
        .sort((a, b) => {
          const aTime = new Date(
            a.created_at ||
              a.changed_at ||
              a.updated_at ||
              `${a.service_date}T00:00:00`
          ).getTime();
          const bTime = new Date(
            b.created_at ||
              b.changed_at ||
              b.updated_at ||
              `${b.service_date}T00:00:00`
          ).getTime();
          return bTime - aTime;
        })
        .slice(0, 50);

      setRecentChanges(sorted);
    } catch (err) {
      console.error("Recent Changes error:", err);
      setRecentChangesError(err.message || "Could not load recent changes.");
    } finally {
      setRecentChangesLoading(false);
    }
  }

  function changeDashboardDay(amount) {
    const date = new Date(`${dashboardDate}T12:00:00`);
    date.setDate(date.getDate() + amount);
    const nextDate = getLocalDateString(date);

    if (nextDate <= todayString) {
      setDashboardDate(nextDate);
    }
  }

  function returnDashboardToToday() {
    setDashboardDate(todayString);
  }

  // =========================================
  // TEST MODE HELPERS
  // =========================================

  function getPreviewDayName() {
    if (testDay === "live") {
      return "Live";
    }

    const names = {
      1: "Monday",
      2: "Tuesday",
      3: "Wednesday",
      4: "Thursday",
      5: "Friday",
    };

    return names[Number(testDay)] || "Live";
  }

  const supervisorTestMode = testDay !== "live" || testMonthEnd;

  function handlePreviewFinishLine() {
    if (!onPreviewFinishLine) {
      return;
    }

    onPreviewFinishLine({
      day: testDay === "live" ? null : Number(testDay),

      monthEnd: testMonthEnd,
    });
  }

  // =========================================
  // MANAGER PIN RESET
  // =========================================

  async function loadPinResetEmployees(locationId) {
    setPinResetSchoolId(locationId);
    setPinResetEmployeeId("");
    setPinResetEmployees([]);
    setPinResetMessage("");
    setPinResetError("");

    if (!locationId) {
      return;
    }

    setPinResetLoading(true);

    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id, employee_name, email, active")
        .eq("location_id", locationId)
        .eq("active", true)
        .order("employee_name");

      if (error) {
        throw error;
      }

      setPinResetEmployees(data || []);
    } catch (error) {
      console.error("PIN reset employee load error:", error);
      setPinResetError("Could not load managers for this school.");
    } finally {
      setPinResetLoading(false);
    }
  }

  async function resetSelectedManagerPin() {
    if (!pinResetEmployeeId) {
      setPinResetError("Select a manager first.");
      return;
    }

    const selectedManager = pinResetEmployees.find(
      (employee) => String(employee.id) === String(pinResetEmployeeId)
    );

    const confirmed = window.confirm(
      `Reset ${selectedManager?.employee_name || "this manager"}'s SPARK PIN?\n\nTheir current PIN will stop working immediately. The next time they sign in, SPARK will ask them to create a new PIN.`
    );

    if (!confirmed) {
      return;
    }

    setPinResetLoading(true);
    setPinResetMessage("");
    setPinResetError("");

    try {
      const { data, error } = await supabase.rpc("reset_manager_pin", {
        p_employee_id: String(pinResetEmployeeId),
        p_supervisor_pin: supervisorPin,
      });

      if (error) {
        throw error;
      }

      if (data !== true) {
        setPinResetError("SPARK could not reset this PIN.");
        return;
      }

      setPinResetMessage(
        `${selectedManager?.employee_name || "Manager"}'s PIN has been reset. They can create a new PIN the next time they sign in.`
      );
    } catch (error) {
      console.error("PIN reset error:", error);
      setPinResetError(
        "SPARK could not reset the PIN. Please confirm supervisor access and try again."
      );
    } finally {
      setPinResetLoading(false);
    }
  }

  // =========================================
  // SUMMARY
  // =========================================

  const summary = useMemo(() => {
    const good = schools.filter((school) => school.overall === "good").length;

    const attention = schools.filter(
      (school) => school.overall === "attention"
    ).length;

    const missing = schools.filter(
      (school) => school.overall === "not-submitted"
    ).length;

    const submitted = schools.length - missing;

    const completion =
      schools.length > 0 ? Math.round((submitted / schools.length) * 100) : 0;

    return {
      good,
      attention,
      missing,
      submitted,
      completion,
    };
  }, [schools]);

  const filteredSchools = useMemo(() => {
    if (filter === "all") {
      return schools;
    }

    return schools.filter((school) => school.overall === filter);
  }, [schools, filter]);

  const attentionSchools = schools.filter(
    (school) => school.overall === "attention"
  );

  const missingSchools = schools.filter(
    (school) => school.overall === "not-submitted"
  );

  const totalFlaggedItems = attentionSchools.reduce(
    (total, school) => total + school.attentionItems.length,
    0
  );

  // =========================================
  // FORMATTERS
  // =========================================

  function formatTime(value) {
    if (!value) {
      return "—";
    }

    return new Date(value).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatDate(value) {
    if (!value) {
      return "—";
    }

    return new Date(`${value}T12:00:00`).toLocaleDateString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  // =========================================
  // LOADING
  // =========================================

  if (loading) {
    return (
      <div className="command-loading">
        Loading South Café LA Command Center...
      </div>
    );
  }

  return (
    <div className="command-app">
      {/* =====================================
          SIDEBAR
      ===================================== */}

      <aside className="command-sidebar">
        <div className="command-brand">
          <div className="command-brand-icon spark-command-logo">
            <img src="/spark-clear.png" alt="Spark" />
          </div>

          <div>
            <strong>SOUTH CAFÉ LA</strong>

            <span>COMMAND CENTER</span>
          </div>
        </div>

        <nav className="command-nav">
          <button
            className={`command-nav-button ${
              view === "dashboard" ? "active" : ""
            }`}
            onClick={openDashboard}
          >
            <span>⌂</span>
            Dashboard
          </button>

          <div className="command-nav-label">OPERATIONS</div>

          <button
            className={`command-nav-button ${
              view === "finish-line" || view === "recent-changes" ? "active" : ""
            }`}
            onClick={() => openFinishLine("all")}
          >
            <span>🏁</span>
            Finish Line
            {(summary.attention > 0 || summary.missing > 0) && (
              <span className="command-badge">
                {summary.attention + summary.missing}
              </span>
            )}
          </button>

          <button
            className={`command-nav-button ${
              view === "meal-trends" ? "active" : ""
            }`}
            onClick={openMealTrends}
          >
            <span>📊</span>
            Meal Analytics
          </button>

          <button
            className={`command-nav-button ${
              view === "mplh-report" ? "active" : ""
            }`}
            onClick={openMplhReport}
          >
            <span>📈</span>
            MPLH Report
          </button>

          <button
            className={`command-nav-button ${
              view === "spark-points" ? "active" : ""
            }`}
            onClick={openSparkPoints}
          >
            <span>⚡</span>
            SPARK Points
          </button>

          <button
            className={`command-nav-button ${
              view === "pin-reset" ? "active" : ""
            }`}
            onClick={() => {
              setView("pin-reset");
              setPinResetMessage("");
              setPinResetError("");
            }}
          >
            <span>🔐</span>
            Manager PIN Reset
          </button>

          <button
            type="button"
            className="command-nav-button command-nav-exit"
            onClick={onExit}
          >
            <span>←</span>
            Exit Supervisor
          </button>
        </nav>
      </aside>

      {/* =====================================
          MAIN
      ===================================== */}

      <main className="command-main">
        {/* TOP BAR */}

        <header className="command-topbar">
          <div>
            <h2>
              {view === "meal-trends"
                ? "South Café LA Meal Analytics"
                : view === "mplh-report"
                ? "South Café LA MPLH Report"
                : view === "finish-line" || view === "recent-changes"
                ? "South Café LA Finish Line"
                : view === "spark-points"
                ? "South Café LA SPARK Points"
                : view === "pin-reset"
                ? "South Café LA Manager PIN Reset"
                : "South Café LA Command Center"}
            </h2>

            <p>
              {view === "meal-trends"
                ? "Meal counts, trends, and estimated reimbursement across active locations."
                : view === "mplh-report"
                ? `Meals per labor hour for ${formatDate(
                    dashboardDate
                  )} across all active locations.`
                : view === "finish-line" || view === "recent-changes"
                ? `Finish Line status and audit history for ${formatDate(
                    dashboardDate
                  )}.`
                : view === "spark-points"
                ? "Review school point totals and make documented supervisor adjustments."
                : view === "pin-reset"
                ? "Reset a verified manager's SPARK PIN."
                : `Area operations overview for ${formatDate(
                    dashboardDate
                  )}.`}
            </p>
          </div>

          <div className="command-top-actions">
            {view === "finish-line" && (
              <>
                {/* TEST DAY */}

                <div className="supervisor-test-controls">
                  <select
                    className="supervisor-test-select"
                    value={testDay}
                    onChange={(e) => setTestDay(e.target.value)}
                  >
                    <option value="live">Live Mode</option>
                    <option value="1">Test Monday</option>
                    <option value="2">Test Tuesday</option>
                    <option value="3">Test Wednesday</option>
                    <option value="4">Test Thursday</option>
                    <option value="5">Test Friday</option>
                  </select>

                  <label className="supervisor-month-end-toggle">
                    <input
                      type="checkbox"
                      checked={testMonthEnd}
                      onChange={(e) => setTestMonthEnd(e.target.checked)}
                    />
                    Month-End
                  </label>
                </div>
              </>
            )}

            {view !== "pin-reset" && (
              <button
                className="command-refresh"
                onClick={
                  view === "meal-trends"
                    ? loadMealTrends
                    : view === "recent-changes"
                    ? loadRecentChanges
                    : loadCommandCenter
                }
              >
                ↻ Refresh
              </button>
            )}

            {view === "meal-trends" ? (
              <div
                className="command-date"
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span className="command-date-label">Through</span>
                <input
                  type="date"
                  value={mealAnalyticsEndDate}
                  max={todayString}
                  onChange={(e) => setMealAnalyticsEndDate(e.target.value)}
                  style={{
                    border: "1px solid #d7dee5",
                    borderRadius: "7px",
                    padding: "7px 9px",
                    fontWeight: "700",
                    background: "white",
                  }}
                />
              </div>
            ) : view === "dashboard" ||
              view === "finish-line" ||
              view === "mplh-report" ||
              view === "recent-changes" ? (
              <div
                className="command-date"
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <button
                  type="button"
                  className="command-small-button"
                  onClick={() => changeDashboardDay(-1)}
                  title="Previous day"
                >
                  ‹
                </button>

                <input
                  type="date"
                  value={dashboardDate}
                  max={todayString}
                  onChange={(e) => setDashboardDate(e.target.value)}
                  style={{
                    border: "1px solid #d7dee5",
                    borderRadius: "7px",
                    padding: "7px 9px",
                    fontWeight: "700",
                    background: "white",
                  }}
                />

                <button
                  type="button"
                  className="command-small-button"
                  onClick={() => changeDashboardDay(1)}
                  disabled={dashboardDate >= todayString}
                  title="Next day"
                >
                  ›
                </button>

                {dashboardDate !== todayString && (
                  <button
                    type="button"
                    className="command-small-button"
                    onClick={returnDashboardToToday}
                  >
                    Today
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </header>

        <div className="command-content">
          {view === "meal-trends" ? (
            <MealTrendsView
              schools={schools}
              mealTrendData={mealTrendData}
              mealTrendLoading={mealTrendLoading}
              mealTrendError={mealTrendError}
              trendSchoolId={trendSchoolId}
              setTrendSchoolId={setTrendSchoolId}
              trendDays={trendDays}
              setTrendDays={setTrendDays}
              mealAnalyticsEndDate={mealAnalyticsEndDate}
              setMealAnalyticsEndDate={setMealAnalyticsEndDate}
              visibleMeals={visibleMeals}
              toggleMealLine={toggleMealLine}
              loadMealTrends={loadMealTrends}
              mealAnalyticsMode={mealAnalyticsMode}
              setMealAnalyticsMode={setMealAnalyticsMode}
              onOpenSchoolAnalytics={onOpenSchoolAnalytics}
            />
          ) : view === "mplh-report" ? (
            <MplhReportView
              schools={schools}
              dashboardDate={dashboardDate}
              formatDate={formatDate}
            />
          ) : view === "spark-points" ? (
            <section className="dashboard-card">
              <div className="command-section-header">
                <div>
                  <h3>SPARK Points</h3>
                  <p>
                    Review a school's point total and make documented corrections
                    or supervisor awards. Adjustments are added to the point ledger
                    and do not overwrite previous transactions.
                  </p>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(240px, 1fr) minmax(180px, 240px)",
                  gap: "16px",
                  alignItems: "end",
                  marginTop: "18px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: "800",
                      marginBottom: "6px",
                    }}
                  >
                    School
                  </label>

                  <select
                    value={pointsSchoolId}
                    onChange={(e) => loadSparkPointsSupervisor(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "11px 12px",
                      border: "1px solid #d6dfe7",
                      borderRadius: "8px",
                      fontSize: "14px",
                    }}
                  >
                    <option value="">Select a school</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.school_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div
                  style={{
                    background: "#f5f8fb",
                    border: "1px solid #dce5ed",
                    borderRadius: "10px",
                    padding: "14px 18px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "11px",
                      fontWeight: "800",
                      color: "#667482",
                      letterSpacing: "0.5px",
                    }}
                  >
                    ⚡ CURRENT POINTS
                  </div>

                  <strong
                    style={{
                      display: "block",
                      fontSize: "32px",
                      lineHeight: 1.1,
                      marginTop: "4px",
                    }}
                  >
                    {Number(pointsTotal || 0).toLocaleString()}
                  </strong>
                </div>
              </div>

              {pointsSchoolId && (
                <>
                  <div
                    style={{
                      marginTop: "22px",
                      paddingTop: "20px",
                      borderTop: "1px solid #e1e7ec",
                    }}
                  >
                    <h4 style={{ margin: "0 0 14px" }}>
                      Add or Subtract Points
                    </h4>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "160px 160px minmax(260px, 1fr) auto",
                        gap: "12px",
                        alignItems: "end",
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "11px",
                            fontWeight: "800",
                            marginBottom: "6px",
                          }}
                        >
                          Adjustment
                        </label>

                        <select
                          value={pointsDirection}
                          onChange={(e) => setPointsDirection(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "10px",
                            border: "1px solid #d6dfe7",
                            borderRadius: "8px",
                          }}
                        >
                          <option value="add">Add Points</option>
                          <option value="subtract">Subtract Points</option>
                        </select>
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "11px",
                            fontWeight: "800",
                            marginBottom: "6px",
                          }}
                        >
                          Points
                        </label>

                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={pointsAmount}
                          onChange={(e) => setPointsAmount(e.target.value)}
                          placeholder="25"
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "10px",
                            border: "1px solid #d6dfe7",
                            borderRadius: "8px",
                          }}
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "11px",
                            fontWeight: "800",
                            marginBottom: "6px",
                          }}
                        >
                          Reason — required
                        </label>

                        <input
                          type="text"
                          value={pointsReason}
                          onChange={(e) => setPointsReason(e.target.value)}
                          placeholder="Example: Corrected missed meal-count points"
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "10px",
                            border: "1px solid #d6dfe7",
                            borderRadius: "8px",
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        className="finish-line-submit finish-line-ready"
                        disabled={pointsSaving}
                        onClick={saveSparkPointsAdjustment}
                      >
                        {pointsSaving ? "Saving..." : "Save Adjustment"}
                      </button>
                    </div>

                    {pointsError && (
                      <div className="login-error" style={{ marginTop: "12px" }}>
                        {pointsError}
                      </div>
                    )}

                    {pointsMessage && (
                      <div
                        style={{
                          marginTop: "12px",
                          color: "#237044",
                          fontWeight: "700",
                        }}
                      >
                        {pointsMessage}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: "24px",
                      paddingTop: "20px",
                      borderTop: "1px solid #e1e7ec",
                    }}
                  >
                    <h4 style={{ margin: "0 0 6px" }}>
                      Monitoring Points
                    </h4>

                    <p style={{ margin: "0 0 14px", color: "#667482" }}>
                      Award points after completing required school monitorings.
                      Pass = +10 points. Perfect = +20 points.
                    </p>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(260px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      {[
                        {
                          key: "breakfast",
                          label: "Breakfast",
                          limit: 1,
                        },
                        {
                          key: "lunch",
                          label: "Lunch",
                          limit: 1,
                        },
                        {
                          key: "supper",
                          label: "Supper",
                          limit: 3,
                        },
                      ].map((monitoring) => {
                        const completed = getMonitoringCount(monitoring.key);
                        const isComplete = completed >= monitoring.limit;

                        return (
                          <div
                            key={monitoring.key}
                            style={{
                              border: "1px solid #dce5ed",
                              borderRadius: "10px",
                              padding: "14px",
                              background: isComplete ? "#f0faf4" : "#ffffff",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: "10px",
                                marginBottom: "12px",
                              }}
                            >
                              <div>
                                <strong
                                  style={{
                                    display: "block",
                                    fontSize: "15px",
                                  }}
                                >
                                  {monitoring.label} Monitoring
                                </strong>

                                <span
                                  style={{
                                    color: "#667482",
                                    fontSize: "12px",
                                  }}
                                >
                                  {completed} / {monitoring.limit} completed
                                </span>
                              </div>

                              {isComplete && (
                                <span
                                  style={{
                                    background: "#dff4e7",
                                    color: "#237044",
                                    borderRadius: "999px",
                                    padding: "5px 9px",
                                    fontSize: "11px",
                                    fontWeight: "800",
                                  }}
                                >
                                  COMPLETE
                                </span>
                              )}
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "8px",
                              }}
                            >
                              <button
                                type="button"
                                className="dashboard-exit"
                                disabled={
                                  isComplete ||
                                  Boolean(monitoringSaving)
                                }
                                onClick={() =>
                                  awardMonitoringPoints(
                                    monitoring.key,
                                    "pass"
                                  )
                                }
                              >
                                {monitoringSaving ===
                                `${monitoring.key}-pass`
                                  ? "Saving..."
                                  : "Pass +10"}
                              </button>

                              <button
                                type="button"
                                className="finish-line-submit finish-line-ready"
                                disabled={
                                  isComplete ||
                                  Boolean(monitoringSaving)
                                }
                                onClick={() =>
                                  awardMonitoringPoints(
                                    monitoring.key,
                                    "perfect"
                                  )
                                }
                              >
                                {monitoringSaving ===
                                `${monitoring.key}-perfect`
                                  ? "Saving..."
                                  : "Perfect +20"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "24px",
                      paddingTop: "20px",
                      borderTop: "1px solid #e1e7ec",
                    }}
                  >
                    <h4 style={{ margin: "0 0 6px" }}>
                      Unassigned / Excluded Days
                    </h4>
                    <p style={{ margin: "0 0 14px", color: "#667482" }}>
                      Excluded dates do not break the school's Finish Line streak.
                    </p>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "180px minmax(280px, 1fr) auto",
                        gap: "12px",
                        alignItems: "end",
                      }}
                    >
                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "11px",
                            fontWeight: "800",
                            marginBottom: "6px",
                          }}
                        >
                          Service Date
                        </label>
                        <input
                          type="date"
                          value={excludedDate}
                          onChange={(e) => setExcludedDate(e.target.value)}
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "10px",
                            border: "1px solid #d6dfe7",
                            borderRadius: "8px",
                          }}
                        />
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "11px",
                            fontWeight: "800",
                            marginBottom: "6px",
                          }}
                        >
                          Reason — required
                        </label>
                        <input
                          type="text"
                          value={excludedReason}
                          onChange={(e) => setExcludedReason(e.target.value)}
                          placeholder="Example: Manager position unassigned"
                          style={{
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "10px",
                            border: "1px solid #d6dfe7",
                            borderRadius: "8px",
                          }}
                        />
                      </div>

                      <button
                        type="button"
                        className="finish-line-submit finish-line-ready"
                        disabled={excludedSaving}
                        onClick={saveExcludedDay}
                      >
                        {excludedSaving ? "Saving..." : "Exclude Date"}
                      </button>
                    </div>

                    {excludedDays.length > 0 && (
                      <div style={{ overflowX: "auto", marginTop: "16px" }}>
                        <table className="command-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Reason</th>
                              <th>Entered By</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {excludedDays.map((row) => (
                              <tr key={row.id}>
                                <td>{formatDate(row.service_date)}</td>
                                <td>{row.reason}</td>
                                <td>{row.created_by || "Supervisor"}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="dashboard-exit"
                                    onClick={() => removeExcludedDay(row.id)}
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      marginTop: "24px",
                      paddingTop: "20px",
                      borderTop: "1px solid #e1e7ec",
                    }}
                  >
                    <h4 style={{ margin: "0 0 12px" }}>Point History</h4>

                    {pointsLoading ? (
                      <div className="school-empty-history">
                        Loading point history...
                      </div>
                    ) : pointsHistory.length === 0 ? (
                      <div className="school-empty-history">
                        No point transactions for this school yet.
                      </div>
                    ) : (
                      <div style={{ overflowX: "auto" }}>
                        <table className="command-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Points</th>
                              <th>Activity</th>
                              <th>Reason / Detail</th>
                              <th>Source</th>
                            </tr>
                          </thead>

                          <tbody>
                            {pointsHistory.map((row) => (
                              <tr key={row.id}>
                                <td>{formatDate(row.service_date)}</td>
                                <td>
                                  <strong
                                    style={{
                                      color:
                                        Number(row.points) < 0
                                          ? "#a33a3a"
                                          : "#237044",
                                    }}
                                  >
                                    {Number(row.points) > 0 ? "+" : ""}
                                    {row.points}
                                  </strong>
                                </td>
                                <td>{row.description || row.point_type}</td>
                                <td>
                                  {row.adjustment_reason ||
                                    row.employee_name ||
                                    "—"}
                                </td>
                                <td>{row.source || "automatic"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          ) : view === "pin-reset" ? (
            <section className="dashboard-card manager-pin-reset-panel">
              <div className="command-section-header">
                <div>
                  <h3>Reset Manager PIN</h3>
                  <p>
                    Verify the request, choose the school and manager, then reset
                    the PIN. The manager will create a new PIN at their next login.
                  </p>
                </div>
              </div>

              <div className="manager-pin-reset-form">
                <div>
                  <label>School</label>
                  <select
                    value={pinResetSchoolId}
                    onChange={(e) => loadPinResetEmployees(e.target.value)}
                  >
                    <option value="">Select a school</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.school_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Manager</label>
                  <select
                    value={pinResetEmployeeId}
                    onChange={(e) => {
                      setPinResetEmployeeId(e.target.value);
                      setPinResetMessage("");
                      setPinResetError("");
                    }}
                    disabled={!pinResetSchoolId || pinResetLoading}
                  >
                    <option value="">
                      {pinResetLoading ? "Loading managers..." : "Select a manager"}
                    </option>

                    {pinResetEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.employee_name}
                        {employee.email ? ` • ${employee.email}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {pinResetEmployeeId && (
                  <div className="manager-pin-reset-summary">
                    <span>Selected Manager</span>
                    <strong>
                      {pinResetEmployees.find(
                        (employee) =>
                          String(employee.id) === String(pinResetEmployeeId)
                      )?.employee_name || "Manager"}
                    </strong>
                    <small>
                      {pinResetEmployees.find(
                        (employee) =>
                          String(employee.id) === String(pinResetEmployeeId)
                      )?.email || "No email on file"}
                    </small>
                  </div>
                )}

                {pinResetError && (
                  <div className="login-error">{pinResetError}</div>
                )}

                {pinResetMessage && (
                  <div className="manager-pin-reset-success">
                    ✓ {pinResetMessage}
                  </div>
                )}

                <button
                  type="button"
                  className="manager-pin-reset-button"
                  disabled={!pinResetEmployeeId || pinResetLoading}
                  onClick={resetSelectedManagerPin}
                >
                  {pinResetLoading ? "Working..." : "Reset Manager PIN"}
                </button>
              </div>
            </section>
          ) : view === "recent-changes" ? (
            <>
              <div className="finish-line-supervisor-tabs">
                <button
                  type="button"
                  onClick={() => openFinishLine("all")}
                >
                  Finish Line Status
                </button>
                <button type="button" className="active">
                  Recent Changes
                </button>
              </div>

              <RecentChangesView
                schools={schools}
                recentChanges={recentChanges}
                recentChangesLoading={recentChangesLoading}
                recentChangesError={recentChangesError}
                historySchoolId={historySchoolId}
                setHistorySchoolId={setHistorySchoolId}
                historyDate={historyDate}
                setHistoryDate={setHistoryDate}
                loadRecentChanges={loadRecentChanges}
                formatDate={formatDate}
                formatTime={formatTime}
              />
            </>
          ) : (
            <>
              {error && <div className="command-error">{error}</div>}

              {view === "finish-line" && (
                <div className="finish-line-supervisor-tabs">
                  <button type="button" className="active">
                    Finish Line Status
                  </button>
                  <button type="button" onClick={openRecentChanges}>
                    Recent Changes
                  </button>
                </div>
              )}

              {/* =================================
              TEST MODE
          ================================= */}

              {view === "finish-line" && supervisorTestMode && (
                <div className="supervisor-test-banner">
                  <div>
                    <strong> SUPERVISOR TEST MODE </strong>

                    <span>
                      {getPreviewDayName()}

                      {testMonthEnd ? " + Month-End" : ""}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                    }}
                  >
                    <button type="button" onClick={handlePreviewFinishLine}>
                      Preview Manager Finish Line →
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTestDay("live");
                        setTestMonthEnd(false);
                      }}
                    >
                      Live Mode
                    </button>
                  </div>
                </div>
              )}

              {/* =================================
              SUMMARY CARDS
          ================================= */}

              <section className="command-stats">
                <button
                  className="command-stat-card clickable-card"
                  onClick={() => openFinishLine("good")}
                >
                  <div className="command-stat-icon green">✓</div>

                  <div>
                    <span>All Good</span>

                    <strong>{summary.good}</strong>

                    <small>Finish Line complete</small>
                  </div>
                </button>

                <button
                  className="command-stat-card clickable-card"
                  onClick={() => openFinishLine("attention")}
                >
                  <div className="command-stat-icon yellow">!</div>

                  <div>
                    <span>Needs Attention</span>

                    <strong>{summary.attention}</strong>

                    <small>{totalFlaggedItems} flagged items</small>
                  </div>
                </button>

                <button
                  className="command-stat-card clickable-card"
                  onClick={() => openFinishLine("not-submitted")}
                >
                  <div className="command-stat-icon red">×</div>

                  <div>
                    <span>Not Submitted</span>

                    <strong>{summary.missing}</strong>

                    <small>Finish Line missing</small>
                  </div>
                </button>

                <div className="command-stat-card completion">
                  <div>
                    <span>Overall Completion</span>

                    <strong>{summary.completion}%</strong>

                    <small>
                      {summary.submitted} of {schools.length} submitted
                    </small>
                  </div>

                  <div
                    className="command-donut"
                    style={{
                      background: `conic-gradient(
                    #15aa5d 0deg ${summary.completion * 3.6}deg,
                    #e8edf2 ${summary.completion * 3.6}deg 360deg
                  )`,
                    }}
                  />
                </div>
              </section>

              {/* =================================
              NEEDS ATTENTION
          ================================= */}

              {view === "finish-line" && (
                <section className="command-attention-card">
                <div className="command-section-header">
                  <div>
                    <h3>What Needs Your Attention</h3>

                    <p>Exceptions requiring supervisor review.</p>
                  </div>
                </div>

                <div className="command-attention-grid">
                  <button
                    className="command-attention-item"
                    onClick={() => setFilter("not-submitted")}
                  >
                    <span className="attention-circle red">🏁</span>

                    <div>
                      <strong>Missing Finish Line</strong>

                      <small>{summary.missing} schools</small>
                    </div>
                  </button>

                  <button
                    className="command-attention-item"
                    onClick={() => setFilter("attention")}
                  >
                    <span className="attention-circle yellow">⚠</span>

                    <div>
                      <strong>Flagged Finish Line Items</strong>

                      <small>{totalFlaggedItems} items</small>
                    </div>
                  </button>

                  <button
                    className="command-attention-item"
                    onClick={() => setFilter("good")}
                  >
                    <span className="attention-circle blue">✓</span>

                    <div>
                      <strong>Completed Cleanly</strong>

                      <small>{summary.good} schools</small>
                    </div>
                  </button>
                </div>
                </section>
              )}

              {/* =================================
              PRIORITY EXCEPTIONS
          ================================= */}

              {view === "finish-line" &&
                (attentionSchools.length > 0 || missingSchools.length > 0) && (
                  <section className="dashboard-card">
                  <div className="command-section-header">
                    <div>
                      <h3>Priority Exceptions</h3>

                      <p>Start here before reviewing all schools.</p>
                    </div>

                    <button
                      type="button"
                      className="command-small-button priority-collapse-button"
                      onClick={() =>
                        setPriorityExceptionsOpen((current) => !current)
                      }
                    >
                      {priorityExceptionsOpen ? "Collapse ▲" : "Expand ▼"}
                    </button>
                  </div>

                  {priorityExceptionsOpen && (
                    <div className="priority-exception-list">
                    {attentionSchools.slice(0, 5).map((school) => (
                      <button
                        key={`attention-${school.id}`}
                        className="priority-exception-row"
                        onClick={() => {
                          setFilter("attention");

                          setSelectedSchool(school);
                        }}
                      >
                        <span className="priority-dot attention">!</span>

                        <div>
                          <strong>{school.school_name}</strong>

                          <small>
                            {school.attentionItems
                              .map((item) => item.item_label)
                              .join(" • ")}
                          </small>
                        </div>

                        <span>
                          {school.attentionItems.length} issue
                          {school.attentionItems.length === 1 ? "" : "s"}
                        </span>
                      </button>
                    ))}

                    {missingSchools.slice(0, 5).map((school) => (
                      <button
                        key={`missing-${school.id}`}
                        className="priority-exception-row"
                        onClick={() => {
                          setFilter("not-submitted");

                          setSelectedSchool(school);
                        }}
                      >
                        <span className="priority-dot missing">—</span>

                        <div>
                          <strong>{school.school_name}</strong>

                          <small>
                            Finish Line has not been submitted today.
                          </small>
                        </div>

                        <span>Missing</span>
                      </button>
                    ))}
                    </div>
                  )}
                </section>
              )}

              {/* =================================
              FILTER
          ================================= */}

              {view === "finish-line" && (
                <div className="command-filter-bar">
                  <div>
                  <strong>Showing:</strong>

                  <span>
                    {filter === "all" && " All Schools"}

                    {filter === "good" && " All Good"}

                    {filter === "attention" && " Needs Attention"}

                    {filter === "not-submitted" && " Not Submitted"}
                  </span>
                </div>

                {filter !== "all" && (
                  <button onClick={() => setFilter("all")}>Clear Filter</button>
                )}
                </div>
              )}

              {/* =================================
              SCHOOL TABLE
          ================================= */}

              <section className="command-workspace">
                <div className="command-school-card">
                  <div className="command-section-header">
                    <div>
                      <h3>
                        {view === "dashboard"
                          ? "School Performance Overview"
                          : "School Status Overview"}
                      </h3>

                      <p>
                        {view === "dashboard"
                          ? "Compare your schools for the selected date. Click a school for individual detail."
                          : "Click a school to review the selected date's Finish Line."}
                      </p>
                    </div>

                    <button
                      className="command-small-button"
                      onClick={loadCommandCenter}
                    >
                      Refresh
                    </button>
                  </div>

                  <div className="command-table-wrap">
                    <table className="command-table">
                      <thead>
                        <tr>
                          <th>School</th>
                          <th>Location</th>
                          <th>Submitted By</th>
                          <th>Time</th>
                          <th>Issues</th>
                          <th>Meals</th>
                          <th>MPLH</th>
                          <th>Finish Line</th>
                        </tr>
                      </thead>

                      <tbody>
                        {filteredSchools.map((school) => (
                          <tr
                            key={school.id}
                            onClick={() => setSelectedSchool(school)}
                            className={
                              selectedSchool?.id === school.id
                                ? "command-selected-row"
                                : ""
                            }
                          >
                            <td className="command-school-name">
                              <span
                                className={`command-row-line ${school.overall}`}
                              />

                              {school.school_name}
                            </td>

                            <td>{school.location_code}</td>

                            <td>{school.check?.employee_name || "—"}</td>

                            <td>{formatTime(school.check?.submitted_at)}</td>

                            <td>{school.attentionItems.length}</td>

                            <td>
                              {school.mealRow
                                ? (
                                    (Number(school.mealRow.breakfast_count) || 0) +
                                    (Number(school.mealRow.lunch_count) || 0) +
                                    (school.mealRow.supper_status === "pending"
                                      ? 0
                                      : Number(school.mealRow.supper_count) || 0)
                                  ).toLocaleString()
                                : "—"}
                            </td>

                            <td>
                              {school.mplh === null ? (
                                <span className="mplh-supervisor-status no-data">
                                  No Data
                                </span>
                              ) : (
                                <div className="mplh-supervisor-cell">
                                  <strong>{school.mplh.toFixed(1)}</strong>

                                  <span
                                    className={`mplh-supervisor-status ${school.mplhStatus}`}
                                  >
                                    {school.mplhStatus === "below" &&
                                      "Below Target"}
                                    {school.mplhStatus === "target" &&
                                      "On Target"}
                                    {school.mplhStatus === "high" &&
                                      "High Productivity"}
                                    {school.mplhStatus === "no-data" &&
                                      "No Target"}
                                  </span>
                                </div>
                              )}
                            </td>

                            <td>
                              {school.overall === "good" && (
                                <span className="command-status good">✓</span>
                              )}

                              {school.overall === "attention" && (
                                <span className="command-status attention">
                                  !
                                </span>
                              )}

                              {school.overall === "not-submitted" && (
                                <span className="command-status missing">
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {filteredSchools.length === 0 && (
                      <div className="command-empty-table">
                        No schools match this filter.
                      </div>
                    )}
                  </div>
                </div>

                {/* =================================
                SCHOOL DETAIL
            ================================= */}

                <aside className="command-detail-panel">
                  {selectedSchool ? (
                    <>
                      <div className="command-detail-header">
                        <div className="command-detail-location">
                          LOCATION {selectedSchool.location_code}
                        </div>

                        <h2>{selectedSchool.school_name}</h2>

                        <span
                          className={`command-detail-pill ${selectedSchool.overall}`}
                        >
                          {selectedSchool.overall === "good" && "All Good"}

                          {selectedSchool.overall === "attention" &&
                            "Needs Attention"}

                          {selectedSchool.overall === "not-submitted" &&
                            "Not Submitted"}
                        </span>
                      </div>

                      {selectedSchool.check ? (
                        <div className="command-detail-body">
                          <div className="command-submission-info">
                            <div>
                              <small>Service Date</small>

                              <strong>
                                {formatDate(selectedSchool.check.service_date)}
                              </strong>
                            </div>

                            <div>
                              <small>Submitted</small>

                              <strong>
                                {formatTime(selectedSchool.check.submitted_at)}
                              </strong>
                            </div>

                            <div>
                              <small>Submitted By</small>

                              <strong>
                                {selectedSchool.check.employee_name}
                              </strong>
                            </div>

                            <div>
                              <small>Flagged Items</small>

                              <strong>
                                {selectedSchool.attentionItems.length}
                              </strong>
                            </div>
                          </div>

                          {selectedSchool.attentionItems.length > 0 && (
                            <div className="command-flag-box">
                              <h4>⚠ Follow-Up Needed</h4>

                              {selectedSchool.attentionItems.map((item) => {
                                const explanation = getFinishLineExplanation(
                                  selectedSchool.check.finish_line_items,
                                  item.item_key
                                );

                                return (
                                  <div
                                    key={item.id}
                                    style={{ marginBottom: "9px" }}
                                  >
                                    <div>• {item.item_label}</div>

                                    {explanation && (
                                      <div
                                        style={{
                                          marginTop: "3px",
                                          marginLeft: "13px",
                                          fontSize: "11px",
                                          opacity: 0.88,
                                        }}
                                      >
                                        Explanation: {explanation}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <h3>Full Finish Line</h3>

                          <div className="command-detail-list">
                            {selectedSchool.check.finish_line_items
                              ?.filter((item) => !isFinishLineCommentItem(item))
                              .map((item) => {
                                const explanation = getFinishLineExplanation(
                                  selectedSchool.check.finish_line_items,
                                  item.item_key
                                );

                                const isNA =
                                  String(item.answer || "").toLowerCase() === "na";

                                return (
                                  <div
                                    className="command-detail-row"
                                    key={item.id}
                                    style={{
                                      alignItems: "flex-start",
                                      gap: "12px",
                                    }}
                                  >
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <span>{item.item_label}</span>

                                      {explanation && (
                                        <div
                                          style={{
                                            marginTop: "6px",
                                            padding: "7px 9px",
                                            borderRadius: "7px",
                                            background: item.requires_attention
                                              ? "#fff4f4"
                                              : "#f5f7f9",
                                            color: item.requires_attention
                                              ? "#8f3535"
                                              : "#667482",
                                            fontSize: "11px",
                                            lineHeight: "1.45",
                                          }}
                                        >
                                          <strong>Explanation:</strong>{" "}
                                          {explanation}
                                        </div>
                                      )}
                                    </div>

                                    <div className="command-answer">
                                      <span
                                        className={`command-answer-dot ${
                                          item.requires_attention ? "bad" : "good"
                                        }`}
                                        title={
                                          isNA
                                            ? "Not applicable — explanation provided"
                                            : undefined
                                        }
                                      >
                                        {item.requires_attention ? "!" : "✓"}
                                      </span>

                                      <strong>
                                        {formatFinishLineAnswer(item.answer)}
                                      </strong>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>

                          {selectedSchool.check.comments && (
                            <div className="command-comments">
                              <h4>Manager Comments</h4>

                              <p>{selectedSchool.check.comments}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="command-no-submission">
                          <div>🏁</div>

                          <h3>Finish Line Not Submitted</h3>

                          <p>
                            No Finish Line Checklist has been submitted for this
                            location today.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="command-no-submission">
                      Select a school.
                    </div>
                  )}
                </aside>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
function MplhReportView({ schools, dashboardDate, formatDate }) {
  const [mplhSchoolId, setMplhSchoolId] = useState("all");

  const filteredMplhSchools =
    mplhSchoolId === "all"
      ? schools
      : schools.filter(
          (school) => String(school.id) === String(mplhSchoolId)
        );

  const selectedMplhSchool =
    mplhSchoolId === "all"
      ? null
      : schools.find(
          (school) => String(school.id) === String(mplhSchoolId)
        );

  const belowTarget = filteredMplhSchools.filter(
    (school) => school.mplhStatus === "below"
  ).length;

  const onTarget = filteredMplhSchools.filter(
    (school) => school.mplhStatus === "target"
  ).length;

  const highProductivity = filteredMplhSchools.filter(
    (school) => school.mplhStatus === "high"
  ).length;

  const noData = filteredMplhSchools.filter(
    (school) => school.mplh === null
  ).length;

  function getTypeLabel(type) {
    if (type === "secondary") {
      return "Secondary";
    }

    if (type === "elementary_prep") {
      return "Elementary Prep";
    }

    if (type === "elementary_nnc") {
      return "Elementary NNC";
    }

    if (type === "special") {
      return "Special";
    }

    return "—";
  }

  function getTargetLabel(school) {
    if (!school.mplhTarget) {
      return "—";
    }

    return `${school.mplhTarget.min}–${school.mplhTarget.max}`;
  }

  function getStatusLabel(status) {
    if (status === "below") {
      return "Below Target";
    }

    if (status === "target") {
      return "On Target";
    }

    if (status === "high") {
      return "High Productivity";
    }

    return "No Data";
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "18px",
      }}
    >
      {/* REPORT HEADER */}

      <section className="dashboard-card" style={{ padding: "22px" }}>
        <div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: "800",
              color: "#6b7785",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: "5px",
            }}
          >
            Labor Productivity
          </div>

          <h2
            style={{
              margin: 0,
              fontSize: "24px",
            }}
          >
            MPLH Report
          </h2>

          <p
            style={{
              margin: "6px 0 0",
              color: "#687583",
            }}
          >
            {formatDate(dashboardDate)}
            {selectedMplhSchool
              ? ` • ${selectedMplhSchool.school_name}`
              : " • All Schools"}
          </p>
        </div>
      </section>

      {/* SCHOOL FILTER */}

      <section className="dashboard-card" style={{ padding: "16px 20px" }}>
        <div className="supervisor-report-filter">
          <div>
            <label>School</label>
            <select
              value={mplhSchoolId}
              onChange={(e) => setMplhSchoolId(e.target.value)}
            >
              <option value="all">All Schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.school_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* SUMMARY */}

      <section className="command-stats">
        <div className="command-stat-card">
          <div className="command-stat-icon red">!</div>

          <div>
            <span>Below Target</span>
            <strong>{belowTarget}</strong>
            <small>Review participation & labor</small>
          </div>
        </div>

        <div className="command-stat-card">
          <div className="command-stat-icon green">✓</div>

          <div>
            <span>On Target</span>
            <strong>{onTarget}</strong>
            <small>Within current MPLH range</small>
          </div>
        </div>

        <div className="command-stat-card">
          <div className="command-stat-icon yellow">↑</div>

          <div>
            <span>High Productivity</span>
            <strong>{highProductivity}</strong>
            <small>Above current MPLH target</small>
          </div>
        </div>

        <div className="command-stat-card">
          <div className="command-stat-icon blue">—</div>

          <div>
            <span>No Data</span>
            <strong>{noData}</strong>
            <small>No meal data for this date</small>
          </div>
        </div>
      </section>

      {/* SCHOOL REPORT */}

      <section className="dashboard-card">
        <div
          className="command-section-header"
          style={{
            padding: "18px 20px",
          }}
        >
          <div>
            <h3>School Labor Productivity</h3>

            <p>
              {selectedMplhSchool
                ? `Meal volume and labor for ${selectedMplhSchool.school_name}.`
                : "Compare meal volume and labor across all locations."}
            </p>
          </div>
        </div>

        <div className="command-table-wrap">
          <table className="command-table">
            <thead>
              <tr>
                <th>School</th>
                <th>Type</th>
                <th>Meal Equiv.</th>
                <th>Baseline</th>
                <th>Added Hrs</th>
                <th>Actual Hrs</th>
                <th>MPLH</th>
                <th>Target</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody>
              {filteredMplhSchools.map((school) => {
                const addedHours =
                  (Number(school.laborRow?.additional_worker_hours) || 0) +
                  (Number(school.laborRow?.manager_overtime_hours) || 0);

                return (
                  <tr key={school.id}>
                    <td className="command-school-name">
                      <strong>{school.school_name}</strong>

                      <div
                        style={{
                          fontSize: "10px",
                          color: "#788590",
                          marginTop: "2px",
                        }}
                      >
                        Location {school.location_code}
                      </div>
                    </td>

                    <td>{getTypeLabel(school.labor_type)}</td>

                    <td>
                      {school.mplh === null
                        ? "—"
                        : school.mealEquivalents.toFixed(1)}
                    </td>

                    <td>{Number(school.baselineLabor || 0).toFixed(1)}</td>

                    <td>{addedHours.toFixed(1)}</td>

                    <td>
                      {school.mplh === null
                        ? "—"
                        : Number(school.actualLaborHours).toFixed(1)}
                    </td>

                    <td>
                      <strong>
                        {school.mplh === null ? "—" : school.mplh.toFixed(1)}
                      </strong>
                    </td>

                    <td>{getTargetLabel(school)}</td>

                    <td>
                      <span
                        className={`mplh-supervisor-status ${school.mplhStatus}`}
                      >
                        {getStatusLabel(school.mplhStatus)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
function RecentChangesView({
  schools,
  recentChanges,
  recentChangesLoading,
  recentChangesError,
  historySchoolId,
  setHistorySchoolId,
  historyDate,
  setHistoryDate,
  loadRecentChanges,
  formatDate,
  formatTime,
}) {
  function formatAuditValue(value) {
    if (value === null || value === undefined || value === "") {
      return "—";
    }

    const text = String(value);

    if (text.toLowerCase() === "yes") return "YES";
    if (text.toLowerCase() === "no") return "NO";
    if (text.toLowerCase() === "na") return "N/A";
    if (text.toLowerCase() === "complete") return "COMPLETE";
    if (text.toLowerCase() === "attention") return "NEEDS ATTENTION";

    return text;
  }

  function changeTimestamp(row) {
    return row.created_at || row.changed_at || row.updated_at || null;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "18px",
      }}
    >
      <section className="dashboard-card" style={{ padding: "22px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "20px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: "800",
                color: "#6b7785",
                textTransform: "uppercase",
                letterSpacing: ".08em",
                marginBottom: "5px",
              }}
            >
              Audit History
            </div>

            <h2 style={{ margin: 0, fontSize: "24px" }}>Recent Changes</h2>

            <p style={{ margin: "6px 0 0", color: "#687583" }}>
              Latest edits to submitted Finish Line Checks. Newest changes
              appear first.
            </p>
          </div>

          <button
            type="button"
            className="command-small-button"
            onClick={loadRecentChanges}
          >
            ↻ Refresh
          </button>
        </div>
      </section>

      <section className="dashboard-card" style={{ padding: "16px 20px" }}>
        <div
          style={{
            display: "flex",
            gap: "15px",
            alignItems: "end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: "260px", flex: 1 }}>
            <label
              style={{
                display: "block",
                fontSize: "10px",
                fontWeight: "800",
                marginBottom: "6px",
                textTransform: "uppercase",
                color: "#6c7884",
              }}
            >
              Location
            </label>

            <select
              value={historySchoolId}
              onChange={(e) => setHistorySchoolId(e.target.value)}
              style={{
                width: "100%",
                border: "1px solid #d9e0e6",
                borderRadius: "8px",
                padding: "10px 12px",
                background: "white",
                fontWeight: "700",
              }}
            >
              <option value="all">All Schools</option>

              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.school_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: "190px" }}>
            <label
              style={{
                display: "block",
                fontSize: "10px",
                fontWeight: "800",
                marginBottom: "6px",
                textTransform: "uppercase",
                color: "#6c7884",
              }}
            >
              Service Date
            </label>

            <input
              type="date"
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid #d9e0e6",
                borderRadius: "8px",
                padding: "9px 12px",
                background: "white",
                fontWeight: "700",
              }}
            />
          </div>

          {(historySchoolId !== "all" || historyDate) && (
            <button
              type="button"
              className="command-small-button"
              onClick={() => {
                setHistorySchoolId("all");
                setHistoryDate("");
              }}
            >
              Clear Filters
            </button>
          )}
        </div>
      </section>

      <section className="dashboard-card">
        <div
          style={{
            padding: "18px 20px",
            borderBottom: "1px solid #edf0f3",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Change History</h3>
            <p
              style={{ margin: "4px 0 0", color: "#71808e", fontSize: "12px" }}
            >
              Showing up to the 50 most recent matching changes.
            </p>
          </div>

          {!recentChangesLoading && (
            <strong style={{ fontSize: "12px", color: "#6d7985" }}>
              {recentChanges.length} change
              {recentChanges.length === 1 ? "" : "s"}
            </strong>
          )}
        </div>

        {recentChangesError && (
          <div className="command-error" style={{ margin: "16px" }}>
            {recentChangesError}
          </div>
        )}

        {recentChangesLoading ? (
          <div
            style={{
              minHeight: "300px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#6d7985",
              fontWeight: "700",
            }}
          >
            Loading recent changes...
          </div>
        ) : recentChanges.length === 0 ? (
          <div
            style={{
              minHeight: "300px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#73808d",
              textAlign: "center",
              padding: "20px",
            }}
          >
            <div style={{ fontSize: "34px", marginBottom: "10px" }}>↺</div>
            <strong>No changes found</strong>
            <small style={{ marginTop: "5px" }}>
              Edited Finish Line answers will appear here after a submitted
              check is changed.
            </small>
          </div>
        ) : (
          <div className="command-table-wrap">
            <table className="command-table">
              <thead>
                <tr>
                  <th>Changed</th>
                  <th>Service Date</th>
                  <th>School</th>
                  <th>Changed By</th>
                  <th>Field</th>
                  <th>Before</th>
                  <th>After</th>
                </tr>
              </thead>

              <tbody>
                {recentChanges.map((row, index) => {
                  const stamp = changeTimestamp(row);

                  return (
                    <tr
                      key={
                        row.id ||
                        `${row.finish_line_check_id}-${row.field_name}-${index}`
                      }
                    >
                      <td>
                        {stamp ? (
                          <>
                            <strong>
                              {new Date(stamp).toLocaleDateString()}
                            </strong>
                            <div style={{ fontSize: "10px", color: "#788590" }}>
                              {formatTime(stamp)}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td>{formatDate(row.service_date)}</td>

                      <td>
                        <strong>
                          {row.school?.school_name || "Unknown Location"}
                        </strong>
                        {row.school?.location_code && (
                          <div style={{ fontSize: "10px", color: "#788590" }}>
                            Location {row.school.location_code}
                          </div>
                        )}
                      </td>

                      <td>{row.employee_name || "—"}</td>
                      <td>
                        <strong>{row.field_name || "—"}</strong>
                      </td>

                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            maxWidth: "220px",
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                            color: "#7a4650",
                          }}
                        >
                          {formatAuditValue(row.old_value)}
                        </span>
                      </td>

                      <td>
                        <span
                          style={{
                            display: "inline-block",
                            maxWidth: "220px",
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                            fontWeight: "700",
                            color: "#19663d",
                          }}
                        >
                          {formatAuditValue(row.new_value)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function MealTrendsView({
  schools,
  mealTrendData,
  mealTrendLoading,
  mealTrendError,
  trendSchoolId,
  setTrendSchoolId,
  trendDays,
  setTrendDays,
  mealAnalyticsEndDate,
  setMealAnalyticsEndDate,
  visibleMeals,
  toggleMealLine,
  loadMealTrends,
  mealAnalyticsMode,
  setMealAnalyticsMode,
  onOpenSchoolAnalytics,
}) {
  const selectedSchool =
    trendSchoolId === "all"
      ? null
      : schools.find((school) => String(school.id) === String(trendSchoolId));

  const totals = mealTrendData.reduce(
    (summary, day) => {
      summary.breakfast += day.breakfast || 0;
      summary.lunch += day.lunch || 0;
      summary.supper += day.supper || 0;
      summary.total += day.total || 0;
      return summary;
    },
    {
      breakfast: 0,
      lunch: 0,
      supper: 0,
      total: 0,
    }
  );

  const reimbursementRows = mealTrendData.map((day) => {
    const breakfastRevenue =
      Number(day.breakfast || 0) * REIMBURSEMENT_RATES.breakfast;
    const lunchRevenue = Number(day.lunch || 0) * REIMBURSEMENT_RATES.lunch;
    const supperRevenue = Number(day.supper || 0) * REIMBURSEMENT_RATES.supper;

    return {
      ...day,
      breakfastRevenue,
      lunchRevenue,
      supperRevenue,
      totalRevenue: breakfastRevenue + lunchRevenue + supperRevenue,
    };
  });

  const reimbursementTotals = reimbursementRows.reduce(
    (summary, day) => {
      summary.breakfast += day.breakfastRevenue;
      summary.lunch += day.lunchRevenue;
      summary.supper += day.supperRevenue;
      summary.total += day.totalRevenue;
      return summary;
    },
    {
      breakfast: 0,
      lunch: 0,
      supper: 0,
      total: 0,
    }
  );

  function money(value) {
    return `$${Number(value || 0).toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}`;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "18px",
      }}
    >
      {/* =========================================
          REPORT HEADER
      ========================================= */}

      <section className="dashboard-card" style={{ padding: "22px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "20px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "11px",
                fontWeight: "800",
                color: "#6b7785",
                textTransform: "uppercase",
                letterSpacing: ".08em",
                marginBottom: "5px",
              }}
            >
              Operations Analytics
            </div>

            <h2 style={{ margin: 0, fontSize: "24px" }}>Meal Analytics</h2>

            <p style={{ margin: "6px 0 0", color: "#687583" }}>
              {selectedSchool
                ? selectedSchool.school_name
                : "All active locations"}
              {" • Through "}
              {new Date(`${mealAnalyticsEndDate}T12:00:00`).toLocaleDateString()}
            </p>
          </div>


        </div>
      </section>

      {/* =========================================
          FILTERS + SCHOOL DRILL DOWN
      ========================================= */}

      <section className="dashboard-card" style={{ padding: "16px 20px" }}>
        <div
          style={{
            display: "flex",
            gap: "15px",
            alignItems: "end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: "260px", flex: 1 }}>
            <label
              style={{
                display: "block",
                fontSize: "10px",
                fontWeight: "800",
                marginBottom: "6px",
                textTransform: "uppercase",
                color: "#6c7884",
              }}
            >
              Location
            </label>

            <select
              value={trendSchoolId}
              onChange={(e) => setTrendSchoolId(e.target.value)}
              style={{
                width: "100%",
                border: "1px solid #d9e0e6",
                borderRadius: "8px",
                padding: "10px 12px",
                background: "white",
                fontWeight: "700",
              }}
            >
              <option value="all">All Schools</option>

              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.school_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: "170px" }}>
            <label
              style={{
                display: "block",
                fontSize: "10px",
                fontWeight: "800",
                marginBottom: "6px",
                textTransform: "uppercase",
                color: "#6c7884",
              }}
            >
              Date Range
            </label>

            <select
              value={trendDays}
              onChange={(e) => setTrendDays(e.target.value)}
              style={{
                width: "100%",
                border: "1px solid #d9e0e6",
                borderRadius: "8px",
                padding: "10px 12px",
                background: "white",
                fontWeight: "700",
              }}
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
              <option value="ytd">Year to Date</option>
            </select>
          </div>

          {selectedSchool && (
            <button
              type="button"
              className="command-small-button"
              onClick={() => {
                if (onOpenSchoolAnalytics) {
                  onOpenSchoolAnalytics(selectedSchool);
                }
              }}
              style={{
                minHeight: "40px",
                paddingLeft: "16px",
                paddingRight: "16px",
                fontWeight: "800",
              }}
            >
              Open School Analytics →
            </button>
          )}
        </div>
      </section>

      {/* =========================================
          MEAL TOTALS
      ========================================= */}

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "12px",
        }}
      >
        <MealTrendStat label="Breakfast" value={totals.breakfast} />
        <MealTrendStat label="Lunch" value={totals.lunch} />
        <MealTrendStat label="Supper" value={totals.supper} />
        <MealTrendStat label="Total Meals" value={totals.total} />
      </section>

      {/* =========================================
          MEALS / REIMBURSEMENT TOGGLE
      ========================================= */}

      <div className="meal-view-toggle" style={{ alignSelf: "flex-start" }}>
        <button
          type="button"
          className={mealAnalyticsMode === "meals" ? "active" : ""}
          onClick={() => setMealAnalyticsMode("meals")}
        >
          Meals
        </button>

        <button
          type="button"
          className={mealAnalyticsMode === "reimbursement" ? "active" : ""}
          onClick={() => setMealAnalyticsMode("reimbursement")}
        >
          $ Reimbursement
        </button>
      </div>

      {mealAnalyticsMode === "meals" ? (
        <>
          {/* =========================================
              MEAL PARTICIPATION TREND
          ========================================= */}

          <section className="dashboard-card" style={{ padding: "22px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "20px",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "20px",
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Meal Participation Trends</h3>

                <p
                  style={{
                    margin: "4px 0 0",
                    color: "#71808e",
                    fontSize: "12px",
                  }}
                >
                  Click a meal below to show or hide its line.
                </p>
              </div>

              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <TrendToggle
                  active={visibleMeals.breakfast}
                  onClick={() => toggleMealLine("breakfast")}
                  label="Breakfast"
                  color="#e7a52e"
                />

                <TrendToggle
                  active={visibleMeals.lunch}
                  onClick={() => toggleMealLine("lunch")}
                  label="Lunch"
                  color="#2a78d1"
                />

                <TrendToggle
                  active={visibleMeals.supper}
                  onClick={() => toggleMealLine("supper")}
                  label="Supper"
                  color="#8a56c7"
                />

                <TrendToggle
                  active={visibleMeals.total}
                  onClick={() => toggleMealLine("total")}
                  label="Total"
                  color="#1e2935"
                />
              </div>
            </div>

            {mealTrendError && (
              <div className="command-error">{mealTrendError}</div>
            )}

            {mealTrendLoading ? (
              <div
                style={{
                  height: "390px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6d7985",
                  fontWeight: "700",
                }}
              >
                Loading meal analytics...
              </div>
            ) : mealTrendData.length === 0 ? (
              <div
                style={{
                  height: "390px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#73808d",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "34px", marginBottom: "10px" }}>📊</div>

                <strong>No meal-count history yet</strong>

                <small style={{ marginTop: "5px" }}>
                  Meal counts will appear here as managers enter service data.
                </small>
              </div>
            ) : (
              <div style={{ width: "100%", height: "390px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={mealTrendData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#e7ebef"
                    />

                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 20 }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <YAxis
                      tick={{ fontSize: 20 }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />

                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #dce3e8",
                        boxShadow: "0 6px 18px rgba(0,0,0,.08)",
                      }}
                    />

                    {visibleMeals.breakfast && (
                      <Line
                        type="monotone"
                        dataKey="breakfast"
                        name="Breakfast"
                        stroke="#e7a52e"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    )}

                    {visibleMeals.lunch && (
                      <Line
                        type="monotone"
                        dataKey="lunch"
                        name="Lunch"
                        stroke="#2a78d1"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    )}

                    {visibleMeals.supper && (
                      <Line
                        type="monotone"
                        dataKey="supper"
                        name="Supper"
                        stroke="#8a56c7"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    )}

                    {visibleMeals.total && (
                      <Line
                        type="monotone"
                        dataKey="total"
                        name="Total Meals"
                        stroke="#1e2935"
                        strokeWidth={4}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* =========================================
              DAILY COUNTS
          ========================================= */}

          {mealTrendData.length > 0 && (
            <section className="dashboard-card">
              <div
                style={{
                  padding: "18px 20px",
                  borderBottom: "1px solid #edf0f3",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "18px" }}>Daily Counts</h3>
              </div>

              <div className="command-table-wrap">
                <table className="command-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Breakfast</th>
                      <th>Lunch</th>
                      <th>Supper</th>
                      <th>Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {[...mealTrendData].reverse().map((day) => (
                      <tr key={day.service_date}>
                        <td>
                          {new Date(
                            `${day.service_date}T12:00:00`
                          ).toLocaleDateString()}
                        </td>

                        <td>{day.breakfast.toLocaleString()}</td>
                        <td>{day.lunch.toLocaleString()}</td>
                        <td>{day.supper.toLocaleString()}</td>

                        <td>
                          <strong>{day.total.toLocaleString()}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          {/* =========================================
              ESTIMATED REIMBURSEMENT SUMMARY
          ========================================= */}

          <section className="dashboard-card">
            <div className="command-section-header">
              <div>
                <h3>Estimated Reimbursement</h3>

                <p>
                  Estimated meal reimbursement for the selected location and
                  date range.
                </p>
              </div>
            </div>

            <div className="revenue-summary-grid">
              <div className="revenue-summary-card">
                <span>Breakfast</span>
                <strong>{money(reimbursementTotals.breakfast)}</strong>
                <small>{totals.breakfast.toLocaleString()} meals</small>
              </div>

              <div className="revenue-summary-card">
                <span>Lunch</span>
                <strong>{money(reimbursementTotals.lunch)}</strong>
                <small>{totals.lunch.toLocaleString()} meals</small>
              </div>

              <div className="revenue-summary-card">
                <span>Supper</span>
                <strong>{money(reimbursementTotals.supper)}</strong>
                <small>{totals.supper.toLocaleString()} meals</small>
              </div>

              <div className="revenue-summary-card revenue-summary-total">
                <span>Total</span>
                <strong>{money(reimbursementTotals.total)}</strong>
                <small>Estimated reimbursement</small>
              </div>
            </div>
          </section>

          {/* =========================================
              REIMBURSEMENT DETAIL
          ========================================= */}

          {reimbursementRows.length > 0 && (
            <section className="dashboard-card">
              <div
                style={{
                  padding: "18px 20px",
                  borderBottom: "1px solid #edf0f3",
                }}
              >
                <h3 style={{ margin: 0 }}>Reimbursement Detail</h3>

                <p
                  style={{
                    margin: "4px 0 0",
                    color: "#71808e",
                    fontSize: "12px",
                  }}
                >
                  Estimated reimbursement by service day.
                </p>
              </div>

              <div className="command-table-wrap">
                <table className="revenue-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Breakfast</th>
                      <th>Lunch</th>
                      <th>Supper</th>
                      <th>Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {[...reimbursementRows].reverse().map((day) => (
                      <tr key={day.service_date}>
                        <td>
                          <strong>
                            {new Date(
                              `${day.service_date}T12:00:00`
                            ).toLocaleDateString()}
                          </strong>
                        </td>

                        <td>{money(day.breakfastRevenue)}</td>
                        <td>{money(day.lunchRevenue)}</td>
                        <td>{money(day.supperRevenue)}</td>

                        <td>
                          <strong>{money(day.totalRevenue)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  <tfoot>
                    <tr>
                      <th>Period Total</th>
                      <th>{money(reimbursementTotals.breakfast)}</th>
                      <th>{money(reimbursementTotals.lunch)}</th>
                      <th>{money(reimbursementTotals.supper)}</th>
                      <th>{money(reimbursementTotals.total)}</th>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function MealTrendStat({ label, value }) {
  return (
    <div className="dashboard-card" style={{ padding: "18px 20px" }}>
      <span
        style={{
          display: "block",
          fontSize: "11px",
          fontWeight: "800",
          color: "#75818c",
          marginBottom: "6px",
        }}
      >
        {label}
      </span>

      <strong
        style={{
          display: "block",
          fontSize: "26px",
          lineHeight: 1,
        }}
      >
        {Number(value || 0).toLocaleString()}
      </strong>
    </div>
  );
}

function TrendToggle({ label, active, onClick, color }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: active ? `2px solid ${color}` : "1px solid #d7dee5",
        background: active ? "#ffffff" : "#f4f6f8",
        color: active ? "#25313c" : "#89939d",
        borderRadius: "20px",
        padding: "7px 12px",
        fontSize: "11px",
        fontWeight: "800",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: "6px",
      }}
    >
      <span
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: active ? color : "#aeb7bf",
        }}
      />
      {label}
    </button>
  );
}

export default CommandCenter;
