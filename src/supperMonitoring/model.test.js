import { newDraft, weekDates, average, validate, requiresCorrectiveAction, findings, QUESTION_IDS, schoolYear, resumeDraft, historyKey, repeatedHistory, serviceEnd, changeDraft } from "./model";

// Synthetic questionnaire exercises the renderer contract. It is deliberately
// not the missing official questionnaire or an approved compliance definition.
const fixture = { ready: true, questions: QUESTION_IDS.map(id => ({ id, options: ["yes", "no", "na"], ...(id === "18b" ? { when: { id: "18a", answer: "yes" } } : {}) })) };
function completeDraft() {
  const data = newDraft("A Monitor");
  Object.assign(data, { unannounced: true, adultMeals: "0", approvedServiceTime: "14:30-15:30", followUpRequired: false, monitoringDate: "2026-09-23", arrivalTime: "14:00", departureTime: "16:00", serviceStart: "14:30", serviceEnd: "15:30", programName: "ASP", todayAttendance: "101", todayMeals: "100", weekStart: "2026-09-14", coordinatorName: "B Coordinator", comments: "No Findings" });
  data.serviceTimes = [{program:"Youth Enrichment",day:"Wednesday",start:"14:30",end:"15:00",observed:true}];
  data.history = weekDates(data.weekStart).map(date => ({ date, meals: "100", attendance: "101" }));
  data.milks = [{fatType:"1%",description:"White",serving:"8 oz"},{fatType:"Nonfat",description:"Chocolate",serving:"8 oz"}];
  data.menu = data.menu.map(row => ({ ...row, item: "Menu item", serving: "1 cup" }));
  data.answers = Object.fromEntries(QUESTION_IDS.map(id => [id, id === "18a" || id === "19" ? "no" : "yes"]));
  ["monitor", "coordinator"].forEach(role => { data.signatures[role] = { contentHash: "a".repeat(64), strokes: [[[0.1, 0.2], [0.4, 0.8]]], printedName: data[`${role}Name`], date: "2026-09-23", pages: [1, 2], acceptedAt: "2026-09-23T20:00:00Z" }; });
  data.historyVerified = historyKey(data.history);
  return data;
}

