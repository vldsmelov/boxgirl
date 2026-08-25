import type { AssistantTurnV1, PerformanceSegment } from "./types";
import { validateAssistantTurn } from "./types";

interface Scenario {
  id: string;
  matches: (input: string) => boolean;
  segments: PerformanceSegment[];
}

const containsAny = (input: string, words: string[]) => words.some((word) => input.includes(word));

export const SCENARIOS: Scenario[] = [
  {
    id: "greeting",
    matches: (input) => containsAny(input, ["привет", "здравствуй", "доброе утро", "добрый вечер"]),
    segments: [
      {
        text: "Привет! Я BoxGirl. Рада тебя видеть — о чём хочешь поговорить?",
        emotion: { id: "joy", intensity: 0.72 },
        gesture: "wave",
        voiceStyle: "warm",
      },
    ],
  },
  {
    id: "thanks",
    matches: (input) => containsAny(input, ["спасибо", "благодарю", "ты помогла"]),
    segments: [
      {
        text: "Пожалуйста! Мне приятно быть полезной.",
        emotion: { id: "joy", intensity: 0.58 },
        gesture: "nod",
        voiceStyle: "warm",
      },
    ],
  },
  {
    id: "identity",
    matches: (input) => containsAny(input, ["кто ты", "как тебя зовут", "расскажи о себе"]),
    segments: [
      {
        text: "Я BoxGirl — локальная аниме-помощница. Пока мой интеллект работает на сценариях, зато эмоции, голос и движения уже проходят через тот же pipeline, что и будущая модель.",
        emotion: { id: "joy", intensity: 0.48 },
        gesture: "explain_right",
        voiceStyle: "warm",
      },
    ],
  },
  {
    id: "good-news",
    matches: (input) => containsAny(input, ["получилось", "успех", "хорошая новость", "я сделал", "я смог"]),
    segments: [
      {
        text: "Вот это здорово! Правда, отличный результат.",
        emotion: { id: "joy", intensity: 0.9 },
        gesture: "celebrate",
        voiceStyle: "energetic",
      },
      {
        text: "Расскажешь, что оказалось самым сложным?",
        emotion: { id: "joy", intensity: 0.5 },
        gesture: "none",
        voiceStyle: "warm",
      },
    ],
  },
  {
    id: "sad-topic",
    matches: (input) => containsAny(input, ["грустно", "плохо", "не получилось", "устал", "тяжело"]),
    segments: [
      {
        text: "Понимаю. Не обязательно решать всё одним рывком.",
        emotion: { id: "concern", intensity: 0.7 },
        gesture: "nod",
        voiceStyle: "soft",
      },
      {
        text: "Давай разберём ситуацию на один маленький следующий шаг.",
        emotion: { id: "neutral", intensity: 0.45 },
        gesture: "explain_left",
        voiceStyle: "warm",
      },
    ],
  },
  {
    id: "surprise",
    matches: (input) => containsAny(input, ["удивись", "сюрприз", "невероятно", "представляешь"]),
    segments: [
      {
        text: "Серьёзно? Вот этого я точно не ожидала!",
        emotion: { id: "surprise", intensity: 0.88 },
        gesture: "shrug",
        voiceStyle: "energetic",
      },
    ],
  },
  {
    id: "thinking",
    matches: (input) => containsAny(input, ["подумай", "сложный вопрос", "как лучше", "посоветуй"]),
    segments: [
      {
        text: "Хм, давай подумаем спокойно.",
        emotion: { id: "thinking", intensity: 0.72 },
        gesture: "none",
        voiceStyle: "soft",
      },
      {
        text: "Я бы сначала уточнила цель, затем ограничения, и только после этого сравнила варианты.",
        emotion: { id: "neutral", intensity: 0.5 },
        gesture: "explain_right",
        voiceStyle: "neutral",
      },
    ],
  },
  {
    id: "how-are-you",
    matches: (input) => containsAny(input, ["как дела", "как настроение", "как ты"]),
    segments: [
      {
        text: "У меня всё хорошо — процессы прогреты, настроение тёплое. А как ты?",
        emotion: { id: "joy", intensity: 0.55 },
        gesture: "nod",
        voiceStyle: "warm",
      },
    ],
  },
];

const fallbackSegment: PerformanceSegment = {
  text: "Пока я работаю в демонстрационном режиме и не умею честно ответить на любой вопрос. Но я уже могу показать, как буду говорить, двигаться и выражать эмоции после подключения локальной модели.",
  emotion: { id: "confused", intensity: 0.45 },
  gesture: "explain_left",
  voiceStyle: "warm",
};

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Turn cancelled", "AbortError"));
      },
      { once: true },
    );
  });

export class MockAssistantProvider {
  async respond(input: string, turnId: string, signal: AbortSignal): Promise<AssistantTurnV1> {
    await wait(420 + Math.random() * 260, signal);
    const normalized = input.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();
    const scenario = SCENARIOS.find((candidate) => candidate.matches(normalized));
    return validateAssistantTurn({
      version: 1,
      turnId,
      segments: scenario?.segments ?? [fallbackSegment],
    });
  }
}
