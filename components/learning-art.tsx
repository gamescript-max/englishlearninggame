"use client";

import { gameImageURL } from "@/lib/game-image-assets";
import { useId } from "react";
import regions from "@/lib/learning-art-regions.json";
import { getLearningWord } from "@/lib/learning-content";
import type { LearningScene } from "@/lib/learning-types";
import { WordArt } from "./word-art";

export function LearningWordArt({ id, variant = "base", className = "" }: { id: string; variant?: "base" | "review"; className?: string }) {
  const clipId = `learning-crop-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const word = getLearningWord(id);
  if (!word) return <span className={`learning-word-fallback ${className}`} lang="en">{id.replaceAll("-", " ")}</span>;
  if (["animals", "food", "toys"].includes(word.unitId)) return <WordArt id={id} variant={variant} className={`learning-old-art ${className}`} />;
  const region = regions[variant].find(item => item.index === word.spriteIndex);
  if (!region) return <span className={`learning-word-fallback ${className}`} lang="en">{word.en}</span>;
  return <span role="img" aria-label={word.zh} className={`learning-word-art ${className}`}><span className="learning-word-crop"><svg viewBox={`${region.x} ${region.y} ${region.width} ${region.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><clipPath id={clipId}><rect x={region.x} y={region.y} width={region.width} height={region.height} /></clipPath></defs><image href={gameImageURL(`/images/expanded-words-${variant}.png`)} x="0" y="0" width={region.imageWidth} height={region.imageHeight} clipPath={`url(#${clipId})`} /></svg></span></span>;
}

function ColouredBall({ color }: { color: string }) {
  const fill: Record<string, string> = { red: "#ed665d", blue: "#61a6f2", green: "#65b991", yellow: "#f5c758" };
  return <svg viewBox="0 0 100 100" className="learning-coloured-ball" role="img" aria-label={`${color}球`}><circle cx="50" cy="50" r="42" fill={fill[color] ?? color} stroke="#fff" strokeWidth="5" /><path d="M15 33Q50 55 85 33M23 80Q58 54 76 18" fill="none" stroke="#ffffffa0" strokeWidth="7" /><ellipse cx="31" cy="27" rx="10" ry="6" fill="#fff9" /></svg>;
}

export function LearningSceneArt({ scene, variant = "base" }: { scene: LearningScene; variant?: "base" | "review" }) {
  const objects = scene.objects ?? [];
  if (scene.actionWordId) return <div className="learning-scene learning-action-scene"><LearningWordArt id={scene.actionWordId} variant={variant} /></div>;
  const moving = objects.find(item => item.position);
  const anchor = moving ? objects.find(item => item !== moving) : undefined;
  function draw(id: string, color?: string) { return id === "ball" && color ? <ColouredBall color={color} /> : <LearningWordArt id={id} variant={variant} />; }
  if (moving && anchor) return <div className={`learning-scene learning-position-scene position-${moving.position}`}>
    <div className="learning-scene-anchor">{draw(anchor.wordId, anchor.color)}</div>
    {moving.position === "in" && <div className="learning-inside-frame" aria-hidden="true" />}
    <div className={`learning-scene-moving moving-count-${Math.min(3, moving.count ?? 1)}`}>{Array.from({ length: Math.min(3, moving.count ?? 1) }, (_, index) => <span key={index}>{draw(moving.wordId, moving.color)}</span>)}</div>
    <span className="learning-scene-floor" aria-hidden="true" />
  </div>;
  return <div className={`learning-scene learning-scene-count objects-${objects.reduce((sum, item) => sum + Math.min(3, item.count ?? 1), 0)}`}>
    {objects.flatMap((item, itemIndex) => Array.from({ length: Math.min(3, item.count ?? 1) }, (_, count) => <span key={`${itemIndex}-${count}`} className="learning-scene-object">{draw(item.wordId, item.color)}</span>))}
  </div>;
}
