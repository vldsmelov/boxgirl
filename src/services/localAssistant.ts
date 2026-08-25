import { invoke } from "@tauri-apps/api/core";
import { MockAssistantProvider } from "../domain/mockAssistant";
import type { AssistantTurnV1 } from "../domain/types";
import { validateAssistantTurn } from "../domain/types";

export interface LocalLlmCapabilities {
  available: boolean;
  ready: boolean;
  engine: string;
  engineVersion: string;
  modelId: string;
  quantization: string;
  contextSize: number;
  gpuLayers: number | null;
  acceleration: string;
  executablePath: string | null;
  modelPath: string | null;
  reason: string | null;
}

export interface LocalLlmMetrics {
  promptTokens: number;
  completionTokens: number;
  generationMs: number;
  tokensPerSecond: number;
  modelId: string;
  acceleration: string;
}

interface LlmWarmup {
  startupMs: number;
  alreadyRunning: boolean;
  gpuLayers: number | null;
  acceleration: string;
}

interface NativeLlmCompletion extends LocalLlmMetrics {
  turn: unknown;
}

interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
}

export type AssistantBackendMode = "local-qwen" | "mock-fallback";

const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_CHARS = 6_000;
const tauriAvailable = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const abortError = () => new DOMException("Assistant turn cancelled", "AbortError");
const isAbortError = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => reject(abortError());
    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", handleAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", handleAbort);
        reject(error);
      },
    );
  });
}

export async function detectLocalLlmCapabilities(): Promise<LocalLlmCapabilities> {
  if (!tauriAvailable()) {
    return {
      available: false,
      ready: false,
      engine: "llama.cpp",
      engineVersion: "b10603",
      modelId: "Qwen3.5-4B-Q4_K_M",
      quantization: "Q4_K_M",
      contextSize: 4_096,
      gpuLayers: 0,
      acceleration: "unavailable",
      executablePath: null,
      modelPath: null,
      reason: "Локальная LLM доступна только в desktop-сборке",
    };
  }
  try {
    return await invoke<LocalLlmCapabilities>("llm_capabilities");
  } catch (error) {
    return {
      available: false,
      ready: false,
      engine: "llama.cpp",
      engineVersion: "b10603",
      modelId: "Qwen3.5-4B-Q4_K_M",
      quantization: "Q4_K_M",
      contextSize: 4_096,
      gpuLayers: 0,
      acceleration: "unavailable",
      executablePath: null,
      modelPath: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function warmLocalLlm(): Promise<LlmWarmup> {
  if (!tauriAvailable()) throw new Error("Локальная LLM доступна только в desktop-сборке");
  return invoke<LlmWarmup>("warm_llm");
}

export class LocalAssistantProvider {
  private readonly mock = new MockAssistantProvider();
  private readonly history: HistoryMessage[] = [];
  private localAvailable = tauriAvailable();
  private lastMode: AssistantBackendMode = "mock-fallback";
  private lastMetrics: LocalLlmMetrics | null = null;
  private lastFallbackReason: string | null = null;

  setLocalAvailable(available: boolean): void {
    this.localAvailable = available && tauriAvailable();
  }

  getLastMode(): AssistantBackendMode {
    return this.lastMode;
  }

  getLastMetrics(): LocalLlmMetrics | null {
    return this.lastMetrics;
  }

  getLastFallbackReason(): string | null {
    return this.lastFallbackReason;
  }

  async respond(input: string, turnId: string, signal: AbortSignal): Promise<AssistantTurnV1> {
    this.lastMetrics = null;
    this.lastFallbackReason = null;
    if (this.localAvailable) {
      try {
        const completion = await abortable(
          invoke<NativeLlmCompletion>("complete_llm_turn", {
            input,
            history: this.history,
            turnId,
          }),
          signal,
        );
        const turn = validateAssistantTurn(completion.turn);
        if (turn.turnId !== turnId) throw new Error("LLM вернула чужой turnId");
        this.lastMode = "local-qwen";
        this.lastMetrics = {
          promptTokens: completion.promptTokens,
          completionTokens: completion.completionTokens,
          generationMs: completion.generationMs,
          tokensPerSecond: completion.tokensPerSecond,
          modelId: completion.modelId,
          acceleration: completion.acceleration,
        };
        this.remember(input, turn);
        return turn;
      } catch (error) {
        if (isAbortError(error) || signal.aborted) throw abortError();
        this.lastFallbackReason = error instanceof Error ? error.message : String(error);
      }
    } else {
      this.lastFallbackReason = "Локальная модель не установлена";
    }

    const fallback = await this.mock.respond(input, turnId, signal);
    this.lastMode = "mock-fallback";
    this.remember(input, fallback);
    return fallback;
  }

  private remember(input: string, turn: AssistantTurnV1): void {
    this.history.push(
      { role: "user", text: input.trim().slice(0, 2_000) },
      { role: "assistant", text: turn.segments.map((segment) => segment.text).join(" ").slice(0, 1_600) },
    );
    while (
      this.history.length > MAX_HISTORY_MESSAGES
      || this.history.reduce((sum, message) => sum + message.text.length, 0) > MAX_HISTORY_CHARS
    ) {
      this.history.splice(0, Math.min(2, this.history.length));
    }
  }
}
