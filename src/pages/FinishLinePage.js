import {breakfastToday} from '../breakfast/BreakfastDispatch';
import FinishLineBreakfast from '../breakfast/FinishLineBreakfast';
import {loadSchoolBenefits} from '../mysteryPull/benefits';
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  REWARD_LAUNCH_DATE,
  getFinishLinePointAward,
  isStreakEligibleCheck,
} from "../sparkPolicy";
import { calculateDisplayedFinishLineStreak } from "../finishLineStreaks";
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
  receiversCompleted: "",
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

const emptyResponseComments = {
  previousMealCounts: "",
  dairyOrderCreated: "",
  receiversCompleted: "",
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
};
/* =========================================================
YES / NO BUTTONS
========================================================= */
function YesNoButtons({ value, onChange, allowNA = false }) {
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
      {allowNA && (
        <button
          type="button"
          className={`yes-no-button ${value === "na" ? "selected-danger" : ""}`}
          onClick={() => onChange("na")}
        >
          N/A
        </button>
      )}
    </div>
  );
}

function ResponseComment({ answer, value, onChange }) {
  if (answer !== "no" && answer !== "na") return null;

  return (
    <div
      style={{
        marginTop: "10px",
        padding: "11px 12px",
        background: "#fff7f7",
        border: "1px solid #efb7b7",
        borderRadius: "8px",
      }}
    >
      <div
        style={{
          color: "#a53030",
          fontSize: "10px",
          fontWeight: "800",
          marginBottom: "7px",
        }}
      >
        Comment required — please explain this response.
      </div>
      <textarea
        className="comments-box"
        rows="2"
        placeholder="Enter explanation..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ margin: 0 }}
      />
    </div>
  );
}

