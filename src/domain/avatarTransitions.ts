import type { AvatarFrameId } from "./avatarFrames";

export type FrameTransitionKind = "pose" | "blink" | "motion";

export const FRAME_TRANSITION_DURATIONS_MS = {
  blink: 96,
  motion: 300,
  pose: 560,
  privatePose: 320,
} as const;

const isBlinkFrame = (frame: AvatarFrameId) => frame === "blink" || frame.endsWith("-blink");
const isMotionFrame = (frame: AvatarFrameId) => frame === "nod-down" || frame.startsWith("shake-");

export function getFrameTransitionKind(from: AvatarFrameId, to: AvatarFrameId): FrameTransitionKind {
  if (isBlinkFrame(from) || isBlinkFrame(to)) return "blink";
  if (isMotionFrame(from) || isMotionFrame(to)) return "motion";
  return "pose";
}

export function getFrameTransitionDurationMs(from: AvatarFrameId, to: AvatarFrameId): number {
  if (from === "private-playful" || to === "private-playful") return FRAME_TRANSITION_DURATIONS_MS.privatePose;
  return FRAME_TRANSITION_DURATIONS_MS[getFrameTransitionKind(from, to)];
}

/** Quintic smoothstep: zero velocity and acceleration at both ends. */
export function easeFrameTransition(progress: number): number {
  const value = Math.max(0, Math.min(1, progress));
  return value * value * value * (value * (value * 6 - 15) + 10);
}
