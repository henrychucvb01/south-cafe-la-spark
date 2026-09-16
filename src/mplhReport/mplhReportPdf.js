import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prepareMplhPdfData } from "./mplhReportModel";

const C = {
  ink: rgb(0.04, 0.18, 0.15), muted: rgb(0.37, 0.44, 0.41), green: rgb(0.04, 0.34, 0.25),
  green2: rgb(0.08, 0.53, 0.36), mint: rgb(0.91, 0.97, 0.94), line: rgb(0.82, 0.87, 0.84),
  pale: rgb(0.97, 0.98, 0.98), amber: rgb(0.86, 0.52, 0.08), amberPale: rgb(1, 0.96, 0.87),
  red: rgb(0.72, 0.2, 0.19), redPale: rgb(1, 0.92, 0.91), blue: rgb(0.18, 0.43, 0.63),
  bluePale: rgb(0.91, 0.96, 0.99), white: rgb(1, 1, 1),
};

const fmt = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : "N/A";
const target = (value) => value ? `${value.min}-${value.max}` : "N/A";
const status = (value) => ({ below: "Below Target", target: "On Target", high: "High Productivity" }[value] || "No Data");
const typeLabel = (value) => ({ secondary: "Secondary", elementary_prep: "Elementary Prep", elementary_nnc: "Elementary NNC", special: "Special" }[value] || "N/A");
const labelDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function statusStyle(value) {
  if (value === "target") return { fill: C.mint, text: C.green2 };
  if (value === "below") return { fill: C.redPale, text: C.red };
  if (value === "high") return { fill: C.amberPale, text: C.amber };
  return { fill: C.bluePale, text: C.blue };
}

function fitText(text, font, size, width) {
  const value = String(text ?? "");
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  let shortened = value;
  while (shortened.length && font.widthOfTextAtSize(`${shortened}...`, size) > width) shortened = shortened.slice(0, -1);
  return `${shortened}...`;
}

function pageChrome(page, fonts, title, subtitle, pageNumber) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 86, width, height: 86, color: C.green });
  page.drawRectangle({ x: 0, y: height - 90, width, height: 4, color: C.green2 });
  page.drawText("SPARK", { x: 30, y: height - 36, size: 10, font: fonts.bold, color: rgb(0.55, 0.92, 0.76) });
  page.drawText(title, { x: 30, y: height - 60, size: 19, font: fonts.bold, color: C.white });
  page.drawText(subtitle, { x: 30, y: height - 76, size: 8.5, font: fonts.regular, color: rgb(0.83, 0.92, 0.88) });
  page.drawText(`Page ${pageNumber}`, { x: width - 68, y: 18, size: 8, font: fonts.regular, color: C.muted });
  page.drawText("South Cafe LA - Labor Productivity", { x: 30, y: 18, size: 8, font: fonts.regular, color: C.muted });
}

function drawSectionTitle(page, fonts, title, y) {
  page.drawText(title.toUpperCase(), { x: 30, y, size: 9, font: fonts.bold, color: C.green });
  page.drawLine({ start: { x: 30, y: y - 6 }, end: { x: page.getWidth() - 30, y: y - 6 }, thickness: 1, color: C.line });
  return y - 18;
}

function drawMetricCards(page, fonts, cards, y) {
  const gap = 8;
  const margin = 30;
  const width = (page.getWidth() - margin * 2 - gap * (cards.length - 1)) / cards.length;
  cards.forEach((card, index) => {
    const x = margin + index * (width + gap);
    page.drawRectangle({ x, y: y - 58, width, height: 58, color: card.fill || C.pale, borderColor: C.line, borderWidth: 0.7 });
    page.drawText(card.label.toUpperCase(), { x: x + 10, y: y - 16, size: 6.7, font: fonts.bold, color: C.muted });
    page.drawText(fitText(card.value, fonts.bold, 16, width - 20), { x: x + 10, y: y - 39, size: 16, font: fonts.bold, color: card.color || C.green });
    if (card.note) page.drawText(fitText(card.note, fonts.regular, 6.5, width - 20), { x: x + 10, y: y - 51, size: 6.5, font: fonts.regular, color: C.muted });
  });
  return y - 70;
}

