import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export function sanitizeFilename(name) {
  return String(name || "School")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_");
}

export function isExcludedSchool(school) {
  const name = String(school?.school_name || "").toLowerCase();
  return (
    name.includes("test") ||
    name.includes("demo") ||
    name.includes("sample") ||
    school?.is_test === true ||
    school?.active === false
  );
}

const formatInt = (v) =>
  v === null || v === undefined ? "—" : Math.round(Number(v)).toLocaleString();
const formatDec = (v, digits = 1) =>
  v === null || v === undefined ? "—" : Number(v).toFixed(digits);
const formatMoney = (v) =>
  v === null || v === undefined
    ? "Unavailable"
    : Number(v).toLocaleString("en-US", { style: "currency", currency: "USD" });

// Helper to draw a scorecard on pages of a target PDFDocument
export async function appendSchoolScorecardPages(pdfDoc, card, dateRange) {
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { school, current, previous, changes, summary } = card;
  const rangeLabel = `${dateRange.startDate} to ${dateRange.endDate}`;

  // ================= PAGE 1 =================
  const page1 = pdfDoc.addPage([612, 792]); // Letter Portrait
  const { width, height } = page1.getSize();

  // Top header bar
  page1.drawRectangle({
    x: 36,
    y: height - 100,
    width: width - 72,
    height: 64,
    color: rgb(0.12, 0.22, 0.32),
  });

  page1.drawText("SPARK MONTHLY SCHOOL PERFORMANCE SCORECARD", {
    x: 48,
    y: height - 52,
    size: 9,
    font: fontBold,
    color: rgb(0.7, 0.8, 0.9),
  });

  page1.drawText(school.school_name || "School Scorecard", {
    x: 48,
    y: height - 72,
    size: 16,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page1.drawText(
    `Location: ${school.location_code || "N/A"}  |  Type: ${school.site_type || school.labor_type || "N/A"}  |  Reporting Range: ${rangeLabel}`,
    {
      x: 48,
      y: height - 88,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.85, 0.9, 0.95),
    }
  );

  // Enrollment & Operating Days pill
  page1.drawRectangle({
    x: width - 180,
    y: height - 90,
    width: 132,
    height: 44,
    color: rgb(0.18, 0.3, 0.42),
  });
  page1.drawText(
    `Enrollment: ${school.enrollment ? formatInt(school.enrollment) : "Unavailable"}`,
    {
      x: width - 172,
      y: height - 64,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1),
    }
  );
  page1.drawText(`Operating Days: ${current.operatingDays || 0}`, {
    x: width - 172,
    y: height - 80,
    size: 8.5,
    font: fontRegular,
    color: rgb(0.85, 0.92, 0.98),
  });

  // Section 01: Meal Participation
  let y = height - 126;
  page1.drawText("01  MEAL PARTICIPATION", {
    x: 36,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.32),
  });
  y -= 14;

  const meals = [
    {
      name: "Breakfast",
      total: current.totals.breakfast,
      avg: current.averages.breakfast,
      part: current.participation.breakfast,
      delta: changes.breakfastParticipation,
    },
    {
      name: "Lunch",
      total: current.totals.lunch,
      avg: current.averages.lunch,
      part: current.participation.lunch,
      delta: changes.lunchParticipation,
    },
    {
      name: "Supper",
      total: current.totals.supper,
      avg: current.averages.supper,
      part: current.participation.supper,
      delta: changes.supperParticipation,
    },
  ];

  const cardW = (width - 72 - 16) / 3;
  meals.forEach((m, idx) => {
    const cx = 36 + idx * (cardW + 8);
    page1.drawRectangle({
      x: cx,
      y: y - 68,
      width: cardW,
      height: 68,
      color: rgb(0.96, 0.97, 0.98),
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });
    page1.drawText(m.name.toUpperCase(), {
      x: cx + 10,
      y: y - 16,
      size: 10,
      font: fontBold,
      color: rgb(0.2, 0.3, 0.4),
    });
    page1.drawText(`${formatInt(m.total)} meals`, {
      x: cx + 10,
      y: y - 34,
      size: 14,
      font: fontBold,
      color: rgb(0.08, 0.14, 0.2),
    });
    page1.drawText(
      `Daily Avg: ${formatDec(m.avg)}  |  Part: ${formatDec(m.part)}%`,
      {
        x: cx + 10,
        y: y - 48,
        size: 8,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.5),
      }
    );
    if (m.delta !== null && m.delta !== undefined) {
      const sign = m.delta >= 0 ? "+" : "";
      page1.drawText(`vs Prior: ${sign}${formatDec(m.delta)} pp`, {
        x: cx + 10,
        y: y - 60,
        size: 7.5,
        font: fontRegular,
        color: m.delta >= 0 ? rgb(0.1, 0.5, 0.25) : rgb(0.7, 0.2, 0.2),
      });
    }
  });

  // Section 02: Participation Trends (Vector chart for Lunch & Breakfast)
  y -= 96;
  page1.drawText(
    "02  PARTICIPATION TRENDS (Orange = Breakfast, Green = Lunch)",
    {
      x: 36,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.12, 0.22, 0.32),
    }
  );

  y -= 14;
  const chartH = 150;
  const chartW = width - 72;
  const chartBoxY = y - chartH;

  page1.drawRectangle({
    x: 36,
    y: chartBoxY,
    width: chartW,
    height: chartH,
    color: rgb(0.98, 0.99, 1),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });

  // Draw chart gridlines
  for (let grid = 0; grid <= 4; grid++) {
    const gy = chartBoxY + 24 + grid * 26;
    page1.drawLine({
      start: { x: 60, y: gy },
      end: { x: 36 + chartW - 14, y: gy },
      color: rgb(0.9, 0.92, 0.94),
      thickness: 1,
    });
    page1.drawText(`${grid * 25}%`, {
      x: 40,
      y: gy - 3,
      size: 7,
      font: fontRegular,
      color: rgb(0.5, 0.55, 0.6),
    });
  }

  // Plot trend points if available
  const trend = current.lunchTrend || [];
  if (trend.length > 0) {
    const usableW = chartW - 54;
    const stepX = trend.length > 1 ? usableW / (trend.length - 1) : usableW / 2;

    for (let i = 0; i < trend.length; i++) {
      const currPt = trend[i];
      const px = 62 + i * stepX;

      // Draw date labels every few points
      if (i % Math.max(1, Math.floor(trend.length / 8)) === 0) {
        page1.drawText(currPt.date.slice(5), {
          x: px - 8,
          y: chartBoxY + 8,
          size: 7,
          font: fontRegular,
          color: rgb(0.5, 0.55, 0.6),
        });
      }

      if (i > 0) {
        const prevPt = trend[i - 1];
        const prevX = 62 + (i - 1) * stepX;

        // Lunch Line (Green)
        if (prevPt.participation !== null && currPt.participation !== null) {
          const prevY =
            chartBoxY + 24 + Math.min(100, Math.max(0, prevPt.participation)) * 1.04;
          const currY =
            chartBoxY + 24 + Math.min(100, Math.max(0, currPt.participation)) * 1.04;
          page1.drawLine({
            start: { x: prevX, y: prevY },
            end: { x: px, y: currY },
            color: rgb(0.09, 0.52, 0.35),
            thickness: 2,
          });
        }

        // Breakfast Line (Orange)
        if (
          prevPt.breakfastParticipation !== null &&
          currPt.breakfastParticipation !== null
        ) {
          const prevY =
            chartBoxY +
            24 +
            Math.min(100, Math.max(0, prevPt.breakfastParticipation)) * 1.04;
          const currY =
            chartBoxY +
            24 +
            Math.min(100, Math.max(0, currPt.breakfastParticipation)) * 1.04;
          page1.drawLine({
            start: { x: prevX, y: prevY },
            end: { x: px, y: currY },
            color: rgb(0.9, 0.58, 0.18),
            thickness: 1.5,
          });
        }
      }
    }
  }

  // Section 03: MPLH & Labor
  y = chartBoxY - 26;
  page1.drawText("03  MPLH & LABOR PRODUCTIVITY", {
    x: 36,
    y,
    size: 11,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.32),
  });

  y -= 14;
  const mplhBoxH = 74;
  page1.drawRectangle({
    x: 36,
    y: y - mplhBoxH,
    width: chartW,
    height: mplhBoxH,
    color: rgb(0.96, 0.98, 0.96),
    borderColor: rgb(0.85, 0.9, 0.85),
    borderWidth: 1,
  });

  page1.drawText(
    `Average MPLH: ${formatDec(current.averageMplh)}  (Target: ${
      current.target?.min !== null ? `${current.target.min}–${current.target.max}` : "N/A"
    })`,
    {
      x: 48,
      y: y - 20,
      size: 11,
      font: fontBold,
      color: rgb(0.1, 0.3, 0.15),
    }
  );

  page1.drawText(
    `Total Labor Hours: ${formatDec(current.laborHours)}  |  Estimated Wages: ${
      current.laborCost !== null ? formatMoney(current.laborCost) : "Unavailable"
    }`,
    {
      x: 48,
      y: y - 38,
      size: 9,
      font: fontRegular,
      color: rgb(0.2, 0.25, 0.3),
    }
  );

  page1.drawText(
    `Days Meeting Target: ${current.daysMeetingTarget ?? "—"}  |  Days Below Target: ${
      current.daysBelowTarget ?? "—"
    }`,
    {
      x: 48,
      y: y - 56,
      size: 9,
      font: fontRegular,
      color: rgb(0.2, 0.25, 0.3),
    }
  );

  // Footer page 1
  page1.drawText("SPARK Monthly Scorecard • Page 1 of 2", {
    x: 36,
    y: 20,
    size: 8,
    font: fontRegular,
    color: rgb(0.6, 0.65, 0.7),
  });

  // ================= PAGE 2 =================
  const page2 = pdfDoc.addPage([612, 792]);
  let y2 = height - 48;

  // Header mini banner
  page2.drawRectangle({
    x: 36,
    y: y2 - 28,
    width: width - 72,
    height: 32,
    color: rgb(0.12, 0.22, 0.32),
  });
  page2.drawText(
    `${school.school_name} — Scorecard Detail (Period: ${rangeLabel})`,
    {
      x: 48,
      y: y2 - 18,
      size: 11,
      font: fontBold,
      color: rgb(1, 1, 1),
    }
  );

  y2 -= 46;

  // Section 04: Menu Performance
  page2.drawText("04  TOP ENTRÉE PERFORMANCE", {
    x: 36,
    y: y2,
    size: 11,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.32),
  });
  y2 -= 14;

  const bTop = current.menuRankings?.breakfast || [];
  const lTop = current.menuRankings?.lunch || [];
  const halfW = (width - 72 - 12) / 2;

  // Breakfast box
  page2.drawRectangle({
    x: 36,
    y: y2 - 62,
    width: halfW,
    height: 62,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });
  page2.drawText("Breakfast Top Entrées", {
    x: 44,
    y: y2 - 14,
    size: 9,
    font: fontBold,
    color: rgb(0.2, 0.25, 0.3),
  });
  if (bTop.length === 0) {
    page2.drawText("No qualifying breakfast entrées recorded.", {
      x: 44,
      y: y2 - 30,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  } else {
    bTop.slice(0, 2).forEach((it, idx) => {
      page2.drawText(
        `${it.rank}. ${it.name.slice(0, 28)} (${formatInt(it.served)} served)`,
        {
          x: 44,
          y: y2 - 28 - idx * 14,
          size: 8,
          font: fontRegular,
          color: rgb(0.1, 0.1, 0.1),
        }
      );
    });
  }

  // Lunch box
  page2.drawRectangle({
    x: 36 + halfW + 12,
    y: y2 - 62,
    width: halfW,
    height: 62,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });
  page2.drawText("Lunch Top Entrées", {
    x: 44 + halfW + 12,
    y: y2 - 14,
    size: 9,
    font: fontBold,
    color: rgb(0.2, 0.25, 0.3),
  });
  if (lTop.length === 0) {
    page2.drawText("No qualifying lunch entrées recorded.", {
      x: 44 + halfW + 12,
      y: y2 - 30,
      size: 8,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  } else {
    lTop.slice(0, 2).forEach((it, idx) => {
      page2.drawText(
        `${it.rank}. ${it.name.slice(0, 28)} (${formatInt(it.served)} served)`,
        {
          x: 44 + halfW + 12,
          y: y2 - 28 - idx * 14,
          size: 8,
          font: fontRegular,
          color: rgb(0.1, 0.1, 0.1),
        }
      );
    });
  }

  // Section 05: Forecasting & Leftovers
  y2 -= 82;
  page2.drawText("05  FORECASTING & LEFTOVERS", {
    x: 36,
    y: y2,
    size: 11,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.32),
  });
  y2 -= 14;

  const prod = current.productionTotals || {};
  page2.drawRectangle({
    x: 36,
    y: y2 - 60,
    width: width - 72,
    height: 60,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });

  page2.drawText(
    `Planned: ${formatInt(prod.planned)}   |   Prepared: ${formatInt(prod.prepared)}   |   Served: ${formatInt(prod.served)}   |   Leftover: ${formatInt(prod.leftover)}   |   Leftover %: ${formatDec(prod.leftoverPercentage)}%`,
    {
      x: 46,
      y: y2 - 20,
      size: 9,
      font: fontBold,
      color: rgb(0.1, 0.2, 0.3),
    }
  );

  const worst = current.worstItems || [];
  const worstText = worst.length
    ? `Highest leftover items: ${worst.map((w) => `${w.name} (${formatDec(w.leftoverPercentage)}%)`).join(", ")}`
    : "No items exceeded the leftover threshold.";
  page2.drawText(worstText.slice(0, 110), {
    x: 46,
    y: y2 - 42,
    size: 8,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.5),
  });

  // Section 06: Financial Snapshot (Reimbursement rates NOT exposed)
  y2 -= 80;
  page2.drawText(
    "06  FINANCIAL SNAPSHOT (Food & Labor Costs, Cost Per Meal)",
    {
      x: 36,
      y: y2,
      size: 11,
      font: fontBold,
      color: rgb(0.12, 0.22, 0.32),
    }
  );
  y2 -= 14;

  page2.drawRectangle({
    x: 36,
    y: y2 - 64,
    width: width - 72,
    height: 64,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });

  page2.drawText(
    `Total Food Cost: ${current.totalCost !== null ? formatMoney(current.totalCost) : "Unavailable"}    |    Food Cost / Meal: ${
      current.foodCostPerMeal !== null ? formatMoney(current.foodCostPerMeal) : "Unavailable"
    }`,
    {
      x: 46,
      y: y2 - 22,
      size: 9.5,
      font: fontBold,
      color: rgb(0.1, 0.2, 0.3),
    }
  );

  page2.drawText(
    `Estimated Wages: ${current.laborCost !== null ? formatMoney(current.laborCost) : "Unavailable"}    |    Total Meal Revenue: ${formatMoney(current.revenue)}`,
    {
      x: 46,
      y: y2 - 44,
      size: 9,
      font: fontRegular,
      color: rgb(0.3, 0.35, 0.4),
    }
  );

  // Section 07: Management Focus
  y2 -= 84;
  page2.drawText("07  MANAGEMENT FOCUS & SUMMARY", {
    x: 36,
    y: y2,
    size: 11,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.32),
  });
  y2 -= 14;

  const focusKeys = [
    { label: "WIN", text: summary?.win },
    { label: "WATCH", text: summary?.watch },
    { label: "ACTION", text: summary?.action },
    { label: "GOAL", text: summary?.goal },
  ];

  const itemW = (width - 72 - 18) / 2;
  focusKeys.forEach((item, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const fx = 36 + col * (itemW + 18);
    const fy = y2 - row * 56;

    page2.drawRectangle({
      x: fx,
      y: fy - 48,
      width: itemW,
      height: 48,
      color: rgb(0.96, 0.98, 0.99),
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });

    page2.drawText(item.label, {
      x: fx + 10,
      y: fy - 16,
      size: 8.5,
      font: fontBold,
      color: rgb(0.1, 0.4, 0.6),
    });

    const body = String(item.text || "No notes available.").slice(0, 95);
    page2.drawText(body, {
      x: fx + 10,
      y: fy - 32,
      size: 8,
      font: fontRegular,
      color: rgb(0.2, 0.25, 0.3),
    });
  });

  // Footer page 2
  page2.drawText("SPARK Monthly Scorecard • Page 2 of 2", {
    x: 36,
    y: 20,
    size: 8,
    font: fontRegular,
    color: rgb(0.6, 0.65, 0.7),
  });
}

