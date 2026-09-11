import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const integer = (value) =>
  value === null || value === undefined
    ? "—"
    : Math.round(Number(value)).toLocaleString();
const decimal = (value, digits = 1) =>
  value === null || value === undefined ? "—" : Number(value).toFixed(digits);
const money = (value) =>
  value === null || value === undefined
    ? "Unavailable"
    : Number(value).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      });
const readableDate = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "—";
const readableMonth = (value) =>
  new Date(`${String(value).slice(0, 7)}-01T12:00:00`).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" }
  );
const signed = (value, suffix = "") =>
  value === null || value === undefined
    ? "Unavailable"
    : `${value >= 0 ? "+" : ""}${Number(value).toFixed(1)}${suffix}`;

function MealKpi({ meal, total, average, participation, delta, priorLabel }) {
  return (
    <article className={`scorecard-meal-kpi ${meal.toLowerCase()}`}>
      <div className="scorecard-kpi-heading">
        <span>{meal}</span>
        <small>Total meals</small>
      </div>
      <strong>{integer(total)}</strong>
      <div className="scorecard-kpi-footer">
        <span>
          <b>{decimal(average)}</b> avg/day
        </span>
        <span>
          <b>{decimal(participation)}%</b> participation
          {priorLabel && (
            <em>
              {signed(delta, " pp")} vs {priorLabel}
            </em>
          )}
        </span>
      </div>
    </article>
  );
}

