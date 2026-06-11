import type { Exercise } from "@/lib/workouts";
import {
  matchExerciseName,
  parseWorkoutMessage,
  type ParseResult,
  type ParsedSet,
  type Unit,
} from "@/lib/chatParse";

const FN_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/parse-workout`
  : null;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const TIMEOUT_MS = 7000;

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// LLM-backed parse with the local regex parser as an offline / error fallback.
// The contract is identical to parseWorkoutMessage so ChatLogger is agnostic.
export async function parseWorkoutRemote(
  raw: string,
  exercises: Exercise[],
  defaultUnit: Unit
): Promise<ParseResult> {
  const local = () => parseWorkoutMessage(raw, exercises, defaultUnit);

  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;
  if (!FN_URL || !ANON || offline) return local();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(FN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${ANON}`,
      },
      body: JSON.stringify({
        text: raw,
        unit: defaultUnit,
        exercises: exercises.map((e) => ({
          id: e.id,
          name: e.name,
          aliases: e.aliases,
        })),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return local();
    const data = await res.json();
    return toResult(data, exercises, defaultUnit, raw);
  } catch {
    return local();
  } finally {
    clearTimeout(timer);
  }
}

function toResult(
  data: unknown,
  exercises: Exercise[],
  defaultUnit: Unit,
  raw: string
): ParseResult {
  const d = (data ?? {}) as Record<string, unknown>;
  const unit: Unit = d.unit === "lb" ? "lb" : d.unit === "kg" ? "kg" : defaultUnit;

  const sets: ParsedSet[] = Array.isArray(d.sets)
    ? (d.sets as unknown[])
        .map((s, i) => {
          const o = (s ?? {}) as Record<string, unknown>;
          return {
            setNo: Number.isFinite(Number(o.setNo)) ? Number(o.setNo) : i + 1,
            weight: numOrNull(o.weight),
            reps: numOrNull(o.reps),
          };
        })
        .filter((s) => s.weight !== null || s.reps !== null)
    : [];

  // Model returned nothing usable — let the deterministic parser try instead.
  if (sets.length === 0) return parseWorkoutMessage(raw, exercises, defaultUnit);

  const exercise =
    typeof d.exercise === "string"
      ? matchExerciseName(d.exercise, exercises)
      : null;

  const candidateNames = Array.isArray(d.candidates)
    ? (d.candidates as unknown[]).filter((c): c is string => typeof c === "string")
    : [];
  const candidates = candidateNames
    .map((n) => matchExerciseName(n, exercises))
    .filter((e): e is Exercise => e !== null);

  // "12kg 12 each" with no explicit set count → broadcast across every set
  // (ChatLogger expands this to the exercise's configured number of sets).
  const eachKeyword = /\b(each|every|all)\b/i.test(raw);
  const fillAll =
    eachKeyword && sets.length === 1
      ? { weight: sets[0].weight, reps: sets[0].reps }
      : null;

  return {
    exercise,
    candidates: exercise ? [] : candidates,
    unit,
    sets: sets.map((s, i) => ({ ...s, setNo: s.setNo || i + 1 })),
    fillAll,
  };
}
