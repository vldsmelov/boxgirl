import { invoke } from "@tauri-apps/api/core";
import type { VoiceStyle } from "../domain/types";

export type VoiceProfileId = "windows-irina" | "silero-xenia" | "silero-kseniya" | "silero-baya";

export interface VoiceProfile {
  id: VoiceProfileId;
  label: string;
  engine: "windows" | "silero";
  speaker?: "xenia" | "kseniya" | "baya";
}

export interface SileroCapabilities {
  available: boolean;
  engine: string;
  modelVersion: string;
  speakers: string[];
  sampleRates: number[];
  modelPath: string | null;
  pythonPath: string | null;
  reason: string | null;
}

interface SileroSynthesis {
  wavBase64: string;
  durationMs: number;
  synthesisMs: number;
  sampleRate: number;
  speaker: string;
}

interface SpeechProvider {
  cancel(): void;
  speak(
    text: string,
    style: VoiceStyle,
    signal: AbortSignal,
    onLipLevel: (level: number) => void,
    delivery?: SpeechDeliveryOverride,
  ): Promise<void>;
}

export interface SpeechDeliveryOverride {
  rate?: number;
  pitch?: number;
  gain?: number;
}

export interface SpeechOptions {
  profile?: VoiceProfileId;
  delivery?: SpeechDeliveryOverride;
}

export const VOICE_PROFILES: readonly VoiceProfile[] = [
  { id: "windows-irina", label: "Windows · Irina", engine: "windows" },
  { id: "silero-xenia", label: "Silero · Xenia", engine: "silero", speaker: "xenia" },
  { id: "silero-kseniya", label: "Silero · Kseniya", engine: "silero", speaker: "kseniya" },
  { id: "silero-baya", label: "Silero · Baya", engine: "silero", speaker: "baya" },
] as const;

const WINDOWS_VOICE_HINTS = ["irina", "svetlana", "dariya", "alena", "екатерина", "женский"];
const DEFAULT_PROFILE: VoiceProfileId = "silero-baya";
const PROFILE_STORAGE_KEY = "boxgirl.voiceProfile.v2";

const abortError = () => new DOMException("Speech cancelled", "AbortError");
const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
const tauriAvailable = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function isVoiceProfileId(value: string | null): value is VoiceProfileId {
  return VOICE_PROFILES.some((profile) => profile.id === value);
}

