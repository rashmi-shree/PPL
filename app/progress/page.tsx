"use client";

import { useEffect, useMemo, useState } from "react";
import { workouts } from "@/lib/workouts";
import { getSessions, localDateString, type WorkoutSession } from "@/lib/sessions";
import { getBodyWeights, saveBodyWeight, type BodyWeight } from "@/lib/bodyweight";
import { useAuth } from "../AuthProvider";
import { LineChart, Heatmap, type ChartPoint } from "../Charts";
import Nav from "../Nav";

const allExercises = workouts.flatMap((w) =>
  w.exercises.map((e) => ({ id: e.id, name: e.name, day: w.title }))
);

function computeStreak(dates: Set<string>): number {
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const fmt = (x: Date) => localDateString(x);
  // Allow the streak to count from today or yesterday.
  if (!dates.has(fmt(d))) d.setDate(d.getDate() - 1);
  while (dates.has(fmt(d))) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export default function ProgressPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [bodyWeights, setBodyWeights] = useState<BodyWeight[]>([]);
  const [loading, setLoading] = useState(true);
  const [exerciseId, setExerciseId] = useState(allExercises[0].id);

  const [bwInput, setBwInput] = useState("");
  const [bwUnit, setBwUnit] = useState<"kg" | "lb">("kg");
  const [bwBusy, setBwBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [s, bw] = await Promise.all([
        getSessions(userId),
        getBodyWeights(userId),
      ]);
      setSessions(s);
      setBodyWeights(bw);
      const savedUnit = window.localStorage.getItem("ppl-bw-unit");
      if (savedUnit === "kg" || savedUnit === "lb") setBwUnit(savedUnit);
      setLoading(false);
    })();
  }, [userId]);

  const trainedDates = useMemo(
    () => new Set(sessions.map((s) => s.log_date ?? s.performed_at.slice(0, 10))),
    [sessions]
  );
  const streak = useMemo(() => computeStreak(trainedDates), [trainedDates]);
  const totalWorkouts = trainedDates.size;

  const exerciseSeries: ChartPoint[] = useMemo(() => {
    const pts: ChartPoint[] = [];
    // sessions come newest-first; reverse for chronological order.
    [...sessions].reverse().forEach((s) => {
      const entry = s.entries.find((e) => e.exercise_id === exerciseId);
      if (entry && entry.weight !== null && entry.weight !== undefined) {
        pts.push({ x: new Date(s.performed_at).getTime(), y: entry.weight });
      }
    });
    return pts;
  }, [sessions, exerciseId]);

  const exerciseUnit = useMemo(() => {
    for (const s of sessions) {
      const e = s.entries.find((x) => x.exercise_id === exerciseId);
      if (e?.unit) return e.unit;
    }
    return "kg";
  }, [sessions, exerciseId]);

  const bodySeries: ChartPoint[] = useMemo(
    () =>
      bodyWeights.map((b) => ({
        x: new Date(b.log_date).getTime(),
        y: b.weight,
      })),
    [bodyWeights]
  );

  const latestBw = bodyWeights[bodyWeights.length - 1];
  const bwChange =
    bodyWeights.length >= 2
      ? latestBw.weight - bodyWeights[0].weight
      : null;

  const logBodyWeight = async () => {
    const val = Number(bwInput);
    if (!val) return;
    setBwBusy(true);
    window.localStorage.setItem("ppl-bw-unit", bwUnit);
    await saveBodyWeight(userId, val, bwUnit);
    const bw = await getBodyWeights(userId);
    setBodyWeights(bw);
    setBwInput("");
    setBwBusy(false);
  };

  return (
    <main className="page">
      <header className="header">
        <div className="header-top">
          <div>
            <h1 className="title">Progress</h1>
            <p className="tagline">Track your consistency and gains</p>
          </div>
        </div>
      </header>

      {loading ? (
        <p className="empty">Loading…</p>
      ) : (
        <div className="progress">
          {/* Streak / consistency */}
          <section className="panel">
            <div className="panel-head">
              <h2>Consistency</h2>
              <div className="stat-row">
                <span className="stat">
                  <strong>🔥 {streak}</strong> day streak
                </span>
                <span className="stat">
                  <strong>{totalWorkouts}</strong> total
                </span>
              </div>
            </div>
            <Heatmap dates={trainedDates} />
            <p className="panel-hint">Last 16 weeks · each square is a day</p>
          </section>

          {/* Per-exercise progress */}
          <section className="panel">
            <div className="panel-head">
              <h2>Exercise progress</h2>
            </div>
            <select
              className="exercise-select"
              value={exerciseId}
              onChange={(e) => setExerciseId(e.target.value)}
            >
              {workouts.map((w) => (
                <optgroup key={w.id} label={w.title}>
                  {w.exercises.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <LineChart points={exerciseSeries} unit={exerciseUnit} />
          </section>

          {/* Body weight */}
          <section className="panel">
            <div className="panel-head">
              <h2>Body weight</h2>
              {latestBw && (
                <div className="stat-row">
                  <span className="stat">
                    <strong>
                      {latestBw.weight} {latestBw.unit}
                    </strong>{" "}
                    latest
                  </span>
                  {bwChange !== null && (
                    <span className="stat">
                      <strong>
                        {bwChange >= 0 ? "+" : ""}
                        {bwChange.toFixed(1)}
                      </strong>{" "}
                      overall
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="bw-form">
              <div className="weight-input bw-field">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Today's weight"
                  value={bwInput}
                  onChange={(e) =>
                    setBwInput(e.target.value.replace(/[^0-9.]/g, ""))
                  }
                />
                <span className="unit">{bwUnit}</span>
              </div>
              <div className="unit-toggle" role="group" aria-label="Body weight unit">
                <button
                  className={bwUnit === "kg" ? "active" : ""}
                  onClick={() => setBwUnit("kg")}
                >
                  kg
                </button>
                <button
                  className={bwUnit === "lb" ? "active" : ""}
                  onClick={() => setBwUnit("lb")}
                >
                  lb
                </button>
              </div>
              <button
                className="bw-log"
                onClick={logBodyWeight}
                disabled={bwBusy || !bwInput}
              >
                {bwBusy ? "…" : "Log"}
              </button>
            </div>

            <LineChart points={bodySeries} unit={bwUnit} />
          </section>
        </div>
      )}

      <Nav />
    </main>
  );
}
