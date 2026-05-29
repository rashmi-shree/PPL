"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  workouts,
  cardio,
  generalGuidelines,
  progressionRules,
  type Exercise,
} from "@/lib/workouts";
import { supabase, isSupabaseEnabled, type WeightRow } from "@/lib/supabase";
import {
  saveSession,
  getSessions,
  localDateString,
  type SessionEntry,
  type WorkoutSession,
} from "@/lib/sessions";
import { useAuth } from "./AuthProvider";
import Reminders from "./Reminders";
import Nav from "./Nav";

const STORAGE_KEY = "ppl-weights-v1";
const REPS_KEY = "ppl-reps-v1";

type WeightMap = Record<string, string>;
type RepsMap = Record<string, string[]>;
type SyncState = "idle" | "saving" | "saved" | "error" | "local";

function weightsKey(userId?: string) {
  return userId ? `${STORAGE_KEY}-${userId}` : STORAGE_KEY;
}
function repsKeyFor(userId?: string) {
  return userId ? `${REPS_KEY}-${userId}` : REPS_KEY;
}

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Program-derived targets.
function repTarget(ex: Exercise) {
  return ex.type === "compound" ? 8 : 12;
}
function workingSetsOf(ex: Exercise) {
  return Number(ex.sets) || 3;
}
function restSecondsOf(ex: Exercise) {
  const m = ex.rest.match(/(\d+)\s*min/);
  return m ? Number(m[1]) * 60 : 120;
}
function increment(unit: string) {
  return unit === "lb" ? 5 : 2.5;
}

function beep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.value = 880;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.start(t);
    o.stop(t + 0.52);
  } catch {
    /* audio not available */
  }
  navigator.vibrate?.([300, 100, 300]);
}

