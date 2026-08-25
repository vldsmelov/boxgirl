import type { AvatarState, GestureId } from "./types";

export type MotionVariant = "idle" | "listening" | "thinking" | "speaking" | "error" | "nod" | "shake-head" | "celebrate";

export interface MotionProfile {
  motion: MotionVariant;
  gazeX: number;
  gazeY: number;
  headX: number;
  headY: number;
  headRotation: number;
  bodyX: number;
  bodyRotation: number;
  pointerWeight: number;
  motionScale: number;
}

const profiles: Record<AvatarState, Omit<MotionProfile, "motion">> = {
  idle: { gazeX: 0, gazeY: 0, headX: 0, headY: 0, headRotation: 0, bodyX: 0, bodyRotation: 0, pointerWeight: 0.56, motionScale: 1 },
  listening: { gazeX: 0, gazeY: 0.08, headX: 2.1, headY: 1.2, headRotation: 1.35, bodyX: 1.6, bodyRotation: 0.45, pointerWeight: 0.82, motionScale: 0.72 },
  thinking: { gazeX: 0.7, gazeY: -0.72, headX: 1.4, headY: -0.8, headRotation: 1.8, bodyX: 0.7, bodyRotation: 0.35, pointerWeight: 0.16, motionScale: 0.58 },
  speaking: { gazeX: 0, gazeY: 0.04, headX: 0, headY: -0.4, headRotation: -0.3, bodyX: 0, bodyRotation: -0.18, pointerWeight: 0.68, motionScale: 0.86 },
  error: { gazeX: -0.28, gazeY: 0.52, headX: -1.5, headY: 2.2, headRotation: -2.2, bodyX: -0.8, bodyRotation: -0.7, pointerWeight: 0.2, motionScale: 0.42 },
};

export function getMotionProfile(state: AvatarState, gesture: GestureId): MotionProfile {
  const motion: MotionVariant =
    state === "thinking"
      ? "thinking"
      : gesture === "nod"
        ? "nod"
        : gesture === "shake_head"
          ? "shake-head"
          : gesture === "celebrate"
            ? "celebrate"
            : state;
  return { ...profiles[state], motion };
}

export function randomBetween(min: number, max: number, random = Math.random): number {
  return min + (max - min) * random();
}
