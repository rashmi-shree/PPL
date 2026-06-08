"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Exercise, WorkoutDay } from "@/lib/workouts";
import {
  parseWorkoutMessage,
  type ParsedSet,
  type Unit,
} from "@/lib/chatParse";

type FillAll = { weight: number | null; reps: number | null } | null;

type Msg =
  | { id: string; role: "user" | "bot"; text: string }
  | {
      id: string;
      role: "bot";
      kind: "confirm";
      exercise: Exercise;
      unit: Unit;
      sets: ParsedSet[];
      done?: "logged" | "cancelled";
    }
  | {
      id: string;
      role: "bot";
      kind: "choose";
      candidates: Exercise[];
      sets: ParsedSet[];
      fillAll: FillAll;
      unit: Unit;
      done?: boolean;
    };

let counter = 0;
const nextId = () => `m${Date.now()}-${counter++}`;

function totalSets(ex: Exercise) {
  return Number(ex.sets) || 3;
}

// Expand an "each/all" broadcast into one row per working set.
function expandSets(ex: Exercise, sets: ParsedSet[], fillAll: FillAll): ParsedSet[] {
  if (!fillAll) return sets;
  const total = totalSets(ex);
  return Array.from({ length: total }, (_, i) => ({
    setNo: i + 1,
    weight: fillAll.weight,
    reps: fillAll.reps,
  }));
}

function setLine(s: ParsedSet, unit: Unit) {
  const w = s.weight != null ? `${s.weight} ${unit}` : "—";
  const r = s.reps != null ? `${s.reps} reps` : "— reps";
  return { w, r };
}

