import { isNative } from "./native";

// Stable id so re-enabling replaces (not stacks) the daily reminder.
const DAILY_REMINDER_ID = 1001;
export const REMINDER_HOUR = 18; // 6:00 PM
export const REMINDER_MINUTE = 0;

const LINES = [
  "Bro, did you hit the gym today? 💪 Tap to log your sets.",
  "No workout logged yet today. Let's get it. 🏋️",
  "Keep the streak alive — log today's session. 🔥",
];

// Schedule a daily repeating local notification at 6 PM. Returns false if the
// platform isn't native or the user denied notification permission.
export async function enableDailyReminder(): Promise<boolean> {
  if (!isNative()) return false;
  const { LocalNotifications } = await import("@capacitor/local-notifications");

  const perm = await LocalNotifications.requestPermissions();
  if (perm.display !== "granted") return false;

  // Clear any previous schedule first so we never stack duplicates.
  await LocalNotifications.cancel({
    notifications: [{ id: DAILY_REMINDER_ID }],
  });

  await LocalNotifications.schedule({
    notifications: [
      {
        id: DAILY_REMINDER_ID,
        title: "PPL",
        body: LINES[new Date().getDate() % LINES.length],
        // `on` with only hour/minute repeats every day at that time.
        schedule: {
          on: { hour: REMINDER_HOUR, minute: REMINDER_MINUTE },
          allowWhileIdle: true,
        },
      },
    ],
  });
  return true;
}

export async function disableDailyReminder(): Promise<void> {
  if (!isNative()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.cancel({
    notifications: [{ id: DAILY_REMINDER_ID }],
  });
}
