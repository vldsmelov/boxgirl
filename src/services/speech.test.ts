import { beforeEach, describe, expect, it } from "vitest";
import {
  isVoiceProfileId,
  storedVoiceProfile,
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
});
