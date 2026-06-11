// Supabase Edge Function: parse-workout
//
// Turns a free-form gym-logging message ("squats 1,2,3 all sets same 30kg 10
// reps") into structured sets using Hugging Face (Qwen2.5-7B-Instruct).
// The HF token lives here as a secret and never reaches the client. The web /
// native app calls this and falls back to its local regex parser on any error.

const HF_TOKEN = Deno.env.get("HF_TOKEN");
const HF_MODEL = Deno.env.get("HF_MODEL") ?? "Qwen/Qwen2.5-7B-Instruct";
const HF_URL = "https://router.huggingface.co/v1/chat/completions";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ExIn = { id: string; name: string; aliases?: string[] };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!HF_TOKEN) return json({ error: "missing_token" }, 500);

  let payload: { text?: string; exercises?: ExIn[]; unit?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const text = (payload.text ?? "").toString().slice(0, 400).trim();
  const exercises = Array.isArray(payload.exercises) ? payload.exercises : [];
  const unit = payload.unit === "lb" ? "lb" : "kg";
  if (!text) return json({ error: "empty" }, 400);

  const aliasLines = exercises
    .map(
      (e) =>
        `- ${e.name}${
          e.aliases?.length ? ` (aka ${e.aliases.join(", ")})` : ""
        }`
    )
    .join("\n");

  const system = [
    "You convert a gym set-logging message into strict JSON.",
    "Output ONLY a JSON object (no prose, no markdown) matching exactly:",
    '{"exercise": string|null, "candidates": string[], "unit": "kg"|"lb", "sets": [{"setNo": number, "weight": number|null, "reps": number|null}]}',
    "",
    "Rules:",
    '- "exercise" MUST be a canonical name copied verbatim from this list, or null if unclear:',
    aliasLines || "(no exercises provided)",
    "- If the message is ambiguous between several listed exercises, set exercise to null and list the canonical names in candidates.",
    '- Expand shorthand into one object per set: "3x10", "3 sets of 10", "1,2,3 all sets same 30kg 10 reps", "all sets 40kg 8", "40kg 10 each" all mean every set shares that weight & reps.',
    '- "40kg 8" means weight 40, reps 8. "8 reps 40kg" is the same. "45x6" means weight 45, reps 6.',
    `- Default unit is "${unit}" unless the text clearly says kg / lb / pounds.`,
    "- setNo starts at 1 and increments by 1. Use null for a weight or reps you cannot determine.",
    "- Never invent exercises, weights, or reps that are not implied by the message.",
  ].join("\n");

  const body = {
    model: HF_MODEL,
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: 400,
    messages: [
      { role: "system", content: system },
      { role: "user", content: "bench 40kg 8, 45kg 6, 45kg 6" },
      {
        role: "assistant",
        content:
          '{"exercise":"Bench Press","candidates":[],"unit":"kg","sets":[{"setNo":1,"weight":40,"reps":8},{"setNo":2,"weight":45,"reps":6},{"setNo":3,"weight":45,"reps":6}]}',
      },
      { role: "user", content: "squats 1,2,3 all sets same 30kg 10 reps" },
      {
        role: "assistant",
        content:
          '{"exercise":"Squats","candidates":[],"unit":"kg","sets":[{"setNo":1,"weight":30,"reps":10},{"setNo":2,"weight":30,"reps":10},{"setNo":3,"weight":30,"reps":10}]}',
      },
      { role: "user", content: text },
    ],
  };

  let hfRes: Response;
  try {
    hfRes = await fetch(HF_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return json({ error: "hf_unreachable", detail: String(e) }, 502);
  }

  if (!hfRes.ok) {
    const detail = await hfRes.text().catch(() => "");
    return json(
      { error: "hf_error", status: hfRes.status, detail: detail.slice(0, 300) },
      502
    );
  }

  const data = await hfRes.json().catch(() => null);
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) return json({ error: "hf_empty" }, 502);

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        parsed = null;
      }
    }
  }
  if (!parsed) return json({ error: "parse_failed", raw: content.slice(0, 300) }, 502);

  const outUnit = parsed.unit === "lb" ? "lb" : "kg";
  const sets = Array.isArray(parsed.sets)
    ? (parsed.sets as unknown[]).slice(0, 12).map((s, i) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return {
          setNo: Number.isFinite(Number(o.setNo)) ? Number(o.setNo) : i + 1,
          weight: numOrNull(o.weight),
          reps: numOrNull(o.reps),
        };
      })
    : [];
  const candidates = Array.isArray(parsed.candidates)
    ? (parsed.candidates as unknown[]).filter((c): c is string => typeof c === "string")
    : [];
  const exercise = typeof parsed.exercise === "string" ? parsed.exercise : null;

  return json({ exercise, candidates, unit: outUnit, sets });
});
