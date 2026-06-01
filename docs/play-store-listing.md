# Google Play Store listing - PPL Workout Tracker

Copy-paste these into the Play Console. Replace anything in [BRACKETS].

---

## App details

- **App name** (max 30 chars): `PPL Workout Tracker`
- **Package name:** `com.rashmi.ppl`
- **Default language:** English (United States)
- **App or game:** App
- **Category:** Health & Fitness
- **Contact email:** [your-support-email]
- **Privacy policy URL:** https://[your-vercel-domain]/privacy

---

## Short description (max 80 characters)

```
Push, Pull, Legs tracker. Log per-set weights, see progress, beat your last lift.
```

(That is 80 chars - trim if Play complains. Alt: `Track your Push/Pull/Legs workouts, weights, and progress in one simple app.`)

---

## Full description (max 4000 characters)

```
PPL Workout Tracker is a simple, fast way to run a Push / Pull / Legs strength and hypertrophy program and actually track your progress.

No clutter, no ads - just the exercises, your weights, and the numbers you need to beat next time.

WHAT YOU CAN DO
- Follow a structured Push, Pull, and Legs routine with the right exercises, sets, and rep targets for each day.
- Log every set individually - record a different weight and reps for each set, the way you really train.
- See "last time" instantly - the weight and reps from your previous session of that day appear under each exercise so you always know what to beat.
- Get progression nudges - hit your target reps and the app suggests adding weight next time.
- Watch your form - tap the Form button on any exercise to play a short demonstration video.
- Rest timer - a tap-to-start countdown between sets so you hit your prescribed rest.
- Personal records - the app celebrates when you beat a previous best.

TRACK YOUR PROGRESS
- Per-exercise charts showing your weight over time.
- Body weight tracking with its own chart.
- A training streak and calendar so you can see your consistency at a glance.
- Full workout history you can edit anytime if you typo a number.

QUALITY OF LIFE
- Light and dark themes.
- Works offline at the gym; your data syncs to your account.
- Sign in with email or Google.
- Gentle reminders so you never forget to log a session.
- Export your data to CSV whenever you want it.

Your workout history is tied to your account and protected so only you can see it.

Whether you are just starting Push/Pull/Legs or you have been lifting for years, PPL Workout Tracker keeps the focus where it belongs: showing up and beating your last session.
```

---

## Graphic assets you must upload

| Asset | Spec | Required? |
|---|---|---|
| App icon | 512 x 512 px, 32-bit PNG | Yes |
| Feature graphic | 1024 x 500 px, PNG/JPG (no alpha) | Yes |
| Phone screenshots | 2-8 images, PNG/JPG, 16:9 or 9:16, each side 320-3840 px | Yes (min 2) |
| 7-inch tablet screenshots | optional | No |
| 10-inch tablet screenshots | optional | No |

Tips for screenshots: just run the app in the emulator and capture the Workout day view, the per-set logging, the History page, and the Progress charts. In the emulator toolbar there is a camera/screenshot button, or run:
`adb exec-out screencap -p > shot1.png`

You already have a 512x512 icon at `public/icon-512.png`.

---

## Content rating questionnaire (typical answers for this app)

- Violence: None
- Sexual content: None
- Profanity: None
- Controlled substances: None
- User-generated content / sharing: No
- Collects personal info: Yes (email) - see Data safety below
Expected result: rated "Everyone".

---

## Data safety form (what to declare)

Data collected:
- **Email address** - collected, linked to the user, used for Account management / app functionality. Required. Not shared with third parties. Encrypted in transit.
- **App activity / other (workout logs, body weight)** - collected, linked to the user, used for App functionality. Not shared. Encrypted in transit.

- Is all data encrypted in transit? Yes.
- Can users request deletion? Yes (provide the support email; account deletion within 30 days).

---

## Release checklist

1. Create app in Play Console, fill the details above.
2. Upload `android/app/build/outputs/bundle/release/app-release.aab`.
3. Complete: Store listing, Content rating, Data safety, Target audience, Privacy policy URL.
4. (Personal accounts) Set up a Closed testing track, add 12+ testers, run it 14 days.
5. Promote to Production and submit for review.
