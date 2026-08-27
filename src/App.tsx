import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bug,
  CircleStop,
  Heart,
  Mic,
  SendHorizontal,
  Sparkles,
  Volume2,
  WifiOff,
} from "lucide-react";
import { AvatarStage } from "./components/AvatarStage";
import type { AvatarFrameId } from "./domain/avatarFrames";
import { GESTURE_TIMINGS } from "./domain/avatarPointRig";
import { isBaseDebugCommand } from "./domain/baseDebug";
import { loadOutfitPreference, resolveOutfitCommand, saveOutfitPreference } from "./domain/outfit";
import {
  isPrivateEasterEggAltCommand,
  isPrivateEasterEggCommand,
  PRIVATE_EASTER_EGG_DURATION_MS,
} from "./domain/privateEasterEgg";
import type { AvatarOutfitId, AvatarPresentationId, AvatarState, ChatMessage, EmotionId, GestureId } from "./domain/types";
import { safeFallbackTurn } from "./domain/types";
import { useFps } from "./hooks/useFps";
import {
  detectLocalLlmCapabilities,
  LocalAssistantProvider,
  type LocalLlmCapabilities,
  type LocalLlmMetrics,
  warmLocalLlm,
} from "./services/localAssistant";
import {
  detectSileroCapabilities,
  isVoiceProfileId,
  LocalSpeechOutput,
  type SileroCapabilities,
  type VoiceProfileId,
  VOICE_PROFILES,
  warmSilero,
} from "./services/speech";
import { detectVoiceInputMode, VoiceInputService } from "./services/voiceInput";

const suggestions = ["Привет!", "Как у тебя дела?", "У меня получилось!", "Помоги подумать"];

const animationLab: { label: string; state: AvatarState; emotion: EmotionId; gesture: GestureId }[] = [
  { label: "Слушает", state: "listening", emotion: "neutral", gesture: "none" },
  { label: "Думает", state: "thinking", emotion: "thinking", gesture: "none" },
  { label: "Приветствие", state: "speaking", emotion: "joy", gesture: "wave" },
  { label: "Кивок", state: "speaking", emotion: "neutral", gesture: "nod" },
  { label: "Нет", state: "speaking", emotion: "concern", gesture: "shake_head" },
  { label: "Объясняет ←", state: "speaking", emotion: "neutral", gesture: "explain_left" },
  { label: "Объясняет →", state: "speaking", emotion: "neutral", gesture: "explain_right" },
  { label: "Пожимает плечами", state: "speaking", emotion: "confused", gesture: "shrug" },
  { label: "Радуется", state: "speaking", emotion: "joy", gesture: "celebrate" },
  { label: "Удивлена", state: "speaking", emotion: "surprise", gesture: "none" },
  { label: "Сочувствует", state: "speaking", emotion: "concern", gesture: "nod" },
];

const previewParameters = new URLSearchParams(globalThis.location?.search ?? "");
const previewKey = previewParameters.get("avatarPreview");
const initialPreview = animationLab.find((item) => previewKey === (item.gesture === "none" ? item.state : item.gesture));
const initialDebugOpen = previewParameters.get("debug") === "1";
const previewOutfitValue = previewParameters.get("outfit");
const previewOutfit: AvatarOutfitId | null = previewOutfitValue === "hoodie"
  || previewOutfitValue === "summer"
  || previewOutfitValue === "gym"
  || previewOutfitValue === "evening"
  || previewOutfitValue === "hacker"
  || previewOutfitValue === "office"
  || previewOutfitValue === "sleep"
  ? previewOutfitValue
  : null;

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Привет! Я BoxGirl. Моя локальная модель готовится к работе — можешь спросить меня о чём-нибудь.",
  createdAt: Date.now(),
};

