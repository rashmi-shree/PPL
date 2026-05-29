"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getSessions } from "@/lib/sessions";

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Nav() {
  const path = usePathname();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [exporting, setExporting] = useState(false);
  const [reminders, setReminders] = useState(false);
  const initial = (user?.email?.[0] ?? "U").toUpperCase();

  useEffect(() => {
    setTheme(
      document.documentElement.getAttribute("data-theme") === "light"
        ? "light"
        : "dark"
    );
    setReminders(localStorage.getItem("ppl-reminders") === "on");
  }, []);

  const toggleReminders = async () => {
    if (reminders) {
      localStorage.removeItem("ppl-reminders");
      setReminders(false);
      return;
    }
    if (!("Notification" in window)) {
      alert("Your browser doesn't support notifications.");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      alert("Allow notifications in your browser to enable reminders.");
      return;
    }
    localStorage.setItem("ppl-reminders", "on");
    setReminders(true);
    try {
      const body = "Reminders on 💪 I'll nudge you to log your workouts.";
      if (navigator.serviceWorker?.controller) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification("PPL", { body, icon: "/icon-192.png" });
      } else {
        new Notification("PPL", { body, icon: "/icon-192.png" });
      }
    } catch {}
  };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    if (next === "light")
      document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem("ppl-theme", next);
    } catch {}
  };

  const exportCsv = async () => {
    setExporting(true);
    const data = await getSessions(user?.id);
    const rows: string[][] = [
      ["date", "day", "exercise", "weight", "unit", "reps", "rpe", "notes"],
    ];
    data.forEach((s) =>
      s.entries.forEach((e) => {
        rows.push([
          s.log_date ?? s.performed_at.slice(0, 10),
          s.day_id,
          e.name,
          e.weight ?? "",
          e.unit,
          (e.reps ?? []).filter((r) => r > 0).join("/"),
          s.rpe ?? "",
          (s.notes ?? "").replace(/\n/g, " "),
        ].map(String));
      })
    );
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ppl-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  return (
    <>
      {menuOpen && (
        <div className="sheet-backdrop" onClick={() => setMenuOpen(false)} />
      )}

      {menuOpen && user && (
        <div className="account-sheet">
          <span className="account-avatar-lg">{initial}</span>
          <p className="account-email-full">{user.email}</p>
          <div className="sheet-actions">
            <button className="sheet-btn" onClick={toggleTheme} type="button">
              {theme === "light" ? "🌙 Dark mode" : "☀️ Light mode"}
            </button>
            <button
              className="sheet-btn"
              onClick={exportCsv}
              type="button"
              disabled={exporting}
            >
              {exporting ? "Exporting…" : "⬇ Export CSV"}
            </button>
          </div>
          <button
            className={`sheet-btn wide ${reminders ? "on" : ""}`}
            onClick={toggleReminders}
            type="button"
          >
            {reminders ? "🔔 Reminders on" : "🔕 Enable reminders"}
          </button>
          <button className="signout" onClick={signOut} type="button">
            Sign out
          </button>
        </div>
      )}

      <nav className="tabbar" aria-label="Primary">
        <div className="tabbar-inner">
          <Link href="/" className={`tab-item ${path === "/" ? "active" : ""}`}>
            <WorkoutIcon />
            <span>Workout</span>
          </Link>
          <Link
            href="/history"
            className={`tab-item ${path === "/history" ? "active" : ""}`}
          >
            <HistoryIcon />
            <span>History</span>
          </Link>
          <Link
            href="/progress"
            className={`tab-item ${path === "/progress" ? "active" : ""}`}
          >
            <ProgressIcon />
            <span>Progress</span>
          </Link>
          {user && (
            <button
              type="button"
              className={`tab-item ${menuOpen ? "active" : ""}`}
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Account"
            >
              <span className="avatar">{initial}</span>
              <span>You</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
}

function WorkoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 12h2.5M20 12h2.5" />
      <rect x="4" y="8" width="3" height="8" rx="1" />
      <rect x="17" y="8" width="3" height="8" rx="1" />
      <path d="M7 12h10" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ProgressIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 3 3 5-6" />
    </svg>
  );
}