export default function Tracker() {
  const { user } = useAuth();
  const userId = user?.id;
  const [activeDay, setActiveDay] = useState(workouts[0].id);
  const [weights, setWeights] = useState<WeightMap>({});
  const [reps, setReps] = useState<RepsMap>({});
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [showGuide, setShowGuide] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sync, setSync] = useState<SyncState>(
    isSupabaseEnabled ? "idle" : "local"
  );
  const [logging, setLogging] = useState(false);
  const [logMsg, setLogMsg] = useState("");
  const [notes, setNotes] = useState("");
  const [rpe, setRpe] = useState("");

  const pending = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Rest timer
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSessions = useCallback(async () => {
    const data = await getSessions(userId);
    setSessions(data);
  }, [userId]);

  useEffect(() => {
    setWeights(loadJson<WeightMap>(weightsKey(userId), {}));
    setReps(loadJson<RepsMap>(repsKeyFor(userId), {}));
    const savedUnit = window.localStorage.getItem("ppl-unit");
    if (savedUnit === "kg" || savedUnit === "lb") setUnit(savedUnit);
    setHydrated(true);

    loadSessions();

    if (!supabase || !userId) return;
    (async () => {
      const { data, error } = await supabase
        .from("exercise_weights")
        .select("exercise_id, weight, unit");
      if (error) {
        setSync("error");
        return;
      }
      if (data) {
        setWeights((prev) => {
          const merged = { ...prev };
          (data as WeightRow[]).forEach((row) => {
            if (row.weight !== null && row.weight !== undefined) {
              merged[row.exercise_id] = String(row.weight);
            }
          });
          return merged;
        });
        setSync("saved");
      }
    })();
  }, [userId, loadSessions]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(weightsKey(userId), JSON.stringify(weights));
  }, [weights, hydrated, userId]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(repsKeyFor(userId), JSON.stringify(reps));
  }, [reps, hydrated, userId]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem("ppl-unit", unit);
  }, [unit, hydrated]);

  useEffect(() => {
    return () => {
      if (restRef.current) clearInterval(restRef.current);
    };
  }, []);

  const day = useMemo(
    () => workouts.find((w) => w.id === activeDay) ?? workouts[0],
    [activeDay]
  );

  // Previous session of THIS day (excluding today) → "Last time".
  const lastByExercise = useMemo(() => {
    const today = localDateString();
    const prior = sessions.find(
      (s) => s.day_id === day.id && s.log_date !== today
    );
    const map: Record<string, SessionEntry> = {};
    prior?.entries.forEach((e) => (map[e.exercise_id] = e));
    return { map, session: prior };
  }, [sessions, day]);

  // Best weight ever recorded per exercise (PR baseline).
  const prByExercise = useMemo(() => {
    const map: Record<string, number> = {};
    sessions.forEach((s) =>
      s.entries.forEach((e) => {
        if (e.weight !== null && e.weight !== undefined) {
          map[e.exercise_id] = Math.max(map[e.exercise_id] ?? 0, e.weight);
        }
      })
    );
    return map;
  }, [sessions]);

  const upsertToCloud = (exerciseId: string, value: string) => {
    if (!supabase || !userId) return;
    if (pending.current[exerciseId]) clearTimeout(pending.current[exerciseId]);
    setSync("saving");
    pending.current[exerciseId] = setTimeout(async () => {
      const weight = value === "" ? null : Number(value);
      const { error } = await supabase!.from("exercise_weights").upsert(
        {
          user_id: userId,
          exercise_id: exerciseId,
          weight,
          unit,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,exercise_id" }
      );
      setSync(error ? "error" : "saved");
    }, 600);
  };

  const setWeight = (id: string, value: string) => {
    const clean = value.replace(/[^0-9.]/g, "");
    setWeights((prev) => ({ ...prev, [id]: clean }));
    upsertToCloud(id, clean);
  };

  const setRep = (id: string, setIdx: number, value: string, total: number) => {
    const clean = value.replace(/[^0-9]/g, "").slice(0, 3);
    setReps((prev) => {
      const arr = [...(prev[id] ?? Array(total).fill(""))];
      while (arr.length < total) arr.push("");
      arr[setIdx] = clean;
      return { ...prev, [id]: arr };
    });
  };

  const startRest = (seconds: number) => {
    if (restRef.current) clearInterval(restRef.current);
    setRestLeft(seconds);
    restRef.current = setInterval(() => {
      setRestLeft((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (restRef.current) clearInterval(restRef.current);
          restRef.current = null;
          beep();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };
  const stopRest = () => {
    if (restRef.current) clearInterval(restRef.current);
    restRef.current = null;
    setRestLeft(null);
  };
  const addRest = (s: number) =>
    setRestLeft((prev) => (prev === null ? s : prev + s));

  const logWorkout = async () => {
    setLogging(true);
    setLogMsg("");
    const prs: string[] = [];
    const entries: SessionEntry[] = day.exercises.map((ex) => {
      const total = workingSetsOf(ex);
      const w = weights[ex.id] ? Number(weights[ex.id]) : null;
      if (w !== null && w > (prByExercise[ex.id] ?? 0)) prs.push(ex.name);
      const repArr = (reps[ex.id] ?? [])
        .slice(0, total)
        .map((r) => (r === "" ? 0 : Number(r)));
      return { exercise_id: ex.id, name: ex.name, weight: w, unit, reps: repArr };
    });
    const { ok } = await saveSession(userId, day.id, entries, {
      notes: notes.trim() || null,
      rpe: rpe === "" ? null : Number(rpe),
    });
    setLogging(false);
    if (!ok) {
      setLogMsg("Couldn't save — try again");
    } else {
      await loadSessions();
      setNotes("");
      setRpe("");
      setLogMsg(
        prs.length
          ? `${day.title} logged ✓ · 🏆 New PR: ${prs.join(", ")}!`
          : `${day.title} logged ✓`
      );
    }
    setTimeout(() => setLogMsg(""), 6000);
  };

  return (
    <main className="page">
      <Reminders />
      <header className="header">
        <div className="header-top">
          <div>
            <h1 className="title">PPL Program</h1>
            <p className="tagline">Push · Pull · Legs — Strength &amp; Hypertrophy</p>
          </div>
          <div className="unit-toggle" role="group" aria-label="Weight unit">
            <button
              className={unit === "kg" ? "active" : ""}
              onClick={() => setUnit("kg")}
            >
              kg
            </button>
            <button
              className={unit === "lb" ? "active" : ""}
              onClick={() => setUnit("lb")}
            >
              lb
            </button>
          </div>
        </div>

        <nav className="tabs" aria-label="Workout day">
          {workouts.map((w) => (
            <button
              key={w.id}
              className={`tab ${activeDay === w.id ? "tab-active" : ""}`}
              onClick={() => setActiveDay(w.id)}
            >
              {w.title.replace(" Day", "")}
            </button>
          ))}
        </nav>
      </header>

      <section className="day">
        <div className="day-head">
          <h2 className="day-title">{day.title}</h2>
          <p className="day-sub">{day.subtitle}</p>
        </div>

        <ul className="cards">
          {day.exercises.map((ex, i) => (
            <ExerciseCard
              key={ex.id}
              index={i + 1}
              exercise={ex}
              unit={unit}
              weight={weights[ex.id] ?? ""}
              reps={reps[ex.id] ?? []}
              last={lastByExercise.map[ex.id]}
              prBest={prByExercise[ex.id]}
              onWeight={(v) => setWeight(ex.id, v)}
              onRep={(idx, v) => setRep(ex.id, idx, v, workingSetsOf(ex))}
              onRest={() => startRest(restSecondsOf(ex))}
            />
          ))}
        </ul>

        <div className="cardio">
          <span className="cardio-badge">Cardio</span>
          <p>{cardio.detail}</p>
        </div>

        <div className="session-meta">
          <div className="rpe-field">
            <label htmlFor="rpe">How hard? (RPE)</label>
            <select
              id="rpe"
              value={rpe}
              onChange={(e) => setRpe(e.target.value)}
            >
              <option value="">—</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <textarea
            className="notes-field"
            placeholder="Session notes — how did it feel?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        <div className="log-row">
          <button className="log-btn" onClick={logWorkout} disabled={logging}>
            {logging ? "Saving…" : `Log this ${day.title}`}
          </button>
          {logMsg && <span className="log-msg">{logMsg}</span>}
        </div>
      </section>

      <section className="guide">
        <button
          className="guide-toggle"
          onClick={() => setShowGuide((s) => !s)}
          aria-expanded={showGuide}
        >
          <span>Guidelines &amp; Progression</span>
          <span className={`chevron ${showGuide ? "open" : ""}`}>⌄</span>
        </button>
        {showGuide && (
          <div className="guide-body">
            <h3>General Guidelines</h3>
            <ul>
              {generalGuidelines.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
            <h3>Progression Rule</h3>
            <ul>
              {progressionRules.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <footer className="footer">
        <SyncBadge sync={sync} />
      </footer>

      {restLeft !== null && (
        <div className="rest-pill" role="status">
          <span className="rest-label">Rest</span>
          <span className="rest-time">{formatClock(restLeft)}</span>
          <button onClick={() => addRest(30)}>+30s</button>
          <button onClick={stopRest}>Skip</button>
        </div>
      )}

      <Nav />
    </main>
  );
}

function formatClock(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function SyncBadge({ sync }: { sync: SyncState }) {
  const label: Record<SyncState, string> = {
    idle: "Connected to cloud",
    saving: "Saving…",
    saved: "Saved to cloud",
    error: "Cloud error — saved on this device",
    local: "Saved on this device",
  };
  return <span className={`sync sync-${sync}`}>{label[sync]}</span>;
}

function ExerciseCard({
  index,
  exercise,
  unit,
  weight,
  reps,
  last,
  prBest,
  onWeight,
  onRep,
  onRest,
}: {
  index: number;
  exercise: Exercise;
  unit: string;
  weight: string;
  reps: string[];
  last?: SessionEntry;
  prBest?: number;
  onWeight: (v: string) => void;
  onRep: (idx: number, v: string) => void;
  onRest: () => void;
}) {
  const total = Number(exercise.sets) || 3;
  const target = exercise.type === "compound" ? 8 : 12;
  const inc = unit === "lb" ? 5 : 2.5;
  const weightNum = weight === "" ? null : Number(weight);

  const repsFilled = Array.from({ length: total }, (_, i) => reps[i] ?? "");
  const allHit =
    weightNum !== null &&
    repsFilled.every((r) => r !== "" && Number(r) >= target);

  const isPR = weightNum !== null && prBest != null && weightNum > prBest;

  const lastText = (() => {
    if (!last) return null;
    if (last.weight === null || last.weight === undefined) return "—";
    const repsStr =
      last.reps && last.reps.length
        ? ` × ${last.reps.join("/")}`
        : "";
    return `${last.weight} ${last.unit}${repsStr}`;
  })();

  return (
    <li className="card">
      <div className="card-main">
        <span className="card-index">{index}</span>
        <div className="card-info">
          <div className="card-name-row">
            <h3 className="card-name">{exercise.name}</h3>
            <span className={`type-pill ${exercise.type}`}>{exercise.type}</span>
            {isPR && <span className="pr-pill">🏆 PR</span>}
          </div>
          <div className="meta">
            <span>
              <strong>{exercise.sets}</strong> sets
            </span>
            <span>
              <strong>{exercise.reps}</strong> reps
            </span>
            <button className="rest-trigger" onClick={onRest} type="button">
              ⏱ Rest {exercise.rest}
            </button>
          </div>
          {exercise.note && <p className="card-note">{exercise.note}</p>}
        </div>
      </div>

      <div className="weight">
        <label htmlFor={`w-${exercise.id}`}>Current weight</label>
        <div className="weight-input">
          <input
            id={`w-${exercise.id}`}
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={weight}
            onChange={(e) => onWeight(e.target.value)}
          />
          <span className="unit">{unit}</span>
        </div>
      </div>

      <div className="reps-row">
        <span className="reps-label">Reps / set</span>
        <div className="reps-inputs">
          {repsFilled.map((r, i) => (
            <input
              key={i}
              type="text"
              inputMode="numeric"
              placeholder={String(target)}
              value={r}
              onChange={(e) => onRep(i, e.target.value)}
              aria-label={`Set ${i + 1} reps`}
            />
          ))}
        </div>
      </div>

      <div className="hints">
        <span className="last-time">
          {last
            ? `Last time: ${lastText}`
            : "No previous session yet"}
        </span>
        {allHit && (
          <span className="nudge">
            💪 Hit all {target} reps — try {(weightNum as number) + inc} {unit}{" "}
            next time
          </span>
        )}
      </div>
    </li>
  );
}
