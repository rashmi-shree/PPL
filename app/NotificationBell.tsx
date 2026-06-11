"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";
import {
  getNotifications,
  markAllRead,
  clearNotifications,
  NOTIFICATIONS_EVENT,
  type AppNotification,
  type NotificationType,
} from "@/lib/notificationCenter";

const ICONS: Record<NotificationType, string> = {
  reminder: "💪",
  weight: "📈",
  pr: "🏆",
  streak: "🔥",
  info: "🔔",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

export default function NotificationBell() {
  const { user } = useAuth();
  const userId = user?.id;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    setItems(getNotifications(userId));
  }, [userId]);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(NOTIFICATIONS_EVENT, onChange);
    window.addEventListener("focus", onChange);
    return () => {
      window.removeEventListener(NOTIFICATIONS_EVENT, onChange);
      window.removeEventListener("focus", onChange);
    };
  }, [refresh]);

  // Mark everything read once the panel is opened (badge clears, list stays).
  useEffect(() => {
    if (open && userId !== undefined) {
      const t = setTimeout(() => markAllRead(userId), 600);
      return () => clearTimeout(t);
    }
  }, [open, userId]);

  const unread = items.filter((n) => !n.read).length;

  return (
    <>
      <button
        type="button"
        className="bell-btn"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
        {unread > 0 && <span className="bell-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <>
          <div className="bell-backdrop" onClick={() => setOpen(false)} />
          <div className="bell-panel" ref={panelRef} role="dialog" aria-label="Notifications">
            <div className="bell-panel-head">
              <span>Notifications</span>
              {items.length > 0 && (
                <button
                  type="button"
                  className="bell-clear"
                  onClick={() => {
                    clearNotifications(userId);
                    refresh();
                  }}
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="bell-list">
              {items.length === 0 ? (
                <p className="bell-empty">No notifications yet. Log a workout 💪</p>
              ) : (
                items.map((n) => (
                  <div key={n.id} className={`bell-item ${n.read ? "" : "unread"}`}>
                    <span className="bell-item-icon">{ICONS[n.type]}</span>
                    <div className="bell-item-body">
                      <div className="bell-item-title">{n.title}</div>
                      <div className="bell-item-text">{n.body}</div>
                      <div className="bell-item-time">{relativeTime(n.createdAt)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="22"
      height="22"
    >
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
