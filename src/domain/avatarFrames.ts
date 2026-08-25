import type { AvatarOutfitId, AvatarState, EmotionId, GestureId } from "./types";

export const AVATAR_FRAME_IDS = [
  "neutral",
  "blink",
  "joy",
  "joy-blink",
  "listening",
  "listening-blink",
  "thinking",
  "thinking-blink",
  "private-playful",
  "nod-down",
  "shake-left",
  "shake-right",
  "wave",
  "explain-left",
  "explain-right",
  "celebrate",
  "concern",
  "concern-blink",
  "confused",
  "confused-blink",
  "surprise",
  "surprise-blink",
  "sadness",
  "sadness-blink",
] as const;

export type AvatarFrameId = (typeof AVATAR_FRAME_IDS)[number];

export const AVATAR_OUTFIT_IDS = ["hoodie", "summer", "gym"] as const satisfies readonly AvatarOutfitId[];

const outfitAssetRoots: Record<AvatarOutfitId, string> = {
  hoodie: "/assets/avatar-v2",
  summer: "/assets/avatar-v3-summer",
  gym: "/assets/avatar-v4-gym",
};

export function getAvatarFrameSource(outfit: AvatarOutfitId, frame: AvatarFrameId): string {
  return `${outfitAssetRoots[outfit]}/webp/${frame}.webp`;
}

export function getAvatarRigFrameSource(outfit: AvatarOutfitId, frame: AvatarFrameId): string {
  return `${outfitAssetRoots[outfit]}/webp-rig/${frame}.webp`;
}

const gestureFrames: Partial<Record<GestureId, AvatarFrameId>> = {
  wave: "wave",
  explain_left: "explain-left",
  explain_right: "explain-right",
  shrug: "confused",
  celebrate: "celebrate",
};

const emotionFrames: Record<EmotionId, AvatarFrameId> = {
  neutral: "neutral",
  joy: "joy",
  sadness: "sadness",
  concern: "concern",
  surprise: "surprise",
  thinking: "thinking",
  confused: "confused",
};

/** Resolves semantic intent to curated art. Raw model output never selects a file. */
export function resolveAvatarFrame(state: AvatarState, emotion: EmotionId, gesture: GestureId): AvatarFrameId {
  if (state === "error") return "confused";
  if (state === "listening") return "listening";
  if (state === "thinking") return "thinking";
  return gestureFrames[gesture] ?? emotionFrames[emotion];
}

export function resolveBlinkFrame(frame: AvatarFrameId, state: AvatarState): AvatarFrameId | null {
  if (frame === "neutral" && (state === "idle" || state === "speaking")) return "blink";
  if (frame === "joy" && state === "speaking") return "joy-blink";
  if (frame === "listening" && state === "listening") return "listening-blink";
  if (frame === "thinking" && (state === "thinking" || state === "speaking")) return "thinking-blink";
  if (frame === "concern" && state === "speaking") return "concern-blink";
  if (frame === "sadness" && state === "speaking") return "sadness-blink";
  if (frame === "surprise" && state === "speaking") return "surprise-blink";
  if (frame === "confused" && (state === "speaking" || state === "error")) return "confused-blink";
  return null;
}

export function canUseBlinkFrame(frame: AvatarFrameId, state: AvatarState): boolean {
  return resolveBlinkFrame(frame, state) !== null;
}
