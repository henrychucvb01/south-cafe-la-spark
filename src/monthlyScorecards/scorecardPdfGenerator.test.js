import { PDFDocument } from "pdf-lib";
import { appendSchoolScorecardPages } from "./scorecardPdfGenerator";

const makeCard = () => {
  const item={rank:1,name:"Beef & Cheese Burrito with a deliberately long printable menu name",served:120,strongestWeekLabel:"Week of Aug 24",prepared:140,leftover:15,wasted:5,wastePercentage:3.6,carryoverPercentage:10.7,serviceDays:4};
  const current={
    operatingDays:14,totals:{breakfast:900,lunch:1800,supper:200},averages:{breakfast:64.3,lunch:128.6,supper:14.3},participation:{breakfast:30,lunch:60,supper:6.7},
    participationTrend:[{date:"2026-08-12",breakfastParticipation:30,lunchParticipation:60},{date:"2026-08-13",breakfastParticipation:32,lunchParticipation:63}],
    target:{min:18,max:20},averageMplh:19.2,laborHours:100,budgetedLaborHours:8,daysMeetingTarget:12,daysBelowTarget:2,laborCost:2800,
    breakfastCostPerMeal:1.2,lunchCostPerMeal:1.8,totalCost:4320,revenues:{breakfast:3672,lunch:10620,supper:1180},revenue:15472,
    menuRankings:{breakfast:[item,item,item],lunch:[item,item,item]},productionTotals:{planned:4200,prepared:4000,served:3700,leftover:260,wasted:40,wastePercentage:1},
    weekly:[{label:"Aug 10-Aug 14",prepared:2000,served:1850,leftover:130,wasted:20,carryoverPercentage:6.5,wastePercentage:1}],worstItems:[item],highCarryoverItems:[item],forecastObservation:"Carryover remained above waste and should be reviewed before the next menu cycle.",
  };
  return {school:{school_name:"BANNING HS",location_code:"8529",site_type:"PREP",enrollment:2165},current,changes:{breakfastParticipation:1,lunchParticipation:2,supperParticipation:0,mplh:0.8},summary:{win:"Lunch improved.",watch:"Waste requires monitoring.",action:"Review production quantities.",goal:"Keep lunch participation at or above 60%."}};
};

test("renders the complete shared scorecard as three PDF pages", async () => {
  const card=makeCard();
  const doc=await PDFDocument.create();
  await appendSchoolScorecardPages(doc,card,{startDate:"2026-08-01",endDate:"2026-08-31"},{PDFDocument,rgb:(await import("pdf-lib")).rgb,StandardFonts:(await import("pdf-lib")).StandardFonts});
  expect(doc.getPageCount()).toBe(3);
  const bytes=await doc.save();
  expect(bytes.length).toBeGreaterThan(1000);
});

test("reuses the complete three-page scorecard for every Export All school", async () => {
  const helpers={PDFDocument,rgb:(await import("pdf-lib")).rgb,StandardFonts:(await import("pdf-lib")).StandardFonts};
  const doc=await PDFDocument.create();
  await appendSchoolScorecardPages(doc,makeCard(),{startDate:"2026-08-01",endDate:"2026-08-31"},helpers);
  await appendSchoolScorecardPages(doc,makeCard(),{startDate:"2026-08-01",endDate:"2026-08-31"},helpers);
  expect(doc.getPageCount()).toBe(6);
});
