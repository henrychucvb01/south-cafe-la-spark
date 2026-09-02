import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import "./supervisorLeaderboard.css";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSeason(now = new Date()) {
  // SPARK competition year follows the operating year, beginning in August.
  // The championship intentionally freezes after the first week of June.
  const startYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    startYear,
    endYear: startYear + 1,
    start: `${startYear}-08-01`,
    end: `${startYear + 1}-06-07`,
    label: `${startYear}–${String(startYear + 1).slice(-2)}`,
  };
}

function getSeasonMonths(season) {
  const values = [];
  for (let month = 7; month <= 11; month += 1) {
    values.push({ year: season.startYear, month });
  }
  for (let month = 0; month <= 5; month += 1) {
    values.push({ year: season.endYear, month });
  }
  return values;
}

function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function monthBounds(year, month, season) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  let start = toDateKey(first);
  let end = toDateKey(last);

  if (start < season.start) start = season.start;
  if (end > season.end) end = season.end;

  return { start, end };
}

function rankScores(schools, scoreMap) {
  const sorted = schools
    .map((school) => ({
      id: String(school.id),
      schoolName: school.school_name,
      locationCode: school.location_code,
      points: Number(scoreMap.get(String(school.id)) || 0),
    }))
    .sort((a, b) => b.points - a.points || a.schoolName.localeCompare(b.schoolName));

  let priorPoints = null;
  let priorRank = 0;
  return sorted.map((row, index) => {
    const rank = priorPoints === row.points ? priorRank : index + 1;
    priorPoints = row.points;
    priorRank = rank;
    return { ...row, rank };
  });
}

function sumPoints(points, start, end) {
  const totals = new Map();
  points.forEach((row) => {
    const date = row.service_date || String(row.created_at || "").slice(0, 10);
    if (!date || date < start || date > end) return;
    const id = String(row.location_id);
    totals.set(id, Number(totals.get(id) || 0) + Number(row.points || 0));
  });
  return totals;
}

function Movement({ value }) {
  if (!value) return <span className="spark-leaderboard-movement same">—</span>;
  if (value > 0) {
    return <span className="spark-leaderboard-movement up">▲ {value}</span>;
  }
  return <span className="spark-leaderboard-movement down">▼ {Math.abs(value)}</span>;
}

