"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type Mode = "signin" | "signup";

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg("");
    setError("");

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setError(error.message);
      else if (data.session)
        setMsg("Account created — you're in!");
      else setMsg("Check your email to confirm your account, then sign in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setError(error.message);
    }
    setBusy(false);
  };

  const google = async () => {
    if (!supabase) return;
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
  };

  const forgot = async () => {
    if (!supabase) return;
    setError("");
    setMsg("");
    if (!email) {
      setError("Enter your email above first, then tap “Forgot password”.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset`,
    });
    setMsg(
      error ? error.message : "Password reset link sent — check your email."
    );
  };

  return (
    <main className="page auth">
      <div className="auth-card">
        <h1 className="title auth-title">PPL Program</h1>
        <p className="tagline auth-sub">
          {mode === "signin" ? "Sign in to your account" : "Create your account"}
        </p>

        <button className="google-btn" onClick={google} type="button">
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="divider">
          <span>or</span>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          {error && <p className="auth-error">{error}</p>}
          {msg && <p className="auth-msg">{msg}</p>}

          <button className="log-btn auth-submit" disabled={busy} type="submit">
            {busy
              ? "Please wait…"
              : mode === "signin"
              ? "Sign in"
              : "Sign up"}
          </button>
        </form>

        {mode === "signin" && (
          <button type="button" className="forgot-link" onClick={forgot}>
            Forgot password?
          </button>
        )}

        <p className="auth-switch">
          {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
              setMsg("");
            }}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22 22-9.8 22-22c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 4.1 29.6 2 24 2 15.6 2 8.3 6.8 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 46c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.4C29.5 36.7 26.9 38 24 38c-5.2 0-9.6-3.3-11.2-8l-6.5 5C8.2 41.1 15.5 46 24 46z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.6 5.4C41.4 36.4 46 30.9 46 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
