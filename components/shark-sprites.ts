import { naturalOceanArt } from "@/lib/natural-ocean-art";
import { createSwimState, fishFinRows, fishStrip, sampleSwim, swimProfileFor } from "@/lib/adventure-motion";
import { mouthGeometry } from "@/lib/adventure-feeding";

export const SHARK_ART_INDEX = 70;
// Preserve each species' natural colour: orange goldfish, red betta, blue/red
// tetras and yellow croaker share the water with a few silver coastal fish.
export const SHARK_PREY_ART = [9, 11, 12, 15, 16, 26, 27, 48] as const;
export interface SharkSprite { image: CanvasImageSource; w: number; h: number; species: string }
export interface SharkImages { readonly sprites: ReadonlyMap<number, SharkSprite> }
type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

/** Only compact transparent animal crops survive loading; atlases never enter the frame loop. */
let imageLoading: Promise<SharkImages> | undefined;
export function loadSharkImages(): Promise<SharkImages> {
  imageLoading ??= prepareSharkImages().catch(error => { imageLoading = undefined; throw error; });
  return imageLoading;
}
async function prepareSharkImages(): Promise<SharkImages> {
  const indices = [SHARK_ART_INDEX, ...SHARK_PREY_ART], sources = [...new Set(indices.map(index => naturalOceanArt(index).src))];
  const loaded = await Promise.all(sources.map(src => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("海洋小伙伴的图片还没加载好。")); image.src = src;
  })));
  const atlases = new Map(sources.map((src, index) => [src, loaded[index]])), sprites = new Map<number, SharkSprite>();
  for (const index of indices) {
    const rect = naturalOceanArt(index), canvas = document.createElement("canvas");
    canvas.width = rect.w; canvas.height = rect.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("海洋小伙伴的图片还没加载好。");
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, rect.w, rect.h);
    for (const cut of rect.exclusions) ctx.rect(cut.x, cut.y, cut.w, cut.h);
    for (const points of rect.exclusionPaths) { points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); }
    ctx.clip("evenodd");
    if (rect.flipX) { ctx.translate(rect.w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(atlases.get(rect.src)!, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h); ctx.restore();
    sprites.set(index, { image: canvas, w: rect.w, h: rect.h, species: rect.id ?? "sardine" });
  }
  // Release decoded atlas images after copying their small crops.
  for (const image of loaded) { image.onload = null; image.onerror = null; image.src = ""; }
  return { sprites };
}

function path(ctx: CanvasRenderingContext2D, points: Point[]) {
  points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)); ctx.closePath();
}

/** Two affine triangles retain matching cell endpoints while the original fin pixels flex. */
function texturedQuad(ctx: CanvasRenderingContext2D, sprite: SharkSprite, source: Rect, points: Point[]) {
  const padding = .45, sx = Math.max(0, source.x - padding), sy = Math.max(0, source.y - padding);
  const sw = Math.min(sprite.w, source.x + source.w + padding) - sx, sh = Math.min(sprite.h, source.y + source.h + padding) - sy;
  for (const indices of [[0, 1, 2], [0, 2, 3]]) {
    const [a, b, c] = indices.map(index => points[index]), center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    ctx.save(); ctx.beginPath();
    path(ctx, [a, b, c].map(point => { const dx = point.x - center.x, dy = point.y - center.y, length = Math.hypot(dx, dy) || 1; return { x: point.x + dx / length * .25, y: point.y + dy / length * .25 }; })); ctx.clip();
    const first = indices[1] === 1;
    ctx.transform(first ? b.x - a.x : b.x - c.x, first ? b.y - a.y : b.y - c.y, first ? c.x - b.x : c.x - a.x, first ? c.y - b.y : c.y - a.y, a.x, a.y);
    ctx.drawImage(sprite.image, sx, sy, sw, sh, (sx - source.x) / source.w, (sy - source.y) / source.h, sw / source.w, sh / source.h); ctx.restore();
  }
}

