"use client";

import { useEffect, useMemo, useState } from "react";
import { workouts } from "@/lib/workouts";
import {
  getSessions,
  updateSession,
  deleteSession,
  type WorkoutSession,
  type SessionEntry,
} from "@/lib/sessions";
import { useAuth } from "../AuthProvider";
import Nav from "../Nav";

const dayMeta: Record<string, { title: string; short: string }> = {
  push: { title: "Push Day", short: "Push" },
  pull: { title: "Pull Day", short: "Pull" },
  legs: { title: "Leg Day", short: "Legs" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkoutSession | null>(null);

  const load = async () => {
    const data = await getSessions(userId);
    setSessions(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const filtered = useMemo(
    () =>
      filter === "all"
        ? sessions
        : sessions.filter((s) => s.day_id === filter),
    [sessions, filter]
  );

  const startEdit = (s: WorkoutSession) => {
    setEditId(s.id);
    setDraft(JSON.parse(JSON.stringify(s)) as WorkoutSession);
  };

  const cancelEdit = () => {
    setEditId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!draft) return;
    await updateSession(userId, draft);
    setEditId(null);
    setDraft(null);
    await load();
  };

  const remove = async (s: WorkoutSession) => {
    if (!confirm("Delete this workout from your history?")) return;
    await deleteSession(userId, s);
    await load();
  };

  const setDraftSet = (
    entryIdx: number,
    setIdx: number,
    field: "weight" | "reps",
    value: string
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const entries = prev.entries.map((e, i) => {
        if (i !== entryIdx) return e;
        const total = Math.max(
          e.weights?.length ?? 0,
          e.reps?.length ?? 0,
          setIdx + 1
        );
        if (field === "weight") {
          const clean = value.replace(/[^0-9.]/g, "");
          const wArr = Array.from(
            { length: total },
            (_, k) => e.weights?.[k] ?? null
          );
          wArr[setIdx] = clean === "" ? null : Number(clean);
          const top = wArr.reduce<number | null>(
            (m, x) => (x === null ? m : m === null ? x : Math.max(m, x)),
            null
          );
          return { ...e, weights: wArr, weight: top };
        }
        const clean = value.replace(/[^0-9]/g, "");
        const rArr = Array.from({ length: total }, (_, k) => e.reps?.[k] ?? 0);
        rArr[setIdx] = clean === "" ? 0 : Number(clean);
        return { ...e, reps: rArr };
      });
      return { ...prev, entries };
    });
  };

  const formatEntry = (e: SessionEntry) => {
    const rs = e.reps ?? [];
    if (e.weights && e.weights.length) {
      return e.weights
        .map((w, i) => `${w ?? "—"}×${rs[i] ?? "—"}`)
        .join(" · ");
    }
    if (e.weight === null || e.weight === undefined) return "—";
    const repsStr = rs.some((r) => r > 0) ? ` × ${rs.join("/")}` : "";
    return `${e.weight}${repsStr}`;
  };

  const setCount = (e: SessionEntry) =>
    Math.max(e.weights?.length ?? 0, e.reps?.length ?? 0, 1);

  return (
    <main className="page">
      <header className="header">
        <div className="header-top">
          <div>
            <h1 className="title">History</h1>
            <p className="tagline">Your logged workouts, newest first</p>
          </div>
        </div>
        <nav className="tabs" aria-label="Filter by day">
          {[
            { id: "all", label: "All" },
            ...workouts.map((w) => ({
              id: w.id,
              label: dayMeta[w.id]?.short ?? w.title,
            })),
          ].map((t) => (
            <button
              key={t.id}
              className={`tab ${filter === t.id ? "tab-active" : ""}`}
              onClick={() => setFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {loading ? (
        <p className="empty">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="empty">
          No workouts logged yet. Head to the Workout tab, enter your weights,
          and tap “Log this workout”.
        </p>
      ) : (
        <ul className="history">
          {filtered.map((s) => {
            const editing = editId === s.id;
            const view = editing && draft ? draft : s;
            return (
              <li key={s.id} className="session">
                <div className="session-head">
                  <span className={`day-badge day-${s.day_id}`}>
                    {dayMeta[s.day_id]?.title ?? s.day_id}
                  </span>
                  <span className="session-date">
                    {formatDate(s.performed_at)} · {formatTime(s.performed_at)}
                  </span>
                </div>

                <ul className="session-entries">
                  {view.entries.map((e: SessionEntry, idx) => (
                    <li key={e.exercise_id}>
                      <span className="entry-name">{e.name}</span>
                      {editing ? (
                        <div className="entry-sets">
                          {Array.from({ length: setCount(e) }, (_, si) => (
                            <div className="entry-set" key={si}>
                              <span className="entry-set-no">{si + 1}</span>
                              <input
                                className="edit-weight"
                                inputMode="decimal"
                                value={e.weights?.[si] ?? ""}
                                onChange={(ev) =>
                                  setDraftSet(idx, si, "weight", ev.target.value)
                                }
                                placeholder="wt"
                              />
                              <span className="entry-x">×</span>
                              <input
                                className="edit-reps"
                                inputMode="numeric"
                                value={e.reps?.[si] ? String(e.reps[si]) : ""}
                                onChange={(ev) =>
                                  setDraftSet(idx, si, "reps", ev.target.value)
                                }
                                placeholder="reps"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="entry-weight">
                          {formatEntry(e)}
                          {e.weight !== null && e.weight !== undefined
                            ? ` ${e.unit}`
                            : ""}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {editing ? (
                  <div className="edit-meta">
                    <label>
                      RPE
                      <select
                        value={draft?.rpe ?? ""}
                        onChange={(ev) =>
                          setDraft((p) =>
                            p
                              ? {
                                  ...p,
                                  rpe:
                                    ev.target.value === ""
                                      ? null
                                      : Number(ev.target.value),
                                }
                              : p
                          )
                        }
                      >
                        <option value="">—</option>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <textarea
                      value={draft?.notes ?? ""}
                      onChange={(ev) =>
                        setDraft((p) =>
                          p ? { ...p, notes: ev.target.value } : p
                        )
                      }
                      placeholder="Notes"
                      rows={2}
                    />
                  </div>
                ) : (
                  (s.rpe || s.notes) && (
                    <div className="session-extra">
                      {s.rpe ? (
                        <span className="rpe-chip">RPE {s.rpe}</span>
                      ) : null}
                      {s.notes ? (
                        <span className="session-notes">{s.notes}</span>
                      ) : null}
                    </div>
                  )
                )}

                <div className="session-actions">
                  {editing ? (
                    <>
                      <button className="act save" onClick={saveEdit}>
                        Save
                      </button>
                      <button className="act" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="act" onClick={() => startEdit(s)}>
                        Edit
                      </button>
                      <button className="act danger" onClick={() => remove(s)}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Nav />
    </main>
  );
}