// Download PDF helper
export function triggerPdfDownload(pdfBytes, filename) {
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 1. Export Single School PDF
export async function exportSingleSchoolPdf(card, dateRange) {
  const pdfDoc = await PDFDocument.create();
  await appendSchoolScorecardPages(pdfDoc, card, dateRange);
  const pdfBytes = await pdfDoc.save();

  const safeSchool = sanitizeFilename(card.school.school_name);
  const filename = `${safeSchool}_SPARK_Scorecard_${dateRange.startDate}_to_${dateRange.endDate}.pdf`;
  triggerPdfDownload(pdfBytes, filename);
}

// 2. Export All Schools Combined PDF
export async function exportAllSchoolsPdf(cards, dateRange, onProgress) {
  const pdfDoc = await PDFDocument.create();
  const eligibleCards = cards.filter(
    (card) =>
      !isExcludedSchool(card.school) &&
      (card.current.hasMeals || card.current.hasProduction || card.current.hasCost)
  );

  if (eligibleCards.length === 0) {
    throw new Error(
      "No eligible schools with scorecard data found for this date range."
    );
  }

  for (let i = 0; i < eligibleCards.length; i++) {
    const card = eligibleCards[i];
    if (onProgress) {
      onProgress(i + 1, eligibleCards.length, card.school.school_name);
    }
    await appendSchoolScorecardPages(pdfDoc, card, dateRange);
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `SPARK_Scorecards_${dateRange.startDate}_to_${dateRange.endDate}.pdf`;
  triggerPdfDownload(pdfBytes, filename);

  return {
    exportedCount: eligibleCards.length,
    skippedCount: cards.length - eligibleCards.length,
  };
}