/** Visual motion is sampled from simulation time; repainting or pausing never advances it. */
export function drawNaturalSwimmer(ctx: CanvasRenderingContext2D, sprite: SharkSprite, x: number, y: number, width: number, angle: number, time: number, phase: number, reducedMotion: boolean, open = 0, player = false) {
  const height = width * sprite.h / sprite.w, profile = swimProfileFor(sprite.species), state = createSwimState(sprite.species, angle);
  state.phase = phase + time * Math.PI * 2 * (player ? 1.1 : 1.35); state.speed = player ? 190 : 65;
  const motion = sampleSwim(state, profile, width, reducedMotion), count = reducedMotion ? 1 : player ? 12 : width < 70 ? 6 : 9;
  ctx.save(); ctx.translate(x, y + motion.bob); ctx.rotate(angle); if (Math.cos(angle) < 0) ctx.scale(1, -1);
  const tailEnd = 1 - profile.headLock;
  if (count === 1 && open <= 0) ctx.drawImage(sprite.image, 0, 0, sprite.w, sprite.h, -width / 2, -height / 2, width, height);
  else {
    if (reducedMotion) {
      ctx.drawImage(sprite.image, 0, 0, sprite.w * tailEnd, sprite.h, -width / 2, -height / 2, width * tailEnd, height);
    } else for (let strip = 0; strip < count; strip++) {
      const band = fishStrip(strip, count, width, profile, motion, tailEnd), left = fishFinRows(band.u0, height, profile, motion), right = fishFinRows(band.u1, height, profile, motion), nextY = band.y0 + band.width * band.shearY;
      for (let row = 0; row < left.length; row++) {
        const a = left[row], b = right[row];
        texturedQuad(ctx, sprite, { x: sprite.w * band.u0, y: sprite.h * a.v0, w: sprite.w * (band.u1 - band.u0), h: sprite.h * (a.v1 - a.v0) }, [{ x: band.x0, y: band.y0 + a.y }, { x: band.x0 + band.width, y: nextY + b.y }, { x: band.x0 + band.width, y: nextY + b.y + b.height }, { x: band.x0, y: band.y0 + a.y + a.height }]);
      }
    }
    const headLeft = (tailEnd - .5) * width, headWidth = width * profile.headLock;
    const head = () => ctx.drawImage(sprite.image, sprite.w * tailEnd, 0, sprite.w * profile.headLock, sprite.h, headLeft, -height / 2, headWidth, height);
    if (open > 0) {
      const jaw = mouthGeometry(sprite.species, width, height, open), turn = Math.atan2(jaw.openedLip.y - jaw.lip.y, jaw.lip.x - jaw.hinge.x);
      const dx = jaw.lip.x - jaw.hinge.x, dy = jaw.lip.y - jaw.hinge.y;
      const turnedLip = { x: jaw.hinge.x + dx * Math.cos(turn) - dy * Math.sin(turn), y: jaw.hinge.y + dx * Math.sin(turn) + dy * Math.cos(turn) };
      ctx.save(); ctx.beginPath(); path(ctx, [{ x: headLeft, y: -height / 2 }, { x: width / 2, y: -height / 2 }, { x: width / 2, y: height / 2 }, { x: headLeft, y: height / 2 }]); path(ctx, jaw.polygon); ctx.clip("evenodd"); head(); ctx.restore();
      ctx.beginPath(); path(ctx, [jaw.hinge, jaw.lip, turnedLip]); ctx.fillStyle = "#132329"; ctx.fill();
      ctx.save(); ctx.translate(jaw.hinge.x, jaw.hinge.y); ctx.rotate(turn); ctx.translate(-jaw.hinge.x, -jaw.hinge.y); ctx.beginPath(); path(ctx, jaw.polygon); ctx.clip(); head(); ctx.restore();
    } else head();
  }
  ctx.restore();
}
