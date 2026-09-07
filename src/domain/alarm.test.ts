import { describe, expect, it, vi } from "vitest";
import { ALARM_SCRIPT, isAlarmCommand, waitForAlarmDelay } from "./alarm";

describe("local alarm scene", () => {
  it.each(["будильник", " БУДИЛЬНИК ", "Будильник!", "будильник."])("recognizes the exact command %s", (value) => {
    expect(isAlarmCommand(value)).toBe(true);
  });

  it.each(["поставь будильник", "будильник?", "будильники", "мой будильник", ""])("does not intercept normal chat text %s", (value) => {
    expect(isAlarmCommand(value)).toBe(false);
  });

  it("builds a four-stage progression with a distinct authored frame and stronger delivery", () => {
    expect(ALARM_SCRIPT).toHaveLength(4);
    expect(ALARM_SCRIPT.map((cue) => cue.frame)).toEqual([
      "alarm-soft",
      "alarm-teasing",
      "alarm-firm",
      "alarm-pout",
    ]);
    expect(ALARM_SCRIPT[0].delivery.gain).toBeLessThan(ALARM_SCRIPT.at(-1)!.delivery.gain!);
    expect(ALARM_SCRIPT[0].delivery.rate).toBeLessThan(ALARM_SCRIPT[2].delivery.rate!);
    expect(ALARM_SCRIPT.at(-1)!.text).toContain("обижусь");
  });

  it("cancels an inter-cue delay immediately", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const delay = waitForAlarmDelay(5_000, controller.signal);
    controller.abort();
    await expect(delay).rejects.toMatchObject({ name: "AbortError" });
    vi.useRealTimers();
  });
});
