import { describe, expect, it } from "vitest";
import { isPrivateEasterEggCommand } from "./privateEasterEgg";
import { GESTURE_IDS } from "./types";

describe("private easter egg command", () => {
  it.each(["боньк", " БОНЬК ", "Боньк!", "боньк."])("accepts the private typed command %s", (value) => {
    expect(isPrivateEasterEggCommand(value)).toBe(true);
  });

  it.each(["бонк", "скажи боньк", "боньк-боньк", "боньк?", ""])("does not expose broad or accidental matches for %s", (value) => {
    expect(isPrivateEasterEggCommand(value)).toBe(false);
  });

  it("is not available to AssistantTurnV1 providers", () => {
    expect(GESTURE_IDS).not.toContain("boink");
    expect(GESTURE_IDS).not.toContain("easter_egg");
  });
});
