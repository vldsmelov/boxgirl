import { describe, expect, it } from "vitest";
import { isBaseDebugCommand } from "./baseDebug";

describe("typed-only base debug command", () => {
  it.each(["отладка", " ОТЛАДКА ", "ОтЛаДкА"])("accepts exact normalized text %s", (value) => {
    expect(isBaseDebugCommand(value)).toBe(true);
  });

  it.each(["отладка!", "покажи отладку", "отладка модели", "", "debug"])("rejects non-exact text %s", (value) => {
    expect(isBaseDebugCommand(value)).toBe(false);
  });
});
