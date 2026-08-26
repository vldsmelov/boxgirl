import { describe, expect, it } from "vitest";
import { isPrivateEasterEggAltCommand, isPrivateEasterEggCommand } from "./privateEasterEgg";
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

  it.each(["боньк2", " БОНЬК2 ", "БоНьК2"])('accepts the exact legacy mannequin command %s', (value) => {
    expect(isPrivateEasterEggAltCommand(value)).toBe(true);
  });

  it.each(["боньк2!", "скажи боньк2", "боньк 2", "боньк22", ""])('rejects broad legacy command matches for %s', (value) => {
    expect(isPrivateEasterEggAltCommand(value)).toBe(false);
  });
});
