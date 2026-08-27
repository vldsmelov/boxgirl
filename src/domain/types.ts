export const EMOTION_IDS = [
  "neutral",
  "joy",
  "sadness",
  "concern",
  "surprise",
  "thinking",
  "confused",
] as const;

export const GESTURE_IDS = [
  "none",
  "wave",
  "nod",
  "shake_head",
  "explain_left",
  "explain_right",
  "shrug",
  "celebrate",
] as const;

export const VOICE_STYLES = ["neutral", "warm", "energetic", "soft"] as const;

export type EmotionId = (typeof EMOTION_IDS)[number];
export type GestureId = (typeof GESTURE_IDS)[number];
export type VoiceStyle = (typeof VOICE_STYLES)[number];
export type AvatarState = "idle" | "listening" | "thinking" | "speaking" | "error";
export type AvatarOutfitId = "hoodie" | "summer" | "gym" | "evening" | "hacker" | "office" | "sleep";
export type AvatarPresentationId = AvatarOutfitId | "base-debug";

export interface PerformanceSegment {
  text: string;
  emotion: {
    id: EmotionId;
    intensity: number;
  };
  gesture: GestureId;
  voiceStyle: VoiceStyle;
}

export interface AssistantTurnV1 {
  version: 1;
  turnId: string;
  segments: PerformanceSegment[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: number;
}

const includes = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === "string" && values.includes(value as T[number]);

export function validateAssistantTurn(value: unknown): AssistantTurnV1 {
  if (!value || typeof value !== "object") throw new Error("Ответ помощницы не является объектом");
  const turn = value as Record<string, unknown>;
  if (turn.version !== 1 || typeof turn.turnId !== "string" || !Array.isArray(turn.segments)) {
    throw new Error("Некорректный формат AssistantTurnV1");
  }

  const segments = turn.segments.map((raw): PerformanceSegment => {
    if (!raw || typeof raw !== "object") throw new Error("Некорректный сегмент ответа");
    const segment = raw as Record<string, unknown>;
    const emotion = segment.emotion as Record<string, unknown> | undefined;
    if (
      typeof segment.text !== "string" ||
      !segment.text.trim() ||
      !emotion ||
      !includes(EMOTION_IDS, emotion.id) ||
      typeof emotion.intensity !== "number" ||
      !Number.isFinite(emotion.intensity) ||
      !includes(GESTURE_IDS, segment.gesture) ||
      !includes(VOICE_STYLES, segment.voiceStyle)
    ) {
      throw new Error("Сегмент содержит недопустимую эмоцию, жест или текст");
    }
    return {
      text: segment.text.trim().slice(0, 2_000),
      emotion: { id: emotion.id, intensity: Math.max(0, Math.min(1, emotion.intensity)) },
      gesture: segment.gesture,
      voiceStyle: segment.voiceStyle,
    };
  });

  if (segments.length === 0 || segments.length > 8) throw new Error("Недопустимое число сегментов");
  return { version: 1, turnId: turn.turnId, segments };
}

export function safeFallbackTurn(turnId: string): AssistantTurnV1 {
  return {
    version: 1,
    turnId,
    segments: [
      {
        text: "Кажется, я немного запуталась. Сформулируй вопрос ещё раз — попробуем вместе.",
        emotion: { id: "confused", intensity: 0.55 },
        gesture: "shrug",
        voiceStyle: "soft",
      },
    ],
  };
}
