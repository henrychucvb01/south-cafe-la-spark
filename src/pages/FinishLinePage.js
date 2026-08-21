import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
/* =========================================================
DEVELOPMENT TEST MODE
Normally leave these as:
const TEST_DAY = null;
const TEST_MONTH_END = false;
1 = Monday
2 = Tuesday
3 = Wednesday
4 = Thursday
5 = Friday
========================================================= */
const TEST_DAY = null;
const TEST_MONTH_END = false;
/* =========================================================
EMPTY DATA
========================================================= */
const emptyChecklist = {
  previousMealCounts: "",
  dairyOrderCreated: "",
  productionWorksheet: "",
  productionRecord: "",
  mealCountEntered: "",
  reportsReviewed: "",
  mondayMissingMealReport: "",
  mondayAllMealCountsEntered: "",
  tuesdayMealPlan: "",
  wednesdayOrderStatus: "",
  thursdayOrdersComplete: "",
  monthEndInventory: "",
  comments: "",
};
const emptyClosing = {
  equipment: false,
  prepAreas: false,
  floors: false,
  trash: false,
  kitchenReady: false,
};
const emptyMealCounts = {
  breakfast: "",
  lunch: "",
  supper: "",
};
/* =========================================================
YES / NO BUTTONS
========================================================= */
function YesNoButtons({ value, onChange }) {
  return (
    <div className="yes-no-group">
      <button
        type="button"
        className={`yes-no-button ${value === "yes" ? "selected-good" : ""}`}
        onClick={() => onChange("yes")}
      >
        Yes
      </button>
      <button
        type="button"
        className={`yes-no-button ${value === "no" ? "selected-danger" : ""}`}
        onClick={() => onChange("no")}
      >
        No
      </button>
    </div>
  );
}
/* =========================================================
FINISH LINE PAGE
========================================================= */
function FinishLinePage({
  location,
  employee,
  existingCheck,
  onBack,
  onComplete,
}) {
  const [checklist, setChecklist] = useState(emptyChecklist);
  const [closing, setClosing] = useState(emptyClosing);
  const [mealCounts, setMealCounts] = useState(emptyMealCounts);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  // Snapshot of the Finish Line as it existed when this page loaded.
  // Used only to create an audit trail when an existing submission is edited.
  const [originalCheck, setOriginalCheck] = useState(null);

  /* =========================================================
SUPERVISOR PREVIEW MODE
========================================================= */
  const isPreviewMode = existingCheck?.previewMode === true;
  const previewDay = existingCheck?.previewDay ?? null;
  const previewMonthEnd = existingCheck?.previewMonthEnd ?? false;
  /* =========================================================
DAY LOGIC
========================================================= */
  const realDay = new Date().getDay();
  const activeDay =
    isPreviewMode && previewDay !== null
      ? previewDay
      : TEST_DAY !== null
      ? TEST_DAY
      : realDay;
  const isMonday = activeDay === 1;
  const isTuesday = activeDay === 2;
  const isWednesday = activeDay === 3;
  const isThursday = activeDay === 4;
  const isFriday = activeDay === 5;
  /* =========================================================
DATE HELPERS
========================================================= */
  function getTodayLabel() {
    return new Date().toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  function getPreviousWeekdays() {
    const today = new Date();
    const currentDay = today.getDay();
    const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - daysSinceMonday);
    const previousMonday = new Date(thisMonday);
    previousMonday.setDate(thisMonday.getDate() - 7);
    const weekdays = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date(previousMonday);
      date.setDate(previousMonday.getDate() + i);
      weekdays.push(
        date.toLocaleDateString([], {
          weekday: "short",
          month: "short",
          day: "numeric",
        })
      );
    }
    return weekdays;
  }
  function isLastWeekdayOfMonth() {
    if (TEST_MONTH_END) {
      return true;
    }
    const today = new Date();
    /*
Friday:
check whether next Monday is
a different month.
*/
    if (today.getDay() === 5) {
      const monday = new Date(today);
      monday.setDate(today.getDate() + 3);
      return monday.getMonth() !== today.getMonth();
    }
    /*
Monday-Thursday:
check whether tomorrow starts
a new month.
*/
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow.getMonth() !== today.getMonth();
  }
  const showMonthEnd = isPreviewMode ? previewMonthEnd : isLastWeekdayOfMonth();
  /* =========================================================
LOAD PAGE DATA
========================================================= */
  useEffect(() => {
    loadPageData();
  }, [location?.id]);
  async function loadPageData() {
    /*
Supervisor preview:
show blank form and do not
touch Supabase.
*/
    if (isPreviewMode) {
      setChecklist(emptyChecklist);
      setClosing(emptyClosing);
      setMealCounts(emptyMealCounts);
      setIsEditing(false);
      setOriginalCheck(null);
      setPageLoading(false);
      return;
    }
    if (!location?.id) {
      setPageLoading(false);
      return;
    }
    setPageLoading(true);
    try {
      const serviceDate = new Date().toISOString().split("T")[0];
      /* =====================================
LOAD FINISH LINE
===================================== */
      const { data: finishData, error: finishError } = await supabase
        .from("finish_line_checks")
        .select(
          `
*,
finish_line_items (*)
`
        )
        .eq("location_id", location.id)
        .eq("service_date", serviceDate)
        .maybeSingle();
      if (finishError) {
        throw finishError;
      }
      if (finishData) {
        setIsEditing(true);
        setOriginalCheck(finishData);
        const items = finishData.finish_line_items || [];
        function answerFor(key) {
          return items.find((item) => item.item_key === key)?.answer || "";
        }
        setChecklist({
          previousMealCounts: answerFor("previous_meal_counts"),
          dairyOrderCreated: answerFor("dairy_order_created"),
          productionWorksheet: answerFor("production_worksheet"),
          productionRecord: answerFor("production_record"),
          mealCountEntered: answerFor("meal_count_entered"),
          reportsReviewed: answerFor("reports_reviewed"),
          mondayMissingMealReport: answerFor("monday_missing_meal_report"),
          mondayAllMealCountsEntered: answerFor(
            "monday_all_meal_counts_entered"
          ),
          tuesdayMealPlan: answerFor("tuesday_meal_plan"),
          wednesdayOrderStatus: answerFor("wednesday_order_status"),
          thursdayOrdersComplete: answerFor("thursday_orders_complete"),
          monthEndInventory: answerFor("month_end_inventory"),
          comments: finishData.comments || "",
        });
        /*
They could only submit the
original Finish Line after
completing closing.
*/
        setClosing({
          equipment: true,
          prepAreas: true,
          floors: true,
          trash: true,
          kitchenReady: true,
        });
      } else {
        setIsEditing(false);
        setOriginalCheck(null);
        setChecklist(emptyChecklist);
        setClosing(emptyClosing);
      }
      /* =====================================
LOAD TODAY'S MEAL COUNTS
===================================== */
      const { data: mealData, error: mealError } = await supabase
        .from("meal_counts")
        .select("*")
        .eq("location_id", location.id)
        .eq("service_date", serviceDate)
        .maybeSingle();
      if (mealError) {
        throw mealError;
      }
      if (mealData) {
        setMealCounts({
          breakfast: mealData.breakfast_count ?? "",
          lunch: mealData.lunch_count ?? "",
          supper: mealData.supper_count ?? "",
        });
      } else {
        setMealCounts(emptyMealCounts);
      }
    } catch (error) {
      console.error("Finish Line load error:", error);
      setMessage(`Could not load today's Finish Line: ${error.message}`);
    } finally {
      setPageLoading(false);
    }
  }
  /* =========================================================
FORM UPDATES
========================================================= */
  function updateChecklist(field, value) {
    setChecklist((current) => ({
      ...current,
      [field]: value,
    }));
    setMessage("");
  }
  function updateMealCount(field, value) {
    /*
Numbers only.
*/
    const clean = value.replace(/\D/g, "");
    setMealCounts((current) => ({
      ...current,
      [field]: clean,
    }));
    setMessage("");
  }
  function toggleClosing(field) {
    setClosing((current) => ({
      ...current,
      [field]: !current[field],
    }));
    setMessage("");
  }
  const closingComplete = Object.values(closing).every(Boolean);
  /* =========================================================
ATTENTION STATUS
========================================================= */
  function determineAttention() {
    return [
      checklist.previousMealCounts === "no",
      checklist.dairyOrderCreated === "no",
      checklist.productionWorksheet === "no",
      checklist.productionRecord === "no",
      checklist.mealCountEntered === "no",
      checklist.reportsReviewed === "no",
      isMonday && checklist.mondayMissingMealReport === "no",
      isMonday && checklist.mondayAllMealCountsEntered === "no",
      isTuesday && checklist.tuesdayMealPlan === "no",
      isWednesday && checklist.wednesdayOrderStatus === "no",
      isThursday && checklist.thursdayOrdersComplete === "no",
      showMonthEnd && checklist.monthEndInventory === "no",
    ].some(Boolean);
  }
  /* =========================================================
FORM COMPLETE CHECK
========================================================= */
  function isFormComplete() {
    const dailyComplete = [
      checklist.previousMealCounts,
      checklist.dairyOrderCreated,
      checklist.productionWorksheet,
      checklist.productionRecord,
      checklist.mealCountEntered,
      checklist.reportsReviewed,
    ].every(Boolean);
    if (!dailyComplete) {
      return false;
    }
    /*
Breakfast and Lunch are required.
Supper is allowed to remain pending
until the next morning.
*/
    if (mealCounts.breakfast === "" || mealCounts.lunch === "") {
      return false;
    }
    if (
      isMonday &&
      (!checklist.mondayMissingMealReport ||
        !checklist.mondayAllMealCountsEntered)
    ) {
      return false;
    }
    if (isTuesday && !checklist.tuesdayMealPlan) {
      return false;
    }
    if (isWednesday && !checklist.wednesdayOrderStatus) {
      return false;
    }
    if (isThursday && !checklist.thursdayOrdersComplete) {
      return false;
    }
    if (showMonthEnd && !checklist.monthEndInventory) {
      return false;
    }
    return closingComplete;
  }
  const formComplete = isFormComplete();
  /* =========================================================
VALIDATION
========================================================= */
  function validateChecklist() {
    if (!formComplete) {
      setMessage(
        "Complete all required Finish Line items, meal counts, and Closing & Readiness before submitting."
      );
      return false;
    }
    return true;
  }
  /* =========================================================
BUILD FINISH LINE DATABASE ITEMS
========================================================= */
  function buildItems(checkId) {
    const items = [
      {
        finish_line_check_id: checkId,
        item_key: "previous_meal_counts",
        item_label: "Previous meal counts entered in Newton",
        answer: checklist.previousMealCounts,
        requires_attention: checklist.previousMealCounts === "no",
      },
      {
        finish_line_check_id: checkId,
        item_key: "dairy_order_created",
        item_label: "Dairy order created if due",
        answer: checklist.dairyOrderCreated,
        requires_attention: checklist.dairyOrderCreated === "no",
      },
      {
        finish_line_check_id: checkId,
        item_key: "production_worksheet",
        item_label: "Production worksheets completed and signed",
        answer: checklist.productionWorksheet,
        requires_attention: checklist.productionWorksheet === "no",
      },
      {
        finish_line_check_id: checkId,
        item_key: "production_record",
        item_label: "Production record completed",
        answer: checklist.productionRecord,
        requires_attention: checklist.productionRecord === "no",
      },
      {
        finish_line_check_id: checkId,
        item_key: "meal_count_entered",
        item_label: "Meal counts entered into production record",
        answer: checklist.mealCountEntered,
        requires_attention: checklist.mealCountEntered === "no",
      },
      {
        finish_line_check_id: checkId,
        item_key: "reports_reviewed",
        item_label: "Required reports reviewed for accuracy",
        answer: checklist.reportsReviewed,
        requires_attention: checklist.reportsReviewed === "no",
      },
    ];
    /* MONDAY */
    if (isMonday) {
      items.push(
        {
          finish_line_check_id: checkId,
          item_key: "monday_missing_meal_report",
          item_label: "Missing Meal Count Report reviewed",
          answer: checklist.mondayMissingMealReport,
          requires_attention: checklist.mondayMissingMealReport === "no",
        },
        {
          finish_line_check_id: checkId,
          item_key: "monday_all_meal_counts_entered",
          item_label:
            "All required meal counts entered for applicable service days",
          answer: checklist.mondayAllMealCountsEntered,
          requires_attention: checklist.mondayAllMealCountsEntered === "no",
        }
      );
    }
    /* TUESDAY */
    if (isTuesday) {
      items.push({
        finish_line_check_id: checkId,
        item_key: "tuesday_meal_plan",
        item_label:
          "Meal Plan completed for required ordering-calendar date range",
        answer: checklist.tuesdayMealPlan,
        requires_attention: checklist.tuesdayMealPlan === "no",
      });
    }
    /* WEDNESDAY */
    if (isWednesday) {
      items.push({
        finish_line_check_id: checkId,
        item_key: "wednesday_order_status",
        item_label: "Site Report — Order Status (Non-Dairy) run and reviewed",
        answer: checklist.wednesdayOrderStatus,
        requires_attention: checklist.wednesdayOrderStatus === "no",
      });
    }
    /* THURSDAY */
    if (isThursday) {
      items.push({
        finish_line_check_id: checkId,
        item_key: "thursday_orders_complete",
        item_label: "Required orders edited, saved, and completed by 2:00 PM",
        answer: checklist.thursdayOrdersComplete,
        requires_attention: checklist.thursdayOrdersComplete === "no",
      });
    }
    /* MONTH END */
    if (showMonthEnd) {
      items.push({
        finish_line_check_id: checkId,
        item_key: "month_end_inventory",
        item_label: "Monthly physical inventory completed",
        answer: checklist.monthEndInventory,
        requires_attention: checklist.monthEndInventory === "no",
      });
    }
    return items;
  }
  /* =========================================================
AUDIT HELPERS
========================================================= */
  function buildAuditRows(
    checkId,
    serviceDate,
    newItems,
    newComments,
    newStatus
  ) {
    if (!isEditing || !originalCheck) {
      return [];
    }
    const changedBy = employee?.employee_name || "Covering Employee";
    const oldItems = originalCheck.finish_line_items || [];
    const oldByKey = new Map(oldItems.map((item) => [item.item_key, item]));
    const auditRows = [];
    // Record checklist-answer changes.
    newItems.forEach((newItem) => {
      const oldItem = oldByKey.get(newItem.item_key);
      const oldValue = oldItem?.answer ?? "";
      const newValue = newItem.answer ?? "";
      if (String(oldValue) !== String(newValue)) {
        auditRows.push({
          finish_line_check_id: checkId,
          location_id: location.id,
          service_date: serviceDate,
          employee_name: changedBy,
          field_name: newItem.item_label || newItem.item_key,
          old_value: String(oldValue),
          new_value: String(newValue),
        });
      }
    });
    // Record comments only when they actually changed.
    const oldComments = originalCheck.comments ?? "";
    const nextComments = newComments ?? "";
    if (String(oldComments) !== String(nextComments)) {
      auditRows.push({
        finish_line_check_id: checkId,
        location_id: location.id,
        service_date: serviceDate,
        employee_name: changedBy,
        field_name: "Comments",
        old_value: String(oldComments),
        new_value: String(nextComments),
      });
    }
    // Record status changes, such as Complete -> Attention.
    const oldStatus = originalCheck.status ?? "";
    if (String(oldStatus) !== String(newStatus)) {
      auditRows.push({
        finish_line_check_id: checkId,
        location_id: location.id,
        service_date: serviceDate,
        employee_name: changedBy,
        field_name: "Finish Line Status",
        old_value: String(oldStatus),
        new_value: String(newStatus),
      });
    }
    return auditRows;
  }
  /* =========================================================
SAVE
========================================================= */
  async function handleSubmit(e) {
    e.preventDefault();
    /*
Supervisor Preview does not save.
*/
    if (isPreviewMode) {
      setMessage("Preview mode only — nothing will be saved.");
      return;
    }
    if (!validateChecklist()) {
      return;
    }
    if (!location || !employee) {
      setMessage("Location or employee information is missing.");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const serviceDate = new Date().toISOString().split("T")[0];
      const status = determineAttention() ? "attention" : "complete";
      const now = new Date().toISOString();
      /* =====================================
SAVE MAIN FINISH LINE
submitted_at is intentionally NOT
changed here. On an edit, updated_at
records when the correction happened.
===================================== */
      const checkPayload = {
        location_id: location.id,
        employee_id: employee.id || null,
        employee_name: employee.employee_name || "Covering Employee",
        service_date: serviceDate,
        comments: checklist.comments || null,
        status,
      };
      if (isEditing) {
        checkPayload.updated_at = now;
      }
      const { data: checkData, error: checkError } = await supabase
        .from("finish_line_checks")
        .upsert(checkPayload, {
          onConflict: "location_id,service_date",
        })
        .select()
        .single();
      if (checkError) {
        console.error("Finish Line save error:", checkError);
        setMessage(`Could not save Finish Line Check: ${checkError.message}`);
        return;
      }
      /* =====================================
BUILD NEW ITEMS + AUDIT CHANGES
IMPORTANT:
We create the audit rows BEFORE
deleting the old checklist items.
===================================== */
      const items = buildItems(checkData.id);
      const auditRows = buildAuditRows(
        checkData.id,
        serviceDate,
        items,
        checklist.comments || "",
        status
      );
      if (auditRows.length > 0) {
        const { error: auditError } = await supabase
          .from("finish_line_audit_log")
          .insert(auditRows);
        if (auditError) {
          console.error("Finish Line audit save error:", auditError);
          setMessage(
            `Your Finish Line was not fully updated because the audit history could not be saved: ${auditError.message}`
          );
          return;
        }
      }
      /* =====================================
REMOVE OLD FINISH LINE ITEMS
===================================== */
      const { error: deleteError } = await supabase
        .from("finish_line_items")
        .delete()
        .eq("finish_line_check_id", checkData.id);
      if (deleteError) {
        console.error("Finish Line item cleanup error:", deleteError);
        setMessage(
          `Could not update Finish Line items: ${deleteError.message}`
        );
        return;
      }
      /* =====================================
SAVE CURRENT FINISH LINE ITEMS
===================================== */
      const { error: itemError } = await supabase
        .from("finish_line_items")
        .insert(items);
      if (itemError) {
        console.error("Finish Line item save error:", itemError);
        setMessage(
          `Finish Line saved, but checklist answers failed: ${itemError.message}`
        );
        return;
      }
      /* =====================================
SAVE MEAL COUNTS
Meal-count audit history will be
added separately after Finish Line
audit editing is confirmed working.
===================================== */
      const breakfast = Number(mealCounts.breakfast);
      const lunch = Number(mealCounts.lunch);
      const supper =
        mealCounts.supper === "" ? null : Number(mealCounts.supper);
      const supperStatus = supper === null ? "pending" : "complete";
      const { error: mealError } = await supabase.from("meal_counts").upsert(
        {
          location_id: location.id,
          service_date: serviceDate,
          breakfast_count: breakfast,
          lunch_count: lunch,
          supper_count: supper,
          supper_status: supperStatus,
          entered_by: employee.employee_name || "Covering Employee",
          updated_at: now,
        },
        {
          onConflict: "location_id,service_date",
        }
      );
      if (mealError) {
        console.error("Meal count save error:", mealError);
        setMessage(
          `Finish Line saved, but meal counts failed: ${mealError.message}`
        );
        return;
      }
      onComplete();
    } catch (error) {
      console.error("Unexpected Finish Line save error:", error);
      setMessage(`Could not save Finish Line Check: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }
  /* =========================================================
LOADING
========================================================= */
  if (pageLoading) {
    return (
      <div className="login-app">
        <main className="login-main">
          <div className="login-card">Loading Finish Line...</div>
        </main>
      </div>
    );
  }
  /* =========================================================
PAGE
========================================================= */
  return (
    <div className="login-app">
      {/* HEADER */}
      <header className="login-header">
        <div className="login-brand">
          <img src="/spark-192.png" alt="SPARK" className="spark-header-logo" />

          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>
            <div className="login-brand-subtitle">OPERATIONS</div>
          </div>
        </div>
      </header>
      <main className="login-main">
        <div className="finish-line-page">
          {/* =====================================
PAGE HEADER
===================================== */}
          <div className="finish-line-top">
            <button type="button" className="finish-line-back" onClick={onBack}>
              ←{" "}
              {isPreviewMode
                ? "Command Center"
                : isEditing
                ? "School Dashboard"
                : "School Hub"}
            </button>
            <div>
              <h1>Finish Line Check</h1>
              <p
                style={{
                  fontWeight: "700",
                }}
              >
                {getTodayLabel()}
              </p>
              <p>{location?.school_name}</p>
            </div>
            <div className="finish-line-user">{employee?.employee_name}</div>
          </div>
          {/* PREVIEW NOTICE */}
          {isPreviewMode && (
            <div
              style={{
                background: "#fff6d8",
                border: "1px solid #e7cb70",
                color: "#715600",
                borderRadius: "9px",
                padding: "12px 15px",
                marginBottom: "14px",
                fontSize: "11px",
                fontWeight: "700",
              }}
            >
              n Supervisor Preview Mode — nothing on this page will be saved.
            </div>
          )}
          {/* EDIT NOTICE */}
          {!isPreviewMode && isEditing && (
            <div
              style={{
                background: "#eef6ff",
                border: "1px solid #c8def6",
                color: "#265d94",
                borderRadius: "9px",
                padding: "12px 15px",
                marginBottom: "14px",
                fontSize: "11px",
              }}
            >
              You are editing today's existing Finish Line Check.
            </div>
          )}
          {message && <div className="login-error">{message}</div>}
          <form className="finish-line-form" onSubmit={handleSubmit}>
            {/* =====================================
1 — NEWTON
===================================== */}
            <section className="check-section">
              <div className="check-section-heading">
                <span className="section-number">1</span>
                <div>
                  <h2>Newton</h2>
                  <p>Previous meal count verification</p>
                </div>
              </div>
              <div className="check-item">
                <div>
                  <strong>
                    Are all previous meal counts entered in Newton?
                  </strong>
                  <small>
                    Includes Supper for all sites, plus Snack and Offsite where
                    applicable.
                  </small>
                </div>
                <YesNoButtons
                  value={checklist.previousMealCounts}
                  onChange={(value) =>
                    updateChecklist("previousMealCounts", value)
                  }
                />
              </div>
            </section>
            {/* =====================================
2 — EDISON
===================================== */}
            <section className="check-section">
              <div className="check-section-heading">
                <span className="section-number">2</span>
                <div>
                  <h2>Edison — Production & Paperwork</h2>
                  <p>Verify required records are complete.</p>
                </div>
              </div>
              <div className="check-item">
                <strong>Dairy order created if due?</strong>
                <YesNoButtons
                  value={checklist.dairyOrderCreated}
                  onChange={(value) =>
                    updateChecklist("dairyOrderCreated", value)
                  }
                />
              </div>
              <div className="check-item">
                <strong>Production worksheets completed and signed?</strong>
                <YesNoButtons
                  value={checklist.productionWorksheet}
                  onChange={(value) =>
                    updateChecklist("productionWorksheet", value)
                  }
                />
              </div>
              <div className="check-item">
                <strong>Production record completed?</strong>
                <YesNoButtons
                  value={checklist.productionRecord}
                  onChange={(value) =>
                    updateChecklist("productionRecord", value)
                  }
                />
              </div>
              <div className="check-item">
                <strong>Meal counts entered into the production record?</strong>
                <YesNoButtons
                  value={checklist.mealCountEntered}
                  onChange={(value) =>
                    updateChecklist("mealCountEntered", value)
                  }
                />
              </div>
            </section>
            {/* =====================================
3 — REPORT REVIEW
===================================== */}
            <section className="check-section">
              <div className="check-section-heading">
                <span className="section-number">3</span>
                <div>
                  <h2>Report Review</h2>
                  <p>Confirm required reports were reviewed for accuracy.</p>
                </div>
              </div>
              <div className="check-item">
                <div>
                  <strong>Have today's required reports been reviewed?</strong>
                  <small>
                    After Posting Report • Meal Count Report • LAUSD Production
                    Report
                  </small>
                </div>
                <YesNoButtons
                  value={checklist.reportsReviewed}
                  onChange={(value) =>
                    updateChecklist("reportsReviewed", value)
                  }
                />
              </div>
            </section>
            {/* =====================================
4 — MEAL COUNTS
===================================== */}
            <section className="check-section">
              <div className="check-section-heading">
                <span className="section-number">4</span>
                <div>
                  <h2>Meal Counts</h2>
                  <p>Enter counts directly from the End-of-Day Report.</p>
                </div>
              </div>
              <div
                style={{
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "12px",
                  }}
                >
                  {/* BREAKFAST */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "10px",
                        fontWeight: "800",
                        marginBottom: "5px",
                      }}
                    >
                      Breakfast *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Enter count"
                      value={mealCounts.breakfast}
                      onChange={(e) =>
                        updateMealCount("breakfast", e.target.value)
                      }
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        border: "1px solid #d6dfe7",
                        borderRadius: "7px",
                        padding: "10px",
                        fontSize: "14px",
                        fontWeight: "700",
                      }}
                    />
                  </div>
                  {/* LUNCH */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "10px",
                        fontWeight: "800",
                        marginBottom: "5px",
                      }}
                    >
                      Lunch *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Enter count"
                      value={mealCounts.lunch}
                      onChange={(e) => updateMealCount("lunch", e.target.value)}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        border: "1px solid #d6dfe7",
                        borderRadius: "7px",
                        padding: "10px",
                        fontSize: "14px",
                        fontWeight: "700",
                      }}
                    />
                  </div>
                  {/* SUPPER */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: "10px",
                        fontWeight: "800",
                        marginBottom: "5px",
                      }}
                    >
                      Supper
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Pending"
                      value={mealCounts.supper}
                      onChange={(e) =>
                        updateMealCount("supper", e.target.value)
                      }
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        border: "1px solid #d6dfe7",
                        borderRadius: "7px",
                        padding: "10px",
                        fontSize: "14px",
                        fontWeight: "700",
                      }}
                    />
                  </div>
                </div>
                <div
                  style={{
                    marginTop: "10px",
                    background: "#f6f8fa",
                    borderRadius: "7px",
                    padding: "9px 11px",
                    fontSize: "9px",
                    color: "#677482",
                  }}
                >
                  Breakfast and Lunch are required. Supper may remain pending
                  until the final count is available the next morning.
                </div>
              </div>
            </section>
            {/* =====================================
MONDAY
===================================== */}
            {isMonday && (
              <section className="check-section">
                <div className="check-section-heading">
                  <span className="section-number">5</span>
                  <div>
                    <h2>Monday — Missing Meal Counts</h2>
                    <p>Review the previous week's service activity.</p>
                  </div>
                </div>
                <div className="check-item">
                  <strong>Missing Meal Count Report reviewed?</strong>
                  <YesNoButtons
                    value={checklist.mondayMissingMealReport}
                    onChange={(value) =>
                      updateChecklist("mondayMissingMealReport", value)
                    }
                  />
                </div>
                <div className="check-item">
                  <div>
                    <strong>
                      Are all required meal counts entered for applicable
                      service days?
                    </strong>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "6px",
                        marginTop: "8px",
                        marginBottom: "6px",
                      }}
                    >
                      {getPreviousWeekdays().map((date) => (
                        <span
                          key={date}
                          style={{
                            background: "#eef3f7",
                            border: "1px solid #d8e0e7",
                            borderRadius: "6px",
                            padding: "4px 7px",
                            fontSize: "10px",
                            fontWeight: "700",
                          }}
                        >
                          {date}
                        </span>
                      ))}
                    </div>
                    <small>
                      Only include days and meal programs when service was
                      provided.
                    </small>
                  </div>
                  <YesNoButtons
                    value={checklist.mondayAllMealCountsEntered}
                    onChange={(value) =>
                      updateChecklist("mondayAllMealCountsEntered", value)
                    }
                  />
                </div>
              </section>
            )}
            {/* =====================================
TUESDAY
===================================== */}
            {isTuesday && (
              <section className="check-section">
                <div className="check-section-heading">
                  <span className="section-number">5</span>
                  <div>
                    <h2>Tuesday — Meal Plan</h2>
                    <p>Follow the current Ordering Calendar.</p>
                  </div>
                </div>
                <div className="check-item">
                  <strong>
                    Meal Plan completed for the required ordering-calendar date
                    range?
                  </strong>
                  <YesNoButtons
                    value={checklist.tuesdayMealPlan}
                    onChange={(value) =>
                      updateChecklist("tuesdayMealPlan", value)
                    }
                  />
                </div>
              </section>
            )}
            {/* =====================================
WEDNESDAY
===================================== */}
            {isWednesday && (
              <section className="check-section">
                <div className="check-section-heading">
                  <span className="section-number">5</span>
                  <div>
                    <h2>Wednesday — Order Status</h2>
                    <p>Review upcoming non-dairy orders.</p>
                  </div>
                </div>
                <div className="check-item">
                  <div>
                    <strong>
                      Have you run and reviewed the Site Report — Order Status
                      (Non-Dairy)?
                    </strong>
                    <small>
                      Edison → Site Reports → Order Status (Non-Dairy)
                    </small>
                  </div>
                  <YesNoButtons
                    value={checklist.wednesdayOrderStatus}
                    onChange={(value) =>
                      updateChecklist("wednesdayOrderStatus", value)
                    }
                  />
                </div>
              </section>
            )}
            {/* =====================================
THURSDAY
===================================== */}
            {isThursday && (
              <section className="check-section">
                <div className="check-section-heading">
                  <span className="section-number">5</span>
                  <div>
                    <h2>Thursday — Orders</h2>
                    <p>Ordering deadline: 2:00 PM</p>
                  </div>
                </div>
                <div className="check-item">
                  <strong>
                    Have all required orders been edited, saved, and completed
                    by 2:00 PM?
                  </strong>
                  <YesNoButtons
                    value={checklist.thursdayOrdersComplete}
                    onChange={(value) =>
                      updateChecklist("thursdayOrdersComplete", value)
                    }
                  />
                </div>
              </section>
            )}
            {/* =====================================
MONTH END
===================================== */}
            {showMonthEnd && (
              <section className="check-section">
                <div className="check-section-heading">
                  <span className="section-number">H</span>
                  <div>
                    <h2>Month-End Inventory</h2>
                    <p>Last weekday of the month.</p>
                  </div>
                </div>
                <div className="check-item">
                  <strong>
                    Has the monthly physical inventory been completed?
                  </strong>
                  <YesNoButtons
                    value={checklist.monthEndInventory}
                    onChange={(value) =>
                      updateChecklist("monthEndInventory", value)
                    }
                  />
                </div>
              </section>
            )}
            {/* =====================================
CLOSING & READINESS
===================================== */}

            <section className="check-section">
              <div className="check-section-heading">
                <span className="section-number">3</span>

                <div>
                  <h2>Closing & Readiness</h2>
                  <p>Complete every area before submitting.</p>
                </div>
              </div>

              <div
                style={{
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "9px",
                  }}
                >
                  <button
                    type="button"
                    className={`closing-pill ${
                      closing.equipment ? "closing-complete" : ""
                    }`}
                    onClick={() => toggleClosing("equipment")}
                  >
                    Equipment
                  </button>

                  <button
                    type="button"
                    className={`closing-pill ${
                      closing.prepAreas ? "closing-complete" : ""
                    }`}
                    onClick={() => toggleClosing("prepAreas")}
                  >
                    Prep Areas
                  </button>

                  <button
                    type="button"
                    className={`closing-pill ${
                      closing.floors ? "closing-complete" : ""
                    }`}
                    onClick={() => toggleClosing("floors")}
                  >
                    Floors
                  </button>

                  <button
                    type="button"
                    className={`closing-pill ${
                      closing.trash ? "closing-complete" : ""
                    }`}
                    onClick={() => toggleClosing("trash")}
                  >
                    Trash Cans
                  </button>

                  <button
                    type="button"
                    className={`closing-pill ${
                      closing.kitchenReady ? "closing-complete" : ""
                    }`}
                    onClick={() => toggleClosing("kitchenReady")}
                  >
                    Kitchen Ready
                  </button>
                </div>
              </div>
            </section>
            {/* =====================================
COMMENTS
===================================== */}
            <section className="check-section">
              <div className="check-section-heading">
                <span className="section-number">•</span>
                <div>
                  <h2>Comments</h2>
                  <p>Anything your Area Supervisor should know.</p>
                </div>
              </div>
              <textarea
                className="comments-box"
                rows="5"
                placeholder="Comments, issues, follow-up needs..."
                value={checklist.comments}
                onChange={(e) => updateChecklist("comments", e.target.value)}
              />
            </section>
            {/* =====================================
SUBMIT
===================================== */}
            <div className="finish-line-submit-area">
              <div>
                <strong>
                  {isPreviewMode
                    ? "Manager Finish Line Preview"
                    : isEditing
                    ? "Ready to save your changes?"
                    : "Ready to finish the day?"}
                </strong>
                <small>
                  {!formComplete &&
                    "Complete all required items before submitting."}
                  {formComplete &&
                    !isPreviewMode &&
                    "All Finish Line requirements are complete."}
                  {formComplete &&
                    isPreviewMode &&
                    "This is a preview. Nothing will be saved."}
                </small>
              </div>
              <button
                type="submit"
                className={`finish-line-submit ${
                  formComplete ? "finish-line-ready" : "finish-line-not-ready"
                }`}
                disabled={loading || !formComplete}
              >
                {loading
                  ? "Saving..."
                  : isPreviewMode
                  ? "Preview Complete"
                  : isEditing
                  ? "Save Finish Line Changes"
                  : "Submit Finish Line Check"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
export default FinishLinePage;