async function fetchAllSeasonPoints(start, end) {
  const pageSize = 1000;
  const allRows = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("spark_points")
      .select("location_id, points, service_date, created_at")
      .gte("service_date", start)
      .lte("service_date", end)
      .order("service_date", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = data || [];
    allRows.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

export default function SupervisorLeaderboard({ onClose }) {
  const season = useMemo(() => getSeason(), []);
  const seasonMonths = useMemo(() => getSeasonMonths(season), [season]);
  const today = toDateKey(new Date());
  const initialMonth = useMemo(() => {
    const current = seasonMonths.find(
      (item) => item.year === new Date().getFullYear() && item.month === new Date().getMonth()
    );
    return current || seasonMonths[0];
  }, [seasonMonths]);

  const [view, setView] = useState("season");
  const [selectedMonthKey, setSelectedMonthKey] = useState(
    monthKey(initialMonth.year, initialMonth.month)
  );
  const [schools, setSchools] = useState([]);
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadLeaderboard() {
    setLoading(true);
    setError("");
    try {
      const [{ data: locationRows, error: locationError }, pointRows] = await Promise.all([
        supabase
          .from("locations")
          .select("id, school_name, location_code")
          .eq("active", true)
          .order("school_name"),
        fetchAllSeasonPoints(season.start, season.end),
      ]);

      if (locationError) throw locationError;
      setSchools(locationRows || []);
      setPoints(pointRows || []);
    } catch (err) {
      console.error("SPARK leaderboard load error:", err);
      setError(err.message || "Could not load the SPARK leaderboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const selectedMonth = useMemo(() => {
    return seasonMonths.find(
      (item) => monthKey(item.year, item.month) === selectedMonthKey
    ) || seasonMonths[0];
  }, [seasonMonths, selectedMonthKey]);

  const calculations = useMemo(() => {
    if (!schools.length) {
      return { seasonRows: [], monthRows: [], monthlyWinners: [], seasonLeaders: [] };
    }

    const month = selectedMonth;
    const bounds = monthBounds(month.year, month.month, season);
    const monthScores = sumPoints(points, bounds.start, bounds.end);
    const seasonToDateEnd = today < season.end ? today : season.end;
    const seasonScores = sumPoints(points, season.start, seasonToDateEnd);

    const currentMonthEnd = bounds.end < seasonToDateEnd ? bounds.end : seasonToDateEnd;
    const currentMonthSeasonScores = sumPoints(points, season.start, currentMonthEnd);
    const currentMonthSeasonRanks = rankScores(schools, currentMonthSeasonScores);
    const currentRankMap = new Map(currentMonthSeasonRanks.map((row) => [row.id, row.rank]));

    const selectedIndex = seasonMonths.findIndex(
      (item) => monthKey(item.year, item.month) === selectedMonthKey
    );
    let previousRankMap = new Map();
    if (selectedIndex > 0) {
      const previous = seasonMonths[selectedIndex - 1];
      const previousBounds = monthBounds(previous.year, previous.month, season);
      const previousScores = sumPoints(points, season.start, previousBounds.end);
      previousRankMap = new Map(rankScores(schools, previousScores).map((row) => [row.id, row.rank]));
    }

    const seasonRows = rankScores(schools, seasonScores).map((row) => {
      const selectedCurrentRank = currentRankMap.get(row.id);
      const previousRank = previousRankMap.get(row.id);
      return {
        ...row,
        movement:
          selectedIndex > 0 && previousRank && selectedCurrentRank
            ? previousRank - selectedCurrentRank
            : 0,
        monthPoints: Number(monthScores.get(row.id) || 0),
      };
    });

    const monthRows = rankScores(schools, monthScores).map((row) => ({
      ...row,
      seasonRank: currentRankMap.get(row.id) || "—",
    }));

    const bestMonth = monthRows.length ? monthRows[0].points : 0;
    const monthlyWinners = monthRows.filter((row) => row.points === bestMonth && bestMonth > 0);
    const bestSeason = seasonRows.length ? seasonRows[0].points : 0;
    const seasonLeaders = seasonRows.filter((row) => row.points === bestSeason && bestSeason > 0);

    return { seasonRows, monthRows, monthlyWinners, seasonLeaders };
  }, [schools, points, selectedMonth, selectedMonthKey, season, seasonMonths, today]);

  const selectedBounds = monthBounds(selectedMonth.year, selectedMonth.month, season);
  const monthComplete = today > selectedBounds.end;
  const seasonComplete = today > season.end;
  const selectedMonthLabel = `${MONTH_NAMES[selectedMonth.month]} ${selectedMonth.year}`;

  const rows = view === "season" ? calculations.seasonRows : calculations.monthRows;

  return (
    <div className="spark-leaderboard-page" role="dialog" aria-modal="true" aria-label="SPARK Leaderboard">
      <header className="spark-leaderboard-header">
        <div>
          <div className="spark-leaderboard-kicker">SOUTH CAFÉ LA · SPARK LEAGUE</div>
          <h1>School Leaderboard</h1>
          <p>{season.label} competition · standings freeze June 7, {season.endYear}</p>
        </div>
        <div className="spark-leaderboard-header-actions">
          <button type="button" className="spark-leaderboard-refresh" onClick={loadLeaderboard} disabled={loading}>
            ↻ Refresh
          </button>
          <button type="button" className="spark-leaderboard-close" onClick={onClose}>
            ← Command Center
          </button>
        </div>
      </header>

      <main className="spark-leaderboard-main">
        <section className="spark-leaderboard-trophies">
          <div className="spark-leaderboard-trophy-card monthly">
            <div className="spark-leaderboard-trophy-icon">🏆</div>
            <div>
              <small>{monthComplete ? "MONTHLY CHAMPION" : "MONTHLY LEADER"}</small>
              <strong>
                {calculations.monthlyWinners.length
                  ? calculations.monthlyWinners.map((row) => row.schoolName).join(" · ")
                  : "No points yet"}
              </strong>
              <span>{selectedMonthLabel}</span>
            </div>
          </div>

          <div className="spark-leaderboard-trophy-card season">
            <div className="spark-leaderboard-trophy-icon">🏆</div>
            <div>
              <small>{seasonComplete ? "SEASON CHAMPION" : "SEASON LEADER"}</small>
              <strong>
                {calculations.seasonLeaders.length
                  ? calculations.seasonLeaders.map((row) => row.schoolName).join(" · ")
                  : "No points yet"}
              </strong>
              <span>{season.label} SPARK League</span>
            </div>
          </div>
        </section>

        <section className="spark-leaderboard-card">
          <div className="spark-leaderboard-controls">
            <div className="spark-leaderboard-tabs" role="tablist" aria-label="Leaderboard view">
              <button
                type="button"
                className={view === "season" ? "active" : ""}
                onClick={() => setView("season")}
              >
                Season Standings
              </button>
              <button
                type="button"
                className={view === "month" ? "active" : ""}
                onClick={() => setView("month")}
              >
                Monthly Cup
              </button>
            </div>

            <label className="spark-leaderboard-month-picker">
              <span>Standings month</span>
              <select value={selectedMonthKey} onChange={(event) => setSelectedMonthKey(event.target.value)}>
                {seasonMonths.map((item) => {
                  const key = monthKey(item.year, item.month);
                  const bounds = monthBounds(item.year, item.month, season);
                  return (
                    <option key={key} value={key} disabled={bounds.start > today}>
                      {MONTH_NAMES[item.month]} {item.year}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          <div className="spark-leaderboard-table-title">
            <div>
              <h2>{view === "season" ? "Season Table" : `${selectedMonthLabel} Cup`}</h2>
              <p>
                {view === "season"
                  ? `Cumulative SPARK points. Movement compares the end-of-${MONTH_NAMES[selectedMonth.month]} season position with the previous month.`
                  : `Only SPARK points earned during ${selectedMonthLabel}.`}
              </p>
            </div>
            <div className="spark-leaderboard-no-bonus">Trophies add 0 bonus points</div>
          </div>

          {error ? (
            <div className="spark-leaderboard-error">{error}</div>
          ) : loading ? (
            <div className="spark-leaderboard-loading">Loading standings…</div>
          ) : (
            <div className="spark-leaderboard-table-wrap">
              <table className="spark-leaderboard-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    {view === "season" && <th>Movement</th>}
                    <th>School</th>
                    {view === "month" && <th>Season Rank</th>}
                    {view === "season" && <th>{MONTH_NAMES[selectedMonth.month]} Pts</th>}
                    <th>{view === "season" ? "Season Pts" : "Monthly Pts"}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={row.rank <= 3 ? `top-${row.rank}` : ""}>
                      <td className="spark-leaderboard-rank">
                        {row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : row.rank}
                      </td>
                      {view === "season" && (
                        <td><Movement value={row.movement} /></td>
                      )}
                      <td>
                        <div className="spark-leaderboard-school">
                          <strong>{row.schoolName}</strong>
                          <span>Location {row.locationCode}</span>
                        </div>
                      </td>
                      {view === "month" && <td className="spark-leaderboard-number">{row.seasonRank}</td>}
                      {view === "season" && (
                        <td className="spark-leaderboard-number muted">{row.monthPoints.toLocaleString()}</td>
                      )}
                      <td className="spark-leaderboard-points">{row.points.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
