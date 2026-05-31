export type Exercise = {
  id: string;
  name: string;
  sets: string;
  reps: string;
  rest: string;
  type: "compound" | "accessory";
  note?: string;
  // YouTube video ID for a form-demo clip.
  video?: string;
};

export type WorkoutDay = {
  id: string;
  title: string;
  subtitle: string;
  exercises: Exercise[];
};

export const cardio = {
  title: "Cardio (every day)",
  detail:
    "30 minutes incline treadmill walk. Use a speed that elevates heart rate and breathing while remaining sustainable.",
};

export const generalGuidelines: string[] = [
  "Train each muscle group twice per week (Push → Pull → Legs → Rest → repeat).",
  "Focus on progressive overload.",
  "Maintain proper form on every rep.",
  "Rest periods are important; do not rush them.",
  "For compound movements, use a weight that lets you hit the rep range with good technique.",
  "For accessory movements, focus on muscle contraction and control.",
];

export const progressionRules: string[] = [
  "8 reps on all compound sets with good form → increase weight next session.",
  "12 reps on all accessory sets with good form → increase weight next session.",
  "Small consistent increases beat frequent large jumps over time.",
];

export const workouts: WorkoutDay[] = [
  {
    id: "push",
    title: "Push Day",
    subtitle: "Chest · Shoulders · Triceps",
    exercises: [
      {
        id: "push-bench",
        name: "Bench Press",
        video: "hWbUlkb5Ms4",
        sets: "3",
        reps: "7–8 (1 warm-up × 10)",
        rest: "3 min",
        type: "compound",
      },
      {
        id: "push-incline",
        name: "Incline Bench Press",
        video: "SrqOu55lrYU",
        sets: "3",
        reps: "7–8",
        rest: "3 min",
        type: "compound",
      },
      {
        id: "push-dips",
        name: "Dips",
        video: "RtCARlkWnuw",
        sets: "3",
        reps: "7–8",
        rest: "3 min",
        type: "compound",
      },
      {
        id: "push-tri-ext",
        name: "Overhead Triceps Extension",
        video: "-Vyt2QdsR7E",
        sets: "3",
        reps: "10–12",
        rest: "2 min",
        type: "accessory",
      },
      {
        id: "push-jm",
        name: "JM Press",
        video: "hOCW9cE-GJg",
        sets: "3",
        reps: "10–12",
        rest: "2 min",
        type: "accessory",
      },
    ],
  },
  {
    id: "pull",
    title: "Pull Day",
    subtitle: "Back · Biceps",
    exercises: [
      {
        id: "pull-lat",
        name: "Lat Pulldown / Assisted Pull-Up",
        video: "SALxEARiMkw",
        sets: "3",
        reps: "7–8 (1 warm-up × 10)",
        rest: "3 min",
        type: "compound",
        note: "Alternate between exercises if desired.",
      },
      {
        id: "pull-row",
        name: "Seated Row Machine",
        video: "GZbfZ033f74",
        sets: "3",
        reps: "7–8",
        rest: "3 min",
        type: "compound",
        note: "Upper back focus.",
      },
      {
        id: "pull-back-ext",
        name: "Back Extension",
        video: "hS8uaxb0yMQ",
        sets: "3",
        reps: "7–8",
        rest: "3 min",
        type: "compound",
      },
      {
        id: "pull-preacher",
        name: "Preacher Curl / Bicep Curl Bench",
        video: "fIWP-FRFNU0",
        sets: "3",
        reps: "10–12",
        rest: "2 min",
        type: "accessory",
      },
      {
        id: "pull-hammer",
        name: "Hammer Curls",
        video: "8XLxfXROrTo",
        sets: "3",
        reps: "10–12",
        rest: "2 min",
        type: "accessory",
      },
    ],
  },
  {
    id: "legs",
    title: "Leg Day",
    subtitle: "Quads · Hamstrings · Calves",
    exercises: [
      {
        id: "legs-ext",
        name: "Leg Extension",
        video: "i1m7xGSpPbg",
        sets: "3",
        reps: "7–8 (1 warm-up × 10)",
        rest: "3 min",
        type: "compound",
      },
      {
        id: "legs-squat",
        name: "Squats",
        video: "gcNh17Ckjgg",
        sets: "3",
        reps: "7–8",
        rest: "3 min",
        type: "compound",
      },
      {
        id: "legs-curl",
        name: "Leg Curl",
        video: "SbSNUXPRkc8",
        sets: "3",
        reps: "7–8",
        rest: "3 min",
        type: "compound",
      },
      {
        id: "legs-standing-calf",
        name: "Standing Calf Raises",
        video: "YMmgqO8Jo-k",
        sets: "3",
        reps: "10–12",
        rest: "2 min",
        type: "accessory",
      },
      {
        id: "legs-seated-calf",
        name: "Seated Calf Raises",
        video: "pz66Bw6HJ4s",
        sets: "3",
        reps: "10–12",
        rest: "2 min",
        type: "accessory",
      },
    ],
  },
];
