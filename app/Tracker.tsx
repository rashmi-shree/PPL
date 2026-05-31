"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  workouts,
  cardio,
  generalGuidelines,
  progressionRules,
  type Exercise,
} from "@/lib/workouts";
import { isSupabaseEnabled } from "@/lib/supabase";
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

type WeightMap = Record<string, string[]>;
type RepsMap = Record<string, string[]>;
type SyncState = "idle" | "saving" | "saved" | "error" | "local";

// Accepts the old single-string-per-exercise shape and the new per-set arrays.
function normalizeWeights(raw: unknown): WeightMap {
  const out: WeightMap = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.map((x) => String(x ?? ""));
      else if (v != null && v !== "") out[k] = [String(v)];
    }
  }
  return out;
}

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
  const [sessionSync, setSessionSync] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [notes, setNotes] = useState("");
  const [rpe, setRpe] = useState("");

  // Days the user has actually edited this visit (gates auto-save so merely
  // opening/browsing a day never creates an empty history entry).
  const touchedDays = useRef<Set<string>>(new Set());
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rest timer
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const restRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form-demo video modal
  const [formVideo, setFormVideo] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const loadSessions = useCallback(async () => {
    const data = await getSessions(userId);
    setSessions(data);
  }, [userId]);

  useEffect(() => {
    setWeights(normalizeWeights(loadJson<unknown>(weightsKey(userId), {})));
    setReps(loadJson<RepsMap>(repsKeyFor(userId), {}));
    const savedUnit = window.localStorage.getItem("ppl-unit");
    if (savedUnit === "kg" || savedUnit === "lb") setUnit(savedUnit);
    setHydrated(true);

    (async () => {
      const data = await getSessions(userId);
      setSessions(data);

      // Restore today's per-set weights/reps so reopening mid-day shows them.
      const today = localDateString();
      const wMerge: WeightMap = {};
      const rMerge: RepsMap = {};
      data
        .filter((s) => s.log_date === today)
        .forEach((s) =>
          s.entries.forEach((e) => {
            if (e.weights && e.weights.length) {
              wMerge[e.exercise_id] = e.weights.map((x) =>
                x === null || x === undefined ? "" : String(x)
              );
            } else if (e.weight !== null && e.weight !== undefined) {
              wMerge[e.exercise_id] = [String(e.weight)];
            }
            if (e.reps && e.reps.length) {
              rMerge[e.exercise_id] = e.reps.map((x) => (x ? String(x) : ""));
            }
          })
        );
      if (Object.keys(wMerge).length)
        setWeights((prev) => ({ ...prev, ...wMerge }));
      if (Object.keys(rMerge).length)
        setReps((prev) => ({ ...prev, ...rMerge }));
      setSync(isSupabaseEnabled ? "saved" : "local");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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

  // Best weight per exercise from PRIOR days (excludes today's auto-saved
  // session so the PR badge keeps showing while you're beating it today).
  const prByExercise = useMemo(() => {
    const today = localDateString();
    const map: Record<string, number> = {};
    sessions.forEach((s) => {
      if (s.log_date === today) return;
      s.entries.forEach((e) => {
        if (e.weight !== null && e.weight !== undefined) {
          map[e.exercise_id] = Math.max(map[e.exercise_id] ?? 0, e.weight);
        }
      });
    });
    return map;
  }, [sessions]);

  const setWeight = (id: string, setIdx: number, value: string, total: number) => {
    const clean = value.replace(/[^0-9.]/g, "");
    touchedDays.current.add(activeDay);
    setWeights((prev) => {
      const arr = [...(prev[id] ?? Array(total).fill(""))];
      while (arr.length < total) arr.push("");
      arr[setIdx] = clean;
      return { ...prev, [id]: arr };
    });
  };

  const setRep = (id: string, setIdx: number, value: string, total: number) => {
    const clean = value.replace(/[^0-9]/g, "").slice(0, 3);
    touchedDays.current.add(activeDay);
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

  // Keep notes/RPE in sync with the active day's saved session — but never
  // clobber a day the user is actively editing.
  useEffect(() => {
    if (!hydrated) return;
    if (touchedDays.current.has(day.id)) return;
    const today = localDateString();
    const todays = sessions.find(
      (s) => s.day_id === day.id && s.log_date === today
    );
    setNotes(todays?.notes ?? "");
    setRpe(todays?.rpe != null ? String(todays.rpe) : "");
  }, [day, sessions, hydrated]);

  const autoSaveSession = useCallback(async () => {
    if (!userId) return;
    const entries: SessionEntry[] = day.exercises.map((ex) => {
      const total = workingSetsOf(ex);
      const weightsArr = Array.from({ length: total }, (_, i) => {
        const v = (weights[ex.id] ?? [])[i];
        return v === undefined || v === "" ? null : Number(v);
      });
      const repArr = Array.from({ length: total }, (_, i) => {
        const v = (reps[ex.id] ?? [])[i];
        return v === undefined || v === "" ? 0 : Number(v);
      });
      const top = weightsArr.reduce<number | null>(
        (m, x) => (x === null ? m : m === null ? x : Math.max(m, x)),
        null
      );
      return {
        exercise_id: ex.id,
        name: ex.name,
        weight: top,
        unit,
        reps: repArr,
        weights: weightsArr,
      };
    });
    if (!entries.some((e) => e.weight !== null)) return;
    setSessionSync("saving");
    setSync("saving");
    const { ok } = await saveSession(userId, day.id, entries, {
      notes: notes.trim() || null,
      rpe: rpe === "" ? null : Number(rpe),
    });
    setSessionSync(ok ? "saved" : "error");
    setSync(ok ? "saved" : "error");
    if (ok) await loadSessions();
  }, [userId, day, weights, reps, unit, notes, rpe, loadSessions]);

  // Debounced auto-save: fires only after a real edit on the active day.
  useEffect(() => {
    if (!hydrated) return;
    if (!touchedDays.current.has(day.id)) return;
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      void autoSaveSession();
    }, 1200);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [weights, reps, notes, rpe, day, hydrated, autoSaveSession]);

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
              weights={weights[ex.id] ?? []}
              reps={reps[ex.id] ?? []}
              last={lastByExercise.map[ex.id]}
              prBest={prByExercise[ex.id]}
              onWeight={(idx, v) => setWeight(ex.id, idx, v, workingSetsOf(ex))}
              onRep={(idx, v) => setRep(ex.id, idx, v, workingSetsOf(ex))}
              onRest={() => startRest(restSecondsOf(ex))}
              onForm={
                ex.video
                  ? () => setFormVideo({ id: ex.video!, name: ex.name })
                  : undefined
              }
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
              onChange={(e) => {
                touchedDays.current.add(activeDay);
                setRpe(e.target.value);
              }}
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
            onChange={(e) => {
              touchedDays.current.add(activeDay);
              setNotes(e.target.value);
            }}
            rows={2}
          />
        </div>

        <div className="log-row">
          <span className={`autosave ${sessionSync}`}>
            {sessionSync === "saving" && "Saving…"}
            {sessionSync === "saved" && "Saved automatically ✓"}
            {sessionSync === "error" && "Couldn't save — check your connection"}
            {sessionSync === "idle" &&
              "Your weights save automatically as you log them"}
          </span>
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

      {formVideo && (
        <FormVideoModal video={formVideo} onClose={() => setFormVideo(null)} />
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

function FormVideoModal({
  video,
  onClose,
}: {
  video: { id: string; name: string };
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="video-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="video-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="video-head">
          <span className="video-title">{video.name} — form</span>
          <button className="video-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="video-frame">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.id}?rel=0&playsinline=1`}
            title={`${video.name} form demo`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <a
          className="video-link"
          href={`https://www.youtube.com/watch?v=${video.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in YouTube ↗
        </a>
      </div>
    </div>
  );
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
  weights,
  reps,
  last,
  prBest,
  onWeight,
  onRep,
  onRest,
  onForm,
}: {
  index: number;
  exercise: Exercise;
  unit: string;
  weights: string[];
  reps: string[];
  last?: SessionEntry;
  prBest?: number;
  onWeight: (setIdx: number, v: string) => void;
  onRep: (idx: number, v: string) => void;
  onRest: () => void;
  onForm?: () => void;
}) {
  const total = Number(exercise.sets) || 3;
  const target = exercise.type === "compound" ? 8 : 12;
  const inc = unit === "lb" ? 5 : 2.5;

  const weightsFilled = Array.from({ length: total }, (_, i) => weights[i] ?? "");
  const repsFilled = Array.from({ length: total }, (_, i) => reps[i] ?? "");

  const topSet = weightsFilled.reduce<number | null>((m, v) => {
    if (v === "") return m;
    const n = Number(v);
    return m === null ? n : Math.max(m, n);
  }, null);

  const allHit =
    weightsFilled.some((w) => w !== "") &&
    repsFilled.every((r) => r !== "" && Number(r) >= target);

  const isPR = topSet !== null && prBest != null && topSet > prBest;

  const lastText = (() => {
    if (!last) return null;
    const rs = last.reps ?? [];
    if (last.weights && last.weights.length) {
      return (
        last.weights
          .map((w, i) => `${w ?? "—"}×${rs[i] ?? "—"}`)
          .join(" · ") + ` ${last.unit}`
      );
    }
    if (last.weight === null || last.weight === undefined) return "—";
    const repsStr = rs.length ? ` × ${rs.join("/")}` : "";
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
            {onForm && (
              <button className="form-trigger" onClick={onForm} type="button">
                ▶ Form
              </button>
            )}
          </div>
          {exercise.note && <p className="card-note">{exercise.note}</p>}
        </div>
      </div>

      <div className="sets">
        <div className="sets-head">
          <span className="col-set">Set</span>
          <span className="col-weight">Weight ({unit})</span>
          <span className="col-reps">Reps</span>
        </div>
        {Array.from({ length: total }, (_, i) => {
          const wv = weightsFilled[i];
          const wn = wv === "" ? 0 : Number(wv);
          return (
            <div className="set-row" key={i}>
              <span className="set-no">{i + 1}</span>
              <div className="weight-input">
                <button
                  type="button"
                  className="step-btn"
                  aria-label={`Set ${i + 1}: decrease by 1`}
                  onClick={() =>
                    onWeight(i, String(Math.max(0, +((wn - 1).toFixed(2)))))
                  }
                >
                  −
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={wv}
                  onChange={(e) => onWeight(i, e.target.value)}
                  aria-label={`Set ${i + 1} weight`}
                />
                <button
                  type="button"
                  className="step-btn"
                  aria-label={`Set ${i + 1}: increase by 1`}
                  onClick={() => onWeight(i, String(+((wn + 1).toFixed(2))))}
                >
                  +
                </button>
              </div>
              <input
                className="set-reps"
                type="text"
                inputMode="numeric"
                placeholder={String(target)}
                value={repsFilled[i]}
                onChange={(e) => onRep(i, e.target.value)}
                aria-label={`Set ${i + 1} reps`}
              />
            </div>
          );
        })}
      </div>

      <div className="hints">
        <span className="last-time">
          {last ? `Last time: ${lastText}` : "No previous session yet"}
        </span>
        {allHit && topSet !== null && (
          <span className="nudge">
            💪 Hit all {target} reps — try {topSet + inc} {unit} next time
          </span>
        )}
      </div>
    </li>
  );
}
