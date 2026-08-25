import type { AvatarState, GestureId } from "./types";
import type { AvatarFrameId } from "./avatarFrames";
import { PRIVATE_EASTER_EGG_DURATION_MS } from "./privateEasterEgg";

export const RIG_POINT_IDS = [
  "head",
  "neck",
  "hairLeft",
  "hairRight",
  "shoulderLeft",
  "shoulderRight",
  "chest",
  "chestLeft",
  "chestRight",
  "waist",
  "elbowLeft",
  "elbowRight",
  "handLeft",
  "handRight",
  "cordLeft",
  "cordRight",
] as const;

export type RigPointId = (typeof RIG_POINT_IDS)[number];
export type IdleBeat = "none" | "soft-nod" | "shoulder-shift" | "curious-tilt";

export interface RigPointDefinition {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  strength: number;
}

export interface RigTransform {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export type RigPose = Record<RigPointId, RigTransform>;

export interface AttentionVector {
  x: number;
  y: number;
}

export interface RigMotionInput {
  nowMs: number;
  gestureElapsedMs: number;
  state: AvatarState;
  gesture: GestureId;
  idleBeat: IdleBeat;
  attentionX: number;
  attentionY: number;
  reducedMotion: boolean;
  easterEggElapsedMs?: number;
}

export interface GestureTiming {
  durationMs: number;
  attackMs: number;
  releaseMs: number;
}

export const POINT_SPRING_FREQUENCIES: Record<RigPointId, number> = {
  head: 4.2,
  neck: 3.8,
  hairLeft: 2.6,
  hairRight: 2.45,
  shoulderLeft: 3.3,
  shoulderRight: 3.3,
  chest: 2.85,
  chestLeft: 4.6,
  chestRight: 4.35,
  waist: 2.4,
  elbowLeft: 3.2,
  elbowRight: 3.2,
  handLeft: 3.8,
  handRight: 3.8,
  cordLeft: 2.1,
  cordRight: 2,
};

export interface AuthoredFrameKey {
  atMs: number;
  frame: AvatarFrameId | null;
}

export const GESTURE_TIMINGS: Record<GestureId, GestureTiming> = {
  none: { durationMs: 0, attackMs: 0, releaseMs: 0 },
  wave: { durationMs: 1_900, attackMs: 420, releaseMs: 500 },
  nod: { durationMs: 1_200, attackMs: 240, releaseMs: 320 },
  shake_head: { durationMs: 1_600, attackMs: 260, releaseMs: 360 },
  explain_left: { durationMs: 2_100, attackMs: 460, releaseMs: 520 },
  explain_right: { durationMs: 2_100, attackMs: 460, releaseMs: 520 },
  shrug: { durationMs: 1_700, attackMs: 420, releaseMs: 480 },
  celebrate: { durationMs: 1_600, attackMs: 300, releaseMs: 460 },
};

export const AUTHORED_HEAD_FRAME_TIMELINES: Partial<Record<GestureId, readonly AuthoredFrameKey[]>> = {
  nod: [
    { atMs: 0, frame: "nod-down" },
    { atMs: 690, frame: null },
  ],
  shake_head: [
    { atMs: 0, frame: "shake-left" },
    { atMs: 380, frame: "shake-right" },
    { atMs: 760, frame: "shake-left" },
    { atMs: 1_140, frame: null },
  ],
};

const baseRig: Record<RigPointId, RigPointDefinition> = {
  head: { x: 0.5, y: 0.205, radiusX: 0.225, radiusY: 0.205, strength: 1 },
  neck: { x: 0.5, y: 0.355, radiusX: 0.14, radiusY: 0.125, strength: 0.72 },
  hairLeft: { x: 0.335, y: 0.235, radiusX: 0.135, radiusY: 0.225, strength: 0.82 },
  hairRight: { x: 0.665, y: 0.235, radiusX: 0.135, radiusY: 0.225, strength: 0.82 },
  shoulderLeft: { x: 0.31, y: 0.43, radiusX: 0.16, radiusY: 0.14, strength: 0.7 },
  shoulderRight: { x: 0.69, y: 0.43, radiusX: 0.16, radiusY: 0.14, strength: 0.7 },
  chest: { x: 0.5, y: 0.505, radiusX: 0.25, radiusY: 0.24, strength: 0.62 },
  chestLeft: { x: 0.425, y: 0.545, radiusX: 0.11, radiusY: 0.105, strength: 0.95 },
  chestRight: { x: 0.575, y: 0.545, radiusX: 0.11, radiusY: 0.105, strength: 0.95 },
  waist: { x: 0.5, y: 0.75, radiusX: 0.31, radiusY: 0.25, strength: 0.48 },
  elbowLeft: { x: 0.255, y: 0.655, radiusX: 0.14, radiusY: 0.155, strength: 0.72 },
  elbowRight: { x: 0.745, y: 0.655, radiusX: 0.14, radiusY: 0.155, strength: 0.72 },
  handLeft: { x: 0.425, y: 0.855, radiusX: 0.115, radiusY: 0.115, strength: 0.88 },
  handRight: { x: 0.575, y: 0.855, radiusX: 0.115, radiusY: 0.115, strength: 0.88 },
  cordLeft: { x: 0.43, y: 0.56, radiusX: 0.055, radiusY: 0.2, strength: 0.72 },
  cordRight: { x: 0.57, y: 0.56, radiusX: 0.055, radiusY: 0.2, strength: 0.72 },
};

type RigOverrides = Partial<Record<RigPointId, Partial<RigPointDefinition>>>;

const frameOverrides: Partial<Record<AvatarFrameId, RigOverrides>> = {
  "private-playful": {
    shoulderLeft: { x: 0.3, y: 0.43 }, shoulderRight: { x: 0.7, y: 0.44 },
    chestLeft: { x: 0.415, y: 0.53 }, chestRight: { x: 0.58, y: 0.54 },
    elbowLeft: { x: 0.25, y: 0.64 }, handLeft: { x: 0.31, y: 0.49, radiusX: 0.12, radiusY: 0.13 },
    elbowRight: { x: 0.7, y: 0.72 }, handRight: { x: 0.49, y: 0.88, radiusX: 0.13, radiusY: 0.12 },
    cordLeft: { x: 0.38, y: 0.55 }, cordRight: { x: 0.56, y: 0.56 },
  },
  wave: {
    shoulderLeft: { x: 0.31, y: 0.45 }, elbowLeft: { x: 0.26, y: 0.57 }, handLeft: { x: 0.19, y: 0.39, radiusX: 0.13, radiusY: 0.15 },
    elbowRight: { x: 0.68, y: 0.7 }, handRight: { x: 0.61, y: 0.86 },
  },
  "explain-left": {
    elbowLeft: { x: 0.265, y: 0.67 }, handLeft: { x: 0.18, y: 0.59, radiusX: 0.145, radiusY: 0.12 },
    handRight: { x: 0.61, y: 0.86 },
  },
  "explain-right": {
    elbowRight: { x: 0.735, y: 0.67 }, handRight: { x: 0.82, y: 0.59, radiusX: 0.145, radiusY: 0.12 },
    handLeft: { x: 0.39, y: 0.86 },
  },
  celebrate: {
    elbowLeft: { x: 0.32, y: 0.59 }, elbowRight: { x: 0.68, y: 0.59 },
    handLeft: { x: 0.39, y: 0.43 }, handRight: { x: 0.61, y: 0.43 },
  },
  concern: {
    elbowLeft: { x: 0.35, y: 0.65 }, handLeft: { x: 0.49, y: 0.51 },
    elbowRight: { x: 0.66, y: 0.74 }, handRight: { x: 0.43, y: 0.76 },
  },
  confused: {
    elbowLeft: { x: 0.24, y: 0.68 }, elbowRight: { x: 0.76, y: 0.68 },
    handLeft: { x: 0.17, y: 0.65, radiusX: 0.15 }, handRight: { x: 0.83, y: 0.65, radiusX: 0.15 },
  },
  surprise: {
    elbowLeft: { x: 0.34, y: 0.72 }, elbowRight: { x: 0.66, y: 0.72 },
    handLeft: { x: 0.43, y: 0.65 }, handRight: { x: 0.57, y: 0.65 },
  },
  thinking: {
    elbowLeft: { x: 0.35, y: 0.7 }, elbowRight: { x: 0.62, y: 0.73 },
    handLeft: { x: 0.47, y: 0.39 }, handRight: { x: 0.36, y: 0.76 },
  },
};

const rigDefinitionCache = new Map<AvatarFrameId, Record<RigPointId, RigPointDefinition>>();
const NOD_CURVE = [[0, 0], [0.16, 0], [0.4, 0.82], [0.58, 0.76], [0.82, -0.08], [1, 0]] as const;
const SHAKE_CURVE = [[0, 0], [0.22, -0.82], [0.47, 0.75], [0.7, -0.5], [0.87, 0.18], [1, 0]] as const;
const CELEBRATE_CURVE = [[0, 0], [0.25, 0.84], [0.52, -0.08], [0.74, 0.25], [1, 0]] as const;
const PRIVATE_EASTER_EGG_CURVE = [[0, 0], [0.06, 0], [0.14, -1], [0.23, 0.58], [0.34, -0.88], [0.44, 0.5], [0.55, -0.72], [0.65, 0.38], [0.76, -0.55], [0.86, 0.26], [1, 0]] as const;
const RIG_TRANSFORM_FIELDS: ReadonlyArray<keyof RigTransform> = ["x", "y", "rotation", "scaleX", "scaleY"];

function canonicalFrame(frame: AvatarFrameId): AvatarFrameId {
  if (frame.endsWith("-blink")) return frame.slice(0, -6) as AvatarFrameId;
  if (frame === "nod-down" || frame.startsWith("shake-")) return "neutral";
  return frame;
}

export function getRigPointDefinitions(frame: AvatarFrameId): Record<RigPointId, RigPointDefinition> {
  const canonical = canonicalFrame(frame);
  const cached = rigDefinitionCache.get(canonical);
  if (cached) return cached;
  const overrides = frameOverrides[canonical] ?? {};
  const definitions = Object.fromEntries(RIG_POINT_IDS.map((id) => [id, { ...baseRig[id], ...overrides[id] }])) as Record<RigPointId, RigPointDefinition>;
  rigDefinitionCache.set(canonical, definitions);
  return definitions;
}

export function createRigPose(): RigPose {
  return Object.fromEntries(RIG_POINT_IDS.map((id) => [id, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }])) as RigPose;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smoothstep = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
const smootherstep = (value: number) => {
  const t = clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

export function sampleKeyframes(keyframes: ReadonlyArray<readonly [number, number]>, progress: number): number {
  if (keyframes.length === 0) return 0;
  const t = clamp(progress, 0, 1);
  for (let index = 1; index < keyframes.length; index += 1) {
    const previous = keyframes[index - 1];
    const next = keyframes[index];
    if (t <= next[0]) {
      const local = smootherstep((t - previous[0]) / Math.max(0.0001, next[0] - previous[0]));
      return previous[1] + (next[1] - previous[1]) * local;
    }
  }
  return keyframes[keyframes.length - 1][1];
}

function add(
  pose: RigPose,
  id: RigPointId,
  x = 0,
  y = 0,
  rotation = 0,
  scaleXDelta = 0,
  scaleYDelta = 0,
) {
  const point = pose[id];
  point.x += x;
  point.y += y;
  point.rotation += rotation;
  point.scaleX += scaleXDelta;
  point.scaleY += scaleYDelta;
}

function gestureEnvelope(elapsedMs: number, timing: GestureTiming): number {
  if (timing.durationMs <= 0 || elapsedMs < 0 || elapsedMs > timing.durationMs) return 0;
  const attack = smootherstep(elapsedMs / Math.max(1, timing.attackMs));
  const releaseStart = timing.durationMs - timing.releaseMs;
  const release = elapsedMs <= releaseStart ? 1 : 1 - smootherstep((elapsedMs - releaseStart) / Math.max(1, timing.releaseMs));
  return attack * release;
}

function resetRigPose(pose: RigPose): RigPose {
  for (const id of RIG_POINT_IDS) {
    const point = pose[id];
    point.x = 0;
    point.y = 0;
    point.rotation = 0;
    point.scaleX = 1;
    point.scaleY = 1;
  }
  return pose;
}

export function sampleRigPose(input: RigMotionInput, output = createRigPose()): RigPose {
  const pose = resetRigPose(output);
  if (input.reducedMotion) return pose;

  const breath = 0.5 - 0.5 * Math.cos((input.nowMs / 5_200) * Math.PI * 2);
  const speaking = Math.sin((input.nowMs / 2_900) * Math.PI * 2);
  const hairLeft = Math.sin((input.nowMs / 3_700) * Math.PI * 2);
  const hairRight = Math.sin((input.nowMs / 4_100) * Math.PI * 2 + 0.7);
  const attentionX = clamp(input.attentionX, -1, 1);
  const attentionY = clamp(input.attentionY, -1, 1);

  add(pose, "chest", 0, -0.0015 * breath, 0, 0.001 * breath, 0.0032 * breath);
  add(pose, "shoulderLeft", 0, -0.0008 * breath, -0.0012 * breath);
  add(pose, "shoulderRight", 0, -0.0008 * breath, 0.0012 * breath);
  add(pose, "neck", 0, -0.0007 * breath);
  add(pose, "hairLeft", -0.0012 * hairLeft, 0, -0.003 * hairLeft - attentionX * 0.0015);
  add(pose, "hairRight", 0.0012 * hairRight, 0, 0.003 * hairRight - attentionX * 0.0015);
  add(pose, "cordLeft", 0, 0, -0.004 * hairLeft);
  add(pose, "cordRight", 0, 0, 0.004 * hairRight);

  const stateAttentionWeight = input.state === "listening" ? 1 : input.state === "thinking" ? 0.28 : input.state === "error" ? 0.2 : 0.62;
  add(
    pose,
    "head",
    attentionX * 0.0033 * stateAttentionWeight,
    attentionY * 0.0018 * stateAttentionWeight,
    attentionX * 0.0055 * stateAttentionWeight,
  );
  add(pose, "neck", attentionX * 0.0014 * stateAttentionWeight, 0, attentionX * 0.002 * stateAttentionWeight);

  if (input.state === "listening") {
    add(pose, "head", 0, 0.0016, 0.0045);
    add(pose, "neck", 0, 0.0008, 0.002);
    add(pose, "chest", 0, 0, 0, 0, 0.0015);
  } else if (input.state === "thinking") {
    add(pose, "head", 0.0014, -0.001, 0.006);
    add(pose, "hairLeft", 0, 0, -0.002);
  } else if (input.state === "speaking") {
    add(pose, "head", 0.0008 * speaking, -0.0007 * Math.abs(speaking), 0.0022 * speaking);
    add(pose, "neck", 0.00035 * speaking);
  } else if (input.state === "error") {
    add(pose, "head", 0, 0.0018, -0.007);
    add(pose, "shoulderLeft", 0, 0.001);
    add(pose, "shoulderRight", 0, 0.001);
  }

  if (input.idleBeat === "soft-nod") {
    add(pose, "head", 0, 0.0034, 0, 0, -0.002);
    add(pose, "neck", 0, 0.0012);
  } else if (input.idleBeat === "shoulder-shift") {
    add(pose, "shoulderLeft", 0, -0.0022, 0.003);
    add(pose, "shoulderRight", 0, 0.0012, -0.0015);
    add(pose, "chest", 0.0008);
  } else if (input.idleBeat === "curious-tilt") {
    add(pose, "head", 0.0015, 0.001, 0.008);
    add(pose, "neck", 0, 0, 0.003);
  }

  const timing = GESTURE_TIMINGS[input.gesture];
  const envelope = gestureEnvelope(input.gestureElapsedMs, timing);
  const progress = timing.durationMs === 0 ? 0 : clamp(input.gestureElapsedMs / timing.durationMs, 0, 1);

  if (input.gesture === "nod") {
    const nod = sampleKeyframes(NOD_CURVE, progress);
    add(pose, "head", 0, 0.0056 * nod, 0.0024 * nod, 0, -0.0032 * Math.max(0, nod));
    add(pose, "neck", 0, 0.0018 * nod);
    add(pose, "hairLeft", 0, 0.001 * nod);
    add(pose, "hairRight", 0, 0.001 * nod);
  } else if (input.gesture === "shake_head") {
    const shake = sampleKeyframes(SHAKE_CURVE, progress);
    add(pose, "head", 0.007 * shake, 0, 0.0095 * shake);
    add(pose, "neck", 0.0021 * shake, 0, 0.0032 * shake);
    add(pose, "hairLeft", -0.0015 * shake, 0, -0.0032 * shake);
    add(pose, "hairRight", -0.0015 * shake, 0, -0.0032 * shake);
  } else if (input.gesture === "wave") {
    const oscillation = Math.sin(Math.max(0, input.gestureElapsedMs - timing.attackMs) / 320 * Math.PI);
    add(pose, "handLeft", -0.0016 * envelope, -0.0016 * envelope, 0.017 * oscillation * envelope);
    add(pose, "elbowLeft", -0.0008 * envelope, 0, 0.0045 * oscillation * envelope);
    add(pose, "shoulderLeft", 0, -0.0012 * envelope);
  } else if (input.gesture === "explain_left" || input.gesture === "explain_right") {
    const isLeft = input.gesture === "explain_left";
    const hand: RigPointId = isLeft ? "handLeft" : "handRight";
    const elbow: RigPointId = isLeft ? "elbowLeft" : "elbowRight";
    const direction = isLeft ? -1 : 1;
    const accent = 0.5 - 0.5 * Math.cos(progress * Math.PI * 2);
    add(pose, hand, 0, -0.0042 * envelope * accent, direction * 0.008 * envelope * accent);
    add(pose, elbow, 0, -0.0018 * envelope * accent, direction * 0.003 * envelope);
  } else if (input.gesture === "shrug") {
    add(pose, "shoulderLeft", 0, -0.004 * envelope, 0.005 * envelope);
    add(pose, "shoulderRight", 0, -0.004 * envelope, -0.005 * envelope);
    add(pose, "handLeft", 0, -0.002 * envelope, -0.006 * envelope);
    add(pose, "handRight", 0, -0.002 * envelope, 0.006 * envelope);
    add(pose, "head", 0, 0.001 * envelope, -0.003 * envelope);
  } else if (input.gesture === "celebrate") {
    const bounce = sampleKeyframes(CELEBRATE_CURVE, progress);
    add(pose, "chest", 0, -0.004 * bounce, 0, 0, 0.004 * Math.max(0, bounce));
    add(pose, "head", 0, -0.0045 * bounce, -0.004 * bounce);
    add(pose, "handLeft", 0, -0.0035 * bounce, -0.006 * bounce);
    add(pose, "handRight", 0, -0.0035 * bounce, 0.006 * bounce);
  }

  const easterEggElapsed = input.easterEggElapsedMs ?? Number.POSITIVE_INFINITY;
  if (easterEggElapsed >= 0 && easterEggElapsed <= PRIVATE_EASTER_EGG_DURATION_MS) {
    const leftProgress = clamp(easterEggElapsed / PRIVATE_EASTER_EGG_DURATION_MS, 0, 1);
    const rightProgress = clamp((easterEggElapsed - 24) / PRIVATE_EASTER_EGG_DURATION_MS, 0, 1);
    const leftBounce = sampleKeyframes(PRIVATE_EASTER_EGG_CURVE, leftProgress);
    const rightBounce = sampleKeyframes(PRIVATE_EASTER_EGG_CURVE, rightProgress);
    const centerBounce = (leftBounce + rightBounce) * 0.5;
    add(pose, "chestLeft", 0, 0.021 * leftBounce, -0.004 * leftBounce, 0, -0.014 * Math.max(0, -leftBounce) + 0.006 * Math.max(0, leftBounce));
    add(pose, "chestRight", 0, 0.021 * rightBounce, 0.004 * rightBounce, 0, -0.014 * Math.max(0, -rightBounce) + 0.006 * Math.max(0, rightBounce));
    add(pose, "chest", 0, 0.006 * centerBounce, 0, 0.003 * Math.max(0, centerBounce));
    add(pose, "shoulderLeft", 0, 0.0007 * leftBounce);
    add(pose, "shoulderRight", 0, 0.0007 * rightBounce);
    add(pose, "cordLeft", 0, 0.006 * leftBounce, -0.005 * leftBounce);
    add(pose, "cordRight", 0, 0.006 * rightBounce, 0.005 * rightBounce);
  }

  for (const id of RIG_POINT_IDS) {
    const point = pose[id];
    point.x = clamp(point.x, -0.018, 0.018);
    const maximumY = id === "chestLeft" || id === "chestRight" ? 0.022 : 0.014;
    point.y = clamp(point.y, -maximumY, maximumY);
    point.rotation = clamp(point.rotation, -0.04, 0.04);
    point.scaleX = clamp(point.scaleX, 0.985, 1.015);
    point.scaleY = clamp(point.scaleY, 0.985, 1.015);
  }
  return pose;
}

export interface SpringPointState {
  value: RigTransform;
  velocity: RigTransform;
}

export type SpringRigState = Record<RigPointId, SpringPointState>;

const zeroTransform = (): RigTransform => ({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
const zeroVelocity = (): RigTransform => ({ x: 0, y: 0, rotation: 0, scaleX: 0, scaleY: 0 });

export function createSpringRigState(): SpringRigState {
  return Object.fromEntries(RIG_POINT_IDS.map((id) => [id, { value: zeroTransform(), velocity: zeroVelocity() }])) as SpringRigState;
}

export function stepSpringRig(state: SpringRigState, target: RigPose, deltaSeconds: number, frequencyHz?: number): SpringRigState {
  const dt = clamp(deltaSeconds, 0, 1 / 20);
  for (const id of RIG_POINT_IDS) {
    const point = state[id];
    const omega = Math.PI * 2 * (frequencyHz ?? POINT_SPRING_FREQUENCIES[id]);
    const decay = Math.exp(-omega * dt);
    for (const field of RIG_TRANSFORM_FIELDS) {
      const displacement = point.value[field] - target[id][field];
      const combined = point.velocity[field] + omega * displacement;
      point.value[field] = target[id][field] + (displacement + combined * dt) * decay;
      point.velocity[field] = (point.velocity[field] - omega * combined * dt) * decay;
    }
  }
  return state;
}

export function createMeshIndices(columns: number, rows: number): Uint16Array {
  const indices: number[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * (columns + 1) + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns + 1;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }
  return new Uint16Array(indices);
}

interface MeshBinding {
  baseX: Float32Array;
  baseY: Float32Array;
  edgePin: Float32Array;
  inverseNormalizer: Float32Array;
  influenceStart: Uint32Array;
  pointIndex: Uint8Array;
  localX: Float32Array;
  localY: Float32Array;
  weight: Float32Array;
  translateX: Float32Array;
  translateY: Float32Array;
  scaleX: Float32Array;
  scaleY: Float32Array;
  cosine: Float32Array;
  sine: Float32Array;
}

const meshBindingCache = new Map<AvatarFrameId, Map<number, MeshBinding>>();

function getMeshBinding(frame: AvatarFrameId, columns: number, rows: number): MeshBinding {
  const canonical = canonicalFrame(frame);
  let frameBindings = meshBindingCache.get(canonical);
  if (!frameBindings) {
    frameBindings = new Map();
    meshBindingCache.set(canonical, frameBindings);
  }
  const meshKey = columns * 65_536 + rows;
  const cached = frameBindings.get(meshKey);
  if (cached) return cached;

  const definitions = getRigPointDefinitions(canonical);
  const vertexCount = (columns + 1) * (rows + 1);
  const pointIndices: number[] = [];
  const localXValues: number[] = [];
  const localYValues: number[] = [];
  const weightValues: number[] = [];
  const binding: MeshBinding = {
    baseX: new Float32Array(vertexCount),
    baseY: new Float32Array(vertexCount),
    edgePin: new Float32Array(vertexCount),
    inverseNormalizer: new Float32Array(vertexCount),
    influenceStart: new Uint32Array(vertexCount + 1),
    pointIndex: new Uint8Array(),
    localX: new Float32Array(),
    localY: new Float32Array(),
    weight: new Float32Array(),
    translateX: new Float32Array(RIG_POINT_IDS.length),
    translateY: new Float32Array(RIG_POINT_IDS.length),
    scaleX: new Float32Array(RIG_POINT_IDS.length),
    scaleY: new Float32Array(RIG_POINT_IDS.length),
    cosine: new Float32Array(RIG_POINT_IDS.length),
    sine: new Float32Array(RIG_POINT_IDS.length),
  };

  let vertexIndex = 0;
  for (let row = 0; row <= rows; row += 1) {
    const y = row / rows;
    for (let column = 0; column <= columns; column += 1) {
      const x = column / columns;
      binding.baseX[vertexIndex] = x;
      binding.baseY[vertexIndex] = y;
      binding.edgePin[vertexIndex] = smoothstep(Math.min(x, 1 - x, y, 1 - y) / 0.075);
      binding.influenceStart[vertexIndex] = weightValues.length;
      let totalWeight = 0;
      for (let pointIndex = 0; pointIndex < RIG_POINT_IDS.length; pointIndex += 1) {
        const anchor = definitions[RIG_POINT_IDS[pointIndex]];
        const localX = x - anchor.x;
        const localY = y - anchor.y;
        const distanceSquared = (localX / anchor.radiusX) ** 2 + (localY / anchor.radiusY) ** 2;
        if (distanceSquared > 2.25) continue;
        const weight = Math.exp(-2.8 * distanceSquared) * anchor.strength;
        pointIndices.push(pointIndex);
        localXValues.push(localX);
        localYValues.push(localY);
        weightValues.push(weight);
        totalWeight += weight;
      }
      binding.inverseNormalizer[vertexIndex] = 1 / Math.max(1, totalWeight * 0.78);
      vertexIndex += 1;
    }
  }
  binding.influenceStart[vertexCount] = weightValues.length;
  binding.pointIndex = new Uint8Array(pointIndices);
  binding.localX = new Float32Array(localXValues);
  binding.localY = new Float32Array(localYValues);
  binding.weight = new Float32Array(weightValues);
  frameBindings.set(meshKey, binding);
  return binding;
}

export function deformMeshVertices(
  frame: AvatarFrameId,
  pose: RigPose,
  columns: number,
  rows: number,
  output = new Float32Array((columns + 1) * (rows + 1) * 4),
): Float32Array {
  const binding = getMeshBinding(frame, columns, rows);
  const pointCount = RIG_POINT_IDS.length;
  for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
    const transform = pose[RIG_POINT_IDS[pointIndex]];
    binding.translateX[pointIndex] = transform.x;
    binding.translateY[pointIndex] = transform.y;
    binding.scaleX[pointIndex] = transform.scaleX;
    binding.scaleY[pointIndex] = transform.scaleY;
    binding.cosine[pointIndex] = Math.cos(transform.rotation);
    binding.sine[pointIndex] = Math.sin(transform.rotation);
  }

  for (let vertexIndex = 0; vertexIndex < binding.baseX.length; vertexIndex += 1) {
    let movedX = 0;
    let movedY = 0;
    const influenceEnd = binding.influenceStart[vertexIndex + 1];
    for (let index = binding.influenceStart[vertexIndex]; index < influenceEnd; index += 1) {
      const pointIndex = binding.pointIndex[index];
      const weight = binding.weight[index];
      const localX = binding.localX[index];
      const localY = binding.localY[index];
      const scaledX = localX * binding.scaleX[pointIndex];
      const scaledY = localY * binding.scaleY[pointIndex];
      const transformedX = scaledX * binding.cosine[pointIndex] - scaledY * binding.sine[pointIndex];
      const transformedY = scaledX * binding.sine[pointIndex] + scaledY * binding.cosine[pointIndex];
      movedX += (binding.translateX[pointIndex] + transformedX - localX) * weight;
      movedY += (binding.translateY[pointIndex] + transformedY - localY) * weight;
    }
    const deformation = binding.inverseNormalizer[vertexIndex] * binding.edgePin[vertexIndex];
    const outputOffset = vertexIndex * 4;
    output[outputOffset] = binding.baseX[vertexIndex] + movedX * deformation;
    output[outputOffset + 1] = binding.baseY[vertexIndex] + movedY * deformation;
    output[outputOffset + 2] = binding.baseX[vertexIndex];
    output[outputOffset + 3] = binding.baseY[vertexIndex];
  }
  return output;
}