function drawTable(page, fonts, columns, rows, y, options = {}) {
  const x0 = 30;
  const rowHeight = options.rowHeight || 19;
  const headerHeight = 23;
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  page.drawRectangle({ x: x0, y: y - headerHeight, width: tableWidth, height: headerHeight, color: C.green });
  let x = x0;
  columns.forEach((column) => {
    page.drawText(column.label, { x: x + 5, y: y - 15, size: options.headerSize || 6.5, font: fonts.bold, color: C.white, maxWidth: column.width - 8 });
    x += column.width;
  });
  y -= headerHeight;
  rows.forEach((row, rowIndex) => {
    page.drawRectangle({ x: x0, y: y - rowHeight, width: tableWidth, height: rowHeight, color: rowIndex % 2 ? C.pale : C.white });
    x = x0;
    columns.forEach((column) => {
      const value = column.value(row);
      if (column.status) {
        const style = statusStyle(value);
        const label = status(value);
        const badgeWidth = Math.min(column.width - 8, fonts.bold.widthOfTextAtSize(label, 6.2) + 10);
        page.drawRectangle({ x: x + 4, y: y - rowHeight + 4, width: badgeWidth, height: rowHeight - 8, color: style.fill });
        page.drawText(label, { x: x + 9, y: y - rowHeight + 8, size: 6.2, font: fonts.bold, color: style.text });
      } else {
        page.drawText(fitText(value, column.bold ? fonts.bold : fonts.regular, options.bodySize || 6.6, column.width - 9), { x: x + 5, y: y - rowHeight + 7, size: options.bodySize || 6.6, font: column.bold ? fonts.bold : fonts.regular, color: column.color ? column.color(row) : C.ink });
      }
      x += column.width;
    });
    page.drawLine({ start: { x: x0, y: y - rowHeight }, end: { x: x0 + tableWidth, y: y - rowHeight }, thickness: 0.35, color: C.line });
    y -= rowHeight;
  });
  return y;
}

function addAllSchoolsPages(doc, fonts, data) {
  const range = `${labelDate(data.startDate)} - ${labelDate(data.endDate)}`;
  const columns = [
    { label: "School", width: 96, value: (r) => `${r.school.school_name} (${r.school.location_code})`, bold: true },
    { label: "Type", width: 63, value: (r) => typeLabel(r.school.labor_type) },
    { label: "Coverage", width: 58, value: (r) => `${r.summary.daysWithMealData}/${r.summary.operatingDays} days` },
    { label: "Brkfst", width: 39, value: (r) => fmt(r.summary.breakfast) },
    { label: "Lunch", width: 39, value: (r) => fmt(r.summary.lunch) },
    { label: "Supper", width: 39, value: (r) => fmt(r.summary.supper) },
    { label: "Meal Eq.", width: 43, value: (r) => fmt(r.summary.mealEquivalents) },
    { label: "Baseline", width: 42, value: (r) => fmt(r.summary.baseline) },
    { label: "Added", width: 36, value: (r) => fmt(r.summary.added) },
    { label: "Actual", width: 39, value: (r) => fmt(r.summary.actual) },
    { label: "MPLH", width: 38, value: (r) => fmt(r.summary.mplh), bold: true },
    { label: "Target", width: 41, value: (r) => target(r.summary.target) },
    { label: "Status", width: 72, value: (r) => r.summary.status, status: true },
    { label: "Flags", width: 33, value: (r) => String(r.summary.dataFlags), color: (r) => r.summary.dataFlags ? C.amber : C.muted },
  ];
  const chunks = [];
  for (let index = 0; index < data.reports.length; index += 20) chunks.push(data.reports.slice(index, index + 20));
  chunks.forEach((rows, index) => {
    const page = doc.addPage([792, 612]);
    pageChrome(page, fonts, "South Cafe LA MPLH Report", `${range} | Daily operating-record averages | All schools`, index + 1);
    let y = 500;
    if (index === 0) {
      const totalFlags = data.reports.reduce((sum, report) => sum + report.summary.dataFlags, 0);
      const totalMealDays = data.reports.reduce((sum, report) => sum + report.summary.daysWithMealData, 0);
      y = drawMetricCards(page, fonts, [
        { label: "Schools", value: data.reports.length, note: "Active report locations" },
        { label: "Operating Days", value: Math.max(0, ...data.reports.map((r) => r.summary.operatingDays)), note: "Selected-range weekdays" },
        { label: "Meal-Data Days", value: totalMealDays, note: "Across all schools", fill: C.mint },
        { label: "Data Flags", value: totalFlags, note: totalFlags ? "Review flagged records" : "No issues found", fill: totalFlags ? C.amberPale : C.mint, color: totalFlags ? C.amber : C.green2 },
      ], y);
      y = drawSectionTitle(page, fonts, "School Labor Productivity", y);
    } else y = drawSectionTitle(page, fonts, "School Labor Productivity - Continued", y);
    drawTable(page, fonts, columns, rows, y, { rowHeight: 18, bodySize: 6.2, headerSize: 6.1 });
  });
}

