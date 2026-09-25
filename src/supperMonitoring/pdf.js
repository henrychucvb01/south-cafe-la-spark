import { PDFDocument, StandardFonts, PDFName, PDFDict, rgb, pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject } from "pdf-lib";
import { average, findings, QUESTION_IDS, observedServices, displayTime } from "./model.js";

export class ReportFitError extends Error {
  constructor(label, section) { super(`${label} does not fit the official two-page report. Shorten this entry before submitting; nothing has been truncated.`); this.section = section; }
}
const shortDate = value => value ? `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(2, 4)}` : "";

// Coordinates were measured from the supplied template in PDF points.
// The source has duplicate field names and radio export values. Final reports
// are static: remove empty interactive widgets and overlay verified locations.
// The original PDF bytes and its printed page content are never redesigned.
export async function generateOfficialPdf(template, data, school, { monitorRole = "manager" } = {}) {
  const pdf = await PDFDocument.load(template, { updateMetadata: false });
  if (pdf.getPageCount() !== 2) throw new Error("The official template must have two pages.");
  // Preserve the exact blank Off appearance streams. Generic flattening fails
  // on this template's missing Off states and duplicate radio export values.
  // Widgets without an Off stream already have their blank outline in content.
  for (const page of pdf.getPages()) {
    const annotations = page.node.Annots();
    for (let i = 0; annotations && i < annotations.size(); i++) {
      const widget = annotations.lookup(i);
      const normal = widget.lookup(PDFName.of("AP"))?.lookup(PDFName.of("N"));
      const ref = normal instanceof PDFDict ? normal.get(PDFName.of("Off")) : null;
      if (!ref) continue;
      const stream = pdf.context.lookup(ref);
      const box = stream.dict.lookup(PDFName.of("BBox")).asArray().map(n => n.asNumber());
      const rect = widget.lookup(PDFName.of("Rect")).asArray().map(n => n.asNumber());
      const sx = (rect[2] - rect[0]) / (box[2] - box[0]), sy = (rect[3] - rect[1]) / (box[3] - box[1]);
      const name = page.node.newXObject("BlankWidget", ref);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(sx, 0, 0, sy, rect[0] - box[0] * sx, rect[1] - box[1] * sy), drawObject(name), popGraphicsState());
    }
  }
  pdf.catalog.delete(PDFName.of("AcroForm"));
  pdf.catalog.delete(PDFName.of("OpenAction"));
  pdf.catalog.delete(PDFName.of("AA"));
  const pages = pdf.getPages();
  pages.forEach(page => page.node.delete(PDFName.of("Annots")));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  function text(page, value, x, y, width, label, section, size = 9, min = 7) {
    const content = String(value ?? "").trim();
    if (!content) return;
    try {
      while (font.widthOfTextAtSize(content, size) > width && size > min) size -= 0.25;
      if (/\r|\n/.test(content) || font.widthOfTextAtSize(content, size) > width) throw new ReportFitError(label, section);
      pages[page].drawText(content, { x, y, size, font, color: rgb(0, 0, 0) });
    } catch (error) {
      if (error instanceof ReportFitError) throw error;
      const failure = new Error(`${label} contains a character the official PDF font cannot display. Review this entry before submitting.`); failure.section = section; throw failure;
    }
  }
  function lines(value, width, size, label, section) {
    const result = [];
    for (const paragraph of String(value || "").split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        let length;
        try { length = font.widthOfTextAtSize(word, size); } catch { const error = new Error(`${label} contains a character the official PDF font cannot display.`); error.section = section; throw error; }
        if (length > width) throw new ReportFitError(label, section);
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) > width) { result.push(line); line = word; } else line = candidate;
      }
      result.push(line);
    }
    return result;
  }
  function mark(page, x, y, size = 7) {
    pages[page].drawLine({ start: { x, y }, end: { x: x + size, y: y + size }, thickness: 1.1 });
    pages[page].drawLine({ start: { x, y: y + size }, end: { x: x + size, y }, thickness: 1.1 });
  }
  function signature(page, value, x, y, width, height) {
    const points = value.strokes.flat();
    const ratio = value.aspectRatio || 3;
    const xs = points.map(p => p[0] * ratio), ys = points.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(width / Math.max(maxX - minX, 0.02), height / Math.max(maxY - minY, 0.02));
    for (const stroke of value.strokes) for (let i = 1; i < stroke.length; i++) {
      const pos = p => ({ x: x + (p[0] * ratio - minX) * scale, y: y + height - (p[1] - minY) * scale });
      pages[page].drawLine({ start: pos(stroke[i - 1]), end: pos(stroke[i]), thickness: 1, color: rgb(0, 0, 0) });
    }
  }
  text(0, school.school_name, 37, 724, 179, "School name", 0);
  text(0, shortDate(data.monitoringDate), 241, 724, 72, "Monitoring date", 0);
  text(0, data.arrivalTime, 325, 724, 65, "Arrival time", 0);
  text(0, data.departureTime, 407, 724, 82, "Departure time", 0);
  mark(0, 507, 728); // Supper visits are always unannounced.
  const observed = observedServices(data);
  const serviceLabel = [...new Set(observed.map(row => `${displayTime(row.start)}-${displayTime(row.end)}`))].join("; ");
  const programLabel = [...new Set(observed.map(row => row.program))].join("; ");
  const fitSummary = (value, width) => font.widthOfTextAtSize(value, 7) <= width ? value : "See page 2";
  text(0, fitSummary(serviceLabel, 129), 301, 705, 129, "CDE-approved service time", 2);
  text(0, data.todayMeals, 527, 705, 50, "Today's meal count", 2);
  text(0, data.todayAttendance, 144, 687, 70, "Today's attendance", 2);
  text(0, fitSummary(programLabel, 270), 224, 686, 270, "After School Program name", 2);
  text(0, "0", 555, 687, 24, "Adult meals", 2, 8);
  data.history.forEach((day, i) => {
    const x = 156 + 33 * i;
    text(0, shortDate(day.date), x, 570, 28, "History date", 1, 7, 6.5);
    text(0, day.meals, x, 543, 27, "History meal count", 1, 9);
    text(0, day.attendance, x, 521, 27, "History attendance", 1, 9);
  });
  text(0, String(average(data.history)), 322, 543, 26, "Five-day average", 1, 9);
  const menuRows = [635, 618, 601, 583, 564, 543, 521];
  const menuX = [374, 400, 397, 378, 389, 400, 382];
  data.menu.forEach((item, i) => {
    if(i===0 && Array.isArray(data.milks)) {
      data.milks.slice(0,2).forEach((milk,n)=>{
        text(0,`${milk.fatType} ${milk.description}`,374,638-n*8,154,`Milk ${n+1} description`,3,7,7);
        text(0,milk.serving,535,638-n*8,45,`Milk ${n+1} serving size`,3,7,7);
      });
      return;
    }
    text(0, item.applicable && item.item.trim() ? item.item : "N/A", menuX[i], menuRows[i], 528 - menuX[i], `${item.category} menu item`, 3, 8.5);
    text(0, item.applicable ? item.serving : "", 535, menuRows[i], 45, `${item.category} serving size`, 3, 8);
  });
  const questionY = [466, 451.5, 437, 422.5, 408, 393.5, 379, 364.5, 350, 335.5, 321, 306.5, 292, 277.5, 263, 248.5, 234, 219.5, 201, 177, 156];
  QUESTION_IDS.forEach((id, index) => {
    const answer = id === "18b" && data.answers["18a"] === "no" ? "na" : data.answers[id];
    mark(0, answer === "yes" ? 512 : answer === "no" ? 545 : 571, questionY[index]);
  });
  const required = findings(data);
  if (required.length) text(0, shortDate(data.correctiveActionDue), 403, 139, 90, "Corrective-action deadline", 5);
  signature(0, data.signatures.monitor, 190, 107, 202, 17);
  signature(0, data.signatures.coordinator, 190, 83, 202, 17);
  text(0, shortDate(data.signatures.monitor.date), 445, 109, 82, "Monitor signature date", 7);
  text(0, shortDate(data.signatures.coordinator.date), 445, 85, 82, "Coordinator signature date", 7);
  mark(0, 142, 66); // ASP Coordinator; no FSM/AFSS supervisor fields are filled.
  text(1, school.school_name, 80, 708, 189, "School name", 0);
  text(1, shortDate(data.monitoringDate), 455, 708, 112, "Monitoring date", 0);
  mark(1, 37, 683); // A comment is always required.
  if (data.followUpRequired) mark(1, 129, 683);
  const detail = required.map(q => {
    const a = data.correctiveActions[q.id];
    return `Q${q.id} follow-up by ${shortDate(a.followUpDue)} (${a.operatingDays} operating days, calendar checked): ${a.followUpPlan}${a.followUpComplete ? ` Completed ${shortDate(a.followUpDate)}: ${a.followUpNotes}` : ""}`;
  });
  const comments = [school.monitoring_site_name ? `Monitoring: Supper; Site / Program: ${school.monitoring_site_name}.` : "", data.comments, ...observed.map(row => `After School Program: ${row.program}; ${row.day} CDE-approved service: ${displayTime(row.start)}-${displayTime(row.end)}.`), data.followUpRequired && !required.length ? data.extraFollowUp : "", ...detail].filter(Boolean).join("\n");
  const commentLines = lines(comments, 548, 8, "Comments and follow-up", 6);
  if (commentLines.length > 8) throw new ReportFitError("Comments and follow-up", 6);
  commentLines.forEach((line, i) => text(1, line, 31, 671 - i * 10.85, 548, "Comments and follow-up", 6, 8));
  let row = 0;
  for (const q of required) {
    const a = data.correctiveActions[q.id];
    const description = `Q${q.id}: ${a.description}${q.id === "18b" ? ` Repeated findings: ${data.repeatedFindings}` : ""}`;
    const action = `${a.action}; ${a.training}${q.id === "18b" ? ` Action to be taken: ${data.repeatedAction}` : ""}`;
    const left = lines(description, 306, 8, `Question ${q.id} finding`, 5);
    const right = lines(action, 190, 8, `Question ${q.id} corrective action`, 5);
    const height = Math.max(left.length, right.length);
    if (row + height > 16) throw new ReportFitError("Corrective-action details", 5);
    left.forEach((line, i) => text(1, line, 31, 537 - (row + i) * 10.85, 306, "Findings", 5, 8));
    right.forEach((line, i) => text(1, line, 347, 537 - (row + i) * 10.85, 189, "Corrective actions", 5, 8));
    text(1, shortDate(a.actionDate), 543, 537 - row * 10.85, 38, "Action date", 5, 8);
    row += height;
  }
  if (!required.length) text(1, "No findings requiring corrective action.", 31, 537, 306, "Findings", 5, 8);
  mark(1, data.followUpRequired ? 171 : 211, 350);
  text(1, data.monitorName, 98, 257, 201, "Monitor printed name", 7);
  text(1, data.coordinatorName, 377, 257, 201, "Coordinator printed name", 7);
  mark(1, 149, monitorRole === "supervisor" ? 218 : 242); mark(1, 390, 217);
  signature(1, data.signatures.monitor, 174, 218, 124, 20);
  signature(1, data.signatures.coordinator, 418, 218, 160, 20);
  // Page 2 has no signature-date fields; dated signatures are on page 1.
  pdf.setTitle("LAUSD Food Services Supper Program Monitoring Report");
  return pdf.save();
}