const outfitReplies: Record<AvatarOutfitId, { changed: string; unchanged: string }> = {
  hoodie: {
    changed: "Стало прохладно? Возвращаюсь в уютную худи.",
    unchanged: "Я уже в тёплой худи — всё хорошо.",
  },
  summer: {
    changed: "Фух, так гораздо легче. Переоделась в летнюю майку с кроликом 🐰",
    unchanged: "Я уже в летнем образе — кролик на месте 🐰",
  },
  gym: {
    changed: "Тренировка? Я готова. Переоделась — давай сделаем этот подход вместе 💪",
    unchanged: "Я уже в спортивной форме. Начинаем подход? 💪",
  },
  evening: {
    changed: "Вечерний образ готов. Изумрудный атлас, высокая укладка — можно выходить ✨",
    unchanged: "Я уже в вечернем образе — украшения и укладка на месте ✨",
  },
  hacker: {
    changed: "Хакерский образ загружен. Канал защищён, настроение — немного опасное 💻",
    unchanged: "Я уже в хакерском образе. Защита активна, хвост собран 💻",
  },
  office: {
    changed: "Офисный образ готов. Очки на месте, аргументы тоже 📎",
    unchanged: "Я уже в офисном образе — собрана и убедительна 📎",
  },
  sleep: {
    changed: "Ночной режим. Пеньюар, маска и никаких срочных задач 🌙",
    unchanged: "Я уже в ночном образе. Осталось только выключить уведомления 🌙",
  },
};

