import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prepareMplhPdfData } from "./mplhReportModel";

const fmt = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const target = (value) => value ? `${value.min}–${value.max}` : "—";
const status = (value) => ({ below: "Below Target", target: "On Target", high: "High Productivity" }[value] || "No Data");
const labelDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function download(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function drawTablePage(doc, font, bold, title, subtitle, headers, rows, widths, landscape = true) {
  const size = landscape ? [792, 612] : [612, 792];
  let page = doc.addPage(size);
  let y = size[1] - 42;
  const newPage = () => {
    page = doc.addPage(size);
    y = size[1] - 42;
  };
  const text = (value, x, yy, options = {}) => page.drawText(String(value), { x, y: yy, size: options.size || 7, font: options.bold ? bold : font, color: options.color || rgb(0.08, 0.19, 0.16), maxWidth: options.maxWidth });
  text(title, 30, y, { size: 17, bold: true });
  y -= 18;
  text(subtitle, 30, y, { size: 8, color: rgb(0.35, 0.42, 0.4) });
  y -= 22;
  const drawHeader = () => {
    let x = 30;
    headers.forEach((header, index) => { text(header, x, y, { bold: true, maxWidth: widths[index] - 3 }); x += widths[index]; });
    y -= 15;
  };
  drawHeader();
  rows.forEach((row) => {
    if (y < 35) { newPage(); drawHeader(); }
    let x = 30;
    row.forEach((value, index) => { text(value, x, y, { maxWidth: widths[index] - 3 }); x += widths[index]; });
    y -= 14;
  });
}

export async function exportMplhReportPdf(model, schoolId = null) {
  const data = prepareMplhPdfData(model, schoolId);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const range = `${labelDate(data.startDate)} – ${labelDate(data.endDate)}`;

  if (!schoolId) {
    const headers = ["School", "Type", "Coverage", "Breakfast", "Lunch", "Supper", "Meal Eq.", "Baseline", "Added", "Actual", "MPLH", "Target", "Status", "Flags"];
    const widths = [92, 58, 55, 39, 39, 36, 43, 41, 35, 38, 35, 39, 59, 28];
    const rows = data.reports.map(({ school, summary }) => [
      `${school.school_name} (${school.location_code})`, school.labor_type || "—", `${summary.daysWithMealData}/${summary.operatingDays} days`, fmt(summary.breakfast), fmt(summary.lunch), fmt(summary.supper), fmt(summary.mealEquivalents), fmt(summary.baseline), fmt(summary.added), fmt(summary.actual), fmt(summary.mplh), target(summary.target), status(summary.status), summary.dataFlags,
    ]);
    drawTablePage(doc, font, bold, data.title, `${range} • averages across daily operating records`, headers, rows, widths);
  } else {
    const report = data.reports[0];
    const s = report.summary;
    const summaryRows = [[
      `${s.operatingDays} operating / ${s.daysWithMealData} with meal data / ${s.dataFlags} flags`, fmt(s.breakfast), fmt(s.lunch), fmt(s.supper), fmt(s.mealEquivalents), fmt(s.baseline), fmt(s.added), fmt(s.actual), fmt(s.mplh), target(s.target), status(s.status),
    ]];
    drawTablePage(doc, font, bold, `${report.school.school_name} — MPLH History`, `Location ${report.school.location_code} • ${range}`, ["Coverage", "Breakfast", "Lunch", "Supper", "Meal Eq.", "Baseline", "Added", "Actual", "MPLH", "Target", "Status"], summaryRows, [165, 42, 42, 42, 48, 48, 42, 42, 42, 45, 72]);
    const dailyRows = report.daily.map((day) => [labelDate(day.date), fmt(day.breakfast, 0), fmt(day.lunch, 0), fmt(day.supper, 0), fmt(day.mealEquivalents), fmt(day.baseline), fmt(day.added), fmt(day.actual), fmt(day.mplh), target(day.target), status(day.status), day.flags.map((flag) => flag.message).join("; ") || "—"]);
    drawTablePage(doc, font, bold, `${report.school.school_name} — Daily History`, range, ["Date", "Breakfast", "Lunch", "Supper", "Meal Eq.", "Baseline", "Added", "Actual", "MPLH", "Target", "Status", "Flag"], dailyRows, [68, 45, 42, 42, 46, 45, 38, 40, 38, 42, 60, 165]);
  }
  const bytes = await doc.save();
  download(bytes, schoolId ? `mplh-history-${data.reports[0].school.location_code}-${data.startDate}-${data.endDate}.pdf` : `mplh-report-${data.startDate}-${data.endDate}.pdf`);
}
