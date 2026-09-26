import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import DAILY_BITES from "../data/dailyBitesContent";
import { selectSeasonPuzzle } from "../dailyBites/games/seasonPuzzles";
import CafeteriaWordGame from "../dailyBites/games/CafeteriaWordGame";
import CafeteriaConnectionsGame from "../dailyBites/games/CafeteriaConnectionsGame";
import ArTrainingQuiz from "../dailyBites/training/ArTrainingQuiz";
import { getLosAngelesDate, isWeekdayDate } from "../dailyBites/training/arTrainingUtils";
import SupervisorLeaderboard from "../leaderboard/SupervisorLeaderboard";
import {
  calculateGameStreak,
  getDailyGameDate,
} from "../dailyBites/games/gameUtils";

import BingoPanel from '../dailyBites/BingoPanel';

const DAILY_BITES_ROTATION_START = new Date("2026-08-03T12:00:00");

function getDailyBiteRotationNumber(today = new Date()) {
  const target = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12,
    0,
    0
  );

  // Monday = 1, Wednesday = 3, Friday = 5.
  // On Tue/Thu/weekends, keep showing the most recent Bite.
  while (![1, 3, 5].includes(target.getDay())) {
    target.setDate(target.getDate() - 1);
  }

  if (target < DAILY_BITES_ROTATION_START) {
    return 0;
  }

  let rotationNumber = 0;
  const cursor = new Date(DAILY_BITES_ROTATION_START);

  while (cursor < target) {
    cursor.setDate(cursor.getDate() + 1);

    if ([1, 3, 5].includes(cursor.getDay())) {
      rotationNumber += 1;
    }
  }

  return rotationNumber;
}

function getTodaysDailyBite() {
  if (!DAILY_BITES.length) {
    return null;
  }

  const rotationNumber = getDailyBiteRotationNumber(new Date());
  return DAILY_BITES[rotationNumber % DAILY_BITES.length];
}