/* =========================================================
FINISH LINE PAGE
========================================================= */
function FinishLinePage({
  managerPin,
  location,
  employee,
  existingCheck,
  onBack,
  onComplete,
}) {
  const [checklist, setChecklist] = useState(emptyChecklist);
  const [closing, setClosing] = useState(emptyClosing);
  const [mealCounts, setMealCounts] = useState(emptyMealCounts);
  const [responseComments, setResponseComments] = useState(emptyResponseComments);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [celebration, setCelebration] = useState(null);
  // Snapshot of the Finish Line as it existed when this page loaded.
  // Used only to create an audit trail when an existing submission is edited.
  const [originalCheck, setOriginalCheck] = useState(null);
  const [mealVersion, setMealVersion] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const pendingSubmission = useRef(null);
  const submitting = useRef(false);

  /* =========================================================
SUPERVISOR PREVIEW MODE
========================================================= */
  const isPreviewMode = existingCheck?.previewMode === true;
  const previewDay = existingCheck?.previewDay ?? null;
  const previewMonthEnd = existingCheck?.previewMonthEnd ?? false;

  // When editing a historical Finish Line, keep every load/save tied
  // to that original service date instead of today's date.
  const todayServiceDate = breakfastToday();
  const activeServiceDate =
    !isPreviewMode && existingCheck?.service_date
      ? existingCheck.service_date
      : todayServiceDate;
  /* =========================================================
DAY LOGIC
========================================================= */
  const realDay = new Date(`${activeServiceDate}T12:00:00`).getDay();
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
    return new Date(`${activeServiceDate}T12:00:00`).toLocaleDateString([], {
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
    const serviceDay = new Date(`${activeServiceDate}T12:00:00`);
    /*
Friday:
check whether next Monday is
a different month.
*/
    if (serviceDay.getDay() === 5) {
      const monday = new Date(serviceDay);
      monday.setDate(serviceDay.getDate() + 3);
      return monday.getMonth() !== serviceDay.getMonth();
    }
    /*
Monday-Thursday:
check whether tomorrow starts
a new month.
*/
    const tomorrow = new Date(serviceDay);
    tomorrow.setDate(serviceDay.getDate() + 1);
    return tomorrow.getMonth() !== serviceDay.getMonth();
  }
  const showMonthEnd = isPreviewMode ? previewMonthEnd : isLastWeekdayOfMonth();
  /* =========================================================
LOAD PAGE DATA
========================================================= */
  useEffect(() => {
    loadPageData();
  }, [location?.id, activeServiceDate]);
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
      setResponseComments(emptyResponseComments);
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
    setLoadFailed(false);
    try {
      const serviceDate = activeServiceDate;
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

        function commentFor(key) {
          return items.find((item) => item.item_key === `${key}_comment`)?.answer || "";
        }

        setChecklist({
          previousMealCounts: answerFor("previous_meal_counts"),
          dairyOrderCreated: answerFor("dairy_order_created"),
          receiversCompleted: answerFor("receivers_completed"),
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

        setResponseComments({
          previousMealCounts: commentFor("previous_meal_counts"),
          dairyOrderCreated: commentFor("dairy_order_created"),
          receiversCompleted: commentFor("receivers_completed"),
          productionWorksheet: commentFor("production_worksheet"),
          productionRecord: commentFor("production_record"),
          mealCountEntered: commentFor("meal_count_entered"),
          reportsReviewed: commentFor("reports_reviewed"),
          mondayMissingMealReport: commentFor("monday_missing_meal_report"),
          mondayAllMealCountsEntered: commentFor("monday_all_meal_counts_entered"),
          tuesdayMealPlan: commentFor("tuesday_meal_plan"),
          wednesdayOrderStatus: commentFor("wednesday_order_status"),
          thursdayOrdersComplete: commentFor("thursday_orders_complete"),
          monthEndInventory: commentFor("month_end_inventory"),
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
        setResponseComments(emptyResponseComments);
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
      setMealVersion(mealData?.updated_at || null);
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
      setLoadFailed(true);
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
  function updateResponseComment(field, value) {
    setResponseComments((current) => ({
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
  /* =========================================================
FORM COMPLETE CHECK
========================================================= */
  function isFormComplete() {
    const dailyComplete = [
      checklist.previousMealCounts,
      checklist.dairyOrderCreated,
      checklist.receiversCompleted,
      checklist.productionWorksheet,
      checklist.productionRecord,
      checklist.mealCountEntered,
      checklist.reportsReviewed,
    ].every(Boolean);
    if (!dailyComplete) {
      return false;
    }

    const requiredCommentPairs = [
      ["previousMealCounts", checklist.previousMealCounts],
      ["dairyOrderCreated", checklist.dairyOrderCreated],
      ["receiversCompleted", checklist.receiversCompleted],
      ["productionWorksheet", checklist.productionWorksheet],
      ["productionRecord", checklist.productionRecord],
      ["mealCountEntered", checklist.mealCountEntered],
      ["reportsReviewed", checklist.reportsReviewed],
      ["mondayMissingMealReport", isMonday ? checklist.mondayMissingMealReport : ""],
      ["mondayAllMealCountsEntered", isMonday ? checklist.mondayAllMealCountsEntered : ""],
      ["tuesdayMealPlan", isTuesday ? checklist.tuesdayMealPlan : ""],
      ["wednesdayOrderStatus", isWednesday ? checklist.wednesdayOrderStatus : ""],
      ["thursdayOrdersComplete", isThursday ? checklist.thursdayOrdersComplete : ""],
      ["monthEndInventory", showMonthEnd ? checklist.monthEndInventory : ""],
    ];

    const missingRequiredComment = requiredCommentPairs.some(
      ([field, answer]) =>
        (answer === "no" || answer === "na") &&
        !responseComments[field]?.trim()
    );

    if (missingRequiredComment) {
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
        "Complete all required Finish Line items, required No/N/A explanations, meal counts, and Closing & Readiness before submitting."
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
        item_key: "receivers_completed",
        item_label: "Receivers completed if applicable",
        answer: checklist.receiversCompleted,
        requires_attention: checklist.receiversCompleted === "no",
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
        item_label: "Production Record Produced",
        answer: checklist.productionRecord,
        requires_attention: checklist.productionRecord === "no",
      },
      {
        finish_line_check_id: checkId,
        item_key: "meal_count_entered",
        item_label: "Meal Counts entered in Edison Production and written on paper Production Record",
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
  /* =========================================================
  FINISH LINE STREAK HELPERS
  ========================================================= */
  async function calculateFinishLineStreak(serviceDate) {
    const [{data,error},{data:excludedRows,error:excludedError}]=await Promise.all([
      supabase.from("finish_line_checks").select("service_date, status, submitted_at")
        .eq("location_id",location.id).eq("status","complete").gte("service_date",REWARD_LAUNCH_DATE)
        .lte("service_date",serviceDate).order("service_date",{ascending:false}).limit(100),
      supabase.from("spark_excluded_days").select("service_date").eq("location_id",location.id)
        .gte("service_date",REWARD_LAUNCH_DATE).lte("service_date",serviceDate).limit(100),
    ]);

    if (error || excludedError) {
      console.error("Could not calculate Finish Line streak:", error || excludedError);
      return 1;
    }

    if (!data || data.length === 0) {
      return 1;
    }

    const benefits=await loadSchoolBenefits(location.id);
    const completedDates=new Set(data.filter(check=>isStreakEligibleCheck(check)||(check.status==="complete"&&benefits.makeup.has(check.service_date))).map((row)=>row.service_date));
    const excludedDates=new Set([...(excludedRows||[]).map((row)=>row.service_date),...benefits.shields]);
    return calculateDisplayedFinishLineStreak(completedDates,excludedDates,serviceDate);
  }

  function getStreakMessage(streak) {
    if (streak >= 100) return "Incredible consistency. Keep SPARKing!";
    if (streak >= 50) return "Outstanding Finish Line consistency!";
    if (streak >= 25) return "Amazing work keeping the streak alive!";
    if (streak >= 10) return "Double digits! Great consistency!";
    if (streak >= 5) return "Five days strong. Keep it going!";
    if (streak >= 2) return "Another Finish Line complete. Nice work!";
    return "Finish Line complete. Great job today!";
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
    if (submitting.current || loadFailed) return;
    if (!validateChecklist()) {
      return;
    }
    if (!location || !employee) {
      setMessage("Location or employee information is missing.");
      return;
    }
    submitting.current = true;
    setLoading(true);
    setMessage("");
    try {
      const serviceDate = activeServiceDate;
      const payload = {
        location_id: location.id, service_date: serviceDate,
        expected_check_version: originalCheck?.updated_at || originalCheck?.submitted_at || null,
        expected_meal_version: mealVersion,
        comments: checklist.comments || '', closing,
        meals: {breakfast: Number(mealCounts.breakfast), lunch: Number(mealCounts.lunch),
          supper: mealCounts.supper === '' ? null : Number(mealCounts.supper)},
        items: Object.fromEntries(buildItems(null).map(item => {
          const field = item.item_key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
          return [item.item_key, {answer: item.answer, label: item.item_label, comment: responseComments[field] || ''}];
        })),
      };
      const serialized = JSON.stringify(payload);
      if (pendingSubmission.current?.serialized !== serialized) {
        pendingSubmission.current = {serialized, id: window.crypto.randomUUID()};
      }
      const {data, error} = await supabase.rpc('spark_submit_finish_line', {
        p_request_id: pendingSubmission.current.id, p_payload: payload,
      });
      if (error) throw error;
      const checkData = data.check;
      const finishLineReward = getFinishLinePointAward(serviceDate, checkData.submitted_at);
      // Edits should return normally. Only a brand-new Finish Line
      // submission earns the completion celebration.
      if (isEditing || !finishLineReward.streakEligible) {
        onComplete();
        return;
      }

      const streak = await calculateFinishLineStreak(serviceDate);
      setCelebration({
        streak,
        message: getStreakMessage(streak),
        milestone: [5, 10, 25, 50, 100].includes(streak),
      });

      window.setTimeout(() => {
        setCelebration(null);
        onComplete();
      }, 2200);
    } catch (error) {
      console.error("Unexpected Finish Line save error:", error);
      setMessage(`Could not save Finish Line Checklist: ${error.message}`);
    } finally {
      submitting.current = false;
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
      {celebration && (
        <div
          className={`spark-finish-celebration ${
            celebration.milestone ? "milestone" : ""
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="spark-firework spark-firework-one" aria-hidden="true" />
          <div className="spark-firework spark-firework-two" aria-hidden="true" />
          <div className="spark-firework spark-firework-three" aria-hidden="true" />
          <div className="spark-firework spark-firework-four" aria-hidden="true" />

          <div className="spark-celebration-card">
            <img src="/spark-clear.png" alt="" className="spark-celebration-logo" />
            <div className="spark-celebration-kicker">FINISH LINE COMPLETE</div>
            <div className="spark-celebration-streak">
              {celebration.streak} Day{celebration.streak === 1 ? "" : "s"}
            </div>
            <div className="spark-celebration-label">STREAK</div>
            <p>{celebration.message}</p>
          </div>
        </div>
      )}
      {/* HEADER */}
      <header className="login-header">
        <div className="login-brand">
          <img src="/spark-192.png" alt="SPARK" className="spark-header-logo" />

          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>
            <div className="login-brand-subtitle">FINISH LINE CHECKLIST</div>
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
          : "Finish Line Overview"}
        </button>
            <div>
              <h1>Finish Line Checklist</h1>
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
          {!isPreviewMode && existingCheck?.service_date && (
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
              {isEditing
                ? `You are editing the Finish Line Checklist for ${getTodayLabel()}.`
                : `This Finish Line was missed on ${getTodayLabel()}. You can complete it now for partial credit, but it will not count toward a streak.`}
            </div>
          )}
          {message && <div className="login-error">{message}</div>}
          <form className="finish-line-form" onSubmit={handleSubmit}>
            <div
              style={{
                background: "#fff8e6",
                border: "1px solid #ead39a",
                borderRadius: "9px",
                padding: "11px 14px",
                marginBottom: "14px",
                fontSize: "11px",
                color: "#6c5417",
                fontWeight: "700",
              }}
            >
              Comment with explanation is required immediately for any No or N/A response.
            </div>

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
              <div className="check-item" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <strong>Are all previous meal counts entered in Newton?</strong>
                  <small>
                    Includes Supper for all sites, plus Snack and Offsite where applicable.
                  </small>
                  <ResponseComment
                    answer={checklist.previousMealCounts}
                    value={responseComments.previousMealCounts}
                    onChange={(value) =>
                      updateResponseComment("previousMealCounts", value)
                    }
                  />
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

              {[
                ["dairyOrderCreated", "Dairy order created if due?", true],
                ["receiversCompleted", "Receivers completed if applicable?", true],
                ["productionWorksheet", "Production worksheets completed and signed?", false],
                ["productionRecord", "Production Record Produced?", false],
                ["mealCountEntered", "Meal Counts entered in Edison Production and written on paper Production Record?", false],
              ].map(([field, label, allowNA]) => (
                <div
                  className="check-item"
                  style={{ alignItems: "flex-start" }}
                  key={field}
                >
                  <div style={{ flex: 1 }}>
                    <strong>{label}</strong>
                    <ResponseComment
                      answer={checklist[field]}
                      value={responseComments[field]}
                      onChange={(value) => updateResponseComment(field, value)}
                    />
                  </div>
                  <YesNoButtons
                    value={checklist[field]}
                    allowNA={allowNA}
                    onChange={(value) => updateChecklist(field, value)}
                  />
                </div>
              ))}
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
              <div className="check-item" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <strong>Have today's required reports been reviewed?</strong>
                  <small>
                    After Posting Report • Meal Count Report • LAUSD Production Report
                  </small>
                  <ResponseComment
                    answer={checklist.reportsReviewed}
                    value={responseComments.reportsReviewed}
                    onChange={(value) =>
                      updateResponseComment("reportsReviewed", value)
                    }
                  />
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
              {!isPreviewMode&&<FinishLineBreakfast location={location} employee={employee} managerPin={managerPin} date={activeServiceDate} disabled={loading} onUse={value=>updateMealCount("breakfast",value)}/>}
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
                  <span className="section-number">D</span>
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
                  <ResponseComment
                    answer={checklist.mondayMissingMealReport}
                    value={responseComments.mondayMissingMealReport}
                    onChange={(value) =>
                      updateResponseComment("mondayMissingMealReport", value)
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
                  <ResponseComment
                    answer={checklist.mondayAllMealCountsEntered}
                    value={responseComments.mondayAllMealCountsEntered}
                    onChange={(value) =>
                      updateResponseComment("mondayAllMealCountsEntered", value)
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
                  <span className="section-number">D</span>
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
                  <ResponseComment
                    answer={checklist.tuesdayMealPlan}
                    value={responseComments.tuesdayMealPlan}
                    onChange={(value) =>
                      updateResponseComment("tuesdayMealPlan", value)
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
                  <span className="section-number">D</span>
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
                  <ResponseComment
                    answer={checklist.wednesdayOrderStatus}
                    value={responseComments.wednesdayOrderStatus}
                    onChange={(value) =>
                      updateResponseComment("wednesdayOrderStatus", value)
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
                  <span className="section-number">D</span>
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
                  <ResponseComment
                    answer={checklist.thursdayOrdersComplete}
                    value={responseComments.thursdayOrdersComplete}
                    onChange={(value) =>
                      updateResponseComment("thursdayOrdersComplete", value)
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
                  <ResponseComment
                    answer={checklist.monthEndInventory}
                    value={responseComments.monthEndInventory}
                    onChange={(value) =>
                      updateResponseComment("monthEndInventory", value)
                    }
                  />
                </div>
              </section>
            )}
            {/* =====================================
5 — CLOSING & READINESS
===================================== */}
            <section className="check-section">
              <div className="check-section-heading">
                <span className="section-number">5</span>
                <div>
                  <h2>Closing & Readiness</h2>
                  <p>
                    Confirm each area is cleaned, completed, and ready for the next service day.
                  </p>
                </div>
              </div>

              <div style={{ padding: "16px" }}>
                <div
                  style={{
                    marginBottom: "11px",
                    fontSize: "10px",
                    color: "#677482",
                  }}
                >
                  Click each item when complete. Completed items will turn green.
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "9px",
                  }}
                >
                  <button type="button" className={`closing-pill ${closing.equipment ? "closing-complete" : ""}`} onClick={() => toggleClosing("equipment")}>
                    Equipment Clean & Ready
                  </button>
                  <button type="button" className={`closing-pill ${closing.prepAreas ? "closing-complete" : ""}`} onClick={() => toggleClosing("prepAreas")}>
                    Prep Areas Clean
                  </button>
                  <button type="button" className={`closing-pill ${closing.floors ? "closing-complete" : ""}`} onClick={() => toggleClosing("floors")}>
                    Floors Clean
                  </button>
                  <button type="button" className={`closing-pill ${closing.trash ? "closing-complete" : ""}`} onClick={() => toggleClosing("trash")}>
                    Trash Emptied
                  </button>
                  <button type="button" className={`closing-pill ${closing.kitchenReady ? "closing-complete" : ""}`} onClick={() => toggleClosing("kitchenReady")}>
                    Kitchen Ready for Tomorrow
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
                    "Complete all required items and any required No/N/A explanations before submitting."}
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
                disabled={loading || loadFailed || !formComplete}
              >
                {loading
                  ? "Saving..."
                  : isPreviewMode
                  ? "Preview Complete"
                  : isEditing
                  ? "Save Finish Line Changes"
                  : "Submit Finish Line Checklist"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
export default FinishLinePage;
