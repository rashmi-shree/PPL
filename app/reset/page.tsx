"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ResetPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMsg("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMsg("Password updated! Redirecting…");
    setTimeout(() => router.push("/"), 1200);
  };

  return (
    <main className="page auth">
      <div className="auth-card">
        <h1 className="title auth-title">Set a new password</h1>
        <p className="tagline auth-sub">Enter and confirm your new password</p>

        <form onSubmit={submit} className="auth-form">
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          <label htmlFor="confirm-password">Confirm password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />

          {error && <p className="auth-error">{error}</p>}
          {msg && <p className="auth-msg">{msg}</p>}

          <button className="log-btn auth-submit" disabled={busy} type="submit">
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </main>
  );
}
