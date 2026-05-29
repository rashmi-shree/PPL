"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
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
    return () => sub.subscription.unsubscribe();
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
