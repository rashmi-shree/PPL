// Lightweight, per-user, device-local notification inbox. Stacks app events
// (reminders, PRs, streaks, weight nudges) so they persist instead of flashing
// once on screen. Capped so localStorage never grows unbounded.

export type NotificationType = "reminder" | "weight" | "pr" | "streak" | "info";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string; // ISO
  read: boolean;
};

const KEY = "ppl-notifications-v1";
const MAX = 50;
export const NOTIFICATIONS_EVENT = "ppl-notifications-changed";

function keyFor(userId?: string) {
  return userId ? `${KEY}-${userId}` : KEY;
}

function read(userId?: string): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    return raw ? (JSON.parse(raw) as AppNotification[]) : [];
  } catch {
    return [];
  }
}

function write(list: AppNotification[], userId?: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage unavailable */
  }
  // Let same-tab listeners (the bell) refresh immediately.
  window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
}

export function getNotifications(userId?: string): AppNotification[] {
  return read(userId);
}

export function unreadCount(userId?: string): number {
  return read(userId).filter((n) => !n.read).length;
}

// Add a notification. `dedupeKey` prevents repeats for the same logical event
// (e.g. one reminder per day, one PR per exercise per day).
export function addNotification(
  userId: string | undefined,
  n: {
    type: NotificationType;
    title: string;
    body: string;
    dedupeKey?: string;
  }
): void {
  const list = read(userId);
  if (n.dedupeKey && list.some((x) => x.id.startsWith(`${n.dedupeKey}|`))) return;
  list.unshift({
    id: `${n.dedupeKey ?? n.type}|${Date.now()}`,
    type: n.type,
    title: n.title,
    body: n.body,
    createdAt: new Date().toISOString(),
    read: false,
  });
  write(list, userId);
}

export function markAllRead(userId?: string): void {
  const list = read(userId);
  if (!list.some((n) => !n.read)) return;
  write(
    list.map((n) => ({ ...n, read: true })),
    userId
  );
}

export function clearNotifications(userId?: string): void {
  write([], userId);
}
