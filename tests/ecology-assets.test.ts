import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { inflateSync } from "node:zlib";
import art from "../lib/ecology-art.json";
import source from "../lib/ecology-art-source.json";
import flatSnake from "../lib/snake-flat-art.json";
import naturalArt from "../lib/natural-ocean-art.json";
import { naturalOceanArt } from "../lib/natural-ocean-art";
import manifest from "../lib/audio-manifest.json";
import { adventureVocabulary, oceanSpecies, snakeBreeds } from "../lib/adventure-catalog";
import { adventureGuidance, adventureTasks } from "../lib/adventure-content";

type Rect = { x: number; y: number; w: number; h: number; flipX: boolean };
type PNG = { width: number; height: number; rgba: Buffer };
const atlasFiles = ["ocean-species-a.png", "ocean-species-b.png", "snake-breeds-v2.png", "adventure-cards-v2.png"];
const imageBytes = atlasFiles.map(name => readFileSync(new URL(`../public/images/${name}`, import.meta.url)));

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}

// Decode the PNG bytes rather than trusting dimensions or alpha recorded in JSON.
function decodePNG(bytes: Buffer): PNG {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  assert.deepEqual([...bytes.subarray(24, 29)], [8, 6, 0, 0, 0], "atlases must be noninterlaced 8-bit RGBA PNGs");
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString("ascii", offset + 4, offset + 8);
    assert.ok(offset + length + 12 <= bytes.length, "complete PNG chunk");
    if (type === "IDAT") chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === "IEND") break;
  }
  const stride = width * 4, raw = inflateSync(Buffer.concat(chunks)), rgba = Buffer.alloc(stride * height);
  assert.equal(raw.length, (stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4, "valid PNG row filter");
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const left = x >= 4 ? rgba[at - 4] : 0, up = y ? rgba[at - stride] : 0;
      const diagonal = y && x >= 4 ? rgba[at - stride - 4] : 0;
      const prediction = [0, left, up, Math.floor((left + up) / 2), paeth(left, up, diagonal)][filter];
      rgba[at] = (raw[y * (stride + 1) + x + 1] + prediction) & 255;
    }
  }
  return { width, height, rgba };
}

