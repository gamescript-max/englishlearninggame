// Deterministic lossless format encoding only; never modifies source PNGs.
import sharp from "sharp";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const names = ["adventure-snakes-v1", "words", "archipelago-ocean-v1", "snake-breeds-flat-v3", "adventure-cards-v2", "expanded-words-base", "natural-ocean-a-v1", "natural-ocean-b-v1", "natural-ocean-c-v1", "natural-ocean-d-v1", "natural-ocean-colors-v1", "ocean-giants-v1", "natural-seabed-plants-v2", "destination-islands-v1", "fox"];
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const urls = {}, records = [];
for (const name of names) {
  const source = `/images/${name}.png`, bytes = await readFile(path.join(root, "public", source));
  const encoded = await sharp(bytes).webp({ lossless: true, exact: true, effort: 6 }).toBuffer();
  const before = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(encoded).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (before.info.width !== after.info.width || before.info.height !== after.info.height || !before.data.equals(after.data)) throw new Error(`Lossless RGBA verification failed: ${name}`);
  const sha256 = digest(encoded), url = `/images/${name}-web-${sha256.slice(0, 12)}.webp`;
  await writeFile(path.join(root, "public", url), encoded);
  urls[source] = url;
  records.push({ source, url, width: after.info.width, height: after.info.height, sourceBytes: bytes.length, bytes: encoded.length, sourceSha256: digest(bytes), sha256, rgbaExact: true });
  console.log(`${name}: ${bytes.length} → ${encoded.length} bytes; exact RGBA`);
}
await writeFile(path.join(root, "lib/optimized-game-images.json"), JSON.stringify(urls, null, 2) + "\n");
await writeFile(path.join(root, "scripts/game-images-verification.json"), JSON.stringify({ encoder: "sharp lossless WebP, exact:true, effort:6; original PNGs retained byte-for-byte", sourceBytes: records.reduce((sum, item) => sum + item.sourceBytes, 0), bytes: records.reduce((sum, item) => sum + item.bytes, 0), records }, null, 2) + "\n");
