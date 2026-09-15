import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { awardSparkPoints } from "../sparkPoints";
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
  const [originalCheck, setOriginalCheck] = useState(null);

  const isPreviewMode = existingCheck?.previewMode === true;
  const previewDay = existingCheck?.previewDay ?? null;
  const previewMonthEnd = existingCheck?.previewMonthEnd ?? false;
  const todayServiceDate = new Date().toISOString().split("T")[0];
  const activeServiceDate =
    !isPreviewMode && existingCheck?.service_date
      ? existingCheck.service_date
      : todayServiceDate;

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

  const [excludedServiceDates, setExcludedServiceDates] = useState(new Set());

  function getPreviousInventoryMonthLabel() {
    const serviceDay = new Date(`${activeServiceDate}T12:00:00`);
    const previousMonth = new Date(serviceDay.getFullYear(), serviceDay.getMonth() - 1, 1);
    return previousMonth.toLocaleDateString([], { month: "long", year: "numeric" });
  }

  function isFirstWorkingDayOfMonth() {
    if (TEST_MONTH_END) return true;
    const serviceDay = new Date(`${activeServiceDate}T12:00:00`);
    const serviceMonth = serviceDay.getMonth();
    if (serviceDay.getDay() === 0 || serviceDay.getDay() === 6) return false;
    const candidate = new Date(serviceDay);
    candidate.setDate(candidate.getDate() - 1);
    while (candidate.getMonth() === serviceMonth) {
      const day = candidate.getDay();
      const candidateString = candidate.toISOString().split("T")[0];
      if (day !== 0 && day !== 6 && !excludedServiceDates.has(candidateString)) return false;
      candidate.setDate(candidate.getDate() - 1);
    }
    return !excludedServiceDates.has(activeServiceDate);
  }

  const showMonthEnd = isPreviewMode ? previewMonthEnd : isFirstWorkingDayOfMonth();
  const inventoryMonthLabel = getPreviousInventoryMonthLabel();

  useEffect(() => {
    loadPageData();
  }, [location?.id, activeServiceDate]);

  async function loadPageData() {
    if (isPreviewMode) {
      setChecklist(emptyChecklist); setClosing(emptyClosing); setMealCounts(emptyMealCounts);
      setResponseComments(emptyResponseComments); setIsEditing(false); setOriginalCheck(null);
      setPageLoading(false); return;
    }
    if (!location?.id) { setPageLoading(false); return; }
    setPageLoading(true);
    try {
      const serviceDate = activeServiceDate;
      const monthStart = `${serviceDate.slice(0, 7)}-01`;
      const { data: excludedRows, error: excludedError } = await supabase
        .from("spark_excluded_days").select("service_date").eq("location_id", location.id)
        .gte("service_date", monthStart).lte("service_date", serviceDate);
      if (excludedError) throw excludedError;
      setExcludedServiceDates(new Set((excludedRows || []).map((row) => row.service_date)));

      const { data: finishData, error: finishError } = await supabase
        .from("finish_line_checks").select(`*, finish_line_items (*)`)
        .eq("location_id", location.id).eq("service_date", serviceDate).maybeSingle();
      if (finishError) throw finishError;
      if (finishData) {
        setIsEditing(true); setOriginalCheck(finishData);
        const items = finishData.finish_line_items || [];
        const answerFor = (key) => items.find((item) => item.item_key === key)?.answer || "";
        const commentFor = (key) => items.find((item) => item.item_key === `${key}_comment`)?.answer || "";
        setChecklist({
          previousMealCounts: answerFor("previous_meal_counts"), dairyOrderCreated: answerFor("dairy_order_created"),
          receiversCompleted: answerFor("receivers_completed"), productionWorksheet: answerFor("production_worksheet"),
          productionRecord: answerFor("production_record"), mealCountEntered: answerFor("meal_count_entered"),
          reportsReviewed: answerFor("reports_reviewed"), mondayMissingMealReport: answerFor("monday_missing_meal_report"),
          mondayAllMealCountsEntered: answerFor("monday_all_meal_counts_entered"), tuesdayMealPlan: answerFor("tuesday_meal_plan"),
          wednesdayOrderStatus: answerFor("wednesday_order_status"), thursdayOrdersComplete: answerFor("thursday_orders_complete"),
          monthEndInventory: answerFor("month_end_inventory"), comments: finishData.comments || "",
        });
        setResponseComments({
          previousMealCounts: commentFor("previous_meal_counts"), dairyOrderCreated: commentFor("dairy_order_created"),
          receiversCompleted: commentFor("receivers_completed"), productionWorksheet: commentFor("production_worksheet"),
          productionRecord: commentFor("production_record"), mealCountEntered: commentFor("meal_count_entered"),
          reportsReviewed: commentFor("reports_reviewed"), mondayMissingMealReport: commentFor("monday_missing_meal_report"),
          mondayAllMealCountsEntered: commentFor("monday_all_meal_counts_entered"), tuesdayMealPlan: commentFor("tuesday_meal_plan"),
          wednesdayOrderStatus: commentFor("wednesday_order_status"), thursdayOrdersComplete: commentFor("thursday_orders_complete"),
          monthEndInventory: commentFor("month_end_inventory"),
        });
        setClosing({ equipment:true, prepAreas:true, floors:true, trash:true, kitchenReady:true });
      } else {
        setIsEditing(false); setOriginalCheck(null); setChecklist(emptyChecklist); setClosing(emptyClosing); setResponseComments(emptyResponseComments);
      }
      const { data: mealData, error: mealError } = await supabase.from("meal_counts").select("*")
        .eq("location_id", location.id).eq("service_date", serviceDate).maybeSingle();
      if (mealError) throw mealError;
      setMealCounts(mealData ? { breakfast: mealData.breakfast_count ?? "", lunch: mealData.lunch_count ?? "", supper: mealData.supper_count ?? "" } : emptyMealCounts);
    } catch (error) {
      console.error("Finish Line load error:", error); setMessage(`Could not load today's Finish Line: ${error.message}`);
    } finally { setPageLoading(false); }
  }

  function updateChecklist(field, value) { setChecklist((current)=>({...current,[field]:value})); setMessage(""); }
  function updateResponseComment(field, value) { setResponseComments((current)=>({...current,[field]:value})); setMessage(""); }
  function updateMealCount(field, value) { const clean=value.replace(/\D/g,""); setMealCounts((current)=>({...current,[field]:clean})); setMessage(""); }
  function toggleClosing(field) { setClosing((current)=>({...current,[field]:!current[field]})); setMessage(""); }
  const closingComplete = Object.values(closing).every(Boolean);

  function determineAttention() {
    return [checklist.previousMealCounts==="no",checklist.dairyOrderCreated==="no",checklist.receiversCompleted==="no",
      checklist.productionWorksheet==="no",checklist.productionRecord==="no",checklist.mealCountEntered==="no",checklist.reportsReviewed==="no",
      isMonday&&checklist.mondayMissingMealReport==="no",isMonday&&checklist.mondayAllMealCountsEntered==="no",isTuesday&&checklist.tuesdayMealPlan==="no",
      isWednesday&&checklist.wednesdayOrderStatus==="no",isThursday&&checklist.thursdayOrdersComplete==="no",showMonthEnd&&checklist.monthEndInventory==="no"].some(Boolean);
  }

  function isFormComplete() {
    const dailyComplete=[checklist.previousMealCounts,checklist.dairyOrderCreated,checklist.receiversCompleted,checklist.productionWorksheet,checklist.productionRecord,checklist.mealCountEntered,checklist.reportsReviewed].every(Boolean);
    if(!dailyComplete)return false;
    const requiredCommentPairs=[["previousMealCounts",checklist.previousMealCounts],["dairyOrderCreated",checklist.dairyOrderCreated],["receiversCompleted",checklist.receiversCompleted],["productionWorksheet",checklist.productionWorksheet],["productionRecord",checklist.productionRecord],["mealCountEntered",checklist.mealCountEntered],["reportsReviewed",checklist.reportsReviewed],["mondayMissingMealReport",isMonday?checklist.mondayMissingMealReport:""],["mondayAllMealCountsEntered",isMonday?checklist.mondayAllMealCountsEntered:""],["tuesdayMealPlan",isTuesday?checklist.tuesdayMealPlan:""],["wednesdayOrderStatus",isWednesday?checklist.wednesdayOrderStatus:""],["thursdayOrdersComplete",isThursday?checklist.thursdayOrdersComplete:""],["monthEndInventory",showMonthEnd?checklist.monthEndInventory:""]];
    if(requiredCommentPairs.some(([field,answer])=>(answer==="no"||answer==="na")&&!responseComments[field]?.trim()))return false;
    if(mealCounts.breakfast===""||mealCounts.lunch==="")return false;
    if(isMonday&&(!checklist.mondayMissingMealReport||!checklist.mondayAllMealCountsEntered))return false;
    if(isTuesday&&!checklist.tuesdayMealPlan)return false;
    if(isWednesday&&!checklist.wednesdayOrderStatus)return false;
    if(isThursday&&!checklist.thursdayOrdersComplete)return false;
    if(showMonthEnd&&!checklist.monthEndInventory)return false;
    return closingComplete;
  }
  const formComplete=isFormComplete();
  function validateChecklist(){if(!formComplete){setMessage("Complete all required Finish Line items, required No/N/A explanations, meal counts, and Closing & Readiness before submitting.");return false;}return true;}

  function buildItems(checkId) {
    const items=[
      {finish_line_check_id:checkId,item_key:"previous_meal_counts",item_label:"Previous meal counts entered in Newton",answer:checklist.previousMealCounts,requires_attention:checklist.previousMealCounts==="no"},
      {finish_line_check_id:checkId,item_key:"dairy_order_created",item_label:"Dairy order created if due",answer:checklist.dairyOrderCreated,requires_attention:checklist.dairyOrderCreated==="no"},
      {finish_line_check_id:checkId,item_key:"receivers_completed",item_label:"Receivers completed if applicable",answer:checklist.receiversCompleted,requires_attention:checklist.receiversCompleted==="no"},
      {finish_line_check_id:checkId,item_key:"production_worksheet",item_label:"Production worksheets completed and signed",answer:checklist.productionWorksheet,requires_attention:checklist.productionWorksheet==="no"},
      {finish_line_check_id:checkId,item_key:"production_record",item_label:"Production Record Produced",answer:checklist.productionRecord,requires_attention:checklist.productionRecord==="no"},
      {finish_line_check_id:checkId,item_key:"meal_count_entered",item_label:"Meal Counts entered in Edison Production and written on paper Production Record",answer:checklist.mealCountEntered,requires_attention:checklist.mealCountEntered==="no"},
      {finish_line_check_id:checkId,item_key:"reports_reviewed",item_label:"Required reports reviewed for accuracy",answer:checklist.reportsReviewed,requires_attention:checklist.reportsReviewed==="no"},
    ];
    if(isMonday)items.push({finish_line_check_id:checkId,item_key:"monday_missing_meal_report",item_label:"Missing Meal Count Report reviewed",answer:checklist.mondayMissingMealReport,requires_attention:checklist.mondayMissingMealReport==="no"},{finish_line_check_id:checkId,item_key:"monday_all_meal_counts_entered",item_label:"All required meal counts entered for applicable service days",answer:checklist.mondayAllMealCountsEntered,requires_attention:checklist.mondayAllMealCountsEntered==="no"});
    if(isTuesday)items.push({finish_line_check_id:checkId,item_key:"tuesday_meal_plan",item_label:"Meal Plan completed for required ordering-calendar date range",answer:checklist.tuesdayMealPlan,requires_attention:checklist.tuesdayMealPlan==="no"});
    if(isWednesday)items.push({finish_line_check_id:checkId,item_key:"wednesday_order_status",item_label:"Site Report — Order Status (Non-Dairy) run and reviewed",answer:checklist.wednesdayOrderStatus,requires_attention:checklist.wednesdayOrderStatus==="no"});
    if(isThursday)items.push({finish_line_check_id:checkId,item_key:"thursday_orders_complete",item_label:"Required orders edited, saved, and completed by 2:00 PM",answer:checklist.thursdayOrdersComplete,requires_attention:checklist.thursdayOrdersComplete==="no"});
    if(showMonthEnd)items.push({finish_line_check_id:checkId,item_key:"month_end_inventory",item_label:`${inventoryMonthLabel} physical inventory completed`,answer:checklist.monthEndInventory,requires_attention:checklist.monthEndInventory==="no"});
    return items;
  }

  function buildAuditRows(checkId,serviceDate,newItems,newComments,newStatus){
    if(!isEditing||!originalCheck)return[];const changedBy=employee?.employee_name||"Covering Employee";const oldItems=originalCheck.finish_line_items||[];const oldByKey=new Map(oldItems.map((item)=>[item.item_key,item]));const auditRows=[];
    newItems.forEach((newItem)=>{const oldItem=oldByKey.get(newItem.item_key);const oldValue=oldItem?.answer??"";const newValue=newItem.answer??"";if(String(oldValue)!==String(newValue))auditRows.push({finish_line_check_id:checkId,location_id:location.id,service_date:serviceDate,employee_name:changedBy,field_name:newItem.item_label||newItem.item_key,old_value:String(oldValue),new_value:String(newValue)});});
    const oldComments=originalCheck.comments??"";const nextComments=newComments??"";if(String(oldComments)!==String(nextComments))auditRows.push({finish_line_check_id:checkId,location_id:location.id,service_date:serviceDate,employee_name:changedBy,field_name:"Comments",old_value:String(oldComments),new_value:String(nextComments)});
    const oldStatus=originalCheck.status??"";if(String(oldStatus)!==String(newStatus))auditRows.push({finish_line_check_id:checkId,location_id:location.id,service_date:serviceDate,employee_name:changedBy,field_name:"Finish Line Status",old_value:String(oldStatus),new_value:String(newStatus)});return auditRows;
  }

  async function calculateFinishLineStreak(serviceDate){
    const [{data,error},{data:excludedRows,error:excludedError}]=await Promise.all([
      supabase.from("finish_line_checks").select("service_date, status, submitted_at").eq("location_id",location.id).eq("status","complete").gte("service_date",REWARD_LAUNCH_DATE).lte("service_date",serviceDate).order("service_date",{ascending:false}).limit(100),
      supabase.from("spark_excluded_days").select("service_date").eq("location_id",location.id).gte("service_date",REWARD_LAUNCH_DATE).lte("service_date",serviceDate).limit(100),]);
    if(error||excludedError){console.error("Could not calculate Finish Line streak:",error||excludedError);return 1;}if(!data||data.length===0)return 1;
    const completedDates=new Set(data.filter(isStreakEligibleCheck).map((row)=>row.service_date));const excludedDates=new Set((excludedRows||[]).map((row)=>row.service_date));return calculateDisplayedFinishLineStreak(completedDates,excludedDates,serviceDate);
  }
  function getStreakMessage(streak){if(streak>=100)return"Incredible consistency. Keep SPARKing!";if(streak>=50)return"Outstanding Finish Line consistency!";if(streak>=25)return"Amazing work keeping the streak alive!";if(streak>=10)return"Double digits! Great consistency!";if(streak>=5)return"Five days strong. Keep it going!";if(streak>=2)return"Another Finish Line complete. Nice work!";return"Finish Line complete. Great job today!";}

  async function handleSubmit(e){
    e.preventDefault();if(isPreviewMode){setMessage("Preview mode only — nothing will be saved.");return;}if(!validateChecklist())return;if(!location||!employee){setMessage("Location or employee information is missing.");return;}setLoading(true);setMessage("");
    try{const serviceDate=activeServiceDate;const status=determineAttention()?"attention":"complete";const now=new Date().toISOString();const checkPayload={location_id:location.id,employee_id:employee.id||null,employee_name:employee.employee_name||"Covering Employee",service_date:serviceDate,comments:checklist.comments||null,status};if(isEditing)checkPayload.updated_at=now;
      const {data:checkData,error:checkError}=await supabase.from("finish_line_checks").upsert(checkPayload,{onConflict:"location_id,service_date"}).select().single();if(checkError){setMessage(`Could not save Finish Line Checklist: ${checkError.message}`);return;}
      const items=buildItems(checkData.id);const auditRows=buildAuditRows(checkData.id,serviceDate,items,checklist.comments||"",status);if(auditRows.length>0){const{error:auditError}=await supabase.from("finish_line_audit_log").insert(auditRows);if(auditError){setMessage(`Your Finish Line was not fully updated because the audit history could not be saved: ${auditError.message}`);return;}}
      const{error:deleteError}=await supabase.from("finish_line_items").delete().eq("finish_line_check_id",checkData.id);if(deleteError){setMessage(`Could not update Finish Line items: ${deleteError.message}`);return;}const{error:itemError}=await supabase.from("finish_line_items").insert(items);if(itemError){setMessage(`Finish Line saved, but checklist answers failed: ${itemError.message}`);return;}
      const breakfast=Number(mealCounts.breakfast),lunch=Number(mealCounts.lunch),supper=mealCounts.supper===""?null:Number(mealCounts.supper),supperStatus=supper===null?"pending":"complete";const{error:mealError}=await supabase.from("meal_counts").upsert({location_id:location.id,service_date:serviceDate,breakfast_count:breakfast,lunch_count:lunch,supper_count:supper,supper_status:supperStatus,entered_by:employee.employee_name||"Covering Employee",updated_at:now},{onConflict:"location_id,service_date"});if(mealError){setMessage(`Finish Line saved, but meal counts failed: ${mealError.message}`);return;}
      const employeeName=employee.employee_name||"Covering Employee",employeeId=employee.id||null;
      await awardSparkPoints({locationId:location.id,points:5,pointType:"breakfast_meal_count",description:"Breakfast meal count entered",serviceDate,employeeId,employeeName,uniqueKey:`breakfast-${location.id}-${serviceDate}`});await awardSparkPoints({locationId:location.id,points:5,pointType:"lunch_meal_count",description:"Lunch meal count entered",serviceDate,employeeId,employeeName,uniqueKey:`lunch-${location.id}-${serviceDate}`});if(supper!==null)await awardSparkPoints({locationId:location.id,points:5,pointType:"supper_meal_count",description:"Supper meal count entered",serviceDate,employeeId,employeeName,uniqueKey:`supper-${location.id}-${serviceDate}`});
      const finishLineReward=getFinishLinePointAward(serviceDate,new Date());await awardSparkPoints({locationId:location.id,points:finishLineReward.points,pointType:finishLineReward.late?"finish_line_late":"finish_line",description:finishLineReward.gracePeriod?"Finish Line Checklist completed — rollout grace period":finishLineReward.late?"Finish Line Checklist completed late — partial credit":"Finish Line Checklist completed on time",serviceDate,employeeId,employeeName,uniqueKey:`finish-line-${location.id}-${serviceDate}`});if(isEditing||!finishLineReward.streakEligible){onComplete();return;}const streak=await calculateFinishLineStreak(serviceDate);setCelebration({streak,message:getStreakMessage(streak),milestone:[5,10,25,50,100].includes(streak)});window.setTimeout(()=>{setCelebration(null);onComplete();},2200);
    }catch(error){console.error("Unexpected Finish Line save error:",error);setMessage(`Could not save Finish Line Checklist: ${error.message}`);}finally{setLoading(false);}
  }

  if(pageLoading)return <div className="login-app"><main className="login-main"><div className="login-card">Loading Finish Line...</div></main></div>;

  return <div className="login-app">
    {celebration&&<div className={`spark-finish-celebration ${celebration.milestone?"milestone":""}`} role="status" aria-live="polite"><div className="spark-celebration-card"><img src="/spark-clear.png" alt="" className="spark-celebration-logo"/><div className="spark-celebration-kicker">FINISH LINE COMPLETE</div><div className="spark-celebration-streak">{celebration.streak} Day{celebration.streak===1?"":"s"}</div><div className="spark-celebration-label">STREAK</div><p>{celebration.message}</p></div></div>}
    <header className="login-header"><div className="login-brand"><img src="/spark-192.png" alt="SPARK" className="spark-header-logo"/><div><div className="login-brand-name">SOUTH CAFÉ LA</div><div className="login-brand-subtitle">FINISH LINE CHECKLIST</div></div></div></header>
    <main className="login-main"><div className="finish-line-page"><div className="finish-line-top"><button type="button" className="finish-line-back" onClick={onBack}>← {isPreviewMode?"Command Center":"Finish Line Overview"}</button><div><h1>Finish Line Checklist</h1><p style={{fontWeight:"700"}}>{getTodayLabel()}</p><p>{location?.school_name}</p></div><div className="finish-line-user">{employee?.employee_name}</div></div>
    {message&&<div className="login-error">{message}</div>}<form className="finish-line-form" onSubmit={handleSubmit}>
    <section className="check-section"><div className="check-section-heading"><span className="section-number">1</span><div><h2>Newton</h2><p>Previous meal count verification</p></div></div><div className="check-item"><strong>Are all previous meal counts entered in Newton?</strong><YesNoButtons value={checklist.previousMealCounts} onChange={(v)=>updateChecklist("previousMealCounts",v)}/></div></section>
    <section className="check-section"><div className="check-section-heading"><span className="section-number">2</span><div><h2>Edison — Production & Paperwork</h2></div></div>{[["dairyOrderCreated","Dairy order created if due?",true],["receiversCompleted","Receivers completed if applicable?",true],["productionWorksheet","Production worksheets completed and signed?",false],["productionRecord","Production Record Produced?",false],["mealCountEntered","Meal Counts entered in Edison Production and written on paper Production Record?",false]].map(([field,label,allowNA])=><div className="check-item" key={field}><strong>{label}</strong><YesNoButtons value={checklist[field]} allowNA={allowNA} onChange={(v)=>updateChecklist(field,v)}/></div>)}</section>
    <section className="check-section"><div className="check-section-heading"><span className="section-number">3</span><div><h2>Report Review</h2></div></div><div className="check-item"><strong>Have today's required reports been reviewed?</strong><YesNoButtons value={checklist.reportsReviewed} onChange={(v)=>updateChecklist("reportsReviewed",v)}/></div></section>
    <section className="check-section"><div className="check-section-heading"><span className="section-number">4</span><div><h2>Meal Counts</h2></div></div><div style={{padding:"16px"}}><input placeholder="Breakfast" value={mealCounts.breakfast} onChange={(e)=>updateMealCount("breakfast",e.target.value)}/><input placeholder="Lunch" value={mealCounts.lunch} onChange={(e)=>updateMealCount("lunch",e.target.value)}/><input placeholder="Supper" value={mealCounts.supper} onChange={(e)=>updateMealCount("supper",e.target.value)}/></div></section>
    {isMonday&&<section className="check-section"><div className="check-section-heading"><span className="section-number">D</span><h2>Monday — Missing Meal Counts</h2></div><div className="check-item"><strong>Missing Meal Count Report reviewed?</strong><YesNoButtons value={checklist.mondayMissingMealReport} onChange={(v)=>updateChecklist("mondayMissingMealReport",v)}/></div><div className="check-item"><strong>Are all required meal counts entered for applicable service days?</strong><YesNoButtons value={checklist.mondayAllMealCountsEntered} onChange={(v)=>updateChecklist("mondayAllMealCountsEntered",v)}/></div></section>}
    {isTuesday&&<section className="check-section"><div className="check-section-heading"><span className="section-number">D</span><h2>Tuesday — Meal Plan</h2></div><div className="check-item"><strong>Meal Plan completed for the required ordering-calendar date range?</strong><YesNoButtons value={checklist.tuesdayMealPlan} onChange={(v)=>updateChecklist("tuesdayMealPlan",v)}/></div></section>}
    {isWednesday&&<section className="check-section"><div className="check-section-heading"><span className="section-number">D</span><h2>Wednesday — Order Status</h2></div><div className="check-item"><strong>Have you run and reviewed the Site Report — Order Status (Non-Dairy)?</strong><YesNoButtons value={checklist.wednesdayOrderStatus} onChange={(v)=>updateChecklist("wednesdayOrderStatus",v)}/></div></section>}
    {isThursday&&<section className="check-section"><div className="check-section-heading"><span className="section-number">D</span><h2>Thursday — Orders</h2></div><div className="check-item"><strong>Have all required orders been edited, saved, and completed by 2:00 PM?</strong><YesNoButtons value={checklist.thursdayOrdersComplete} onChange={(v)=>updateChecklist("thursdayOrdersComplete",v)}/></div></section>}
    {showMonthEnd&&<section className="check-section"><div className="check-section-heading"><span className="section-number">H</span><div><h2>{inventoryMonthLabel} Inventory</h2><p>Previous-month inventory confirmation.</p></div></div><div className="check-item"><strong>Has the {inventoryMonthLabel} physical inventory been completed?</strong><YesNoButtons value={checklist.monthEndInventory} onChange={(v)=>updateChecklist("monthEndInventory",v)}/><ResponseComment answer={checklist.monthEndInventory} value={responseComments.monthEndInventory} onChange={(v)=>updateResponseComment("monthEndInventory",v)}/></div></section>}
    <section className="check-section"><div className="check-section-heading"><span className="section-number">5</span><h2>Closing & Readiness</h2></div><div style={{padding:"16px"}}>{Object.keys(closing).map((field)=><button key={field} type="button" className={`closing-pill ${closing[field]?"closing-complete":""}`} onClick={()=>toggleClosing(field)}>{field}</button>)}</div></section>
    <section className="check-section"><textarea className="comments-box" rows="5" placeholder="Comments, issues, follow-up needs..." value={checklist.comments} onChange={(e)=>updateChecklist("comments",e.target.value)}/></section>
    <div className="finish-line-submit-area"><button type="submit" className={`finish-line-submit ${formComplete?"finish-line-ready":"finish-line-not-ready"}`} disabled={loading||!formComplete}>{loading?"Saving...":isEditing?"Save Finish Line Changes":"Submit Finish Line Checklist"}</button></div>
    </form></div></main></div>;
}
export default FinishLinePage;
