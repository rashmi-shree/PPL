import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Null when env vars are missing, so the app still works on localStorage only.
// PKCE flow lets the native (Capacitor) shell exchange the auth code it
// receives over a custom URL scheme; on the web it behaves the same as before.
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

export const isSupabaseEnabled = supabase !== null;

export type WeightRow = {
  exercise_id: string;
  weight: number | null;
  unit: string;
  updated_at?: string;
};
