import { describe, expect, it } from "vitest";
import { getMotionProfile, randomBetween } from "./avatarBehavior";

describe("avatar behavior profiles", () => {
  it("uses dedicated semantic motion profiles", () => {
    expect(getMotionProfile("thinking", "none").motion).toBe("thinking");
    expect(getMotionProfile("speaking", "celebrate").motion).toBe("celebrate");
    expect(getMotionProfile("listening", "none").motion).toBe("listening");
  });

  it("prioritizes the thinking state over a stale gesture", () => {
    expect(getMotionProfile("thinking", "celebrate").motion).toBe("thinking");
  });

  it("keeps randomized intervals inside their requested range", () => {
    expect(randomBetween(2, 6, () => 0)).toBe(2);
    expect(randomBetween(2, 6, () => 0.5)).toBe(4);
    expect(randomBetween(2, 6, () => 1)).toBe(6);
  });
});
