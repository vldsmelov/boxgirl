import { afterEach, describe, expect, it, vi } from "vitest";
import { MockAssistantProvider } from "./mockAssistant";

afterEach(() => vi.useRealTimers());

describe("MockAssistantProvider", () => {
  it("selects the greeting scenario", async () => {
    vi.useFakeTimers();
    const provider = new MockAssistantProvider();
    const response = provider.respond("Привет!", "greeting", new AbortController().signal);
    await vi.advanceTimersByTimeAsync(800);
    const turn = await response;
    expect(turn.turnId).toBe("greeting");
    expect(turn.segments[0].gesture).toBe("wave");
    expect(turn.segments[0].emotion.id).toBe("joy");
  });

  it("uses a bounded fallback for an unknown question", async () => {
    vi.useFakeTimers();
    const provider = new MockAssistantProvider();
    const response = provider.respond("Квантовая гравитация?", "fallback", new AbortController().signal);
    await vi.advanceTimersByTimeAsync(800);
    const turn = await response;
    expect(turn.segments[0].emotion.id).toBe("confused");
    expect(turn.segments[0].text).toContain("демонстрационном режиме");
  });

  it("supports cancellation", async () => {
    vi.useFakeTimers();
    const provider = new MockAssistantProvider();
    const controller = new AbortController();
    const response = provider.respond("Привет", "cancelled", controller.signal);
    controller.abort();
    await expect(response).rejects.toMatchObject({ name: "AbortError" });
  });
});
