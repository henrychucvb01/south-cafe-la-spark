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
    school?.is_test === true
  );
}

const formatInt = (v) =>
  v === null || v === undefined ? "N/A" : Math.round(Number(v)).toLocaleString();
const formatDec = (v, digits = 1) =>
  v === null || v === undefined ? "N/A" : Number(v).toFixed(digits);
const formatMoney = (v) =>
  v === null || v === undefined
    ? "Unavailable"
    : Number(v).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      });

function pdfText(value) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u00B7]/g, "|")
    .replace(/\uFFFD/g, "-")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function makePdfTextSafe(page) {
  const drawText = page.drawText.bind(page);
  page.drawText = (text, options) => drawText(pdfText(text), options);
  return page;
}

function wrapText(text, font, size, maxWidth) {
  const words = pdfText(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  });
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(page, text, { x, y, width, size, font, color, lineHeight = size + 2, maxLines }) {
  const lines = wrapText(text, font, size, width);
  const shown = maxLines ? lines.slice(0, maxLines) : lines;
  shown.forEach((line, index) => page.drawText(line, { x, y: y - index * lineHeight, size, font, color }));
  return shown.length * lineHeight;
}

export async function appendSchoolScorecardPages(pdfDoc, card, dateRange, pdfLib) {
  const { rgb, StandardFonts } = pdfLib;
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { school, current, changes, summary } = card;
  const rangeLabel = `${dateRange.startDate} to ${dateRange.endDate}`;

  // ================= PAGE 1 =================
  const page1 = makePdfTextSafe(pdfDoc.addPage([612, 792]));
  const { width, height } = page1.getSize();

  // Header Banner
  page1.drawRectangle({
    x: 36,
    y: height - 96,
    width: width - 72,
    height: 60,
    color: rgb(0.12, 0.22, 0.32),
  });

  page1.drawText("SPARK MONTHLY SCHOOL PERFORMANCE SCORECARD", {
    x: 48,
    y: height - 50,
    size: 8.5,
    font: fontBold,
    color: rgb(0.7, 0.8, 0.9),
  });

  page1.drawText(school.school_name || "School Scorecard", {
    x: 48,
    y: height - 70,
    size: 15,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  page1.drawText(
    `Location: ${school.location_code || "N/A"}  |  Type: ${school.site_type || school.labor_type || "N/A"}  |  Period: ${rangeLabel}`,
    {
      x: 48,
      y: height - 85,
      size: 8,
      font: fontRegular,
      color: rgb(0.85, 0.9, 0.95),
    }
  );

  page1.drawRectangle({
    x: width - 175,
    y: height - 88,
    width: 125,
    height: 44,
    color: rgb(0.18, 0.3, 0.42),
  });
  page1.drawText(
    `Enrollment: ${school.enrollment ? formatInt(school.enrollment) : "Unavailable"}`,
    {
      x: width - 167,
      y: height - 63,
      size: 8.5,
      font: fontBold,
      color: rgb(1, 1, 1),
    }
  );
  page1.drawText(`Operating Days: ${current.operatingDays || 0}`, {
    x: width - 167,
    y: height - 78,
    size: 8,
    font: fontRegular,
    color: rgb(0.85, 0.92, 0.98),
  });

  // 1. Participation KPIs
  let y = height - 120;
  page1.drawText("01  MEAL PARTICIPATION", {
    x: 36,
    y,
    size: 10.5,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.32),
  });
  y -= 14;

  const meals = [
    {
      name: "Breakfast",
      total: current.totals?.breakfast,
      avg: current.averages?.breakfast,
      part: current.participation?.breakfast,
      delta: changes?.breakfastParticipation,
    },
    {
      name: "Lunch",
      total: current.totals?.lunch,
      avg: current.averages?.lunch,
      part: current.participation?.lunch,
      delta: changes?.lunchParticipation,
    },
    {
      name: "Supper",
      total: current.totals?.supper,
      avg: current.averages?.supper,
      part: current.participation?.supper,
      delta: changes?.supperParticipation,
    },
  ];

  const cardW = (width - 72 - 16) / 3;
  meals.forEach((m, idx) => {
    const cx = 36 + idx * (cardW + 8);
    page1.drawRectangle({
      x: cx,
      y: y - 64,
      width: cardW,
      height: 64,
      color: rgb(0.96, 0.97, 0.98),
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });
    page1.drawText(m.name.toUpperCase(), {
      x: cx + 10,
      y: y - 16,
      size: 9.5,
      font: fontBold,
      color: rgb(0.2, 0.3, 0.4),
    });
    page1.drawText(`${formatInt(m.total)} meals`, {
      x: cx + 10,
      y: y - 32,
      size: 13,
      font: fontBold,
      color: rgb(0.08, 0.14, 0.2),
    });
    page1.drawText(
      `Daily Avg: ${formatDec(m.avg)}  |  Part: ${formatDec(m.part)}%`,
      {
        x: cx + 10,
        y: y - 46,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.4, 0.45, 0.5),
      }
    );
    if (m.delta !== null && m.delta !== undefined) {
      page1.drawText(
        `vs Prior: ${m.delta >= 0 ? "+" : ""}${formatDec(m.delta)} pp`,
        {
          x: cx + 10,
          y: y - 57,
          size: 7,
          font: fontRegular,
          color: m.delta >= 0 ? rgb(0.1, 0.5, 0.25) : rgb(0.7, 0.2, 0.2),
        }
      );
    }
  });

  // Participation Trend Vector Chart
  y -= 88;
  page1.drawText(
    "PARTICIPATION TREND (Orange = Breakfast % | Green = Lunch %)",
    {
      x: 36,
      y,
      size: 9.5,
      font: fontBold,
      color: rgb(0.2, 0.3, 0.4),
    }
  );

  y -= 12;
  const chartH = 135;
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

  for (let grid = 0; grid <= 4; grid++) {
    const gy = chartBoxY + 20 + grid * 24;
    page1.drawLine({
      start: { x: 58, y: gy },
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

  const trend = current.participationTrend || [];
  if (trend.length > 0) {
    const usableW = chartW - 54;
    const stepX = trend.length > 1 ? usableW / (trend.length - 1) : usableW / 2;

    for (let i = 0; i < trend.length; i++) {
      const currPt = trend[i];
      const px = 60 + i * stepX;

      if (i % Math.max(1, Math.floor(trend.length / 8)) === 0) {
        page1.drawText(String(currPt.date || "").slice(5), {
          x: px - 8,
          y: chartBoxY + 6,
          size: 6.5,
          font: fontRegular,
          color: rgb(0.5, 0.55, 0.6),
        });
      }

      if (i > 0) {
        const prevPt = trend[i - 1];
        const prevX = 60 + (i - 1) * stepX;

        if (
          prevPt.lunchParticipation !== null &&
          currPt.lunchParticipation !== null
        ) {
          const prevY =
            chartBoxY +
            20 +
            Math.min(100, Math.max(0, prevPt.lunchParticipation)) * 0.96;
          const currY =
            chartBoxY +
            20 +
            Math.min(100, Math.max(0, currPt.lunchParticipation)) * 0.96;
          page1.drawLine({
            start: { x: prevX, y: prevY },
            end: { x: px, y: currY },
            color: rgb(0.09, 0.52, 0.35),
            thickness: 2,
          });
        }

        if (
          prevPt.breakfastParticipation !== null &&
          currPt.breakfastParticipation !== null
        ) {
          const prevY =
            chartBoxY +
            20 +
            Math.min(100, Math.max(0, prevPt.breakfastParticipation)) * 0.96;
          const currY =
            chartBoxY +
            20 +
            Math.min(100, Math.max(0, currPt.breakfastParticipation)) * 0.96;
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

  // 2. MPLH & Labor
  y = chartBoxY - 24;
  page1.drawText("02  MPLH & LABOR PRODUCTIVITY", {
    x: 36,
    y,
    size: 10.5,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.32),
  });

  y -= 12;
  page1.drawRectangle({
    x: 36,
    y: y - 62,
    width: chartW,
    height: 62,
    color: rgb(0.96, 0.98, 0.96),
    borderColor: rgb(0.85, 0.9, 0.85),
    borderWidth: 1,
  });

  page1.drawText(
    `Average MPLH: ${formatDec(current.averageMplh)}  (Target: ${
      current.target?.min !== null && current.target?.min !== undefined
        ? `${current.target.min}-${current.target.max}`
        : "N/A"
    })${changes?.mplh !== null && changes?.mplh !== undefined ? ` | vs Prior: ${changes.mplh >= 0 ? "+" : ""}${formatDec(changes.mplh)} MPLH` : ""}`,
    {
      x: 48,
      y: y - 18,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.3, 0.15),
    }
  );

  page1.drawText(
    `Total Labor Hours: ${formatDec(current.laborHours)}  |  Budgeted Labor Hours: ${
      current.budgetedLaborHours !== null && current.budgetedLaborHours !== undefined
        ? `${formatDec(current.budgetedLaborHours)} hrs/day`
        : "N/A"
    }  |  Estimated Wages: ${formatMoney(current.laborCost)}`,
    {
      x: 48,
      y: y - 36,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.2, 0.25, 0.3),
    }
  );

  page1.drawText(
    `Days Meeting Target: ${current.daysMeetingTarget ?? "N/A"}  |  Days Below Target: ${
      current.daysBelowTarget ?? "N/A"
    }`,
    {
      x: 48,
      y: y - 52,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.2, 0.25, 0.3),
    }
  );

  // 3. Financial Snapshot
  y -= 84;
  page1.drawText("03  FINANCIAL SNAPSHOT", {
    x: 36,
    y,
    size: 10.5,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.32),
  });

  y -= 12;
  page1.drawRectangle({
    x: 36,
    y: y - 62,
    width: chartW,
    height: 62,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });

  page1.drawText(
    `Breakfast Cost / Meal: ${formatMoney(current.breakfastCostPerMeal)}   |   Lunch Cost / Meal: ${formatMoney(current.lunchCostPerMeal)}   |   Total Food Cost: ${formatMoney(current.totalCost)}`,
    {
      x: 48,
      y: y - 20,
      size: 8.5,
      font: fontBold,
      color: rgb(0.1, 0.2, 0.3),
    }
  );

  drawWrapped(page1,
    `Food Cost - Breakfast: ${current.costAvailable?.breakfast ? formatMoney(current.costs?.breakfast) : "Unavailable"} | Lunch: ${current.costAvailable?.lunch ? formatMoney(current.costs?.lunch) : "Unavailable"}${current.costAvailable?.supper ? ` | Supper: ${formatMoney(current.costs?.supper)}` : ""}`,
    { x:48,y:y-40,width:chartW-24,size:7.5,font:fontRegular,color:rgb(.25,.3,.35),lineHeight:9,maxLines:2 }
  );

  drawWrapped(page1,
    `Estimated Wages: ${formatMoney(current.laborCost)} | Meal Revenue - Breakfast: ${formatMoney(current.revenues?.breakfast)} | Lunch: ${formatMoney(current.revenues?.lunch)}${current.totals?.supper > 0 ? ` | Supper: ${formatMoney(current.revenues?.supper)}` : ""} | Total: ${formatMoney(current.revenue)}`,
    { x:48,y:y-56,width:chartW-24,size:7.4,font:fontBold,color:rgb(.12,.25,.32),lineHeight:8,maxLines:2 }
  );

  page1.drawText("SPARK Monthly Scorecard - Page 1 of 3", {
    x: 36,
    y: 20,
    size: 8,
    font: fontRegular,
    color: rgb(0.6, 0.65, 0.7),
  });

  // ================= PAGE 2 =================
  const page2 = makePdfTextSafe(pdfDoc.addPage([612, 792]));
  let y2 = height - 44;

  page2.drawRectangle({
    x: 36,
    y: y2 - 26,
    width: width - 72,
    height: 28,
    color: rgb(0.12, 0.22, 0.32),
  });
  page2.drawText(
    `${school.school_name} - Management Detail (${rangeLabel})`,
    {
      x: 46,
      y: y2 - 17,
      size: 10,
      font: fontBold,
      color: rgb(1, 1, 1),
    }
  );

  y2 -= 44;

  // 4. Menu Performance
  page2.drawText("04  TOP ENTRÉE PERFORMANCE", {
    x: 36,
    y: y2,
    size: 10.5,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.32),
  });
  y2 -= 12;

  const bTop = current.menuRankings?.breakfast || [];
  const lTop = current.menuRankings?.lunch || [];
  const halfW = (width - 72 - 12) / 2;

  page2.drawRectangle({
    x: 36,
    y: y2 - 88,
    width: halfW,
    height: 88,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });
  page2.drawText("Breakfast Top Entrées", {
    x: 44,
    y: y2 - 14,
    size: 8.5,
    font: fontBold,
    color: rgb(0.2, 0.25, 0.3),
  });
  if (bTop.length === 0) {
    page2.drawText("No qualifying breakfast entrées.", {
      x: 44,
      y: y2 - 30,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  } else {
    bTop.slice(0, 3).forEach((it, idx) => {
      drawWrapped(page2, `${it.rank}. ${it.name} - ${formatInt(it.served)} served${it.strongestWeekLabel ? `; best ${it.strongestWeekLabel}` : ""}`, {
        x:44,y:y2-28-idx*20,width:halfW-16,size:7,font:fontRegular,color:rgb(.1,.1,.1),lineHeight:7.5,maxLines:3,
      });
    });
  }

  page2.drawRectangle({
    x: 36 + halfW + 12,
    y: y2 - 88,
    width: halfW,
    height: 88,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });
  page2.drawText("Lunch Top Entrées", {
    x: 44 + halfW + 12,
    y: y2 - 14,
    size: 8.5,
    font: fontBold,
    color: rgb(0.2, 0.25, 0.3),
  });
  if (lTop.length === 0) {
    page2.drawText("No qualifying lunch entrées.", {
      x: 44 + halfW + 12,
      y: y2 - 30,
      size: 7.5,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    });
  } else {
    lTop.slice(0, 3).forEach((it, idx) => {
      drawWrapped(page2, `${it.rank}. ${it.name} - ${formatInt(it.served)} served${it.strongestWeekLabel ? `; best ${it.strongestWeekLabel}` : ""}`, {
        x:44+halfW+12,y:y2-28-idx*20,width:halfW-16,size:7,font:fontRegular,color:rgb(.1,.1,.1),lineHeight:7.5,maxLines:3,
      });
    });
  }

  // 5. Forecasting & Leftovers
  y2 -= 108;
  page2.drawText("05  FORECASTING & LEFTOVERS", {
    x: 36,
    y: y2,
    size: 10.5,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.32),
  });
  y2 -= 12;

  const prod = current.productionTotals || {};
  page2.drawRectangle({
    x: 36,
    y: y2 - 142,
    width: width - 72,
    height: 142,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });

  page2.drawText(
    `Planned: ${formatInt(prod.planned)} | Prepared: ${formatInt(prod.prepared)} | Served: ${formatInt(prod.served)}`,
    {
      x: 46,
      y: y2 - 18,
      size: 8.5,
      font: fontBold,
      color: rgb(0.1, 0.2, 0.3),
    }
  );
  page2.drawText(`Leftover / Carryover: ${formatInt(prod.leftover)} | Wasted: ${formatInt(prod.wasted)} | Waste: ${formatDec(prod.wastePercentage)}%`, {
    x:46,y:y2-36,size:8,font:fontBold,color:rgb(.15,.3,.35),
  });
  page2.drawText("Weekly Carryover and Waste", {x:46,y:y2-55,size:8,font:fontBold,color:rgb(.2,.3,.4)});
  page2.drawText("Week", {x:46,y:y2-69,size:7,font:fontBold,color:rgb(.35,.4,.45)});
  page2.drawText("Prepared", {x:190,y:y2-69,size:7,font:fontBold,color:rgb(.35,.4,.45)});
  page2.drawText("Served", {x:255,y:y2-69,size:7,font:fontBold,color:rgb(.35,.4,.45)});
  page2.drawText("Carryover", {x:315,y:y2-69,size:7,font:fontBold,color:rgb(.35,.4,.45)});
  page2.drawText("Carryover %", {x:385,y:y2-69,size:7,font:fontBold,color:rgb(.35,.4,.45)});
  page2.drawText("Waste / %", {x:470,y:y2-69,size:7,font:fontBold,color:rgb(.35,.4,.45)});
  (current.weekly || []).forEach((week,index)=>{
    const wy=y2-83-index*11;
    page2.drawText(week.label,{x:46,y:wy,size:6.8,font:fontRegular,color:rgb(.15,.2,.25)});
    page2.drawText(formatInt(week.prepared),{x:190,y:wy,size:6.8,font:fontRegular,color:rgb(.15,.2,.25)});
    page2.drawText(formatInt(week.served),{x:255,y:wy,size:6.8,font:fontRegular,color:rgb(.15,.2,.25)});
    page2.drawText(formatInt(week.leftover),{x:315,y:wy,size:6.8,font:fontRegular,color:rgb(.15,.2,.25)});
    page2.drawText(`${formatDec(week.carryoverPercentage)}%`,{x:385,y:wy,size:6.8,font:fontRegular,color:rgb(.15,.2,.25)});
    page2.drawText(`${formatInt(week.wasted)} / ${formatDec(week.wastePercentage)}%`,{x:470,y:wy,size:6.8,font:fontRegular,color:rgb(.15,.2,.25)});
  });

  // 6. Management Focus
  y2 -= 162;
  page2.drawText("06  MANAGEMENT FOCUS", {
    x: 36,
    y: y2,
    size: 10.5,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.32),
  });
  y2 -= 12;

  const weekText = (label, week) => week
    ? `${label}: ${week.label} | Lunch ${formatDec(week.lunchParticipation)}% | MPLH ${formatDec(week.mplh)} | Carryover ${formatDec(week.carryoverPercentage)}% | Waste ${formatDec(week.wastePercentage)}%`
    : `${label}: Not enough comparable weekly data.`;
  drawWrapped(page2, weekText("Best Week", current.bestWeek), {
    x:36,y:y2,width:width-72,size:7.5,font:fontBold,color:rgb(.12,.3,.24),lineHeight:9,
  });
  drawWrapped(page2, weekText("Watch Week", current.watchWeek), {
    x:36,y:y2-12,width:width-72,size:7.5,font:fontBold,color:rgb(.5,.3,.08),lineHeight:9,
  });
  y2 -= 34;

  const focusKeys = [
    { label: "WIN", text: summary?.win },
    { label: "WATCH", text: summary?.watch },
    { label: "ACTION", text: summary?.action },
    { label: "GOAL", text: summary?.goal },
  ];

  const itemW = (width - 72 - 16) / 2;
  focusKeys.forEach((item, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const fx = 36 + col * (itemW + 16);
    const fy = y2 - row * 66;

    page2.drawRectangle({
      x: fx,
      y: fy - 58,
      width: itemW,
      height: 58,
      color: rgb(0.96, 0.98, 0.99),
      borderColor: rgb(0.85, 0.88, 0.92),
      borderWidth: 1,
    });

    page2.drawText(item.label, {
      x: fx + 10,
      y: fy - 15,
      size: 8,
      font: fontBold,
      color: rgb(0.1, 0.4, 0.6),
    });

    drawWrapped(page2, item.text || "No notes available.", {
      x:fx+10,y:fy-27,width:itemW-20,size:7,font:fontRegular,
      color:rgb(.2,.25,.3),lineHeight:8,maxLines:5,
    });
  });

  page2.drawText("SPARK Monthly Scorecard - Page 2 of 3", {
    x: 36,
    y: 20,
    size: 8,
    font: fontRegular,
    color: rgb(0.6, 0.65, 0.7),
  });

  // ================= PAGE 3 =================
  const page3 = makePdfTextSafe(pdfDoc.addPage([612, 792]));
  let y3 = height - 44;
  page3.drawRectangle({x:36,y:y3-26,width:width-72,height:28,color:rgb(.12,.22,.32)});
  page3.drawText(`${school.school_name} - Waste and Carryover Detail`,{
    x:46,y:y3-17,size:10,font:fontBold,color:rgb(1,1,1),
  });
  y3-=48;

  const drawItemTable=(title,items,isWaste)=>{
    page3.drawText(title,{x:36,y:y3,size:10.5,font:fontBold,color:rgb(.12,.22,.32)});
    y3-=16;
    const columns=isWaste
      ? [["Item",36],["Prepared",300],["Served",355],["Carryover",405],["Wasted",468],["Waste %",515],["Days",565]]
      : [["Item",36],["Prepared",350],["Served",410],["Carryover",460],["Carryover %",520],["Days",575]];
    columns.forEach(([label,x])=>page3.drawText(label,{x,y:y3,size:6.5,font:fontBold,color:rgb(.35,.4,.45)}));
    y3-=10;
    if(!items.length){
      page3.drawText(isWaste ? "No recorded food waste for this reporting period." : "No high-carryover items met the reporting threshold.",{x:36,y:y3,size:8,font:fontRegular,color:rgb(.45,.48,.5)});
      y3-=20;
      return;
    }
    items.forEach((item)=>{
      const nameLines=wrapText(item.name,fontRegular,7.2,isWaste?250:300);
      const rowH=Math.max(18,nameLines.length*9+6);
      if(y3-rowH<48) return;
      page3.drawRectangle({x:36,y:y3-rowH+3,width:width-72,height:rowH,color:rgb(.975,.982,.987)});
      nameLines.forEach((line,index)=>page3.drawText(line,{x:40,y:y3-7-index*9,size:7.2,font:fontRegular,color:rgb(.1,.15,.2)}));
      if(isWaste){
        page3.drawText(formatInt(item.prepared),{x:305,y:y3-7,size:7,font:fontRegular});
        page3.drawText(formatInt(item.served),{x:360,y:y3-7,size:7,font:fontRegular});
        page3.drawText(formatInt(item.leftover),{x:417,y:y3-7,size:7,font:fontRegular});
        page3.drawText(formatInt(item.wasted),{x:475,y:y3-7,size:7,font:fontRegular});
        page3.drawText(`${formatDec(item.wastePercentage)}%`,{x:520,y:y3-7,size:7,font:fontBold});
        page3.drawText(String(item.serviceDays ?? "-"),{x:575,y:y3-7,size:7,font:fontRegular});
      }else{
        page3.drawText(formatInt(item.prepared),{x:355,y:y3-7,size:7,font:fontRegular});
        page3.drawText(formatInt(item.served),{x:415,y:y3-7,size:7,font:fontRegular});
        page3.drawText(formatInt(item.leftover),{x:470,y:y3-7,size:7,font:fontRegular});
        page3.drawText(`${formatDec(item.carryoverPercentage)}%`,{x:530,y:y3-7,size:7,font:fontBold});
        page3.drawText(String(item.serviceDays ?? "-"),{x:580,y:y3-7,size:7,font:fontRegular});
      }
      y3-=rowH;
    });
    y3-=14;
  };

  drawItemTable("WORST FOOD WASTE ITEMS",current.worstItems || [],true);
  drawItemTable("HIGH CARRYOVER ITEMS",current.highCarryoverItems || [],false);
  if(current.forecastObservation){
    page3.drawText("FORECASTING OBSERVATION",{x:36,y:y3,size:9,font:fontBold,color:rgb(.12,.22,.32)});
    y3-=14;
    drawWrapped(page3,current.forecastObservation,{x:36,y:y3,width:width-72,size:8,font:fontRegular,color:rgb(.2,.25,.3),lineHeight:10});
  }
  page3.drawText("SPARK Monthly Scorecard - Page 3 of 3",{x:36,y:20,size:8,font:fontRegular,color:rgb(.6,.65,.7)});
}

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

export async function exportSingleSchoolPdf(card, dateRange) {
  const pdfLib = await import("pdf-lib");
  const { PDFDocument } = pdfLib;
  const pdfDoc = await PDFDocument.create();
  await appendSchoolScorecardPages(pdfDoc, card, dateRange, pdfLib);
  const pdfBytes = await pdfDoc.save();

  const safeSchool = sanitizeFilename(card.school.school_name);
  const filename = `${safeSchool}_SPARK_Scorecard_${dateRange.startDate}_to_${dateRange.endDate}.pdf`;
  triggerPdfDownload(pdfBytes, filename);
}

export async function exportAllSchoolsPdf(cards, dateRange, onProgress) {
  const pdfLib = await import("pdf-lib");
  const { PDFDocument } = pdfLib;
  const pdfDoc = await PDFDocument.create();

  const eligibleCards = cards.filter(
    (card) =>
      !isExcludedSchool(card.school) &&
      (card.current?.hasMeals || card.current?.hasProduction || card.current?.hasCost)
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
    await appendSchoolScorecardPages(pdfDoc, card, dateRange, pdfLib);
  }

  const pdfBytes = await pdfDoc.save();
  const filename = `SPARK_Scorecards_${dateRange.startDate}_to_${dateRange.endDate}.pdf`;
  triggerPdfDownload(pdfBytes, filename);

  return {
    exportedCount: eligibleCards.length,
    skippedCount: cards.length - eligibleCards.length,
  };
}