export default function ChatLogger({
  workouts,
  activeDayId,
  unit,
  onApply,
}: {
  workouts: WorkoutDay[];
  activeDayId: string;
  unit: Unit;
  onApply: (
    dayId: string,
    exerciseId: string,
    unit: Unit,
    sets: ParsedSet[]
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Match across the whole program so "squats" works even on Push day.
  const allExercises = useMemo(
    () => workouts.flatMap((w) => w.exercises),
    [workouts]
  );
  const dayByExercise = useMemo(() => {
    const map: Record<string, string> = {};
    workouts.forEach((w) => w.exercises.forEach((e) => (map[e.id] = w.id)));
    return map;
  }, [workouts]);
  const activeExercises = useMemo(
    () => workouts.find((w) => w.id === activeDayId)?.exercises ?? [],
    [workouts, activeDayId]
  );

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          id: nextId(),
          role: "bot",
          text:
            "Hey! Just tell me the exercise and your sets — I'll log them.\n\n" +
            "Try: “bench 40kg 8, 45kg 6, 45kg 6” or “squats 60kg 10 each”.",
        },
      ]);
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages]);

  const push = (m: Msg) => setMessages((prev) => [...prev, m]);

  const resolveExercise = (
    ex: Exercise,
    sets: ParsedSet[],
    fillAll: FillAll,
    u: Unit
  ) => {
    push({
      id: nextId(),
      role: "bot",
      kind: "confirm",
      exercise: ex,
      unit: u,
      sets: expandSets(ex, sets, fillAll),
    });
  };

  const handleSend = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    push({ id: nextId(), role: "user", text });
    setInput("");

    const res = parseWorkoutMessage(text, allExercises, unit);

    if (res.sets.length === 0 && !res.fillAll) {
      push({
        id: nextId(),
        role: "bot",
        text:
          "I didn't catch any sets there. Try something like " +
          "“squats 60kg 8, 60kg 8, 55kg 8”.",
      });
      return;
    }

    if (res.exercise) {
      resolveExercise(res.exercise, res.sets, res.fillAll, res.unit);
      return;
    }

    const choices = res.candidates.length ? res.candidates : activeExercises;
    push({
      id: nextId(),
      role: "bot",
      kind: "choose",
      candidates: choices,
      sets: res.sets,
      fillAll: res.fillAll,
      unit: res.unit,
    });
  };

  const confirmLog = (id: string) => {
    const target = messages.find(
      (m) => m.id === id && "kind" in m && m.kind === "confirm"
    ) as Extract<Msg, { kind: "confirm" }> | undefined;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && "kind" in m && m.kind === "confirm"
          ? { ...m, done: "logged" }
          : m
      )
    );
    if (!target) return;
    const dayId = dayByExercise[target.exercise.id] ?? activeDayId;
    onApply(dayId, target.exercise.id, target.unit, target.sets);
    const switched = dayId !== activeDayId;
    push({
      id: nextId(),
      role: "bot",
      text: switched
        ? `Logged ${target.exercise.name} ✓ (switched to that day) — anything else?`
        : `Logged ${target.exercise.name} ✓ — anything else?`,
    });
  };

  const cancelLog = (id: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && "kind" in m && m.kind === "confirm"
          ? { ...m, done: "cancelled" }
          : m
      )
    );
  };

  const chooseExercise = (chooseId: string, ex: Exercise) => {
    let sets: ParsedSet[] = [];
    let fillAll: FillAll = null;
    let u: Unit = unit;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id === chooseId && "kind" in m && m.kind === "choose") {
          sets = m.sets;
          fillAll = m.fillAll;
          u = m.unit;
          return { ...m, done: true };
        }
        return m;
      })
    );
    resolveExercise(ex, sets, fillAll, u);
  };

  return (
    <>
      {!open && (
        <button
          className="chat-fab"
          onClick={() => setOpen(true)}
          aria-label="Log with chat"
          type="button"
        >
          <ChatIcon />
        </button>
      )}

      {open && (
        <>
          <div className="chat-backdrop" onClick={() => setOpen(false)} />
          <div
            className="chat-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Chat logger"
          >
            <div className="chat-head">
              <div>
                <h3>Log by chat</h3>
                <p className="sub">Tell me the exercise &amp; your sets</p>
              </div>
              <button
                className="chat-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="chat-body" ref={bodyRef}>
              {messages.map((m) => {
                if (!("kind" in m)) {
                  return (
                    <div key={m.id} className={`chat-msg ${m.role}`}>
                      {m.text}
                    </div>
                  );
                }
                if (m.kind === "confirm") {
                  return (
                    <div key={m.id} className="chat-card">
                      <div className="chat-card-title">{m.exercise.name}</div>
                      {m.sets.map((s) => {
                        const { w, r } = setLine(s, m.unit);
                        return (
                          <div className="chat-set" key={s.setNo}>
                            <span className="lbl">Set {s.setNo}</span>
                            <span>
                              {w} · {r}
                            </span>
                          </div>
                        );
                      })}
                      {!m.done && (
                        <div className="chat-card-actions">
                          <button
                            className="chat-btn primary"
                            onClick={() => confirmLog(m.id)}
                            type="button"
                          >
                            Log it ✓
                          </button>
                          <button
                            className="chat-btn ghost"
                            onClick={() => cancelLog(m.id)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      {m.done === "logged" && (
                        <div className="chat-done">Logged ✓</div>
                      )}
                      {m.done === "cancelled" && (
                        <div className="chat-done cancelled">Cancelled</div>
                      )}
                    </div>
                  );
                }
                // choose
                return (
                  <div key={m.id} className="chat-card">
                    <div className="chat-card-title">Which exercise?</div>
                    <div className="chat-choices">
                      {m.candidates.map((ex) => (
                        <button
                          key={ex.id}
                          className="chat-chip"
                          onClick={() => chooseExercise(m.id, ex)}
                          type="button"
                          disabled={m.done}
                        >
                          {ex.name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <form
              className="chat-input-row"
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. bench 40kg 8, 45kg 6, 45kg 6"
                aria-label="Message"
              />
              <button
                className="chat-send"
                type="submit"
                disabled={!input.trim()}
              >
                Send
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}

function ChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="26"
      height="26"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7a8.5 8.5 0 0 1-.9-3.8A8.38 8.38 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
    </svg>
  );
}