function formatBiteCategory(category) {
  if (!category) {
    return "";
  }

  return category
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function DailyBitesPage({ location, employee, managerPin, onBack }) {
  const todaysBite = useMemo(() => getTodaysDailyBite(), []);
  const gameDate = useMemo(() => getDailyGameDate(new Date()), []);
  const wordPuzzle = useMemo(
    () => selectSeasonPuzzle("word", gameDate),
    [gameDate]
  );
  const sparkSortPuzzle = useMemo(
    () => selectSeasonPuzzle("spark-sort", gameDate),
    [gameDate]
  );

  const [bingoActivityVersion,setBingoActivityVersion]=useState(0);
  const [gameProgress, setGameProgress] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState("");
  const [arDailyPoints, setArDailyPoints] = useState(0);
  const [arQuestions, setArQuestions] = useState([]);
  const [arBatchKey, setArBatchKey] = useState("");
  const [arLoading, setArLoading] = useState(true);
  const [arError, setArError] = useState("");
  const arServiceDate = useMemo(() => getLosAngelesDate(new Date()), []);

  useEffect(() => {
    if (!location?.id) return;
    loadGameProgress();
  }, [location?.id]);

  useEffect(() => {
    if (!location?.id) return;
    loadArProgress();
    loadArQuestions();
  }, [location?.id, arServiceDate]);

  async function loadArQuestions() {
    const { data, error } = await supabase.rpc("get_ar_training_question_batch", { p_location_id: location.id });
    if (error) {
      console.error("AR Training question batch error:", error);
      setArError("AR Training questions are not ready. Run the supplied Supabase migration.");
      setArQuestions([]);
      return;
    }
    const rows = data || [];
    setArQuestions(rows.map((row) => ({
      id: row.id,
      type: row.question_type,
      category: row.category,
      prompt: row.prompt,
      choices: row.choices,
      explanation: row.explanation,
      source: { title: row.source_title, locator: row.source_locator, chunkId: row.source_chunk_id },
    })));
    const first = rows[0];
    setArBatchKey(first ? `${first.cycle_number}-${first.batch_index}` : "");
  }

  async function loadArProgress() {
    setArLoading(true);
    setArError("");
    const { data, error } = await supabase
      .from("ar_training_daily_progress")
      .select("points_awarded")
      .eq("location_id", location.id)
      .eq("service_date", arServiceDate)
      .maybeSingle();
    if (error) {
      console.error("AR Training progress error:", error);
      setArError("AR Training storage is not ready. Run the supplied Supabase migration.");
    } else {
      setArDailyPoints(Number(data?.points_awarded || 0));
    }
    setArLoading(false);
  }

  async function submitArAnswer(question, selectedIndex) {
    setArError("");
    const { data, error } = await supabase.rpc("submit_ar_training_answer", {
      p_location_id: location.id,
      p_employee_id: employee?.id || null,
      p_employee_name: employee?.employee_name || "Covering Employee",
      p_service_date: arServiceDate,
      p_question_id: question.id,
      p_selected_index: selectedIndex,
    });
    if (error) {
      console.error("AR Training answer error:", error);
      setArError(error.message || "Could not save the AR Training answer.");
      return null;
    }
    const result = {
      correct: data?.correct === true,
      pointsEarned: Number(data?.points_earned || 0),
      dailyPoints: Number(data?.daily_points || 0),
      correctIndex: Number(data?.correct_index),
      batchAdvanced: data?.batch_advanced === true,
    };
    setArDailyPoints(result.dailyPoints);
    setBingoActivityVersion(v=>v+1);
    if (result.batchAdvanced) await loadArQuestions();
    return result;
  }

  async function loadGameProgress() {
    setGamesLoading(true);
    setGamesError("");

    const { data, error } = await supabase
      .from("daily_bites_game_progress")
      .select("game_type, puzzle_id, service_date, status, state, attempt_count")
      .eq("location_id", location.id)
      .order("service_date", { ascending: false })
      .limit(800);

    if (error) {
      console.error("Daily Bites game progress error:", error);
      setGamesError("Game storage is not ready. Run the supplied Supabase migration to enable play.");
      setGameProgress([]);
    } else {
      setGameProgress(data || []);
    }
    setGamesLoading(false);
  }

  function mergeGameProgress(row) {
    setGameProgress((current) => [
      row,
      ...current.filter(
        (existing) =>
          !(
            existing.game_type === row.game_type &&
            existing.puzzle_id === row.puzzle_id
          )
      ),
    ]);
  }

  function getCurrentGameProgress(gameType, puzzleId) {
    return gameProgress.find(
      (row) => row.game_type === gameType && row.puzzle_id === puzzleId
    ) || null;
  }

  async function saveGameProgress(gameType, puzzle, update) {
    setGamesError("");
    const payload = {
      location_id: location.id,
      employee_id: employee?.id || null,
      employee_name: employee?.employee_name || "Covering Employee",
      game_type: gameType,
      puzzle_id: puzzle.puzzleId,
      service_date: gameDate,
      status: update.status,
      state: update.state,
      attempt_count: update.attemptCount,
      completed_at: update.status === "lost" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("daily_bites_game_progress")
      .upsert(payload, { onConflict: "location_id,game_type,puzzle_id" })
      .select("game_type, puzzle_id, service_date, status, state, attempt_count")
      .single();

    if (error) {
      console.error("Daily Bites game save error:", error);
      setGamesError(error.message || "Could not save game progress.");
      return false;
    }

    mergeGameProgress(data);
    return true;
  }

  async function completeGame(gameType, puzzle, update) {
    setGamesError("");
    const isWord = gameType === "word";
    const pointType = isWord ? "daily_bites_word_game" : "daily_bites_spark_sort";
    const gameName = isWord ? "Cafeteria Word" : "SPARK Sort";
    const uniqueKey = `daily-bites-${gameType}-${location.id}-${puzzle.puzzleId}`;

    const { error } = await supabase.rpc("complete_daily_bites_game", {
      p_location_id: location.id,
      p_employee_id: employee?.id || null,
      p_employee_name: employee?.employee_name || "Covering Employee",
      p_game_type: gameType,
      p_puzzle_id: puzzle.puzzleId,
      p_service_date: gameDate,
      p_state: update.state,
      p_attempt_count: update.attemptCount,
      p_points: update.points,
      p_point_type: pointType,
      p_description: `${gameName} completed${update.points > 0 ? ` — ${update.points} points` : ""}`,
      p_unique_key: uniqueKey,
    });

    if (error) {
      console.error("Daily Bites game completion error:", error);
      setGamesError(error.message || "Could not complete the game.");
      return false;
    }

    setBingoActivityVersion(v=>v+1);
    mergeGameProgress({
      game_type: gameType,
      puzzle_id: puzzle.puzzleId,
      service_date: gameDate,
      status: "won",
      state: update.state,
      attempt_count: update.attemptCount,
    });
    return true;
  }

  const wordProgress = getCurrentGameProgress("word", wordPuzzle.puzzleId);
  const sparkSortProgress = getCurrentGameProgress(
    "spark_sort",
    sparkSortPuzzle.puzzleId
  );
  const wordStreak = calculateGameStreak(gameProgress, "word", gameDate);
  const sparkSortStreak = calculateGameStreak(
    gameProgress,
    "spark_sort",
    gameDate
  );

  return (
    <div className="login-app">
      <header className="login-header">
        <div className="login-brand">
          <img
            src="/spark-192.png"
            alt="SPARK"
            className="spark-header-logo"
          />

          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>
            <div className="login-brand-subtitle">DAILY BITES</div>
          </div>
        </div>

        <button type="button" className="supervisor-link" onClick={onBack}>
          ← Home Base
        </button>
      </header>

      <main className="login-main">
        <div className="school-dashboard-page">
          <div className="school-dashboard-header">
            <div>
              <div className="dashboard-small-label">
                LOCATION {location?.location_code}
              </div>

              <h1>Daily Bites</h1>

              <p>
                {location?.school_name} • {employee?.employee_name}
              </p>
            </div>
          </div>

          <section className="dashboard-card">
            <div className="school-dashboard-section-title">
              <div>
                <div className="dashboard-small-label">TODAY'S BITE</div>
                <h2>{todaysBite?.title || "Daily Bite"}</h2>
                <p>A quick nutrition fact for your day.</p>
              </div>

              {todaysBite?.category && (
                <div
                  style={{
                    padding: "7px 11px",
                    borderRadius: "999px",
                    background: "#eef7ea",
                    border: "1px solid #d4e8cc",
                    color: "#3f6838",
                    fontSize: "12px",
                    fontWeight: "800",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatBiteCategory(todaysBite.category)}
                </div>
              )}
            </div>

            {todaysBite ? (
              <div
                style={{
                  marginTop: "14px",
                  padding: "20px",
                  borderRadius: "16px",
                  background: "#fbfcf8",
                  border: "1px solid #e1e8dc",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: "#35434a",
                    fontSize: "20px",
                    fontWeight: "700",
                    lineHeight: 1.55,
                  }}
                >
                  {todaysBite.fact}
                </p>
              </div>
            ) : (
              <div className="school-empty-history">
                No Daily Bite is available yet.
              </div>
            )}

            <p
              style={{
                margin: "12px 2px 0",
                color: "#74818a",
                fontSize: "12px",
              }}
            >
              New Daily Bites rotate Monday, Wednesday, and Friday.
            </p>
          </section>

          <section className="dashboard-card">
            <div className="school-dashboard-section-title">
              <div>
                <div className="dashboard-small-label">TODAY'S COMIC</div>
                <h2>Daily Bites Comic</h2>
                <p>A quick cafeteria comic for the day.</p>
              </div>
            </div>

            <div
              style={{
                marginTop: "14px",
                padding: "12px",
                borderRadius: "16px",
                background: "#ffffff",
                border: "1px solid #e1e8dc",
                overflow: "hidden",
              }}
            >
              <img
                src="/daily-bites-comics/regular_01.png"
                alt="Daily Bites cafeteria comic"
                style={{
                  display: "block",
                  width: "100%",
                  height: "auto",
                  borderRadius: "12px",
                }}
              />
            </div>
          </section>

          <section className="daily-games-section" aria-labelledby="daily-games-title">
            <div className="daily-games-intro">
              <div>
                <div className="dashboard-small-label">WEEKDAY GAMES</div>
                <h2 id="daily-games-title">Play, learn, and keep your streak going</h2>
                <p>
                  One shared puzzle of each kind per school, Monday through Friday.
                  Weekends keep Friday's puzzles available.
                </p>
              </div>
              <span className="daily-games-date">Puzzle date: {gameDate}</span>
            </div>

            {gamesError && <div className="login-error daily-games-error" role="alert">{gamesError}</div>}

            <div className="daily-games-grid">
              <CafeteriaWordGame
                puzzle={wordPuzzle}
                progress={wordProgress}
                streak={wordStreak}
                disabled={gamesLoading || Boolean(gamesError)}
                onSave={(update) => saveGameProgress("word", wordPuzzle, update)}
                onComplete={(update) => completeGame("word", wordPuzzle, update)}
              />
              <CafeteriaConnectionsGame
                puzzle={sparkSortPuzzle}
                progress={sparkSortProgress}
                streak={sparkSortStreak}
                disabled={gamesLoading || Boolean(gamesError)}
                onSave={(update) => saveGameProgress("spark_sort", sparkSortPuzzle, update)}
                onComplete={(update) => completeGame("spark_sort", sparkSortPuzzle, update)}
              />
            </div>
          </section>

          {arError && <div className="login-error daily-games-error" role="alert">{arError}</div>}
          <ArTrainingQuiz
            serviceDate={arServiceDate}
            dailyPoints={arDailyPoints}
            weekday={isWeekdayDate(arServiceDate)}
            loading={arLoading}
            disabled={arLoading || Boolean(arError)}
            questions={arQuestions}
            batchKey={arBatchKey}
            onAnswer={submitArAnswer}
          />

          <BingoPanel location={location} employee={employee} managerPin={managerPin} activityVersion={bingoActivityVersion} />

          <SupervisorLeaderboard
            embedded
            compact
            currentLocationId={location?.id}
          />
        </div>
      </main>
    </div>
  );
}

export default DailyBitesPage;
