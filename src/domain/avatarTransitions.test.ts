import { describe, expect, it } from "vitest";
import {
  FRAME_TRANSITION_DURATIONS_MS,
  easeFrameTransition,
  getFrameTransitionDurationMs,
  getFrameTransitionKind,
} from "./avatarTransitions";

describe("avatar frame transitions", () => {
  it("reserves long fades for authored poses and keeps the approved private timing", () => {
    expect(getFrameTransitionKind("neutral", "joy")).toBe("pose");
    expect(getFrameTransitionDurationMs("neutral", "joy")).toBeGreaterThanOrEqual(500);
    expect(getFrameTransitionDurationMs("neutral", "private-playful")).toBe(
      FRAME_TRANSITION_DURATIONS_MS.privatePose,
    );
  });

  it("uses shorter dedicated windows for blinks and authored head keys", () => {
    expect(getFrameTransitionKind("neutral", "blink")).toBe("blink");
    expect(getFrameTransitionKind("neutral", "nod-down")).toBe("motion");
    expect(getFrameTransitionDurationMs("neutral", "blink")).toBe(FRAME_TRANSITION_DURATIONS_MS.blink);
    expect(getFrameTransitionDurationMs("shake-left", "shake-right")).toBe(FRAME_TRANSITION_DURATIONS_MS.motion);
  });

  it("uses a monotonic symmetric quintic curve with gentle endpoints", () => {
    const values = Array.from({ length: 21 }, (_, index) => easeFrameTransition(index / 20));
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(1);
    expect(values.every((value, index) => index === 0 || value >= values[index - 1])).toBe(true);
    expect(easeFrameTransition(0.1)).toBeCloseTo(1 - easeFrameTransition(0.9), 10);
    expect(easeFrameTransition(0.01)).toBeLessThan(0.00002);
    expect(1 - easeFrameTransition(0.99)).toBeLessThan(0.00002);
  });
});
