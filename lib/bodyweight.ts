import { supabase } from "@/lib/supabase";
import { localDateString } from "@/lib/sessions";

export type BodyWeight = {
  log_date: string;
  weight: number;
  unit: string;
};

const LOCAL_KEY = "ppl-bodyweight-v1";

function key(userId?: string) {
  return userId ? `${LOCAL_KEY}-${userId}` : LOCAL_KEY;
}

function readLocal(userId?: string): BodyWeight[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as BodyWeight[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(rows: BodyWeight[], userId?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(userId), JSON.stringify(rows));
}

export async function saveBodyWeight(
  userId: string | undefined,
  weight: number,
  unit: string
): Promise<{ ok: boolean }> {
  const log_date = localDateString();

  const local = readLocal(userId).filter((b) => b.log_date !== log_date);
  local.push({ log_date, weight, unit });
  local.sort((a, b) => a.log_date.localeCompare(b.log_date));
  writeLocal(local, userId);

  if (!supabase || !userId) return { ok: true };

  const { error } = await supabase.from("body_weights").upsert(
    {
      user_id: userId,
      log_date,
      weight,
      unit,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,log_date" }
  );
  return { ok: !error };
}

export async function getBodyWeights(
  userId?: string
): Promise<BodyWeight[]> {
  if (supabase && userId) {
    const { data, error } = await supabase
      .from("body_weights")
      .select("log_date, weight, unit")
      .order("log_date", { ascending: true });
    if (!error && data) return data as BodyWeight[];
  }
  return readLocal(userId);
}
