import { describe, expect, it } from "vitest";
import { canUseBlinkFrame, resolveAvatarFrame, resolveBlinkFrame } from "./avatarFrames";

describe("curated avatar frame resolver", () => {
  it("prioritizes hard states over stale model gestures", () => {
    expect(resolveAvatarFrame("listening", "joy", "celebrate")).toBe("listening");
    expect(resolveAvatarFrame("thinking", "surprise", "wave")).toBe("thinking");
    expect(resolveAvatarFrame("error", "neutral", "none")).toBe("confused");
  });

  it("maps semantic gestures without exposing asset filenames to the model", () => {
    expect(resolveAvatarFrame("speaking", "neutral", "wave")).toBe("wave");
    expect(resolveAvatarFrame("speaking", "joy", "explain_left")).toBe("explain-left");
    expect(resolveAvatarFrame("speaking", "neutral", "shrug")).toBe("confused");
  });

  it("uses authored emotion frames and blinks only on compatible neutral art", () => {
    expect(resolveAvatarFrame("speaking", "sadness", "none")).toBe("sadness");
    expect(resolveAvatarFrame("speaking", "concern", "none")).toBe("concern");
    expect(resolveAvatarFrame("speaking", "joy", "none")).toBe("joy");
    expect(canUseBlinkFrame("neutral", "idle")).toBe(true);
    expect(resolveBlinkFrame("listening", "listening")).toBe("listening-blink");
    expect(resolveBlinkFrame("thinking", "thinking")).toBe("thinking-blink");
    expect(resolveBlinkFrame("joy", "speaking")).toBe("joy-blink");
    expect(resolveBlinkFrame("concern", "speaking")).toBe("concern-blink");
    expect(resolveBlinkFrame("sadness", "speaking")).toBe("sadness-blink");
    expect(resolveBlinkFrame("surprise", "speaking")).toBe("surprise-blink");
    expect(resolveBlinkFrame("confused", "error")).toBe("confused-blink");
    expect(canUseBlinkFrame("concern", "speaking")).toBe(true);
    expect(canUseBlinkFrame("wave", "speaking")).toBe(false);
  });
});
