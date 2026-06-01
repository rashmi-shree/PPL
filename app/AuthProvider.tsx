"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { supabase } from "@/lib/supabase";
import { isNative } from "@/lib/native";
import AuthScreen from "./AuthScreen";

type AuthContextValue = {
  user: User | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    // Native deep-link handler: Supabase redirects back into the app through
    // our custom URL scheme (com.rashmi.ppl://...). Capacitor delivers that URL
    // here, where we exchange the auth code for a session.
    let removeListener: (() => void) | undefined;
    if (isNative()) {
      CapApp.addListener("appUrlOpen", async ({ url }) => {
        if (!url || !url.includes("com.rashmi.ppl://")) return;
        try {
          const parsed = new URL(url);
          const code = parsed.searchParams.get("code");
          if (code) {
            await supabase!.auth.exchangeCodeForSession(code);
          } else if (parsed.hash.includes("access_token")) {
            const hash = new URLSearchParams(parsed.hash.replace(/^#/, ""));
            const access_token = hash.get("access_token");
            const refresh_token = hash.get("refresh_token");
            if (access_token && refresh_token) {
              await supabase!.auth.setSession({ access_token, refresh_token });
            }
          }
          // Password-reset links land on the reset host; send the user there.
          if (parsed.host === "reset" || url.includes("//reset")) {
            window.location.assign("/reset/");
          }
        } catch {
          // ignore malformed callback URLs
        } finally {
          await Browser.close().catch(() => {});
        }
      }).then((handle) => {
        removeListener = () => handle.remove();
      });
    }

    return () => {
      sub.subscription.unsubscribe();
      removeListener?.();
    };
  }, []);

  const signOut = async () => {
    await supabase?.auth.signOut();
  };

  // No cloud configured → run the app locally without auth.
  if (!supabase) {
    return (
      <AuthContext.Provider value={{ user: null, signOut }}>
        {children}
      </AuthContext.Provider>
    );
  }

  if (loading) {
    return (
      <main className="page">
        <p className="empty">Loading…</p>
      </main>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <AuthContext.Provider value={{ user: session.user, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