export default function App() {
  const provider = useMemo(() => new LocalAssistantProvider(), []);
  const speech = useMemo(() => new LocalSpeechOutput(), []);
  const voiceInput = useMemo(() => new VoiceInputService(), []);
  const fps = useFps();
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [input, setInput] = useState("");
  const [avatarState, setAvatarState] = useState<AvatarState>(initialPreview?.state ?? "idle");
  const [outfit, setOutfit] = useState<AvatarOutfitId>(() => previewOutfit ?? loadOutfitPreference());
  const [baseDebugVisible, setBaseDebugVisible] = useState(false);
  const [presentationOverride, setPresentationOverride] = useState<AvatarPresentationId | null>(null);
  const presentation: AvatarPresentationId = presentationOverride ?? (baseDebugVisible ? "base-debug" : outfit);
  const [emotion, setEmotion] = useState<EmotionId>(initialPreview?.emotion ?? "neutral");
  const [emotionIntensity, setEmotionIntensity] = useState(initialPreview ? 0.72 : 0.35);
  const [gesture, setGesture] = useState<GestureId>(initialPreview?.gesture ?? "none");
  const [gestureRevision, setGestureRevision] = useState(initialPreview?.gesture === "none" || !initialPreview ? 0 : 1);
  const [easterEggActive, setEasterEggActive] = useState(false);
  const [easterEggFrame, setEasterEggFrame] = useState<Extract<AvatarFrameId, "private-playful" | "private-playful-alt">>("private-playful");
  const [easterEggRevision, setEasterEggRevision] = useState(0);
  const [lipLevel, setLipLevel] = useState(0);
  const [partialTranscript, setPartialTranscript] = useState("");
  const [voiceMode, setVoiceMode] = useState<"checking" | "native-whisper" | "browser-fallback" | "unavailable">("checking");
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfileId>(() => speech.getProfile());
  const [sileroCapabilities, setSileroCapabilities] = useState<SileroCapabilities | null>(null);
  const [sileroWarmState, setSileroWarmState] = useState<"checking" | "warming" | "ready" | "error">("checking");
  const [ttsFallback, setTtsFallback] = useState<string | null>(null);
  const [llmCapabilities, setLlmCapabilities] = useState<LocalLlmCapabilities | null>(null);
  const [llmWarmState, setLlmWarmState] = useState<"checking" | "warming" | "ready" | "unavailable" | "error">("checking");
  const [assistantBackend, setAssistantBackend] = useState<"checking" | "local-qwen" | "mock-fallback">("checking");
  const [llmMetrics, setLlmMetrics] = useState<LocalLlmMetrics | null>(null);
  const [llmFallback, setLlmFallback] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [debugOpen, setDebugOpen] = useState(initialDebugOpen);
  const [avatarRenderer, setAvatarRenderer] = useState<"point-rig-webgl" | "frame-fallback">("frame-fallback");
  const activeTurn = useRef<AbortController | null>(null);
  const messageEnd = useRef<HTMLDivElement | null>(null);
  const previewTimer = useRef<number | null>(null);

  useEffect(() => {
    detectVoiceInputMode().then(setVoiceMode);
    let disposed = false;
    void (async () => {
      const capabilities = await detectSileroCapabilities();
      if (disposed) return;
      setSileroCapabilities(capabilities);
      if (!capabilities.available) {
        setSileroWarmState("error");
        return;
      }
      setSileroWarmState("warming");
      try {
        await warmSilero();
        if (!disposed) setSileroWarmState("ready");
      } catch (error) {
        if (disposed) return;
        setSileroWarmState("error");
        setSileroCapabilities({
          ...capabilities,
          available: false,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    void (async () => {
      const capabilities = await detectLocalLlmCapabilities();
      if (disposed) return;
      setLlmCapabilities(capabilities);
      provider.setLocalAvailable(capabilities.available);
      if (!capabilities.available) {
        setLlmWarmState("unavailable");
        setAssistantBackend("mock-fallback");
        return;
      }
      setLlmWarmState("warming");
      try {
        await warmLocalLlm();
        if (!disposed) {
          setLlmWarmState("ready");
          setAssistantBackend("local-qwen");
        }
      } catch (error) {
        if (disposed) return;
        const reason = error instanceof Error ? error.message : String(error);
        provider.setLocalAvailable(false);
        setLlmWarmState("error");
        setAssistantBackend("mock-fallback");
        setLlmCapabilities({ ...capabilities, available: false, ready: false, reason });
      }
    })();
    return () => {
      disposed = true;
      activeTurn.current?.abort();
      speech.cancel();
      void voiceInput.cancel();
      if (previewTimer.current !== null) window.clearTimeout(previewTimer.current);
    };
  }, [provider, speech, voiceInput]);

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const stopCurrentTurn = (nextState: AvatarState = "idle") => {
    if (previewTimer.current !== null) {
      window.clearTimeout(previewTimer.current);
      previewTimer.current = null;
    }
    activeTurn.current?.abort();
    activeTurn.current = null;
    speech.cancel();
    setLipLevel(0);
    setGesture("none");
    setEasterEggActive(false);
    setEasterEggFrame("private-playful");
    setPresentationOverride(null);
    setEmotion("neutral");
    setEmotionIntensity(0.35);
    setAvatarState(nextState);
  };

  const startGesture = (nextGesture: GestureId) => {
    setGesture(nextGesture);
    if (nextGesture !== "none") setGestureRevision((value) => value + 1);
  };

  const previewAnimation = (item: (typeof animationLab)[number]) => {
    stopCurrentTurn(item.state);
    setEmotion(item.emotion);
    setEmotionIntensity(item.emotion === "neutral" ? 0.4 : 0.72);
    startGesture(item.gesture);
    previewTimer.current = window.setTimeout(() => stopCurrentTurn(), item.state === "thinking" ? 3_200 : 2_200);
  };

  const selectVoiceProfile = (value: string) => {
    if (!isVoiceProfileId(value)) return;
    stopCurrentTurn();
    speech.setProfile(value);
    setVoiceProfile(value);
    setTtsFallback(null);
  };

  const auditionVoice = async () => {
    stopCurrentTurn("speaking");
    const controller = new AbortController();
    activeTurn.current = controller;
    setEmotion("joy");
    setEmotionIntensity(0.62);
    startGesture("wave");
    try {
      await speech.speak(
        "Привет! Я BoxGirl. Рада тебя видеть. Давай вместе разберёмся с твоим вопросом.",
        "warm",
        controller.signal,
        setLipLevel,
      );
      setTtsFallback(speech.getLastFallbackReason());
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setTtsFallback(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (activeTurn.current === controller) {
        activeTurn.current = null;
        setGesture("none");
        setEmotion("neutral");
        setEmotionIntensity(0.35);
        setLipLevel(0);
        setAvatarState("idle");
      }
    }
  };

  const triggerPrivateEasterEgg = (text: string, variant: "current" | "legacy-base" = "current") => {
    stopCurrentTurn("speaking");
    const now = Date.now();
    setMessages((current) => [
      ...current,
      { id: makeId(), role: "user", text, createdAt: now },
      {
        id: makeId(),
        role: "assistant",
        text: variant === "legacy-base" ? "Боньк2-боньк2-боньк2 ✨" : "Боньк-боньк-боньк-боньк ✨",
        createdAt: now + 1,
      },
    ]);
    setInput("");
    setEmotion("joy");
    setEmotionIntensity(0.68);
    setEasterEggFrame(variant === "legacy-base" ? "private-playful-alt" : "private-playful");
    setPresentationOverride(variant === "legacy-base" ? "base-debug" : null);
    setEasterEggActive(true);
    setEasterEggRevision((value) => value + 1);
    previewTimer.current = window.setTimeout(
      () => stopCurrentTurn(),
      PRIVATE_EASTER_EGG_DURATION_MS + 360,
    );
  };

  const triggerOutfitCommand = (text: string, nextOutfit: AvatarOutfitId) => {
    stopCurrentTurn("speaking");
    const changed = baseDebugVisible || outfit !== nextOutfit;
    const now = Date.now();
    const reply = changed ? outfitReplies[nextOutfit].changed : outfitReplies[nextOutfit].unchanged;
    setMessages((current) => [
      ...current,
      { id: makeId(), role: "user", text, createdAt: now },
      { id: makeId(), role: "assistant", text: reply, createdAt: now + 1 },
    ]);
    setInput("");
    setBaseDebugVisible(false);
    setOutfit(nextOutfit);
    saveOutfitPreference(nextOutfit);
    setEmotion("joy");
    setEmotionIntensity(0.58);
    startGesture("nod");
    previewTimer.current = window.setTimeout(() => stopCurrentTurn(), 1_650);
  };

  const triggerBaseDebugCommand = (text: string) => {
    stopCurrentTurn();
    const nextVisible = !baseDebugVisible;
    const now = Date.now();
    setMessages((current) => [
      ...current,
      { id: makeId(), role: "user", text, createdAt: now },
      {
        id: makeId(),
        role: "assistant",
        text: nextVisible
          ? "Отладочный режим техноманекена включён. Обычный боньк использует исправленную позу, боньк2 — прежнюю."
          : "Отладочный режим техноманекена выключен. Вернула предыдущий наряд.",
        createdAt: now + 1,
      },
    ]);
    setInput("");
    setBaseDebugVisible(nextVisible);
  };

  const runTurn = async (rawInput: string) => {
    const text = rawInput.trim();
    if (!text) return;
    stopCurrentTurn("thinking");
    const controller = new AbortController();
    activeTurn.current = controller;
    const turnId = makeId();
    setMessages((current) => [
      ...current,
      { id: makeId(), role: "user", text, createdAt: Date.now() },
    ]);
    setEmotion("thinking");
    setEmotionIntensity(0.65);
    setInput("");

    try {
      let turn;
      try {
        turn = await provider.respond(text, turnId, controller.signal);
        setAssistantBackend(provider.getLastMode());
        setLlmMetrics(provider.getLastMetrics());
        setLlmFallback(provider.getLastFallbackReason());
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        turn = safeFallbackTurn(turnId);
        setAssistantBackend("mock-fallback");
        setLlmMetrics(null);
        setLlmFallback(error instanceof Error ? error.message : String(error));
      }
      if (controller.signal.aborted || activeTurn.current !== controller) return;

      setMessages((current) => [
        ...current,
        {
          id: turn.turnId,
          role: "assistant",
          text: turn.segments.map((segment) => segment.text).join(" "),
          createdAt: Date.now(),
        },
      ]);

      for (const segment of turn.segments) {
        if (controller.signal.aborted) break;
        setAvatarState("speaking");
        setEmotion(segment.emotion.id);
        setEmotionIntensity(segment.emotion.intensity);
        startGesture(segment.gesture);
        let gestureTimer: number | null = null;
        if (segment.gesture !== "none") {
          gestureTimer = window.setTimeout(() => {
            if (!controller.signal.aborted && activeTurn.current === controller) setGesture("none");
          }, GESTURE_TIMINGS[segment.gesture].durationMs);
        }
        try {
          await speech.speak(segment.text, segment.voiceStyle, controller.signal, setLipLevel);
          setTtsFallback(speech.getLastFallbackReason());
        } finally {
          if (gestureTimer !== null) window.clearTimeout(gestureTimer);
          setGesture("none");
        }
      }
      if (!controller.signal.aborted && activeTurn.current === controller) {
        activeTurn.current = null;
        setAvatarState("idle");
        setEmotion("neutral");
        setEmotionIntensity(0.35);
        setLipLevel(0);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setAvatarState("error");
      setEmotion("confused");
      setMessages((current) => [
        ...current,
        { id: makeId(), role: "system", text: "Не удалось воспроизвести ответ. Проверь аудиоустройство.", createdAt: Date.now() },
      ]);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isBaseDebugCommand(input)) {
      triggerBaseDebugCommand(input.trim());
      return;
    }
    const outfitCommand = resolveOutfitCommand(input);
    if (outfitCommand) {
      triggerOutfitCommand(input.trim(), outfitCommand);
      return;
    }
    if (isPrivateEasterEggAltCommand(input)) {
      triggerPrivateEasterEgg(input.trim(), "legacy-base");
      return;
    }
    if (isPrivateEasterEggCommand(input)) {
      triggerPrivateEasterEgg(input.trim());
      return;
    }
    void runTurn(input);
  };

  const startRecording = async (event: PointerEvent<HTMLButtonElement>) => {
    if (recording) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    stopCurrentTurn("listening");
    setPartialTranscript("");
    setRecording(true);
    try {
      await voiceInput.start(setPartialTranscript);
    } catch {
      setRecording(false);
      setAvatarState("error");
      setEmotion("confused");
      setMessages((current) => [
        ...current,
        { id: makeId(), role: "system", text: "Нет доступа к микрофону. Разреши его в настройках Windows.", createdAt: Date.now() },
      ]);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setRecording(false);
    setAvatarState("thinking");
    setEmotion("thinking");
    try {
      const transcript = await voiceInput.stop();
      setPartialTranscript("");
      await runTurn(transcript);
    } catch (error) {
      setPartialTranscript("");
      setAvatarState("error");
      setEmotion("confused");
      setMessages((current) => [
        ...current,
        {
          id: makeId(),
          role: "system",
          text: error instanceof Error ? error.message : "Не удалось распознать речь",
          createdAt: Date.now(),
        },
      ]);
    }
  };

  const busy = avatarState === "speaking" || avatarState === "thinking";

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><Heart size={18} fill="currentColor" /></span>
          <div><strong>BoxGirl</strong><small>твой локальный помощник</small></div>
        </div>
        <div className="header-actions">
          <span className="offline-badge"><WifiOff size={14} /> offline-first</span>
          <button className="icon-button" onClick={() => setDebugOpen((value) => !value)} aria-label="Диагностика">
            <Bug size={18} />
          </button>
        </div>
      </header>

      <div className="workspace">
        <AvatarStage
          state={avatarState}
          presentation={presentation}
          emotion={emotion}
          emotionIntensity={emotionIntensity}
          gesture={gesture}
          gestureRevision={gestureRevision}
          easterEggActive={easterEggActive}
          easterEggFrame={easterEggFrame}
          easterEggRevision={easterEggRevision}
          lipLevel={lipLevel}
          partialTranscript={partialTranscript}
          onRendererChange={setAvatarRenderer}
        />

        <section className="chat-panel" aria-label="Диалог">
          <div className="chat-heading">
            <div><Sparkles size={17} /><span>Диалог</span></div>
            {busy && (
              <button className="stop-button" onClick={() => stopCurrentTurn()}>
                <CircleStop size={15} /> остановить
              </button>
            )}
          </div>
          <div className="messages" aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} className={`message message-${message.role}`}>
                {message.role === "assistant" && <span className="message-avatar">B</span>}
                <div>
                  <span className="message-author">
                    {message.role === "assistant" ? "BoxGirl" : message.role === "user" ? "Ты" : "Система"}
                  </span>
                  <p>{message.text}</p>
                </div>
              </article>
            ))}
            <div ref={messageEnd} />
          </div>

          <div className="suggestions">
            {suggestions.map((suggestion) => (
              <button key={suggestion} onClick={() => void runTurn(suggestion)} disabled={recording}>
                {suggestion}
              </button>
            ))}
          </div>

          <form className="composer" onSubmit={submit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Напиши что-нибудь…"
              aria-label="Сообщение"
              maxLength={2_000}
            />
            <button className="send-button" type="submit" disabled={!input.trim() || recording} aria-label="Отправить">
              <SendHorizontal size={19} />
            </button>
          </form>

          <button
            className={`ptt-button ${recording ? "is-recording" : ""}`}
            onPointerDown={(event) => void startRecording(event)}
            onPointerUp={() => void stopRecording()}
            onPointerCancel={() => void stopRecording()}
          >
            <Mic size={21} />
            <span>{recording ? "Говори… отпусти для отправки" : "Удерживай, чтобы говорить"}</span>
          </button>
          <p className="voice-note">
            <Volume2 size={13} />
            {voiceMode === "native-whisper" && "Локальный Whisper готов"}
            {voiceMode === "browser-fallback" && "Browser ASR fallback; для offline установи Whisper"}
            {voiceMode === "unavailable" && "Голосовой ввод ждёт локальный Whisper"}
            {voiceMode === "checking" && "Проверяю речевой модуль…"}
          </p>
        </section>
      </div>

      {debugOpen && (
        <aside className="debug-panel">
          <strong>Runtime</strong>
          <dl>
            <div><dt>state</dt><dd>{avatarState}</dd></div>
            <div><dt>emotion</dt><dd>{emotion} · {emotionIntensity.toFixed(2)}</dd></div>
            <div><dt>gesture</dt><dd>{gesture}</dd></div>
            <div><dt>lip</dt><dd>{lipLevel.toFixed(2)}</dd></div>
            <div><dt>render</dt><dd>{fps} FPS</dd></div>
            <div><dt>avatar</dt><dd>{avatarRenderer}</dd></div>
            <div><dt>outfit</dt><dd>{outfit}</dd></div>
            <div><dt>presentation</dt><dd>{presentation}</dd></div>
            <div><dt>ASR</dt><dd>{voiceMode}</dd></div>
            <div><dt>TTS</dt><dd>{voiceProfile}</dd></div>
            <div>
              <dt>LLM</dt>
              <dd>
                {llmWarmState === "ready" && assistantBackend === "local-qwen"
                  ? `Qwen · ${llmMetrics ? `${llmMetrics.tokensPerSecond.toFixed(1)} tok/s · ${llmMetrics.acceleration}` : llmCapabilities?.acceleration ?? "ready"}`
                  : assistantBackend}
              </dd>
            </div>
          </dl>
          <div className={`llm-runtime-note ${llmWarmState === "ready" ? "is-ready" : ""}`}>
            {llmWarmState === "checking" && "Проверяю локальную LLM…"}
            {llmWarmState === "warming" && "Загружаю Qwen3.5-4B · подбираю безопасный GPU-offload…"}
            {llmWarmState === "ready" && `Qwen3.5-4B прогрета · ${llmCapabilities?.acceleration ?? "runtime готов"} · JSON Schema`}
            {(llmWarmState === "unavailable" || llmWarmState === "error") && llmCapabilities?.reason}
            {llmFallback && <span>Последний fallback: {llmFallback}</span>}
          </div>
          <div className="voice-lab">
            <span>Voice lab</span>
            <label>
              <span>Голос ответа</span>
              <select value={voiceProfile} onChange={(event) => selectVoiceProfile(event.target.value)}>
                {VOICE_PROFILES.map((profile) => (
                  <option
                    key={profile.id}
                    value={profile.id}
                    disabled={profile.engine === "silero" && sileroCapabilities?.available === false}
                  >
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void auditionVoice()} disabled={recording || busy}>
              Прослушать реплику
            </button>
            <small className={sileroWarmState === "ready" ? "is-ready" : ""}>
              {sileroWarmState === "checking" && "Проверяю Silero…"}
              {sileroWarmState === "warming" && "Загружаю Silero v5.5 в CPU worker…"}
              {sileroWarmState === "ready" && "Silero v5.5 прогрет · CPU worker"}
              {sileroCapabilities && !sileroCapabilities.available && sileroCapabilities.reason}
            </small>
            {ttsFallback && <small className="voice-warning">Fallback на Irina: {ttsFallback}</small>}
          </div>
          <div className="animation-lab">
            <span>Animation lab</span>
            <div>
              {animationLab.map((item) => (
                <button key={item.label} type="button" onClick={() => previewAnimation(item)}>{item.label}</button>
              ))}
            </div>
          </div>
        </aside>
      )}
    </main>
  );
}
