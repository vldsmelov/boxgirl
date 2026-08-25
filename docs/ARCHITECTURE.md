# Runtime architecture

## Trust boundary

`AssistantTurnV1` — единственная граница между генератором ответа и performance-runtime. Вход всегда валидируется, intensity ограничивается диапазоном 0..1, длина текста и число сегментов ограничены, а emotion/gesture/voice style выбираются только из whitelist.

LLM не должна получать интерфейс для:

- открытия файлов motions по произвольному пути;
- прямой записи Cubism parameters;
- запуска процессов;
- выполнения системных команд.

## Turn lifecycle

```text
idle → listening → thinking → speaking → idle
          │             │          │
          └──────────── cancel ─────┘
                                error
```

Каждый turn владеет `AbortController`. Новый ввод сначала отменяет предыдущий controller и TTS, сбрасывает mouth/gesture, затем создаёт новый `turnId`. Поэтому старый async-ответ не может оживить отменённую анимацию.

## Provider boundaries

- `LocalAssistantProvider.respond` — Qwen3.5-4B через native `llama-server`, с `MockAssistantProvider` как аварийным fallback.
- Tauri `complete_llm_turn` — loopback-only, API-key protected, schema-constrained адаптер; модель не владеет `turnId` и не видит rig API.
- `LocalSpeechOutput.speak` — persistent Silero worker с Baya по умолчанию и Windows Irina как fallback.
- `VoiceInputService` — PCM recorder и выбор native/browser ASR.
- Tauri `transcribe_wav` — безопасный адаптер к локальному whisper.cpp.
- `model.manifest.json` — renderer-independent mapping семантики на Cubism assets.

Следующий этап LLM — streaming как `AsyncIterable<PerformanceSegment>` без изменения сегментного формата. Текущий нативный вызов уже сохраняет тот же `respond(input, turnId, signal)` и отбрасывает результат отменённого turn.

## Animation calculation order

Cubism bridge должен применять кадр в следующем порядке:

1. base pose/idle;
2. body motion;
3. expression;
4. blink/gaze/breath/physics;
5. lip sync;
6. clamping.

Raster fallback имитирует те же семантические состояния через CSS, поэтому UI и сценарии можно тестировать до завершения PSD и рига.
