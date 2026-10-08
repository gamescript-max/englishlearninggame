import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { gameImageURL } from "../lib/game-image-assets";
import * as naturalArt from "../lib/natural-ocean-art";
import type { AdventureImages } from "../components/adventure-renderer";
import type { OceanSceneryImages } from "../components/ocean-scenery-sprites";

type ImagePriority = "high" | "low" | "auto";
type ImageLoader = { loadGameImage: (src: string, priority?: ImagePriority) => Promise<HTMLImageElement> };

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Each VM gets the actual loader and its own cache, without a production reset hook. */
function imageHost() {
  const images: MockImage[] = [];
  class MockImage {
    onload: (() => unknown) | null = null;
    onerror: (() => unknown) | null = null;
    fetchPriority: ImagePriority = "auto";
    decoding = "auto";
    width = 1536;
    height = 1024;
    naturalWidth = 1536;
    naturalHeight = 1024;
    decodeCalls = 0;
    srcWrites: string[] = [];
    readonly decoded = deferred<void>();
    private source = "";
    constructor() { images.push(this); }
    get src() { return this.source; }
    set src(value: string) { this.source = value; this.srcWrites.push(value); }
    decode() { this.decodeCalls++; return this.decoded.promise; }
    loaded() { this.onload?.(); }
    failed() { this.onerror?.(); }
  }
  const source = ts.transpileModule(readFileSync(new URL("../lib/game-image-loader.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loader = {} as ImageLoader;
  vm.runInNewContext(source, {
    exports: loader,
    Image: MockImage,
    require(id: string) {
      if (["./game-image-assets", "@/lib/game-image-assets"].includes(id)) return { gameImageURL };
      throw new Error(`Unexpected image loader dependency: ${id}`);
    },
  });
  return {
    loader, images,
    async flush() { for (let i = 0; i < 5; i++) await Promise.resolve(); },
    async ready(image: MockImage) { image.loaded(); image.decoded.resolve(); await this.flush(); },
  };
}

test("concurrent PNG and WebP callers share one download, decode and cached image", async () => {
  const host = imageHost(), original = "/images/natural-seabed-plants-v2.png", served = gameImageURL(original);
  const first = host.loader.loadGameImage(original, "high"), alias = host.loader.loadGameImage(served);
  assert.strictEqual(first, alias, "both URLs identify the same in-flight promise");
  assert.equal(host.images.length, 1);
  const image = host.images[0];
  assert.equal(image.fetchPriority, "high");
  assert.deepEqual(image.srcWrites, [served]);
  let ready = false; void first.then(() => { ready = true; });
  image.loaded(); await host.flush();
  assert.equal(image.decodeCalls, 1);
  assert.equal(ready, false, "onload must not expose an undecoded bitmap");
  image.decoded.resolve();
  assert.strictEqual(await first, image);
  assert.equal(ready, true);
  assert.strictEqual(host.loader.loadGameImage(original), first);
  assert.strictEqual(host.loader.loadGameImage(served), first);
  assert.equal(host.images.length, 1);
  assert.equal(image.decodeCalls, 1);
  assert.deepEqual(image.srcWrites, [served], "reusable cached images keep their source");
});

test("load failures evict the shared URL so retry starts a fresh download", async () => {
  const host = imageHost(), original = "/images/natural-ocean-a-v1.png", served = gameImageURL(original);
  const failed = host.loader.loadGameImage(original), rejected = assert.rejects(failed);
  assert.strictEqual(host.loader.loadGameImage(served), failed);
  host.images[0].failed(); await rejected;
  const retry = host.loader.loadGameImage(served, "low");
  assert.notStrictEqual(retry, failed);
  assert.strictEqual(host.loader.loadGameImage(original), retry);
  assert.equal(host.images.length, 2);
  assert.equal(host.images[1].fetchPriority, "low");
  await host.ready(host.images[1]);
  assert.strictEqual(await retry, host.images[1]);
  assert.strictEqual(host.loader.loadGameImage(original), retry);
  assert.equal(host.images[0].decodeCalls, 0);
  assert.ok(host.images.every(image => image.srcWrites.every(src => src.length > 0)), "cleanup does not clear shared image sources");
});

test("a rejected bitmap decode does not poison later retry or resolve early", async () => {
  const host = imageHost(), src = "/images/archipelago-ocean-v1.png";
  const failed = host.loader.loadGameImage(src), rejected = assert.rejects(failed);
  host.images[0].loaded(); await host.flush();
  host.images[0].decoded.reject(new Error("decode failed")); await rejected;
  const retry = host.loader.loadGameImage(src);
  assert.notStrictEqual(retry, failed);
  assert.equal(host.images.length, 2);
  await host.ready(host.images[1]);
  assert.strictEqual(await retry, host.images[1]);
  assert.strictEqual(host.loader.loadGameImage(src), retry);
});

test("different URLs remain independent and unknown image URLs load unchanged", async () => {
  const host = imageHost(), firstSrc = "/images/fox.png", secondSrc = "/images/unregistered-test.png";
  const first = host.loader.loadGameImage(firstSrc), second = host.loader.loadGameImage(secondSrc);
  assert.notStrictEqual(first, second);
  assert.equal(host.images.length, 2);
  assert.equal(host.images[0].src, gameImageURL(firstSrc));
  assert.equal(host.images[1].src, secondSrc);
  assert.equal(host.images[1].fetchPriority, "auto");
  let firstReady = false; void first.then(() => { firstReady = true; });
  await host.ready(host.images[1]);
  assert.strictEqual(await second, host.images[1]);
  assert.equal(firstReady, false, "decoding one asset cannot release a different pending asset");
  await host.ready(host.images[0]);
  assert.strictEqual(await first, host.images[0]);
});

function adventureImageHost() {
  const requested: string[] = [], sourceChanges: string[] = [], draws: unknown[][] = [];
  let alphaReads = 0;
  const document = {
    createElement(name: string) {
      assert.equal(name, "canvas");
      const context = {
        save() {}, restore() {}, beginPath() {}, rect() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {},
        drawImage(...args: unknown[]) { draws.push(args); },
        getImageData() { alphaReads++; throw new Error("Plant alpha bounds must be prepared before runtime"); },
      };
      return { width: 0, height: 0, getContext: () => context };
    },
  };
  const loadGameImage = (source: string) => {
    requested.push(gameImageURL(source));
    let src = gameImageURL(source);
    const image = { width: 1536, height: 1286, naturalWidth: 1536, naturalHeight: 1286,
      get src() { return src; }, set src(next: string) { src = next; sourceChanges.push(next); } };
    return Promise.resolve(image);
  };
  const evaluate = <T,>(path: string, dependency: (id: string) => unknown) => {
    const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {} as T;
    vm.runInNewContext(source, { exports, document, require: dependency });
    return exports;
  };
  const scenery = evaluate<{ loadOceanSceneryImages: () => Promise<OceanSceneryImages> }>("../components/ocean-scenery-sprites.ts", id => {
    if (id.endsWith("game-image-loader")) return { loadGameImage };
    throw new Error(`Unexpected scenery loader dependency: ${id}`);
  });
  const adventure = evaluate<{ loadAdventureImages: (mode?: "fish" | "snake") => Promise<AdventureImages> }>("../components/adventure-renderer.ts", id => {
    if (id.endsWith("game-image-loader")) return { loadGameImage };
    if (id.endsWith("game-image-assets")) return { gameImageURL };
    if (id === "./ocean-scenery-sprites") return scenery;
    if (id === "@/lib/natural-ocean-art") return naturalArt;
    if (id.endsWith(".json")) return { default: JSON.parse(readFileSync(new URL(`../${id.replace("@/", "")}`, import.meta.url), "utf8")) };
    if (["@/lib/adventure-engine", "@/lib/adventure-catalog", "@/lib/adventure-motion", "@/lib/adventure-feeding", "./ocean-scenery"].includes(id)) return {};
    throw new Error(`Unexpected adventure loader dependency: ${id}`);
  });
  return { adventure, scenery, requested, sourceChanges, draws, alphaReads: () => alphaReads };
}

test("fish and snake load only their required artwork and reuse prepared mode results", async () => {
  const snakeSources = ["/images/adventure-snakes-v1.png", "/images/snake-breeds-flat-v3.png"].map(gameImageURL);
  const fishSources = [...naturalArt.naturalOceanAtlases.map(atlas => atlas.src), "/images/natural-seabed-plants-v2.png"].map(gameImageURL);
  for (const mode of ["fish", "snake"] as const) {
    const host = adventureImageHost(), first = host.adventure.loadAdventureImages(mode);
    assert.strictEqual(host.adventure.loadAdventureImages(mode), first, "concurrent entries share prepared work");
    const images = await first, requests = host.requested.slice(), cropCount = host.draws.length;
    const omitted = mode === "fish" ? snakeSources : fishSources;
    const required = mode === "fish" ? fishSources : snakeSources;
    assert.ok(omitted.every(src => !requests.includes(src)), `${mode} skips the other mode's sheets`);
    assert.ok(required.every(src => requests.includes(src)), `${mode} includes all artwork needed for later growth`);
    assert.ok(requests.includes(gameImageURL("/images/archipelago-ocean-v1.png")), "both modes retain the original backdrop");
    assert.strictEqual(host.adventure.loadAdventureImages(mode), first);
    assert.strictEqual(await host.adventure.loadAdventureImages(mode), images);
    assert.deepEqual(host.requested, requests, "re-entry starts no new downloads");
    assert.equal(host.draws.length, cropCount, "re-entry creates no new sprite crops");
    assert.equal(host.alphaReads(), 0, "plants use their verified bounds without runtime alpha scans");
    assert.equal(host.sourceChanges.length, 0, "prepared loaders cannot clear a shared atlas source");
    if (mode === "fish") assert.equal(images.scenery?.sprites.length, 4);
  }
});

test("the shared plant preparation is reused without readback or another crop pass", async () => {
  const host = adventureImageHost(), first = host.scenery.loadOceanSceneryImages();
  assert.strictEqual(host.scenery.loadOceanSceneryImages(), first);
  const plants = await first;
  assert.equal(plants.sprites.length, 4);
  assert.equal(host.draws.length, 4);
  assert.deepEqual(host.requested, [gameImageURL("/images/natural-seabed-plants-v2.png")]);
  assert.strictEqual(host.scenery.loadOceanSceneryImages(), first);
  assert.strictEqual(await host.scenery.loadOceanSceneryImages(), plants);
  assert.equal(host.draws.length, 4);
  assert.equal(host.alphaReads(), 0);
  assert.equal(host.sourceChanges.length, 0);
});
