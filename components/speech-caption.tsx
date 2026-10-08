"use client";

import { useSyncExternalStore } from "react";
import { Volume2 } from "lucide-react";
import { getServerSpeechCaption, getSpeechCaption, subscribeSpeechCaption } from "@/lib/speech-caption";

/** All English speech, including Recorder demonstrations, uses this one source. */
export function SpeechCaption({ inlineText }: { inlineText?: string }) {
  const speech = useSyncExternalStore(subscribeSpeechCaption, getSpeechCaption, getServerSpeechCaption);
  if (!speech || speech.phase === "ended" || speech.text === inlineText) return null;
  return <aside className={`speech-caption caption-${speech.phase}`} aria-label="英语朗读字幕" aria-live="polite">
    <span><Volume2 size={21}/>{speech.phase === "playing" ? "正在读给你听" : speech.phase === "loading" ? "准备读这句英语" : "这句英语暂时没播出来"}</span>
    <p lang="en">{speech.text}</p>
  </aside>;
}
