import { supabase } from "@/lib/supabase";

export type SessionEntry = {
  exercise_id: string;
  name: string;
  weight: number | null;
  unit: string;
  reps?: number[];
};

export type WorkoutSession = {
  id: string;
  day_id: string;
  log_date?: string;
  performed_at: string;
  entries: SessionEntry[];
  notes?: string | null;
  rpe?: number | null;
};

const LOCAL_KEY = "ppl-sessions-v1";

function localKey(userId?: string) {
  return userId ? `${LOCAL_KEY}-${userId}` : LOCAL_KEY;
}

// Local calendar date (YYYY-MM-DD), not UTC, so "today" matches the user.
export function localDateString(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function readLocal(userId?: string): WorkoutSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(localKey(userId));
    return raw ? (JSON.parse(raw) as WorkoutSession[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(sessions: WorkoutSession[], userId?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localKey(userId), JSON.stringify(sessions));
}

export async function saveSession(
  userId: string | undefined,
  dayId: string,
  entries: SessionEntry[],
  opts: { notes?: string | null; rpe?: number | null } = {}
): Promise<{ ok: boolean }> {
  const performedAt = new Date().toISOString();
  const logDate = localDateString();
  const notes = opts.notes ?? null;
  const rpe = opts.rpe ?? null;

  // Local copy: replace today's session for this day if it exists (no dupes).
  const local = readLocal(userId).filter(
    (s) => !(s.day_id === dayId && s.log_date === logDate)
  );
  local.unshift({
    id: `local-${dayId}-${logDate}`,
    day_id: dayId,
    log_date: logDate,
    performed_at: performedAt,
    entries,
    notes,
    rpe,
  });
  writeLocal(local.slice(0, 200), userId);

  if (!supabase || !userId) return { ok: true };

  // Upsert on (user_id, day_id, log_date) so re-logging a day updates the row.
  const { error } = await supabase.from("workout_sessions").upsert(
    {
      user_id: userId,
      day_id: dayId,
      log_date: logDate,
      performed_at: performedAt,
      entries,
      notes,
      rpe,
    },
    { onConflict: "user_id,day_id,log_date" }
  );

  return { ok: !error };
}

export async function updateSession(
  userId: string | undefined,
  session: WorkoutSession
): Promise<{ ok: boolean }> {
  const isLocal = session.id.startsWith("local-");

  if (supabase && userId && !isLocal) {
    const { error } = await supabase
      .from("workout_sessions")
      .update({
        entries: session.entries,
        notes: session.notes ?? null,
        rpe: session.rpe ?? null,
      })
      .eq("id", session.id);
    return { ok: !error };
  }

  const local = readLocal(userId).map((s) =>
    s.id === session.id ? session : s
  );
  writeLocal(local, userId);
  return { ok: true };
}

export async function deleteSession(
  userId: string | undefined,
  session: WorkoutSession
): Promise<{ ok: boolean }> {
  const isLocal = session.id.startsWith("local-");

  if (supabase && userId && !isLocal) {
    const { error } = await supabase
      .from("workout_sessions")
      .delete()
      .eq("id", session.id);
    return { ok: !error };
  }

  const local = readLocal(userId).filter((s) => s.id !== session.id);
  writeLocal(local, userId);
  return { ok: true };
}

export async function getSessions(
  userId?: string
): Promise<WorkoutSession[]> {
  if (supabase && userId) {
    const { data, error } = await supabase
      .from("workout_sessions")
      .select("id, day_id, log_date, performed_at, entries, notes, rpe")
      .order("performed_at", { ascending: false });
    if (!error && data) return data as WorkoutSession[];
  }
  return readLocal(userId);
}
