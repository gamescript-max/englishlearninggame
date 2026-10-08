import optimizedImages from "./optimized-game-images.json";

/** Original artwork coordinates and provenance stay in PNG source manifests.
 * Runtime uses content-addressed WebP with exactly the same decoded pixels. */
export function gameImageURL(source: string): string {
  return (optimizedImages as Record<string, string>)[source] ?? source;
}
