// MediaPipe Pose landmark indices (33-point model)
export const LM = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
} as const;

export type Landmark = { x: number; y: number; z: number; visibility?: number };

// Lift phase derived from wrist height relative to key joints (y increases downward in image coords)
export type LiftPhase = "setup" | "pulling" | "lockout" | "lowering" | "idle";

export type FormCue = {
  ruleId: string;
  message: string;
  priority: number; // 1 = most urgent
};

// ── Geometry helpers ────────────────────────────────────────────────────────

function angleDeg(a: Landmark, b: Landmark, c: Landmark): number {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAb = Math.hypot(ab.x, ab.y);
  const magCb = Math.hypot(cb.x, cb.y);
  if (magAb === 0 || magCb === 0) return 0;
  return (Math.acos(Math.max(-1, Math.min(1, dot / (magAb * magCb)))) * 180) / Math.PI;
}

// Pick the landmark from whichever side is more visible (camera on either side)
function betterSide(
  lms: Landmark[],
  leftIdx: number,
  rightIdx: number
): Landmark {
  const l = lms[leftIdx];
  const r = lms[rightIdx];
  return (r?.visibility ?? 0) > (l?.visibility ?? 0) ? r : l;
}

function visible(lm: Landmark | undefined, threshold = 0.5): boolean {
  return (lm?.visibility ?? 0) >= threshold;
}

// ── Phase detection ──────────────────────────────────────────────────────────

export function detectPhase(lms: Landmark[]): LiftPhase {
  const wrist = betterSide(lms, LM.LEFT_WRIST, LM.RIGHT_WRIST);
  const ankle = betterSide(lms, LM.LEFT_ANKLE, LM.RIGHT_ANKLE);
  const hip = betterSide(lms, LM.LEFT_HIP, LM.RIGHT_HIP);
  const shoulder = betterSide(lms, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER);

  if (!visible(wrist) || !visible(ankle)) return "idle";

  // y increases downward in image space
  const wristY = wrist.y;
  const ankleY = ankle.y;
  const hipY = hip.y;
  const shoulderY = shoulder.y;

  // Bar on or near the floor
  if (wristY > ankleY - 0.08) return "setup";

  // Bar above hips + standing tall → lockout
  if (wristY < hipY && Math.abs(shoulderY - hipY) < 0.25) return "lockout";

  // Determine pulling vs lowering later via velocity — default to pulling
  return "pulling";
}

// ── Individual rules ─────────────────────────────────────────────────────────

// Rule 1: bar too far from body at setup (wrist X much further from ankle X)
function ruleBarDistance(lms: Landmark[], phase: LiftPhase): FormCue | null {
  if (phase !== "setup" && phase !== "pulling") return null;

  const wrist = betterSide(lms, LM.LEFT_WRIST, LM.RIGHT_WRIST);
  const ankle = betterSide(lms, LM.LEFT_ANKLE, LM.RIGHT_ANKLE);

  if (!visible(wrist) || !visible(ankle)) return null;

  // In side view, both should share roughly the same X (bar over mid-foot).
  // Normalised image coords: 0–1 across frame width.
  const drift = Math.abs(wrist.x - ankle.x);
  if (drift > 0.12) {
    return {
      ruleId: "bar-distance",
      message:
        phase === "setup"
          ? "Move about 2 inches closer to the bar — it should be over your mid-foot."
          : "Keep the bar dragging close to your legs — don't let it drift forward.",
      priority: 1,
    };
  }
  return null;
}

// Rule 2: hips too high at setup (near straight-leg deadlift posture)
function ruleHipHeight(lms: Landmark[], phase: LiftPhase): FormCue | null {
  if (phase !== "setup") return null;

  const shoulder = betterSide(lms, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER);
  const hip = betterSide(lms, LM.LEFT_HIP, LM.RIGHT_HIP);
  const knee = betterSide(lms, LM.LEFT_KNEE, LM.RIGHT_KNEE);

  if (!visible(shoulder) || !visible(hip) || !visible(knee)) return null;

  const hipAngle = angleDeg(shoulder, hip, knee);
  // A well-set deadlift has ~90–120° at the hip (hinge). > 145° means nearly straight legs.
  if (hipAngle > 145) {
    return {
      ruleId: "hip-height",
      message:
        "Your hips are too high. Push your hips back and bend your knees — sit into the lift.",
      priority: 2,
    };
  }
  return null;
}

