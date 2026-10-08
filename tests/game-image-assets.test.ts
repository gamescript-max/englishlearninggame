import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import sharp from "sharp";
import { gameImageURL } from "../lib/game-image-assets";

const originals = [
  "adventure-snakes-v1", "words", "archipelago-ocean-v1", "snake-breeds-flat-v3",
  "adventure-cards-v2", "expanded-words-base", "natural-ocean-a-v1", "natural-ocean-b-v1",
  "natural-ocean-c-v1", "natural-ocean-d-v1", "natural-ocean-colors-v1", "ocean-giants-v1",
  "natural-seabed-plants-v2", "destination-islands-v1", "fox",
].map(name => `/images/${name}.png`);

function publicFile(src: string) { return new URL(`../public${src}`, import.meta.url); }

test("all game and primary map images have smaller content-hashed WebP assets with original dimensions", async () => {
  const served = originals.map(gameImageURL);
  assert.equal(new Set(served).size, originals.length, "different original sheets retain separate assets");
  let originalBytes = 0, servedBytes = 0;
  for (const [index, src] of originals.entries()) {
    const url = served[index];
    assert.match(url, /^\/images\/[^/]+\.webp$/);
    assert.notEqual(url, src);
    assert.equal(gameImageURL(url), url, "the encoded URL is its own alias");
    const png = readFileSync(publicFile(src)), webp = readFileSync(publicFile(url));
    assert.equal(webp.toString("ascii", 0, 4), "RIFF");
    assert.equal(webp.toString("ascii", 8, 12), "WEBP");
    assert.equal(webp.readUInt32LE(4) + 8, webp.length, `${url} is complete`);
    const hash = url.match(/([a-f0-9]{8,64})(?=\.webp$)/)?.[1];
    assert.ok(hash, `${url} carries a content hash for immutable caching`);
    assert.ok(createHash("sha256").update(webp).digest("hex").startsWith(hash), `${url} hash matches its bytes`);
    const [before, after] = await Promise.all([sharp(png).metadata(), sharp(webp).metadata()]);
    assert.deepEqual([after.width, after.height, after.channels], [before.width, before.height, before.channels], `${src} retains source geometry and channels`);
    assert.equal(after.hasAlpha, before.hasAlpha, `${src} retains transparency`);
    assert.ok(webp.length < png.length, `${src} saves download bytes without resizing`);
    originalBytes += png.length; servedBytes += webp.length;
  }
  assert.ok(servedBytes < originalBytes * .75, "the complete resource set reduces transfer by at least one quarter");
});

test("lossless natural animal and seabed assets preserve every RGBA byte including hidden transparent RGB", async () => {
  for (const src of ["/images/natural-ocean-a-v1.png", "/images/natural-seabed-plants-v2.png"]) {
    const [original, encoded] = await Promise.all([
      sharp(readFileSync(publicFile(src))).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(readFileSync(publicFile(gameImageURL(src)))).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    ]);
    assert.deepEqual([encoded.info.width, encoded.info.height, encoded.info.channels], [original.info.width, original.info.height, original.info.channels]);
    assert.ok(original.data.equals(encoded.data), `${src} preserves alpha, visible colours and zero-alpha RGB exactly`);
  }
});

test("unregistered, external and already encoded URLs are left untouched", () => {
  for (const src of ["/images/unregistered-test.png", "/images/custom.webp", "/favicon.svg", "https://example.com/images/fox.png", "data:image/png;base64,aGVsbG8="]) {
    assert.equal(gameImageURL(src), src);
  }
});