function addSchoolPages(doc, fonts, data) {
  const report = data.reports[0];
  const s = report.summary;
  const range = `${labelDate(data.startDate)} - ${labelDate(data.endDate)}`;
  let pageNumber = 1;
  let page = doc.addPage([792, 612]);
  pageChrome(page, fonts, `${report.school.school_name} - MPLH History`, `Location ${report.school.location_code} | ${typeLabel(report.school.labor_type)} | ${range}`, pageNumber);
  let y = 500;
  const style = statusStyle(s.status);
  y = drawMetricCards(page, fonts, [
    { label: "Operating Days", value: s.operatingDays, note: `${s.daysWithMealData} with meal data` },
    { label: "Data Flags", value: s.dataFlags, note: s.dataFlags ? "Review daily details" : "No issues found", fill: s.dataFlags ? C.amberPale : C.mint, color: s.dataFlags ? C.amber : C.green2 },
    { label: "Average MPLH", value: fmt(s.mplh), note: `Target ${target(s.target)}`, fill: style.fill, color: style.text },
    { label: "Status", value: status(s.status), note: "Selected-range average", fill: style.fill, color: style.text },
  ], y);
  y = drawSectionTitle(page, fonts, "Selected-Range Averages", y);
  y = drawMetricCards(page, fonts, [
    { label: "Breakfast", value: fmt(s.breakfast) }, { label: "Lunch", value: fmt(s.lunch) },
    { label: "Supper", value: fmt(s.supper) }, { label: "Meal Equiv.", value: fmt(s.mealEquivalents) },
    { label: "Baseline", value: fmt(s.baseline) }, { label: "Added Hrs", value: fmt(s.added) },
    { label: "Actual Hrs", value: fmt(s.actual) },
  ], y);
  y = drawSectionTitle(page, fonts, "Daily MPLH History", y);

  const columns = [
    { label: "Date", width: 63, value: (d) => labelDate(d.date), bold: true },
    { label: "Brkfst", width: 39, value: (d) => fmt(d.breakfast, 0) }, { label: "Lunch", width: 39, value: (d) => fmt(d.lunch, 0) },
    { label: "Supper", width: 39, value: (d) => fmt(d.supper, 0) }, { label: "Meal Eq.", width: 45, value: (d) => fmt(d.mealEquivalents) },
    { label: "Baseline", width: 43, value: (d) => fmt(d.baseline) }, { label: "Added", width: 37, value: (d) => fmt(d.added) },
    { label: "Actual", width: 39, value: (d) => fmt(d.actual) }, { label: "MPLH", width: 39, value: (d) => fmt(d.mplh), bold: true },
    { label: "Target", width: 41, value: (d) => target(d.target) }, { label: "Status", width: 72, value: (d) => d.status, status: true },
    { label: "Data Flag", width: 196, value: (d) => d.flags.map((flag) => flag.message).join("; ") || "None", color: (d) => d.flags.length ? C.amber : C.muted },
  ];
  const firstCapacity = Math.max(1, Math.floor((y - 40) / 20) - 1);
  const chunks = [report.daily.slice(0, firstCapacity)];
  for (let index = firstCapacity; index < report.daily.length; index += 23) chunks.push(report.daily.slice(index, index + 23));
  drawTable(page, fonts, columns, chunks[0], y, { rowHeight: 20, bodySize: 6.3, headerSize: 6.2 });
  chunks.slice(1).forEach((rows) => {
    pageNumber += 1;
    page = doc.addPage([792, 612]);
    pageChrome(page, fonts, `${report.school.school_name} - Daily MPLH History`, range, pageNumber);
    y = drawSectionTitle(page, fonts, "Daily MPLH History - Continued", 500);
    drawTable(page, fonts, columns, rows, y, { rowHeight: 20, bodySize: 6.3, headerSize: 6.2 });
  });
}

export async function createMplhReportPdfBytes(model, schoolId = null) {
  const data = prepareMplhPdfData(model, schoolId);
  const doc = await PDFDocument.create();
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  if (schoolId) addSchoolPages(doc, fonts, data);
  else addAllSchoolsPages(doc, fonts, data);
  return doc.save();
}

function download(bytes, filename) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportMplhReportPdf(model, schoolId = null) {
  const data = prepareMplhPdfData(model, schoolId);
  const bytes = await createMplhReportPdfBytes(model, schoolId);
  download(bytes, schoolId ? `mplh-history-${data.reports[0].school.location_code}-${data.startDate}-${data.endDate}.pdf` : `mplh-report-${data.startDate}-${data.endDate}.pdf`);
}