test("a week is always Monday through Friday, including year and leap-day boundaries", () => {
  expect(weekDates("2027-01-01")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"]);
  expect(weekDates("2024-02-29")[3]).toBe("2024-02-29");
  expect(weekDates("2026-02-30")).toEqual([]);
  expect(weekDates("2026-09-20")[0]).toBe("2026-09-14");
});
test("average distinguishes missing values from zero and retains entered counts", () => {
  const history = completeDraft().history;
  history[0].meals = "0";
  expect(average(history)).toBe(80);
  history[0].meals = "";
  expect(average(history)).toBeNull();
  history[0].meals = "2.5";
  expect(average(history)).toBeNull();
  expect(history[0].meals).toBe("2.5");
});
test("detects equal and lower attendance for each day", () => {
  for (let i = 0; i < 5; i++) for (const count of ["100", "99"]) {
    const draft = completeDraft(); draft.history[i].attendance = count;
    expect(validate(draft, fixture).some(e => e.field === `attendance-${i}`)).toBe(true);
  }
});
test("detects duplicate, weekend, missing, and monitoring-date history entries", () => {
  const draft = completeDraft();
  expect(validate(draft, fixture)).toEqual([]);
  draft.history[1].date = draft.history[0].date;
  expect(validate(draft, fixture).some(e => e.message.includes("repeat"))).toBe(true);
  draft.history[1].date = "2026-09-19";
  expect(validate(draft, fixture).some(e => e.field === "date-1")).toBe(true);
  draft.monitoringDate = draft.history[0].date;
  expect(validate(draft, fixture).some(e => e.message.includes("monitoring date cannot"))).toBe(true);
  draft.history[2].meals = "";
  expect(validate(draft, fixture).some(e => e.field === "meals-2")).toBe(true);
});
test("No triggers corrective action except 18a/19; Yes to 19 triggers it", () => {
  expect(requiresCorrectiveAction("18a", "no")).toBe(false);
  expect(requiresCorrectiveAction("19", "no")).toBe(false);
  expect(requiresCorrectiveAction("19", "yes")).toBe(true);
  expect(requiresCorrectiveAction("18b", "no")).toBe(true);
  expect(requiresCorrectiveAction("20", "no")).toBe(true);
  expect(requiresCorrectiveAction("20", "na")).toBe(false);
});
test("18b only applies according to the configured form condition", () => {
  const draft = completeDraft(); draft.answers["18b"] = "no";
  expect(findings(draft, fixture)).toEqual([]);
  draft.answers["18a"] = "yes";
  expect(findings(draft, fixture).map(q => q.id)).toEqual(["18b"]);
  expect(validate(draft, fixture).some(e => e.field === "repeatedFindings")).toBe(true);
});
test("corrective action and follow-up fields are mandatory when triggered", () => {
  const draft = completeDraft(); draft.answers["19"] = "yes"; draft.followUpRequired = true; draft.correctiveActionDue = "2026-10-01";
  expect(validate(draft, fixture).some(e => e.section === 4)).toBe(true);
  draft.correctiveActions["19"] = { description: "Finding", action: "Action", training: "Discussion", followUpPlan: "Return visit", actionDate: "2026-09-23", followUpDue: "2026-10-01", operatingDays: "6", calendarConfirmed: true };
  expect(validate(draft, fixture)).toEqual([]);
  draft.correctiveActions["19"].followUpComplete = true;
  expect(validate(draft, fixture).some(e => e.field === "action-19-followUpNotes")).toBe(true);
});
test("blank comment, names, signature date, page consent and stale signature name fail review", () => {
  const draft = completeDraft();
  draft.comments = "  "; draft.coordinatorName = "";
  draft.signatures.monitor.pages = [1]; draft.signatures.monitor.date = "";
  expect(validate(draft, fixture).map(e => e.field)).toEqual(expect.arrayContaining(["comments", "coordinatorName", "monitorSignature", "coordinatorSignature"]));
});
test("missing menu information, invalid times and incomplete questions fail review", () => {
  const draft = completeDraft(); draft.milks[0].serving = ""; draft.departureTime = "13:00"; delete draft.answers["20"];
  expect(validate(draft, fixture).map(e => e.field)).toEqual(expect.arrayContaining(["milk-serving-0", "departureTime", "question-20"]));
});
test("official template cannot be bypassed by otherwise complete answers", () => {
  expect(validate(completeDraft(), { ready: false, questions: [] }).map(e => e.field)).toEqual(expect.arrayContaining(["officialForm", "officialPdf"]));
});
test("school-year boundary uses July and does not parse invalid dates", () => {
  expect(schoolYear("2026-06-30")).toBe("2025-26");
  expect(schoolYear("2026-07-01")).toBe("2026-27");
  expect(schoolYear("2026-02-30")).toBe("");
});

test("service validation uses only observed programs on the monitoring weekday and strict boundaries", () => {
  const data = completeDraft();
  data.serviceTimes.push({program:"Other program",day:"Wednesday",start:"16:00",end:"16:30",observed:true});
  data.serviceTimes.push({program:"Youth Enrichment",day:"Tuesday",start:"12:00",end:"12:30",observed:true});
  expect(validate(data,fixture).find(e=>e.field === "departureTime").message).toContain("4:30 PM");
  data.departureTime="16:31";
  expect(validate(data,fixture)).toEqual([]);
  for(const time of ["14:30","14:45"]) { data.arrivalTime=time; expect(validate(data,fixture).find(e=>e.field === "arrivalTime").message).toContain("2:30 PM"); }
  data.arrivalTime="14:29";data.departureTime="16:30";
  expect(validate(data,fixture).some(e=>e.field === "departureTime")).toBe(true);
  data.serviceTimes.forEach(row=>row.observed=false);
  expect(validate(data,fixture).some(e=>e.field === "serviceTimes")).toBe(true);
});
test("today and history equal counts require explicit confirmation tied to those counts and date", () => {
  const data=completeDraft();data.todayAttendance="100";
  data.history[0].attendance="100";
  expect(validate(data,fixture).map(e=>e.field)).toEqual(expect.arrayContaining(["todayAttendance","attendance-0"]));
  data.todayAttendanceConfirmed=`${data.monitoringDate}|100|100`;
  data.history[0].attendanceConfirmed=`${data.history[0].date}|100|100`;
  data.historyVerified=historyKey(data.history);
  expect(validate(data,fixture)).toEqual([]);
  data.todayMeals="101";data.todayAttendance="101";
  expect(validate(data,fixture).some(e=>e.field === "todayAttendance")).toBe(true);
  data.todayAttendance="99";
  expect(validate(data,fixture).find(e=>e.field === "todayAttendance").message).toContain("cannot be lower");
});
test("zero history meals cannot be confirmed away and optional menu rows may stay blank", () => {
  const data=completeDraft();data.history[2].meals="0";
  expect(validate(data,fixture).find(e=>e.field === "meals-2").message).toContain("Select a different Monday-Friday week");
  data.history[2].meals="100";data.menu[5].item="";data.menu[5].serving="";
  expect(validate(data,fixture)).toEqual([]);
});

test("legacy drafts retain their work and require confirmation of copied approved service hours", () => {
  const old=completeDraft();delete old.serviceTimes;old.unannounced=false;old.adultMeals="8";
  const resumed=resumeDraft(old);
  expect(resumed.serviceTimes[0]).toMatchObject({program:"ASP",day:"Wednesday",start:"14:30",needsConfirmation:true});
  expect(resumed.history).toEqual(old.history);
  expect(resumed.unannounced).toBe(true);expect(resumed.adultMeals).toBe("0");
  expect(resumed.signatures.monitor).toBeNull();
  expect(validate(resumed,fixture).some(e=>e.field === "service-0")).toBe(true);
});


test("30-minute end recalculates and coverage ignores tampered end", () => {
  expect(serviceEnd("15:02")).toBe("15:32"); expect(serviceEnd("15:45")).toBe("16:15");
  const data=completeDraft(); data.serviceTimes=[{program:"YDP",day:"Wednesday",start:"15:02",end:"15:06",observed:true}];data.departureTime="15:30";
  expect(validate(data).find(e=>e.field==="departureTime").message).toContain("3:32 PM (YDP");
});
test("repeated history confirmation is bound to dates and counts; normal variation is not flagged", () => {
  const data=completeDraft();data.historyVerified="";
  expect(validate(data).some(e=>e.field==="historyVerified")).toBe(true);
  data.historyVerified=historyKey(data.history);expect(validate(data).some(e=>e.field==="historyVerified")).toBe(false);
  data.history[0].meals="99";expect(validate(data).some(e=>e.field==="historyVerified")).toBe(true);
  data.history.forEach((d,i)=>{d.meals=String(51+i*3);d.attendance=String(70+i*4);});expect(repeatedHistory(data.history)).toBe(false);
  data.history.forEach(d=>d.attendance="90");expect(repeatedHistory(data.history)).toBe(true);
  expect(average([51,51,51,52,52].map(meals=>({meals})))).toBe(51);
  expect(average([51,51,52,52,52].map(meals=>({meals})))).toBe(52);
});
test("both monitoring roles preserve the first signature when the second signer enters their name", () => {
  for(const slot of ["manager_1","supervisor"]){
    let data=completeDraft();data.monitoringSlot=slot;
    const accepted=data.signatures.monitor;
    data=changeDraft(data,"coordinatorName","New Coordinator");
    expect(data.signatures.monitor).toBe(accepted);expect(data.signatures.coordinator).toBeNull();
    expect(validate(data).filter(e=>e.field==="monitorSignature")).toEqual([]);
    expect(resumeDraft(JSON.parse(JSON.stringify(data))).signatures.monitor).toEqual(accepted);
    data=changeDraft(data,"comments","Changed");expect(data.signatures.monitor).toBeNull();
  }
});

test.each(['BTB','btb','B.T.B.','B T B','Beyond the Bell','BEYOND - THE - BELL','Beyond the Bell (BTB)'])('rejects division program name %s in each row', name=>{
 const d=completeDraft();d.serviceTimes.push({...d.serviceTimes[0],program:name});
 expect(validate(d,fixture).filter(e=>e.field==='program-1')[0].message).toContain('division, not the program name');
 expect(validate(d,fixture).filter(e=>e.field==='program-0')).toHaveLength(0);
});
test.each([['1%','Nonfat'],['Nonfat','1%']])('accepts distinct milk fat types %s / %s',(first,second)=>{const d=completeDraft();d.milks[0].fatType=first;d.milks[1].fatType=second;expect(validate(d,fixture).filter(e=>e.section===3)).toHaveLength(0);});
test.each(['1%','Nonfat'])('rejects same fat type despite different flavors: %s', fat=>{const d=completeDraft();d.milks.forEach(m=>m.fatType=fat);expect(validate(d,fixture).some(e=>e.message.includes('Flavor alone'))).toBe(true);});
test('requires both milks and their servings',()=>{const d=completeDraft();d.milks.pop();expect(validate(d,fixture).some(e=>e.message.includes('second milk'))).toBe(true);d.milks[0].serving='';expect(validate(d,fixture).some(e=>e.field==='milk-serving-0')).toBe(true);});
test.each([1,2,3,4])('requires component %s and serving',i=>{const d=completeDraft();d.menu[i].item='';expect(validate(d,fixture).some(e=>e.field===`menu-${i}`)).toBe(true);d.menu[i].item='Food';d.menu[i].serving='';expect(validate(d,fixture).some(e=>e.field===`menu-${i}`)).toBe(true);});
test('optional components may be blank but partial entries need a serving',()=>{const d=completeDraft();[5,6].forEach(i=>{d.menu[i].item='';d.menu[i].serving='';});expect(validate(d,fixture).filter(e=>e.section===3)).toHaveLength(0);d.menu[6].item='Extra';expect(validate(d,fixture).some(e=>e.field==='menu-6')).toBe(true);});
test('saved milk entries resume unchanged; legacy drafts require explicit fat types',()=>{
 const d=completeDraft();
 expect(resumeDraft(JSON.parse(JSON.stringify(d))).milks).toEqual(d.milks);
 delete d.milks;
 const resumed=resumeDraft(d);
 expect(resumed.milks).toEqual([{fatType:'',description:'',serving:''},{fatType:'',description:'',serving:''}]);
 expect(resumed.signatures).toEqual({monitor:null,coordinator:null});
 expect(validate(resumed,fixture).some(e=>e.field==='milk-fat-1')).toBe(true);
});
