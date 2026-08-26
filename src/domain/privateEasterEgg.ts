export const PRIVATE_EASTER_EGG_DURATION_MS = 2_150;

/** Deliberately kept outside AssistantTurnV1 so providers cannot trigger it. */
export function isPrivateEasterEggCommand(value: string): boolean {
  return /^боньк[!.]?$/iu.test(value.trim());
}

/** Legacy mannequin pose. Exact typed input only; ASR and providers bypass it. */
export function isPrivateEasterEggAltCommand(value: string): boolean {
  return value.trim().toLocaleLowerCase("ru-RU") === "боньк2";
}
