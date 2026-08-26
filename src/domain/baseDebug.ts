/**
 * The base preview is deliberately typed-only. ASR transcripts must continue
 * directly to the assistant and must never call this resolver.
 */
export function isBaseDebugCommand(value: string): boolean {
  return value.trim().toLocaleLowerCase("ru-RU") === "отладка";
}
