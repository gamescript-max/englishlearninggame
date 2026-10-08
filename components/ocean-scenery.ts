import { getVisibleOceanScenery, type OceanSceneryScene, type ProjectedOceanPatch } from "@/lib/ocean-scenery-layout";
import type { OceanPlantSprite, OceanSceneryImages } from "./ocean-scenery-sprites";

export interface OceanSceneryOptions {
  width: number; height: number;
  cameraX: number; cameraY?: number; zoom?: number;
  elapsed: number; reducedMotion?: boolean;
  surfaceY?: number; islands?: boolean;
  scene?: OceanSceneryScene;
  images?: OceanSceneryImages;
}

const tau = Math.PI * 2;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const wrap = (value: number, span: number) => ((value % span) + span) % span;

function paintPlant(ctx: CanvasRenderingContext2D, sprite: OceanPlantSprite, patch: ProjectedOceanPatch, time: number, reduced: boolean) {
  const height = Math.min(patch.height, patch.width * sprite.h / sprite.w), width = height * sprite.w / sprite.h;
  ctx.save(); ctx.translate(patch.x, patch.y);
  // Sand contact shadow and the entire rock/holdfast share the actor camera.
  ctx.fillStyle = "#123e5538"; ctx.beginPath();
  ctx.ellipse(0, -2, width * .34, Math.max(3, width * .065), 0, 0, tau); ctx.fill();
  if (patch.flipX) ctx.scale(-1, 1);
  if (reduced) ctx.drawImage(sprite.image, 0, 0, sprite.w, sprite.h, -width / 2, -height, width, height);
  else {
    // Continuous shear joins neighbouring strips. Only upper fronds move;
    // the lower 18% (roots, pebbles and coral base) stays completely rigid.
    const leafEnd = .82, count = width < 65 ? 6 : 10;
    const phase = patch.worldX * .017 + patch.worldY * .011;
    const bend = (v: number) => {
      const reach = Math.max(0, 1 - v / leafEnd);
      return width * .024 * reach * reach * (Math.sin(time * .9 + phase + v * 2.2) + Math.sin(time * .53 + phase * 1.6) * .35);
    };
    for (let strip = 0; strip < count; strip++) {
      const a = strip / count * leafEnd, b = (strip + 1) / count * leafEnd;
      const stripHeight = (b - a) * height, shift = bend(a), shear = (bend(b) - shift) / stripHeight;
      ctx.save(); ctx.transform(1, 0, shear, 1, shift, -height + a * height);
      ctx.drawImage(sprite.image, 0, a * sprite.h, sprite.w, (b - a) * sprite.h, -width / 2, 0, width, stripHeight);
      ctx.restore();
    }
    ctx.drawImage(sprite.image, 0, leafEnd * sprite.h, sprite.w, (1 - leafEnd) * sprite.h, -width / 2, -(1 - leafEnd) * height, width, (1 - leafEnd) * height);
  }
  ctx.restore();
}

/** Scenery roots are immutable world positions projected exactly like fish.
 * Viewport dimensions only clip/cull; animation changes leaves, never terrain. */
export function paintOceanScenery(ctx: CanvasRenderingContext2D, options: OceanSceneryOptions): void {
  const { width, height } = options;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  const surface = clamp(options.surfaceY ?? 0, 0, height), waterHeight = height - surface;
  if (waterHeight <= 0) return;
  const zoom = options.zoom ?? 1;
  if (!Number.isFinite(zoom) || zoom <= 0 || !Number.isFinite(options.cameraX) || !Number.isFinite(options.cameraY ?? 0)) return;
  const cameraX = options.cameraX * zoom;
  const time = options.reducedMotion || !Number.isFinite(options.elapsed) ? 0 : options.elapsed;
  ctx.save();
  const inheritedAlpha = Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
  const wash = ctx.createLinearGradient(0, surface, 0, height);
  wash.addColorStop(0, "#b6f8df0c"); wash.addColorStop(.5, "#168daf00"); wash.addColorStop(1, "#0d43551b");
  ctx.fillStyle = wash; ctx.fillRect(0, surface, width, waterHeight);
  // Ambient light can drift; solid scenery below uses full world projection.
  ctx.lineWidth = 1; ctx.strokeStyle = "#ddfff512";
  for (let row = 0; row < 4; row++) {
    ctx.beginPath();
    for (let point = 0; point <= 18; point++) {
      const x = point * width / 18, y = surface + waterHeight * (.17 + row * .19) + Math.sin((x + cameraX * .3) * .012 + time * .42 + row * 1.8) * 7;
      if (!point) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const rays = ctx.createLinearGradient(0, surface, 0, height * .72);
  rays.addColorStop(0, "#d6ffe710"); rays.addColorStop(1, "#d6ffe700"); ctx.fillStyle = rays;
  for (let ray = 0; ray < 3; ray++) {
    const x = wrap(ray * width * .39 + 72 - cameraX * .045, width + 200) - 100;
    ctx.beginPath(); ctx.moveTo(x, surface); ctx.lineTo(x + 33, surface);
    ctx.lineTo(x + waterHeight * .18 + 70, surface + waterHeight * .78); ctx.lineTo(x + waterHeight * .18, surface + waterHeight * .78); ctx.closePath(); ctx.fill();
  }
  if (options.images?.sprites.length) {
    ctx.beginPath(); ctx.rect(0, surface, width, waterHeight); ctx.clip();
    const patches = getVisibleOceanScenery({ ...options, scene: options.scene ?? (options.surfaceY === undefined ? "adventure" : "shark") });
    for (const patch of patches) {
      ctx.globalAlpha = inheritedAlpha * patch.opacity;
      paintPlant(ctx, options.images.sprites[patch.variant % options.images.sprites.length], patch, time, Boolean(options.reducedMotion));
    }
  }
  ctx.restore();
}