function CompactMetric({ label, value, note, tone = "default" }) {
  return (
    <div className={`scorecard-compact-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function FinanceRow({ label, value, unavailable = false }) {
  return (
    <div className={unavailable ? "unavailable" : ""}>
      <span>{label}</span>
      <strong>{unavailable ? "Unavailable" : money(value)}</strong>
    </div>
  );
}

function EntreeRanking({ title, items }) {
  return (
    <div className="scorecard-entree-list">
      <h5>{title} — Top Entrées</h5>
      {items.length ? (
        items.map((item) => (
          <div key={item.name}>
            <b>{item.rank}</b>
            <span>
              {item.name}
              {item.strongestWeekLabel && (
                <small>
                  {item.strongestWeekLabel} · {integer(item.strongestWeekServed)}{" "}
                  served
                </small>
              )}
            </span>
            <strong>
              {integer(item.served)}
              <small>served</small>
            </strong>
          </div>
        ))
      ) : (
        <p>No qualifying entrées available.</p>
      )}
    </div>
  );
}

function WeekSummary({ label, week }) {
  return (
    <div className="scorecard-week-summary">
      <span>{label}</span>
      {week ? (
        <>
          <strong>{week.label}</strong>
          <small>
            {decimal(week.lunchParticipation)}% lunch · {decimal(week.mplh)}{" "}
            MPLH · {decimal(week.leftoverPercentage)}% leftover
          </small>
        </>
      ) : (
        <p>Not enough comparable weekly data.</p>
      )}
    </div>
  );
}

export default function MonthlySchoolScorecard({ card, onBack }) {
  const { school, current, previous, changes, summary } = card;
  const previousLabel = previous
    ? readableMonth(previous.month).split(" ")[0]
    : null;
  const periodLabel =
    current.startDate && current.endDate
      ? `${current.startDate} to ${current.endDate}`
      : readableMonth(current.month);
  const mplhScale = Math.max(current.target.max || 25, 25);
  const targetLeft = ((current.target.min || 0) / mplhScale) * 100;
  const targetWidth =
    current.target.min === null
      ? 0
      : ((current.target.max - current.target.min) / mplhScale) * 100;
  const targetMid =
    current.target.min === null
      ? 0
      : (((current.target.min + current.target.max) / 2) / mplhScale) * 100;

  return (
    <div className="monthly-school-scorecard scorecard-sheet">
      <div className="scorecard-toolbar">
        <button type="button" className="scorecard-back" onClick={onBack}>
          ← All schools
        </button>
        <span>Monthly Management Scorecard</span>
      </div>

      <header className="scorecard-sheet-header">
        <div>
          <span className="scorecard-eyebrow">
            MONTHLY SCHOOL PERFORMANCE SCORECARD
          </span>
          <h3>{school.school_name}</h3>
          <p>
            Location {school.location_code || "Not assigned"} ·{" "}
            {school.site_type || school.labor_type || "Site type unavailable"}
          </p>
        </div>
        <div className="scorecard-period">
          <strong>{periodLabel}</strong>
          <span>Reporting Period</span>
        </div>
        <div className="scorecard-enrollment">
          <span>Enrollment</span>
          <strong>
            {school.enrollment ? integer(school.enrollment) : "Unavailable"}
          </strong>
          <small>{current.operatingDays} operating days</small>
        </div>
      </header>

      {/* 1. PARTICIPATION */}
      <section className="scorecard-section">
        <div className="scorecard-section-title">
          <div>
            <span>01</span>
            <h4>Meal Participation</h4>
          </div>
        </div>
        <div className="scorecard-meal-kpis">
          <MealKpi
            meal="Breakfast"
            total={current.totals.breakfast}
            average={current.averages.breakfast}
            participation={current.participation.breakfast}
            delta={changes.breakfastParticipation}
            priorLabel={previousLabel}
          />
          <MealKpi
            meal="Lunch"
            total={current.totals.lunch}
            average={current.averages.lunch}
            participation={current.participation.lunch}
            delta={changes.lunchParticipation}
            priorLabel={previousLabel}
          />
          <MealKpi
            meal="Supper"
            total={current.totals.supper}
            average={current.averages.supper}
            participation={current.participation.supper}
            delta={changes.supperParticipation}
            priorLabel={previousLabel}
          />
        </div>

        {/* Dual Participation Trend Graph: Breakfast & Lunch */}
        <div style={{ marginTop: "18px" }}>
          <div style={{ marginBottom: "8px" }}>
            <strong style={{ fontSize: "12px", color: "#36454f" }}>
              Participation Trend (Daily Operating Days)
            </strong>
          </div>
          {current.participationTrend &&
          current.participationTrend.some(
            (row) =>
              row.lunchParticipation !== null ||
              row.breakfastParticipation !== null
          ) ? (
            <div className="scorecard-chart" style={{ height: "230px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={current.participationTrend}
                  margin={{ top: 10, right: 15, left: -15, bottom: 0 }}
                >
                  <CartesianGrid stroke="#e6ece9" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => v.slice(5).replace("-", "/")}
                    interval={0}
                    tick={{ fontSize: 10, fill: "#66766e" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    unit="%"
                    tick={{ fontSize: 10, fill: "#66766e" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(val, name) => [
                      val !== null ? `${Number(val).toFixed(1)}%` : "No data",
                      name === "breakfastParticipation"
                        ? "Breakfast %"
                        : "Lunch %",
                    ]}
                    labelFormatter={(v) => readableDate(v)}
                  />
                  <Legend
                    verticalAlign="top"
                    height={30}
                    formatter={(name) =>
                      name === "breakfastParticipation"
                        ? "Breakfast Participation %"
                        : "Lunch Participation %"
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="breakfastParticipation"
                    name="breakfastParticipation"
                    stroke="#e5962d"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="lunchParticipation"
                    name="lunchParticipation"
                    stroke="#16855b"
                    strokeWidth={2.5}
                    dot={{ r: 2.5, fill: "#fff", strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="scorecard-empty">
              Enrollment and meal data are required to plot participation trends.
            </p>
          )}
        </div>
      </section>

      {/* 2. MPLH & LABOR */}
      <section className="scorecard-section scorecard-mplh-panel">
        <div className="scorecard-section-title">
          <div>
            <span>02</span>
            <h4>MPLH & Labor</h4>
          </div>
          <small>
            {current.target.min === null
              ? "Target unavailable"
              : `Target ${current.target.min}–${current.target.max}`}
          </small>
        </div>
        <div className="scorecard-mplh-hero">
          <div>
            <span>Average MPLH</span>
            <strong>{decimal(current.averageMplh)}</strong>
            <small>
              {previous
                ? `${signed(changes.mplh)} vs ${previousLabel}`
                : "Baseline period"}
            </small>
          </div>
          <div className="scorecard-target-track">
            <span
              className="scorecard-mplh-value"
              style={{
                width:
                  current.averageMplh === null
                    ? "0%"
                    : `${Math.min(
                        100,
                        (current.averageMplh /
                          mplhScale) * 100
                      )}%`,
              }}
            />
            {current.target.min !== null && (
              <>
                <b
                  className="scorecard-mplh-target-zone"
                  style={{ left: `${targetLeft}%`, width: `${targetWidth}%` }}
                />
                <i
                  className="scorecard-mplh-midpoint"
                  style={{ left: `${targetMid}%` }}
                />
              </>
            )}
          </div>
        </div>
        <div className="scorecard-mini-grid">
          <CompactMetric
            label="Labor hours"
            value={decimal(current.laborHours)}
          />
          <CompactMetric
            label="Estimated wages"
            value={
              current.laborCost === null
                ? "Unavailable"
                : money(current.laborCost)
            }
          />
          <CompactMetric
            label="Met target"
            value={current.daysMeetingTarget ?? "—"}
            note="days"
            tone="good"
          />
          <CompactMetric
            label="Below target"
            value={current.daysBelowTarget ?? "—"}
            note="days"
            tone={current.daysBelowTarget > 0 ? "watch" : "good"}
          />
        </div>
      </section>

      {/* 3. FINANCIAL SNAPSHOT */}
      <section className="scorecard-section scorecard-financial-panel">
        <div className="scorecard-section-title">
          <div>
            <span>03</span>
            <h4>Financial Snapshot</h4>
          </div>
        </div>
        <div className="scorecard-financial-grid three">
          <div>
            <h5>Food Cost</h5>
            <FinanceRow
              label="Breakfast"
              value={current.costs.breakfast}
              unavailable={!current.costAvailable.breakfast}
            />
            <FinanceRow
              label="Breakfast Cost / Meal"
              value={current.breakfastCostPerMeal}
              unavailable={current.breakfastCostPerMeal === null}
            />
            <FinanceRow
              label="Lunch"
              value={current.costs.lunch}
              unavailable={!current.costAvailable.lunch}
            />
            <FinanceRow
              label="Lunch Cost / Meal"
              value={current.lunchCostPerMeal}
              unavailable={current.lunchCostPerMeal === null}
            />

            {/* If supper is unavailable, omit the line completely */}
            {current.costAvailable.supper && (
              <>
                <FinanceRow label="Supper" value={current.costs.supper} />
                <FinanceRow
                  label="Supper Cost / Meal"
                  value={current.supperCostPerMeal}
                  unavailable={current.supperCostPerMeal === null}
                />
              </>
            )}

            <FinanceRow
              label="Total Food Cost"
              value={current.totalCost}
              unavailable={current.totalCost === null}
            />
          </div>

          <div>
            <h5>Labor</h5>
            <FinanceRow
              label="Estimated wages"
              value={current.laborCost}
              unavailable={current.laborCost === null}
            />
            <div>
              <span>Labor hours</span>
              <strong>{decimal(current.laborHours)}</strong>
            </div>
            {current.budgetedLaborHours != null && (
              <div>
                <span>Budgeted Labor Hours</span>
                <strong>{decimal(current.budgetedLaborHours)} hrs/day</strong>
              </div>
            )}
          </div>

          <div>
            <h5>Meal Revenue</h5>
            <FinanceRow
              label="Breakfast"
              value={current.revenues.breakfast}
            />
            <FinanceRow label="Lunch" value={current.revenues.lunch} />
            {current.totals.supper > 0 && (
              <FinanceRow label="Supper" value={current.revenues.supper} />
            )}
            <FinanceRow
              label="Total meal revenue"
              value={current.revenue}
            />
          </div>
        </div>
      </section>

      {/* 4. MENU PERFORMANCE */}
      <section className="scorecard-section">
        <div className="scorecard-section-title">
          <div>
            <span>04</span>
            <h4>Menu Performance</h4>
          </div>
          <small>Ranked by actual portions served</small>
        </div>
        <div className="scorecard-menu-columns">
          <EntreeRanking
            title="Breakfast"
            items={current.menuRankings.breakfast}
          />
          <EntreeRanking title="Lunch" items={current.menuRankings.lunch} />
        </div>
      </section>

      {/* 5. FORECASTING & LEFTOVERS */}
      <section className="scorecard-section scorecard-forecast-panel">
        <div className="scorecard-section-title">
          <div>
            <span>05</span>
            <h4>Forecasting & Leftovers</h4>
          </div>
          <small>Prepared minus served</small>
        </div>
        <div className="scorecard-forecast-grid">
          <div className="scorecard-production-strip">
            <CompactMetric
              label="Planned"
              value={integer(current.productionTotals.planned)}
            />
            <CompactMetric
              label="Prepared"
              value={integer(current.productionTotals.prepared)}
            />
            <CompactMetric
              label="Served"
              value={integer(current.productionTotals.served)}
            />
            <CompactMetric
              label="Leftover"
              value={integer(current.productionTotals.leftover)}
            />
            <CompactMetric
              label="Leftover %"
              value={`${decimal(current.productionTotals.leftoverPercentage)}%`}
            />
          </div>
          <div className="scorecard-weekly-list">
            <h5>Weekly Leftover Breakdown</h5>
            {current.weekly.map((week) => (
              <div key={week.weekStart}>
                <span>{week.label}</span>
                <b>{decimal(week.leftoverPercentage)}%</b>
                <small>
                  {integer(week.prepared)} prepared · {integer(week.served)}{" "}
                  served · {integer(week.leftover)} leftover
                </small>
              </div>
            ))}
          </div>
        </div>
        <div className="scorecard-leftover-items">
          <h5>Worst Meaningful Leftover Items</h5>
          {current.worstItems.length ? (
            current.worstItems.map((item) => (
              <div key={item.name}>
                <span>{item.name}</span>
                <small>
                  {integer(item.prepared)} prepared · {integer(item.served)}{" "}
                  served · {integer(item.leftover)} leftover · {item.serviceDays}{" "}
                  days
                </small>
                <strong>{decimal(item.leftoverPercentage)}%</strong>
              </div>
            ))
          ) : (
            <p>No items met the volume and service-day threshold.</p>
          )}
        </div>
        {current.forecastObservation && (
          <p className="scorecard-forecast-note">
            {current.forecastObservation}
          </p>
        )}
      </section>

      {/* 6. MANAGEMENT FOCUS */}
      <section className="scorecard-management">
        <div className="scorecard-section-title">
          <div>
            <span>06</span>
            <h4>Management Focus</h4>
          </div>
        </div>
        <div className="scorecard-week-comparison">
          <WeekSummary label="Best Week" week={current.bestWeek} />
          <WeekSummary label="Watch Week" week={current.watchWeek} />
        </div>
        <div className="scorecard-summary-grid">
          {Object.entries(summary).map(([label, text]) => (
            <article key={label} className={label}>
              <span>{label}</span>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
