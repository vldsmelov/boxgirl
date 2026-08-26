import { describe, expect, it } from "vitest";
import {
  AVATAR_OUTFIT_IDS,
  AVATAR_PRESENTATION_IDS,
  canUseBlinkFrame,
  getAvatarFrameSource,
  getAvatarRigFrameSource,
  resolveAvatarFrame,
  resolveBlinkFrame,
} from "./avatarFrames";

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

  it("uses independent full-frame outfit sets including the authored bonk pose", () => {
    expect(AVATAR_OUTFIT_IDS).toEqual(["hoodie", "summer", "gym", "evening"]);
    expect(AVATAR_PRESENTATION_IDS).toEqual(["hoodie", "summer", "gym", "evening", "base-debug"]);
    expect(getAvatarFrameSource("hoodie", "neutral")).toBe("/assets/avatar-v2/webp/neutral.webp");
    expect(getAvatarFrameSource("summer", "wave")).toBe("/assets/avatar-v3-summer/webp/wave.webp");
    expect(getAvatarRigFrameSource("gym", "private-playful"))
      .toBe("/assets/avatar-v4-gym/webp-rig/private-playful.webp");
    expect(getAvatarRigFrameSource("evening", "wave"))
      .toBe("/assets/avatar-v5-evening/webp-rig/wave.webp");
    expect(getAvatarRigFrameSource("base-debug", "private-playful"))
      .toBe("/assets/avatar-layered-v1/base-debug/webp-rig/private-playful.webp");
    expect(getAvatarRigFrameSource("base-debug", "private-playful-alt"))
      .toBe("/assets/avatar-layered-v1/base-debug/webp-rig/private-playful-alt.webp");
  });
});
