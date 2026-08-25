import { invoke } from "@tauri-apps/api/core";

type VoiceInputMode = "native-whisper" | "browser-fallback" | "unavailable";

interface NativeSpeechCapabilities {
  asrReady: boolean;
  engine: string;
  modelPath: string | null;
  executablePath: string | null;
}

interface RecognitionAlternativeLike {
  transcript: string;
}

interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternativeLike;
}

interface RecognitionResultListLike {
  readonly length: number;
  [index: number]: RecognitionResultLike;
}

interface RecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: RecognitionResultListLike;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionConstructor = new () => RecognitionLike;

const tauriAvailable = () => "__TAURI_INTERNALS__" in window;

function recognitionConstructor(): RecognitionConstructor | undefined {
  const candidate = window as typeof window & {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition;
}

class PcmRecorder {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mute: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private sourceSampleRate = 48_000;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    this.context = new AudioContext();
    this.sourceSampleRate = this.context.sampleRate;
    this.source = this.context.createMediaStreamSource(this.stream);
    // ScriptProcessor remains broadly available in WebView2 and keeps this MVP dependency-free.
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.mute = this.context.createGain();
    this.mute.gain.value = 0;
    this.processor.onaudioprocess = (event) => {
      this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.mute);
    this.mute.connect(this.context.destination);
  }

  async stop(): Promise<Uint8Array> {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.mute?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    await this.context?.close();

    const length = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const joined = new Float32Array(length);
    let offset = 0;
    for (const chunk of this.chunks) {
      joined.set(chunk, offset);
      offset += chunk.length;
    }
    const samples = resample(joined, this.sourceSampleRate, 16_000);
    this.chunks = [];
    return encodeWave(samples, 16_000);
  }
}

function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const output = new Float32Array(Math.max(1, Math.floor(input.length / ratio)));
  for (let index = 0; index < output.length; index += 1) {
    const position = index * ratio;
    const left = Math.floor(position);
    const right = Math.min(input.length - 1, left + 1);
    const mix = position - left;
    output[index] = input[left] * (1 - mix) + input[right] * mix;
  }
  return output;
}

function encodeWave(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function detectVoiceInputMode(): Promise<VoiceInputMode> {
  if (tauriAvailable()) {
    try {
      const capabilities = await invoke<NativeSpeechCapabilities>("speech_capabilities");
      if (capabilities.asrReady) return "native-whisper";
    } catch {
      // Browser preview or a backend built without the optional model.
    }
  }
  return recognitionConstructor() ? "browser-fallback" : "unavailable";
}

export class VoiceInputService {
  private recorder: PcmRecorder | null = null;
  private recognition: RecognitionLike | null = null;
  private finalTranscript = "";
  private interimTranscript = "";
  private recognitionEnded: Promise<void> = Promise.resolve();
  private resolveRecognitionEnd: (() => void) | null = null;

  async start(onPartial: (text: string) => void): Promise<void> {
    this.finalTranscript = "";
    this.interimTranscript = "";
    this.recorder = new PcmRecorder();
    await this.recorder.start();

    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    this.recognition = new Constructor();
    this.recognition.lang = "ru-RU";
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognitionEnded = new Promise((resolve) => {
      this.resolveRecognitionEnd = resolve;
    });
    this.recognition.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) this.finalTranscript += `${transcript} `;
        else interim += transcript;
      }
      this.interimTranscript = interim;
      onPartial(`${this.finalTranscript}${interim}`.trim());
    };
    this.recognition.onerror = () => this.resolveRecognitionEnd?.();
    this.recognition.onend = () => this.resolveRecognitionEnd?.();
    try {
      this.recognition.start();
    } catch {
      this.resolveRecognitionEnd?.();
      this.recognition = null;
    }
  }

  async stop(): Promise<string> {
    if (!this.recorder) throw new Error("Запись не была запущена");
    const wav = await this.recorder.stop();
    this.recorder = null;

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        this.recognition.abort();
      }
      await Promise.race([
        this.recognitionEnded,
        new Promise<void>((resolve) => window.setTimeout(resolve, 450)),
      ]);
      this.recognition = null;
    }

    if (tauriAvailable() && wav.length > 48) {
      try {
        const transcript = await invoke<string>("transcribe_wav", { wavBase64: toBase64(wav) });
        if (transcript.trim()) return transcript.trim();
      } catch {
        // Fall through to browser speech recognition when the local model is not installed.
      }
    }

    const fallback = `${this.finalTranscript}${this.interimTranscript}`.trim();
    if (fallback) return fallback;
    throw new Error("Локальный ASR не настроен, а браузерное распознавание недоступно");
  }

  async cancel(): Promise<void> {
    this.recognition?.abort();
    this.recognition = null;
    if (this.recorder) {
      await this.recorder.stop();
      this.recorder = null;
    }
  }
}
