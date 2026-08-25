import { describe, expect, it } from "vitest";
import { safeFallbackTurn, validateAssistantTurn } from "./types";

describe("validateAssistantTurn", () => {
  it("accepts a whitelisted performance plan and clamps intensity", () => {
    const turn = validateAssistantTurn({
      version: 1,
      turnId: "turn-1",
      segments: [
        {
          text: "Привет!",
          emotion: { id: "joy", intensity: 2 },
          gesture: "wave",
          voiceStyle: "warm",
        },
      ],
    });
    expect(turn.segments[0].emotion.intensity).toBe(1);
  });

  it("rejects raw model commands outside the whitelist", () => {
    expect(() =>
      validateAssistantTurn({
        version: 1,
        turnId: "turn-2",
        segments: [
          {
            text: "test",
            emotion: { id: "ParamAngleX", intensity: 1 },
            gesture: "run-arbitrary-file",
            voiceStyle: "warm",
          },
        ],
      }),
    ).toThrow();
  });

  it("creates a safe neutral fallback", () => {
    const turn = safeFallbackTurn("fallback");
    expect(turn.turnId).toBe("fallback");
    expect(turn.segments).toHaveLength(1);
    expect(turn.segments[0].gesture).toBe("shrug");
  });
});
