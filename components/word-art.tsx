import type { CSSProperties } from "react";
import { getWord } from "@/lib/course";

export function WordArt({ id, className = "", style, variant }: { id: string; className?: string; style?: CSSProperties; variant?: "base" | "review" }) {
  const word = getWord(id);
  return <span role="img" aria-label={word.zh} className={`word-art ${className}`} style={{ backgroundPosition: `${(word.spriteIndex % 6) * 20}% ${Math.floor(word.spriteIndex / 6) * (100 / 3)}%`, ...(variant ? { backgroundImage: `url('/images/${variant === "review" ? "words-review" : "words"}.png')` } : {}), ...style }} />;
}
