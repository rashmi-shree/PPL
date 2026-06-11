import type { Exercise } from "@/lib/workouts";

export type Unit = "kg" | "lb";

export type ParsedSet = {
  setNo: number;
  weight: number | null;
  reps: number | null;
};

export type ParseResult = {
  // Confidently matched exercise, or null when none/ambiguous.
  exercise: Exercise | null;
  // Candidate exercises to disambiguate (ambiguous match or no match → suggestions).
  candidates: Exercise[];
  unit: Unit;
  sets: ParsedSet[];
  // Set when the user said "each/all" with one value — apply to every set.
  fillAll: { weight: number | null; reps: number | null } | null;
};

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  last: 0,
};

// Lowercase; keep digits, decimals, and clause separators (commas/semicolons).
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[^a-z0-9\s.,;/+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Light singular/plural stem so "curls" matches "curl".
function stem(t: string): string {
  return t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t;
}

// Returns a confidence score plus the word-length of the longest phrase that
// matched as a substring (0 = matched on loose token overlap only).
function scoreExercise(
  msg: string,
  ex: Exercise
): { score: number; plen: number } {
  const phrases = [ex.name, ...(ex.aliases ?? [])]
    .map(normalize)
    .filter(Boolean);
  const msgStems = new Set(
    msg
      .replace(/[.,;/]/g, " ")
      .split(" ")
      .map(stem)
      .filter(Boolean)
  );
  let score = 0;
  let plen = 0;
  for (const p of phrases) {
    if (!p) continue;
    const words = p.split(" ").filter(Boolean);
    if (msg.includes(p)) {
      score = Math.max(score, 0.75 + Math.min(0.2, (words.length - 1) * 0.07));
      plen = Math.max(plen, words.length);
    }
    const ptoks = words.map(stem);
    if (ptoks.length) {
      const hit = ptoks.filter((t) => msgStems.has(t)).length;
      score = Math.max(score, (hit / ptoks.length) * 0.6);
    }
  }
  return { score, plen };
}

// Map a name the LLM returned (e.g. "Squats", "bench press") back to one of our
// real Exercise objects, reusing the same fuzzy scoring as free-text matching.
export function matchExerciseName(
  name: string,
  exercises: Exercise[]
): Exercise | null {
  const msg = normalize(name);
  if (!msg) return null;
  let best: { ex: Exercise; score: number; plen: number } | null = null;
  for (const ex of exercises) {
    const { score, plen } = scoreExercise(msg, ex);
    if (
      !best ||
      score > best.score ||
      (score === best.score && plen > best.plen)
    ) {
      best = { ex, score, plen };
    }
  }
  return best && best.score >= 0.45 ? best.ex : null;
}

function detectUnit(text: string, fallback: Unit): Unit {
  if (/\b(lbs?|pounds?)\b/.test(text)) return "lb";
  if (/\b(kgs?|kilos?|kilograms?)\b/.test(text)) return "kg";
  return fallback;
}

// Parse a single clause like "45kg 6 reps" or "8 reps 40 kgs" or "40x8".
function parseClause(clause: string): { weight: number | null; reps: number | null } {
  let weight: number | null = null;
  let reps: number | null = null;
  let work = ` ${clause} `;

  // weight × reps shorthand: "40x8", "40kg x 8", "40 x 8"
  const xm = work.match(
    /(\d+(?:\.\d+)?)\s*(?:kgs?|kilos?|lbs?|pounds?)?\s*[x*]\s*(\d+)/
  );
  if (xm) {
    return { weight: Number(xm[1]), reps: Number(xm[2]) };
  }

  // weight with an explicit unit
  const wm = work.match(/(\d+(?:\.\d+)?)\s*(?:kgs?|kilograms?|kilos?|lbs?|pounds?)\b/);
  if (wm) {
    weight = Number(wm[1]);
    work = work.replace(wm[0], "  ");
  }

  // reps with an explicit keyword (either side)
  const rm =
    work.match(/(\d+)\s*(?:reps?|rps?)\b/) || work.match(/\breps?\s*(\d+)/);
  if (rm) {
    reps = Number(rm[1]);
    work = work.replace(rm[0], "  ");
  }

  // assign leftover bare numbers to whatever is still missing
  const bare = (work.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (weight === null && reps === null) {
    if (bare.length >= 2) {
      weight = bare[0];
      reps = bare[1];
    } else if (bare.length === 1) {
      weight = bare[0];
    }
  } else if (weight === null && bare.length) {
    weight = bare[0];
  } else if (reps === null && bare.length) {
    reps = bare[0];
  }

  return { weight, reps };
}

type Marker = { end: number; next: number; setNo: number };

// Split points for sets. Ordinals ("1st set", "first") win; otherwise explicit
// "set N" markers that aren't actually "set <reps>".
function findMarkers(text: string): Marker[] {
  const ord: { index: number; end: number; setNo: number }[] = [];
  const ordRe =
    /(\d+)(?:st|nd|rd|th)\s*(?:sets?)?|\b(first|second|third|fourth|fifth|sixth|last)\s*(?:sets?)?/g;
  let m: RegExpExecArray | null;
  while ((m = ordRe.exec(text)) !== null) {
    const setNo = m[1] ? Number(m[1]) : ORDINAL_WORDS[m[2]] ?? 0;
    ord.push({ index: m.index, end: m.index + m[0].length, setNo });
  }

  let raw = ord;
  if (raw.length === 0) {
    const setRe = /\bset\s*(\d+)\b(?!\s*reps?\b)/g;
    const setMarks: typeof ord = [];
    while ((m = setRe.exec(text)) !== null) {
      setMarks.push({
        index: m.index,
        end: m.index + m[0].length,
        setNo: Number(m[1]),
      });
    }
    raw = setMarks;
  }

  return raw.map((mk, i) => ({
    end: mk.end,
    next: raw[i + 1] ? raw[i + 1].index : text.length,
    setNo: mk.setNo,
  }));
}

function renumber(sets: ParsedSet[]): ParsedSet[] {
  return sets
    .sort((a, b) => a.setNo - b.setNo)
    .map((s, i) => ({ ...s, setNo: s.setNo || i + 1 }));
}

function parseSets(text: string): {
  sets: ParsedSet[];
  fillAll: { weight: number | null; reps: number | null } | null;
} {
  const eachKeyword = /\b(each|every|all)\b/.test(text);
  const markers = findMarkers(text);

  if (markers.length) {
    const parsed = markers.map((mk) => ({
      setNo: mk.setNo,
      ...parseClause(text.slice(mk.end, mk.next)),
    }));
    const withVals = parsed.filter((p) => p.weight !== null || p.reps !== null);
    if (withVals.length === 0) return { sets: [], fillAll: null };

    // "1st, 2nd and 3rd — 40kg 10 each": one value listed for several sets.
    if (withVals.length === 1 && parsed.length > 1) {
      const v = withVals[0];
      const sets = parsed.map((p, i) => ({
        setNo: p.setNo || i + 1,
        weight: v.weight,
        reps: v.reps,
      }));
      return { sets: renumber(sets), fillAll: null };
    }

    return {
      sets: renumber(
        withVals.map((p) => ({ setNo: p.setNo, weight: p.weight, reps: p.reps }))
      ),
      fillAll: null,
    };
  }

  // No markers — split on commas / "and", one set per chunk.
  const chunks = text
    .split(/,|;|\band\b/)
    .map((c) => c.trim())
    .filter((c) => /\d/.test(c));
  const sets: ParsedSet[] = [];
  chunks.forEach((c) => {
    const { weight, reps } = parseClause(c);
    if (weight === null && reps === null) return;
    sets.push({ setNo: sets.length + 1, weight, reps });
  });

  // "all sets 40kg 10" / "40kg 10 reps each" → broadcast to every set.
  if (eachKeyword && sets.length === 1) {
    return { sets, fillAll: { weight: sets[0].weight, reps: sets[0].reps } };
  }
  return { sets, fillAll: null };
}

export function parseWorkoutMessage(
  raw: string,
  exercises: Exercise[],
  defaultUnit: Unit
): ParseResult {
  const msg = normalize(raw);
  const unit = detectUnit(msg, defaultUnit);

  const scored = exercises
    .map((ex) => ({ ex, ...scoreExercise(msg, ex) }))
    .sort((a, b) => b.score - a.score);

  let exercise: Exercise | null = null;
  let candidates: Exercise[] = [];

  const maxPlen = scored.reduce((mx, s) => Math.max(mx, s.plen), 0);
  if (maxPlen >= 1) {
    // Prefer the most specific substring match (e.g. "incline bench press" > "bench press").
    const withMax = scored.filter((s) => s.plen === maxPlen);
    if (withMax.length === 1) exercise = withMax[0].ex;
    else candidates = withMax.map((s) => s.ex);
  } else {
    const top = scored[0];
    const second = scored[1];
    const tie = second && top.score - second.score < 0.12 && second.score >= 0.35;
    if (top && top.score >= 0.45 && !tie) {
      exercise = top.ex;
    } else if (top && top.score >= 0.3) {
      candidates = scored
        .filter((s) => s.score >= Math.max(0.3, top.score - 0.15))
        .map((s) => s.ex);
    }
  }

  // A lone candidate is just a confident match.
  if (!exercise && candidates.length === 1) {
    exercise = candidates[0];
    candidates = [];
  }

  const { sets, fillAll } = parseSets(msg);

  return { exercise, candidates, unit, sets, fillAll };
}
