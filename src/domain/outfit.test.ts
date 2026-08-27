import { describe, expect, it } from "vitest";
import { loadOutfitPreference, resolveOutfitCommand, saveOutfitPreference } from "./outfit";

describe("local outfit commands", () => {
  it.each(["жарко", " ЖАРКО ", "Жарко!", "жарко."])("selects the summer outfit for %s", (value) => {
    expect(resolveOutfitCommand(value)).toBe("summer");
  });

  it.each(["холодно", " ХОЛОДНО ", "Холодно!", "холодно."])("selects the hoodie for %s", (value) => {
    expect(resolveOutfitCommand(value)).toBe("hoodie");
  });

  it.each(["тренировка", " ТРЕНИРОВКА ", "Тренировка!", "тренировка."])("selects the gym outfit for %s", (value) => {
    expect(resolveOutfitCommand(value)).toBe("gym");
  });

  it.each(["вечер", " ВЕЧЕР ", "Вечер!", "вечер."])("selects the evening outfit for %s", (value) => {
    expect(resolveOutfitCommand(value)).toBe("evening");
  });

  it.each(["хакер", " ХАКЕР ", "Хакер!", "хакер."])("selects the hacker outfit for %s", (value) => {
    expect(resolveOutfitCommand(value)).toBe("hacker");
  });

  it.each(["офис", " ОФИС ", "Офис!", "офис."])("selects the office outfit for %s", (value) => {
    expect(resolveOutfitCommand(value)).toBe("office");
  });

  it.each(["сон", " СОН ", "Сон!", "сон."])("selects the sleep outfit for %s", (value) => {
    expect(resolveOutfitCommand(value)).toBe("sleep");
  });

  it.each(["мне жарко", "очень холодно", "план тренировки", "добрый вечер", "вечером", "вечер?", "тренировка?", "хакер?", "офисный", "иду в офис", "пора спать", "сон?", "жарковато", "жарко?", ""])("does not intercept normal chat text %s", (value) => {
    expect(resolveOutfitCommand(value)).toBeNull();
  });

  it("persists the selected outfit between sessions", () => {
    localStorage.clear();
    expect(loadOutfitPreference()).toBe("hoodie");
    saveOutfitPreference("summer");
    expect(loadOutfitPreference()).toBe("summer");
    saveOutfitPreference("gym");
    expect(loadOutfitPreference()).toBe("gym");
    saveOutfitPreference("evening");
    expect(loadOutfitPreference()).toBe("evening");
    saveOutfitPreference("hacker");
    expect(loadOutfitPreference()).toBe("hacker");
    saveOutfitPreference("office");
    expect(loadOutfitPreference()).toBe("office");
    saveOutfitPreference("sleep");
    expect(loadOutfitPreference()).toBe("sleep");
    saveOutfitPreference("hoodie");
    expect(loadOutfitPreference()).toBe("hoodie");
  });
});
