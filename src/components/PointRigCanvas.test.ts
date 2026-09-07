import { describe, expect, it } from "vitest";
import { MAX_RESIDENT_TEXTURES, selectTextureEvictions } from "./PointRigCanvas";

describe("point-rig texture cache", () => {
  it("evicts oldest inactive frames and preserves the active transition pair", () => {
    const keys = ["sleep:soft", "sleep:soft-blink", "sleep:teasing", "sleep:teasing-blink", "sleep:firm"];
    const protectedKeys = new Set(["sleep:teasing-blink", "sleep:firm"]);
    expect(selectTextureEvictions(keys, protectedKeys)).toEqual(["sleep:soft"]);
    expect(keys.length - selectTextureEvictions(keys, protectedKeys).length).toBe(MAX_RESIDENT_TEXTURES);
  });

  it("does not evict when the cache is already within budget", () => {
    expect(selectTextureEvictions(["a", "b", "c", "d"], new Set(["c", "d"]))).toEqual([]);
  });
});