// Rule 3: shoulders too far behind the bar at setup
function ruleShoulderOverBar(lms: Landmark[], phase: LiftPhase): FormCue | null {
  if (phase !== "setup") return null;

  const shoulder = betterSide(lms, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER);
  const wrist = betterSide(lms, LM.LEFT_WRIST, LM.RIGHT_WRIST);

  if (!visible(shoulder) || !visible(wrist)) return null;

  // In side view: shoulders should be over or slightly in front of (same X as) the wrists.
  // If shoulder X is notably behind wrist X (in image space this depends on orientation).
  // We use signed difference: if the shoulder is more than 0.10 behind the wrist, flag it.
  // We figure "behind" by which direction the person is facing using nose vs ankle.
  const nose = lms[LM.NOSE];
  const ankle = betterSide(lms, LM.LEFT_ANKLE, LM.RIGHT_ANKLE);
  if (!visible(nose) || !visible(ankle)) return null;

  // Positive means person faces right in image
  const facingRight = nose.x > ankle.x;
  const shoulderBehind = facingRight
    ? wrist.x - shoulder.x > 0.12
    : shoulder.x - wrist.x > 0.12;

  if (shoulderBehind) {
    return {
      ruleId: "shoulder-over-bar",
      message:
        "Roll your shoulders forward so they're directly over the bar before you pull.",
      priority: 2,
    };
  }
  return null;
}

// Rule 4: shoulders rising faster than hips during the pull (lumbar dominance)
export type PoseHistory = { shoulderY: number; hipY: number; ts: number }[];

function ruleShoulderBeforeHip(
  lms: Landmark[],
  phase: LiftPhase,
  history: PoseHistory
): FormCue | null {
  if (phase !== "pulling") return null;
  if (history.length < 6) return null;

  const shoulder = betterSide(lms, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER);
  const hip = betterSide(lms, LM.LEFT_HIP, LM.RIGHT_HIP);
  if (!visible(shoulder) || !visible(hip)) return null;

  // Compare movement over the last ~10 frames
  const old = history[history.length - 6];
  const deltaS = old.shoulderY - shoulder.y; // positive = moved up (y decreases going up)
  const deltaH = old.hipY - hip.y;

  // If shoulders moved up significantly more than hips → back is doing the work
  if (deltaS > 0.04 && deltaS > deltaH * 1.6) {
    return {
      ruleId: "shoulder-before-hip",
      message:
        "Drive your hips up with your shoulders — you're lifting with your back. Push the floor away.",
      priority: 1,
    };
  }
  return null;
}

// Rule 5: back rounding — spine angle deviates heavily from straight
function ruleSpineAngle(lms: Landmark[], phase: LiftPhase): FormCue | null {
  if (phase === "lockout" || phase === "idle") return null;

  const shoulder = betterSide(lms, LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER);
  const hip = betterSide(lms, LM.LEFT_HIP, LM.RIGHT_HIP);

  if (!visible(shoulder, 0.6) || !visible(hip, 0.6)) return null;

  // Compute the spine's lean angle from vertical
  const dx = shoulder.x - hip.x;
  const dy = shoulder.y - hip.y; // negative when shoulder is above hip

  // Angle of spine from vertical (0° = straight up, 90° = horizontal)
  const spineAngle = Math.abs(
    (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI
  );

  // During setup/pulling a deadlift the spine should be angled (~30–70°).
  // Heavy deviation > 75° suggests collapse/rounding.
  if (spineAngle > 75 && phase === "pulling") {
    return {
      ruleId: "spine-angle",
      message:
        "Keep your chest up and spine neutral — you're folding over. Brace your core and drive.",
      priority: 1,
    };
  }
  return null;
}

// ── Main evaluator ───────────────────────────────────────────────────────────

export function evaluateDeadlift(
  lms: Landmark[],
  phase: LiftPhase,
  history: PoseHistory
): FormCue[] {
  const cues: FormCue[] = [
    ruleBarDistance(lms, phase),
    ruleHipHeight(lms, phase),
    ruleShoulderOverBar(lms, phase),
    ruleShoulderBeforeHip(lms, phase, history),
    ruleSpineAngle(lms, phase),
  ]
    .filter((c): c is FormCue => c !== null)
    .sort((a, b) => a.priority - b.priority);

  return cues;
}
