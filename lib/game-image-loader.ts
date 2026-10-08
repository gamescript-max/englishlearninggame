import { gameImageURL } from "./game-image-assets";

const decoded = new Map<string, Promise<HTMLImageElement>>();

/** One download/decode per URL for all games. A failed load is retryable.
 * Consumers must not clear src on these shared, already decoded images. */
export function loadGameImage(source: string, priority: "high" | "low" | "auto" = "auto"): Promise<HTMLImageElement> {
  const url = gameImageURL(source), existing = decoded.get(url);
  if (existing) return existing;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.decoding = "async"; image.fetchPriority = priority;
    image.onerror = () => reject(new Error("小伙伴的图片还没准备好，点一下重试。"));
    image.onload = () => {
      const decode = Promise.resolve().then(() => typeof image.decode === "function" ? image.decode() : undefined);
      void decode.then(() => {
        if (!image.naturalWidth || !image.naturalHeight) throw new Error("小伙伴的图片还没准备好，点一下重试。");
        image.onload = null; image.onerror = null; resolve(image);
      }).catch(reject);
    };
    image.src = url;
  }).catch(error => {
    if (decoded.get(url) === pending) decoded.delete(url);
    throw error;
  });
  decoded.set(url, pending);
  return pending;
}
