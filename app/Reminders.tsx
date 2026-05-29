"use client";

import { useEffect, useState } from "react";
import { getSessions, localDateString } from "@/lib/sessions";
import { getBodyWeights } from "@/lib/bodyweight";
import { useAuth } from "./AuthProvider";

const GYM_LINES = [
  "Bro, did you hit the gym today? 💪 Log your sets so I can track your gains.",
  "Yo champ — no workout logged yet today. Let's get it. 🏋️",
  "Skipping leg day? 👀 Log today's session, I'm watching the gains.",
];

function pickLine(seed: number) {
  return GYM_LINES[seed % GYM_LINES.length];
}

function maybeNotify(loggedToday: boolean, bwToday: boolean, today: string) {
  try {
    if (localStorage.getItem("ppl-reminders") !== "on") return;
    if (!("Notification" in window) || Notification.permission !== "granted")
      return;
    if (localStorage.getItem("ppl-notified") === today) return;
    if (loggedToday && bwToday) return;

    const body = !loggedToday
      ? "Bro, did you hit the gym today? 💪 Tap to log your sets."
      : "Don't forget to log today's weight 📈 — easy gains tracking.";

    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready.then((reg) =>
        reg.showNotification("PPL", {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
        })
      );
    } else {
      new Notification("PPL", { body, icon: "/icon-192.png" });
    }
    localStorage.setItem("ppl-notified", today);
  } catch {
    /* notifications unavailable */
  }
}

export default function Reminders() {
  const { user } = useAuth();
  const userId = user?.id;
  const [loggedToday, setLoggedToday] = useState<boolean | null>(null);
  const [bwToday, setBwToday] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    (async () => {
      const today = localDateString();
      const [sessions, bws] = await Promise.all([
        getSessions(userId),
        getBodyWeights(userId),
      ]);
      const lg = sessions.some(
        (s) => (s.log_date ?? s.performed_at.slice(0, 10)) === today
      );
      const bw = bws.some((b) => b.log_date === today);
      setLoggedToday(lg);
      setBwToday(bw);
      setDismissed(localStorage.getItem("ppl-nudge-dismissed") === today);
      maybeNotify(lg, bw, today);
    })();
  }, [userId]);

  if (dismissed || loggedToday === null) return null;

  const showGym = loggedToday === false;
  const showBw = loggedToday === true && bwToday === false;
  if (!showGym && !showBw) return null;

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 864e5
  );

  const dismiss = () => {
    localStorage.setItem("ppl-nudge-dismissed", localDateString());
    setDismissed(true);
  };

  return (
    <div className="nudge-banner">
      <span className="nudge-emoji">{showGym ? "💪" : "📈"}</span>
      <p className="nudge-text">
        {showGym
          ? pickLine(dayOfYear)
          : "Bro, log today's weight — it's easy and keeps your tracking tight."}
      </p>
      <button className="nudge-close" onClick={dismiss} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