const pngs = imageBytes.map(decodePNG);
test("natural fish preserve five original plus one new transparent PNG and all 103 individual silhouettes",()=>{
  assert.deepEqual([naturalArt.atlases.length,naturalArt.ocean.length,naturalArt.colors.length],[6,99,4]);
  const actual=naturalArt.atlases.map(atlas=>{
    const bytes=readFileSync(new URL(`../public${atlas.src}`,import.meta.url)),png=decodePNG(bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),atlas.sha256);
    assert.deepEqual([png.width,png.height],[atlas.width,atlas.height]);
    let transparent=0;for(let i=3;i<png.rgba.length;i+=4)if(png.rgba[i]===0)transparent++;
    assert.ok(transparent>png.width*png.height*.2,"cutouts have a genuine transparent background");
    return png;
  });
  const crops=[...naturalArt.ocean,...naturalArt.colors];
  assert.equal(new Set(crops.map(rect=>`${rect.atlas}:${rectangle(rect).join(',')}`)).size,103);
  for(const [i,rect]of crops.entries())validateCrop(rect,actual[rect.atlas],`natural creature ${i}`);
  const sword=naturalArt.ocean[oceanSpecies.find(s=>s.id==='swordfish')!.artIndex];
  assert.ok(sword.w/sword.h>2,"the swordfish silhouette remains long rather than the old rounded mesh");
});
test("late evolution masks remove neighbouring fins without cutting the animal's connected silhouette",()=>{
  const atlas=naturalArt.atlases[3],png=decodePNG(readFileSync(new URL(`../public${atlas.src}`,import.meta.url)));
  for(const index of [85,86,87,88]) {
    const rect=naturalOceanArt(index),visited=new Uint8Array(rect.w*rect.h),components:number[][]=[];
    const visible=(i:number)=>png.rgba[((rect.y+Math.floor(i/rect.w))*png.width+rect.x+i%rect.w)*4+3]>12;
    for(let i=0;i<visited.length;i++) {
      if(visited[i]||!visible(i))continue;
      const pixels=[i];visited[i]=1;
      for(let cursor=0;cursor<pixels.length;cursor++) {
        const at=pixels[cursor],x=at%rect.w,y=Math.floor(at/rect.w);
        for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx=x+dx,ny=y+dy,next=ny*rect.w+nx;
          if(nx<0||nx>=rect.w||ny<0||ny>=rect.h||visited[next]||!visible(next))continue;
          visited[next]=1;pixels.push(next);
        }
      }
      components.push(pixels);
    }
    components.sort((a,b)=>b.length-a.length);
    const hidden=(i:number)=>rect.exclusions.some(r=>i%rect.w>=r.x&&i%rect.w<r.x+r.w&&Math.floor(i/rect.w)>=r.y&&Math.floor(i/rect.w)<r.y+r.h);
    assert.ok(components[0].length>2000);
    assert.ok(components[0].every(i=>!hidden(i)),`${index}: every pixel of the animal survives`);
    assert.ok(components.slice(1).flat().some(hidden),`${index}: actual neighbouring silhouette pixels are removed`);
    for(const component of components.slice(1).filter(c=>c.length>70)) assert.ok(component.every(hidden),`${index}: no large neighbouring tail or fin survives`);
  }
});
test("the replacement snake heads are flat horizontal subjects with valid transparent image crops",()=>{
  const bytes=readFileSync(new URL("../public/images/snake-breeds-flat-v3.png",import.meta.url)),png=decodePNG(bytes);
  assert.equal(createHash("sha256").update(bytes).digest("hex"),flatSnake.sha256);assert.deepEqual([png.width,png.height],[1536,1024]);
  assert.equal(png.rgba[3],0);assert.equal(flatSnake.snake.length,16);
  for(const [i,rect] of flatSnake.snake.entries()){validateCrop({...rect,flipX:false},png,`flat snake ${i}`);if(i<8)assert.ok(rect.w/rect.h>1.6,"head points straight along its body instead of rising vertically");}
});
function rectangle(rect: Rect): number[] { return [rect.x, rect.y, rect.w, rect.h]; }
function validateCrop(rect: Rect, png: PNG, label: string): number {
  assert.ok(rectangle(rect).every(Number.isInteger), `${label}: integer source rectangle`);
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0, `${label}: positive crop`);
  assert.ok(rect.x + rect.w <= png.width && rect.y + rect.h <= png.height, `${label}: crop inside PNG`);
  let visible = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++)
    for (let x = rect.x; x < rect.x + rect.w; x++)
      if (png.rgba[(y * png.width + x) * 4 + 3] >= 16) visible++;
  assert.ok(visible > 0, `${label}: crop must contain actual visible alpha pixels`);
  return visible;
}

test("the four original PNGs preserve source hashes, dimensions and transparent background samples", () => {
  assert.equal(source.assets.length, 4);
  assert.deepEqual([art.width, art.height], [1536, 1024]);
  for (const [i, provenance] of source.assets.entries()) {
    assert.deepEqual([pngs[i].width, pngs[i].height], [1536, 1024], atlasFiles[i]);
    assert.equal(createHash("sha256").update(imageBytes[i]).digest("hex"), provenance.sha256, `${atlasFiles[i]}: original bytes preserved`);
    for (const { x, y, alpha } of provenance.interiorBackgroundSamples) {
      assert.equal(alpha, 0);
      assert.equal(pngs[i].rgba[(y * pngs[i].width + x) * 4 + 3], 0, `${atlasFiles[i]}: transparent background at ${x},${y}`);
    }
  }
});

