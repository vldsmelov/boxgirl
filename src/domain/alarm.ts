import type { AvatarFrameId } from "./avatarFrames";
import type { EmotionId, VoiceStyle } from "./types";
import type { SpeechDeliveryOverride } from "../services/speech";

export interface AlarmCue {
  frame: Extract<AvatarFrameId, "alarm-soft" | "alarm-teasing" | "alarm-firm" | "alarm-pout">;
  text: string;
  emotion: EmotionId;
  intensity: number;
  voiceStyle: VoiceStyle;
  delivery: SpeechDeliveryOverride;
  pauseAfterMs: number;
}

export const ALARM_OUTFIT_SETTLE_MS = 720;

export const ALARM_SCRIPT: readonly AlarmCue[] = [
  {
    frame: "alarm-soft",
    text: "Доброе утро, дорогой… Пора просыпаться. Открывай глаза — новый день уже начался, а я специально наклонилась поближе.",
    emotion: "joy",
    intensity: 0.5,
    voiceStyle: "soft",
    delivery: { rate: 0.9, pitch: 0.985, gain: 0.8 },
    pauseAfterMs: 650,
  },
  {
    frame: "alarm-teasing",
    text: "Ну же, соня. Потянись, вдохни поглубже и вставай. Не заставляй девушку повторять дважды — особенно когда она так мило тебя уговаривает.",
    emotion: "joy",
    intensity: 0.68,
    voiceStyle: "warm",
    delivery: { rate: 0.965, pitch: 1.01, gain: 0.9 },
    pauseAfterMs: 520,
  },
  {
    frame: "alarm-firm",
    text: "Так, нежное пробуждение закончилось. Ноги на пол, плечи расправить — давай-давай. Сегодня у тебя слишком много возможностей, чтобы прятаться под одеялом.",
    emotion: "joy",
    intensity: 0.78,
    voiceStyle: "energetic",
    delivery: { rate: 1.035, pitch: 1.015, gain: 0.98 },
    pauseAfterMs: 460,
  },
  {
    frame: "alarm-pout",
    text: "Последнее предупреждение: если сейчас не проснёшься, я официально обижусь. И тебе придётся весь день заслуживать мою улыбку. Вставай, я жду.",
    emotion: "concern",
    intensity: 0.7,
    voiceStyle: "warm",
    delivery: { rate: 0.985, pitch: 0.995, gain: 0.96 },
    pauseAfterMs: 700,
  },
] as const;

export function isAlarmCommand(value: string): boolean {
  return /^будильник[!.]?$/iu.test(value.trim());
}

export function waitForAlarmDelay(durationMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Alarm cancelled", "AbortError"));
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, durationMs);
    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException("Alarm cancelled", "AbortError"));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}