export function storedVoiceProfile(): VoiceProfileId {
  try {
    const stored = globalThis.localStorage?.getItem(PROFILE_STORAGE_KEY) ?? null;
    return isVoiceProfileId(stored) ? stored : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function detectSileroCapabilities(): Promise<SileroCapabilities> {
  if (!tauriAvailable()) {
    return {
      available: false,
      engine: "silero",
      modelVersion: "v5_5_ru",
      speakers: ["xenia", "kseniya", "baya"],
      sampleRates: [8_000, 24_000, 48_000],
      modelPath: null,
      pythonPath: null,
      reason: "Silero доступен только в desktop-сборке",
    };
  }
  try {
    return await invoke<SileroCapabilities>("silero_capabilities");
  } catch (error) {
    return {
      available: false,
      engine: "silero",
      modelVersion: "v5_5_ru",
      speakers: ["xenia", "kseniya", "baya"],
      sampleRates: [8_000, 24_000, 48_000],
      modelPath: null,
      pythonPath: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function warmSilero(): Promise<void> {
  if (!tauriAvailable()) throw new Error("Silero доступен только в desktop-сборке");
  await invoke("warm_silero");
}

function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  const current = window.speechSynthesis?.getVoices() ?? [];
  if (current.length) return Promise.resolve(current);
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => resolve(window.speechSynthesis?.getVoices() ?? []), 600);
    window.speechSynthesis?.addEventListener(
      "voiceschanged",
      () => {
        window.clearTimeout(timeout);
        resolve(window.speechSynthesis.getVoices());
      },
      { once: true },
    );
  });
}

export function voiceStyleSettings(style: VoiceStyle): { rate: number; pitch: number; gain: number } {
  switch (style) {
    case "energetic":
      return { rate: 1.045, pitch: 1.035, gain: 1 };
    case "soft":
      return { rate: 0.94, pitch: 0.99, gain: 0.86 };
    case "warm":
      return { rate: 0.98, pitch: 1.015, gain: 0.94 };
    default:
      return { rate: 1, pitch: 1, gain: 0.96 };
  }
}

export function resolveSpeechSettings(style: VoiceStyle, delivery?: SpeechDeliveryOverride): { rate: number; pitch: number; gain: number } {
  const defaults = voiceStyleSettings(style);
  return {
    rate: delivery?.rate ?? defaults.rate,
    pitch: delivery?.pitch ?? defaults.pitch,
    gain: delivery?.gain ?? defaults.gain,
  };
}

class WindowsSpeechProvider implements SpeechProvider {
  private generation = 0;

  cancel(): void {
    this.generation += 1;
    window.speechSynthesis?.cancel();
  }

  async speak(
    text: string,
    style: VoiceStyle,
    signal: AbortSignal,
    onLipLevel: (level: number) => void,
    delivery?: SpeechDeliveryOverride,
  ): Promise<void> {
    const generation = ++this.generation;
    if (signal.aborted) throw abortError();

    if (!("speechSynthesis" in window)) {
      await this.simulate(text, signal, generation, onLipLevel);
      return;
    }

    const voices = await waitForVoices();
    const russian = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ru"));
    const voice = russian.find((item) =>
      WINDOWS_VOICE_HINTS.some((hint) => item.name.toLowerCase().includes(hint)),
    ) ?? russian[0];
    const settings = resolveSpeechSettings(style, delivery);

    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ru-RU";
      utterance.rate = settings.rate;
      utterance.pitch = settings.pitch;
      utterance.volume = settings.gain;
      if (voice) utterance.voice = voice;

      let raf = 0;
      let startedAt = performance.now();
      let settled = false;
      const cleanup = () => {
        cancelAnimationFrame(raf);
        onLipLevel(0);
        signal.removeEventListener("abort", handleAbort);
      };
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        error ? reject(error) : resolve();
      };
      const tick = (now: number) => {
        if (signal.aborted || generation !== this.generation) return finish(abortError());
        // SAPI does not expose PCM. This envelope is intentionally conservative until real lip sync lands.
        const wave = Math.abs(Math.sin((now - startedAt) / 82));
        const syllable = Math.abs(Math.sin((now - startedAt) / 151));
        onLipLevel(Math.min(0.82, 0.06 + wave * 0.45 + syllable * 0.24));
        raf = requestAnimationFrame(tick);
      };
      const handleAbort = () => {
        window.speechSynthesis.cancel();
        finish(abortError());
      };

      utterance.onstart = () => {
        startedAt = performance.now();
        raf = requestAnimationFrame(tick);
      };
      utterance.onend = () => finish();
      utterance.onerror = (event) =>
        finish(signal.aborted || event.error === "interrupted" ? abortError() : new Error(`TTS: ${event.error}`));
      signal.addEventListener("abort", handleAbort, { once: true });
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  private async simulate(
    text: string,
    signal: AbortSignal,
    generation: number,
    onLipLevel: (level: number) => void,
  ): Promise<void> {
    const duration = Math.max(900, Math.min(8_000, text.length * 58));
    const started = performance.now();
    await new Promise<void>((resolve, reject) => {
      let raf = 0;
      const tick = (now: number) => {
        if (signal.aborted || generation !== this.generation) {
          onLipLevel(0);
          cancelAnimationFrame(raf);
          reject(abortError());
          return;
        }
        if (now - started >= duration) {
          onLipLevel(0);
          resolve();
          return;
        }
        onLipLevel(0.12 + Math.abs(Math.sin((now - started) / 105)) * 0.62);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
  }
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

class SileroSpeechProvider implements SpeechProvider {
  private generation = 0;
  private context: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;

  constructor(private readonly speaker: "xenia" | "kseniya" | "baya") {}

  cancel(): void {
    this.generation += 1;
    if (this.activeSource) {
      try {
        this.activeSource.stop();
      } catch {
        // An already-ended Web Audio source cannot be stopped twice.
      }
      this.activeSource.disconnect();
      this.activeSource = null;
    }
  }

  async speak(
    text: string,
    style: VoiceStyle,
    signal: AbortSignal,
    onLipLevel: (level: number) => void,
    delivery?: SpeechDeliveryOverride,
  ): Promise<void> {
    if (!tauriAvailable()) throw new Error("Silero доступен только в desktop-сборке");
    const generation = ++this.generation;
    if (signal.aborted) throw abortError();

    const synthesis = await invoke<SileroSynthesis>("synthesize_silero", {
      text,
      speaker: this.speaker,
      sampleRate: 48_000,
    });
    if (signal.aborted || generation !== this.generation) throw abortError();

    this.context ??= new AudioContext({ latencyHint: "interactive" });
    if (this.context.state === "suspended") await this.context.resume();
    const wav = decodeBase64(synthesis.wavBase64);
    const audio = await this.context.decodeAudioData(wav.buffer.slice(0));
    if (signal.aborted || generation !== this.generation) throw abortError();
    const settings = resolveSpeechSettings(style, delivery);

    await new Promise<void>((resolve, reject) => {
      const source = this.context!.createBufferSource();
      const gain = this.context!.createGain();
      const analyser = this.context!.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.68;
      const samples = new Uint8Array(analyser.fftSize);
      let raf = 0;
      let settled = false;

      source.buffer = audio;
      source.playbackRate.value = settings.rate;
      source.detune.value = 1_200 * Math.log2(settings.pitch);
      gain.gain.value = settings.gain;
      source.connect(gain);
      gain.connect(analyser);
      analyser.connect(this.context!.destination);
      this.activeSource = source;

      const cleanup = () => {
        cancelAnimationFrame(raf);
        onLipLevel(0);
        signal.removeEventListener("abort", handleAbort);
        source.disconnect();
        gain.disconnect();
        analyser.disconnect();
        if (this.activeSource === source) this.activeSource = null;
      };
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        error ? reject(error) : resolve();
      };
      const tick = () => {
        if (signal.aborted || generation !== this.generation) return finish(abortError());
        analyser.getByteTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) {
          const centered = (sample - 128) / 128;
          energy += centered * centered;
        }
        const rms = Math.sqrt(energy / samples.length);
        onLipLevel(Math.max(0, Math.min(1, (rms - 0.012) * 7.8)));
        raf = requestAnimationFrame(tick);
      };
      const handleAbort = () => {
        try {
          source.stop();
        } catch {
          // no-op
        }
        finish(abortError());
      };

      source.onended = () => finish();
      signal.addEventListener("abort", handleAbort, { once: true });
      source.start();
      raf = requestAnimationFrame(tick);
    });
  }
}

export class LocalSpeechOutput {
  private readonly windows = new WindowsSpeechProvider();
  private readonly silero = new Map<string, SileroSpeechProvider>();
  private profile: VoiceProfileId;
  private lastFallbackReason: string | null = null;

  constructor(profile: VoiceProfileId = storedVoiceProfile()) {
    this.profile = profile;
  }

  getProfile(): VoiceProfileId {
    return this.profile;
  }

  getLastFallbackReason(): string | null {
    return this.lastFallbackReason;
  }

  setProfile(profile: VoiceProfileId): void {
    this.cancel();
    this.profile = profile;
    this.lastFallbackReason = null;
    try {
      globalThis.localStorage?.setItem(PROFILE_STORAGE_KEY, profile);
    } catch {
      // A restricted WebView may deny storage; voice selection still works for this session.
    }
  }

  cancel(): void {
    this.windows.cancel();
    for (const provider of this.silero.values()) provider.cancel();
  }

  async speak(
    text: string,
    style: VoiceStyle,
    signal: AbortSignal,
    onLipLevel: (level: number) => void,
    options: SpeechOptions = {},
  ): Promise<void> {
    const requestedProfile = options.profile ?? this.profile;
    const profile = VOICE_PROFILES.find((item) => item.id === requestedProfile) ?? VOICE_PROFILES[0];
    this.lastFallbackReason = null;
    if (profile.engine === "windows" || !profile.speaker) {
      await this.windows.speak(text, style, signal, onLipLevel, options.delivery);
      return;
    }

    let provider = this.silero.get(profile.speaker);
    if (!provider) {
      provider = new SileroSpeechProvider(profile.speaker);
      this.silero.set(profile.speaker, provider);
    }
    try {
      await provider.speak(text, style, signal, onLipLevel, options.delivery);
    } catch (error) {
      if (isAbortError(error) || signal.aborted) throw abortError();
      this.lastFallbackReason = error instanceof Error ? error.message : String(error);
      await this.windows.speak(text, style, signal, onLipLevel, options.delivery);
    }
  }
}
