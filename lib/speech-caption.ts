export type SpeechPhase = "loading" | "playing" | "ended" | "error";
export type SpeechCaptionState = { requestId: number; text: string; phase: SpeechPhase } | null;

let snapshot: SpeechCaptionState = null;
const listeners = new Set<() => void>();
export function getSpeechCaption(): SpeechCaptionState { return snapshot; }
export function getServerSpeechCaption(): SpeechCaptionState { return null; }
export function subscribeSpeechCaption(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function beginSpeechCaption(requestId: number, text: string) {
  snapshot = { requestId, text, phase: "loading" };
  for (const listener of listeners) listener();
}
export function updateSpeechCaption(requestId: number, phase: SpeechPhase) {
  if (!snapshot || snapshot.requestId !== requestId || snapshot.phase === phase) return;
  snapshot = { ...snapshot, phase };
  for (const listener of listeners) listener();
}
export function clearSpeechCaption() {
  if (!snapshot) return;
  snapshot = null;
  for (const listener of listeners) listener();
}
