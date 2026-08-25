export const PRIVATE_EASTER_EGG_DURATION_MS = 2_150;

/** Deliberately kept outside AssistantTurnV1 so providers cannot trigger it. */
export function isPrivateEasterEggCommand(value: string): boolean {
  return /^боньк[!.]?$/iu.test(value.trim());
}
