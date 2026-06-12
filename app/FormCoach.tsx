"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  detectPhase,
  evaluateDeadlift,
  LM,
  type Landmark,
  type LiftPhase,
  type PoseHistory,
} from "@/lib/deadliftRules";

// ── MediaPipe dynamic import (large WASM — only loaded when FormCoach opens) ──

type PoseLandmarker = import("@mediapipe/tasks-vision").PoseLandmarker;
type PoseLandmarkerResult = import("@mediapipe/tasks-vision").PoseLandmarkerResult;

// Per-rule cooldown in ms — prevents the same cue from repeating too fast.
const COOLDOWN_MS = 5000;
// Min visibility for skeleton drawing
const VIS_THRESHOLD = 0.5;

const SKELETON_CONNECTIONS: [number, number][] = [
  [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER],
  [LM.LEFT_SHOULDER, LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW, LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW, LM.RIGHT_WRIST],
  [LM.LEFT_SHOULDER, LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.RIGHT_HIP],
  [LM.LEFT_HIP, LM.LEFT_KNEE],
  [LM.LEFT_KNEE, LM.LEFT_ANKLE],
  [LM.RIGHT_HIP, LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE, LM.RIGHT_ANKLE],
];

function speak(text: string) {
  if (typeof window === "undefined") return;
  // Cancel anything currently being spoken
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.95;
  utt.pitch = 1;
  utt.volume = 1;
  window.speechSynthesis.speak(utt);
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  lms: Landmark[],
  W: number,
  H: number
) {
  ctx.clearRect(0, 0, W, H);

  // Bones
  ctx.strokeStyle = "rgba(99,210,255,0.75)";
  ctx.lineWidth = 2.5;
  for (const [a, b] of SKELETON_CONNECTIONS) {
    const la = lms[a];
    const lb = lms[b];
    if (!la || !lb) continue;
    if ((la.visibility ?? 0) < VIS_THRESHOLD || (lb.visibility ?? 0) < VIS_THRESHOLD)
      continue;
    ctx.beginPath();
    ctx.moveTo(la.x * W, la.y * H);
    ctx.lineTo(lb.x * W, lb.y * H);
    ctx.stroke();
  }

  // Joints
  for (const lm of lms) {
    if ((lm?.visibility ?? 0) < VIS_THRESHOLD) continue;
    ctx.beginPath();
    ctx.arc(lm.x * W, lm.y * H, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
  }
}

// ── Setup diagram shown before camera starts ──────────────────────────────────

function SetupGuide({ onStart }: { onStart: () => void }) {
  return (
    <div className="fc-guide">
      <div className="fc-guide-icon">📐</div>
      <h3 className="fc-guide-title">Camera placement</h3>
      <ul className="fc-guide-list">
        <li>Place your phone on the floor or a low surface</li>
        <li>Position it <strong>to your side</strong>, about 1–2 metres away</li>
        <li>Angle it so your full body is visible — feet to head</li>
        <li>Make sure the area is well-lit</li>
      </ul>
      <div className="fc-diagram">
        <div className="fc-diagram-person">🧍</div>
        <div className="fc-diagram-arrow">←</div>
        <div className="fc-diagram-phone">📱</div>
      </div>
      <p className="fc-guide-sub">
        The coach will listen to your form and speak corrections in real time.
      </p>
      <button className="fc-start-btn" onClick={onStart} type="button">
        Start Form Coach
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FormCoach({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"guide" | "loading" | "live" | "error">("guide");
  const [errorMsg, setErrorMsg] = useState("");
  const [phase, setPhase] = useState<LiftPhase>("idle");
  const [lastCue, setLastCue] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const historyRef = useRef<PoseHistory>([]);
  // Per-rule cooldown map: ruleId → last fired timestamp
  const cooldownRef = useRef<Record<string, number>>({});
  const runningRef = useRef(false);

  // ── Cleanup ──────────────────────────────────────────────────────────────

  const stopEverything = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (landmarkerRef.current) {
      landmarkerRef.current.close();
      landmarkerRef.current = null;
    }
    window.speechSynthesis.cancel();
  }, []);

  useEffect(() => () => stopEverything(), [stopEverything]);

  // ── Load MediaPipe + camera ───────────────────────────────────────────────

  const startSession = useCallback(async () => {
    setStep("loading");
    try {
      // Dynamic import — avoids loading the 8 MB WASM until the user opens this
      const { PoseLandmarker, FilesetResolver } = await import(
        "@mediapipe/tasks-vision"
      );

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      landmarkerRef.current = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      runningRef.current = true;
      setStep("live");
      requestAnimationFrame(detectLoop);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Could not start camera or pose model.";
      setErrorMsg(msg);
      setStep("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Per-frame detection loop ─────────────────────────────────────────────

  const detectLoop = useCallback(() => {
    if (!runningRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !canvas || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    const W = video.videoWidth;
    const H = video.videoHeight;
    canvas.width = W;
    canvas.height = H;

    let result: PoseLandmarkerResult;
    try {
      result = landmarker.detectForVideo(video, performance.now());
    } catch {
      rafRef.current = requestAnimationFrame(detectLoop);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Mirror the video so it feels like a selfie (easier to interpret)
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-W, 0);
      ctx.drawImage(video, 0, 0, W, H);
      ctx.restore();
    }

    const lmsRaw = result.worldLandmarks?.[0] ?? result.landmarks?.[0];
    if (lmsRaw && lmsRaw.length > 0 && ctx) {
      const lms = lmsRaw as Landmark[];

      // Mirror X coords to match the flipped canvas
      const mirrored: Landmark[] = lms.map((l) => ({ ...l, x: 1 - l.x }));

      drawSkeleton(ctx, mirrored, W, H);

      const currentPhase = detectPhase(mirrored);
      setPhase(currentPhase);

      // Maintain a rolling history for velocity-based rules
      const lShoulder = mirrored[LM.LEFT_SHOULDER];
      const rShoulder = mirrored[LM.RIGHT_SHOULDER];
      const lHip = mirrored[LM.LEFT_HIP];
      const rHip = mirrored[LM.RIGHT_HIP];
      historyRef.current.push({
        shoulderY: ((lShoulder?.y ?? 0) + (rShoulder?.y ?? 0)) / 2,
        hipY: ((lHip?.y ?? 0) + (rHip?.y ?? 0)) / 2,
        ts: performance.now(),
      });
      if (historyRef.current.length > 30) historyRef.current.shift();

      const cues = evaluateDeadlift(mirrored, currentPhase, historyRef.current);

      if (cues.length > 0) {
        const now = Date.now();
        const topCue = cues[0];
        const lastFired = cooldownRef.current[topCue.ruleId] ?? 0;

        if (now - lastFired > COOLDOWN_MS) {
          cooldownRef.current[topCue.ruleId] = now;
          setLastCue(topCue.message);
          speak(topCue.message);
        }
      }
    }

    rafRef.current = requestAnimationFrame(detectLoop);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Phase label ──────────────────────────────────────────────────────────

  const phaseLabel: Record<LiftPhase, string> = {
    idle: "Waiting…",
    setup: "Setup",
    pulling: "Pulling",
    lockout: "Lockout",
    lowering: "Lowering",
  };

  const phaseColor: Record<LiftPhase, string> = {
    idle: "#888",
    setup: "#f5a623",
    pulling: "#7ed321",
    lockout: "#4a90e2",
    lowering: "#9b59b6",
    };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fc-overlay" role="dialog" aria-modal="true" aria-label="Deadlift Form Coach">
      <div className="fc-panel">
        {/* Header */}
        <div className="fc-header">
          <div>
            <h2 className="fc-title">Deadlift Form Coach</h2>
            <p className="fc-sub">AI-powered real-time feedback</p>
          </div>
          <button
            className="fc-close"
            onClick={() => { stopEverything(); onClose(); }}
            type="button"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Guide screen */}
        {step === "guide" && <SetupGuide onStart={startSession} />}

        {/* Loading */}
        {step === "loading" && (
          <div className="fc-loading">
            <div className="fc-spinner" />
            <p>Loading pose model…</p>
            <p className="fc-loading-sub">First load may take a few seconds.</p>
          </div>
        )}

        {/* Error */}
        {step === "error" && (
          <div className="fc-error">
            <p>⚠️ {errorMsg}</p>
            <button className="fc-start-btn" onClick={startSession} type="button">
              Try again
            </button>
          </div>
        )}

        {/* Live view */}
        {(step === "live" || step === "loading") && (
          <div className={`fc-live ${step === "loading" ? "fc-hidden" : ""}`}>
            <div className="fc-video-wrap">
              {/* Hidden raw video feed — canvas renders the mirrored + annotated version */}
              <video
                ref={videoRef}
                className="fc-video-hidden"
                playsInline
                muted
              />
              <canvas ref={canvasRef} className="fc-canvas" />

              {/* Phase badge */}
              <div
                className="fc-phase-badge"
                style={{ background: phaseColor[phase] }}
              >
                {phaseLabel[phase]}
              </div>
            </div>

            {/* Last spoken cue */}
            <div className="fc-cue-box">
              {lastCue ? (
                <>
                  <span className="fc-cue-icon">🗣</span>
                  <p className="fc-cue-text">{lastCue}</p>
                </>
              ) : (
                <p className="fc-cue-empty">
                  Watching your form — start your lift when ready.
                </p>
              )}
            </div>

            <p className="fc-hint">
              Keep your phone to your side. Stand tall before each rep.
            </p>

            <button
              className="fc-stop-btn"
              onClick={() => { stopEverything(); onClose(); }}
              type="button"
            >
              Stop Form Coach
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