test("95 ocean, 16 snake and 16 card crops point to distinct visible sprites and measured source bounds", () => {
  assert.deepEqual([art.ocean.length, art.snake.length, art.cards.length], [95, 16, 16]);
  assert.equal(new Set(oceanSpecies.map(species => species.artIndex)).size, 99);
  const groups = [
    { rects: art.ocean, records: source.assets.slice(0, 2).flatMap(asset => asset.sprites.filter(sprite => sprite.subject !== null)), pngFor: (i: number) => pngs[i < 48 ? 0 : 1], name: "ocean" },
    { rects: art.snake, records: source.assets[2].sprites, pngFor: () => pngs[2], name: "snake" },
    { rects: art.cards, records: source.assets[3].sprites, pngFor: () => pngs[3], name: "card" },
  ];
  for (const { rects, records, pngFor, name } of groups) {
    assert.equal(records.length, rects.length);
    assert.equal(new Set(rects.map((rect, i) => `${name === "ocean" && i >= 48 ? "B" : "A"}:${rectangle(rect).join(",")}`)).size, rects.length, `${name}: no reused crops`);
    for (const [i, rect] of rects.entries()) {
      const measured = records[i];
      assert.ok(measured.subject && measured.alphaBounds && measured.visibleSpriteBounds);
      assert.ok(measured.visiblePixels > 0);
      assert.deepEqual(rectangle(rect), measured.recommendedCrop, `${name} ${i}: measured crop is preserved`);
      const actualPixels = validateCrop(rect, pngFor(i), `${name} ${i}`);
      assert.ok(actualPixels >= measured.visiblePixels, `${name} ${i}: crop retains measured visible pixels`);
      const [x, y, w, h] = measured.visibleSpriteBounds;
      assert.ok(rect.x <= x && rect.y <= y && rect.x + rect.w >= x + w && rect.y + rect.h >= y + h);
    }
  }
  assert.deepEqual(art.ocean.flatMap((rect, i) => rect.flipX ? [i] : []), [55, 64]);
  assert.ok([...art.snake, ...art.cards].every(rect => rect.flipX === false));
  assert.equal(source.assets[1].sprites[47].subject, null);
  assert.equal(source.assets[1].sprites[47].visiblePixels, 0);
});

function wavDuration(bytes: Buffer, label: string): number {
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF", label);
  assert.equal(bytes.toString("ascii", 8, 12), "WAVE", label);
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, `${label}: complete RIFF`);
  let byteRate = 0, blockAlign = 0, dataBytes = 0;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString("ascii", offset, offset + 4), length = bytes.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + length <= bytes.length, `${label}: complete WAV chunk`);
    if (id === "fmt ") {
      assert.ok(length >= 16);
      assert.equal(bytes.readUInt16LE(offset + 8), 1, `${label}: PCM encoding`);
      byteRate = bytes.readUInt32LE(offset + 16);
      blockAlign = bytes.readUInt16LE(offset + 20);
      assert.ok(bytes.readUInt16LE(offset + 10) > 0 && bytes.readUInt32LE(offset + 12) > 0 && blockAlign > 0 && byteRate > 0);
    }
    if (id === "data") dataBytes += length;
    offset += 8 + length + (length % 2);
  }
  assert.ok(dataBytes > 0 && byteRate > 0 && dataBytes % blockAlign === 0, `${label}: nonempty whole PCM frames`);
  return dataBytes / byteRate * 1000;
}

test("all catalog names, 98 task prompts and five guidance texts have fixed valid WAV resources", () => {
  assert.deepEqual([oceanSpecies.length, adventureVocabulary.length, snakeBreeds.length, adventureTasks.length, Object.values(adventureGuidance).length], [99, 80, 8, 98, 5]);
  const en = [...oceanSpecies.map(value => value.en), ...adventureVocabulary.map(value => value.en), ...snakeBreeds.map(value => value.en), ...adventureTasks.map(value => value.promptEn)];
  const zh = Object.values(adventureGuidance);
  const speech = manifest.speech as Record<"en" | "zh", Record<string, string>>;
  const durations = manifest.durationsMs as Record<string, number>;
  const checked = new Set<string>();
  for (const [language, texts] of [["en", en], ["zh", zh]] as const) {
    for (const text of texts) {
      const url = speech[language][text];
      assert.ok(url, `${language}: fixed audio exists for "${text}"`);
      assert.match(url, /^\/audio\/[a-z0-9-]+\.wav$/);
      assert.ok(Number.isFinite(durations[url]) && durations[url] > 0, `${text}: positive manifest duration`);
      if (checked.has(url)) continue;
      const bytes = readFileSync(new URL(`../public${url}`, import.meta.url));
      const duration = wavDuration(bytes, url);
      assert.ok(duration > 0);
      assert.ok(Math.abs(duration - durations[url]) < 0.1, `${url}: WAV data duration agrees with manifest`);
      checked.add(url);
    }
  }
});
