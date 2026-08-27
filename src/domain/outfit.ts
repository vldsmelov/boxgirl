import type { AvatarOutfitId } from "./types";

const OUTFIT_STORAGE_KEY = "boxgirl.avatar-outfit.v1";

export function resolveOutfitCommand(value: string): AvatarOutfitId | null {
  const command = value.trim();
  if (/^жарко[!.]?$/iu.test(command)) return "summer";
  if (/^холодно[!.]?$/iu.test(command)) return "hoodie";
  if (/^тренировка[!.]?$/iu.test(command)) return "gym";
  if (/^вечер[!.]?$/iu.test(command)) return "evening";
  if (/^хакер[!.]?$/iu.test(command)) return "hacker";
  if (/^офис[!.]?$/iu.test(command)) return "office";
  if (/^сон[!.]?$/iu.test(command)) return "sleep";
  return null;
}

export function loadOutfitPreference(): AvatarOutfitId {
  try {
    const stored = globalThis.localStorage?.getItem(OUTFIT_STORAGE_KEY);
    return stored === "summer"
      || stored === "gym"
      || stored === "evening"
      || stored === "hacker"
      || stored === "office"
      || stored === "sleep"
      ? stored
      : "hoodie";
  } catch {
    return "hoodie";
  }
}

export function saveOutfitPreference(outfit: AvatarOutfitId): void {
  try {
    globalThis.localStorage?.setItem(OUTFIT_STORAGE_KEY, outfit);
  } catch {
    // Persistence is optional; switching still works in the current session.
  }
}
