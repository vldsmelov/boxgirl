import { beforeEach, describe, expect, it } from "vitest";
import {
  isVoiceProfileId,
  storedVoiceProfile,
  resolveSpeechSettings,
  voiceStyleSettings,
  VOICE_PROFILES,
} from "./speech";

describe("voice profiles", () => {
  beforeEach(() => localStorage.clear());

  it("uses the selected BoxGirl voice as the first-run default", () => {
    expect(storedVoiceProfile()).toBe("silero-baya");
  });

  it("restores a previously auditioned profile", () => {
    localStorage.setItem("boxgirl.voiceProfile.v2", "silero-xenia");
    expect(storedVoiceProfile()).toBe("silero-xenia");
  });

  it("rejects unknown persisted values", () => {
    expect(isVoiceProfileId("silero-unknown")).toBe(false);
    expect(VOICE_PROFILES).toHaveLength(4);
  });

  it("uses subtle performance styling", () => {
    expect(voiceStyleSettings("soft").rate).toBeLessThan(1);
    expect(voiceStyleSettings("energetic").rate).toBeGreaterThan(1);
    expect(voiceStyleSettings("warm").gain).toBeLessThanOrEqual(1);
  });

  it("supports scene-local delivery without changing the saved voice profile", () => {
    const settings = resolveSpeechSettings("soft", { rate: 0.9, gain: 0.8 });
    expect(settings).toEqual({ rate: 0.9, pitch: 0.99, gain: 0.8 });
    expect(storedVoiceProfile()).toBe("silero-baya");
  });
});
