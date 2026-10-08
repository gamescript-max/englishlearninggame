export interface OceanSceneryOptions {
  width: number;
  height: number;
  cameraX: number;
  cameraY?: number;
  zoom?: number;
  elapsed: number;
  reducedMotion?: boolean;
  surfaceY?: number;
  islands?: boolean;
}

const tau = Math.PI * 2;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const wrap = (value: number, span: number) => ((value % span) + span) % span;

function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, tau); ctx.fillStyle = color; ctx.fill();
}

function rock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, variant: number) {
  ctx.fillStyle = variant % 2 ? "#537e81" : "#668e88";
  ctx.beginPath(); ctx.moveTo(x - size * .65, y + size * .15);
  ctx.lineTo(x - size * .72, y - size * .19); ctx.lineTo(x - size * .31, y - size * .62);
  ctx.lineTo(x + size * .21, y - size * .75); ctx.lineTo(x + size * .66, y - size * .28);
  ctx.lineTo(x + size * .74, y + size * .13); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#c2d9b746"; ctx.beginPath(); ctx.moveTo(x - size * .72, y - size * .19);
  ctx.lineTo(x - size * .31, y - size * .62); ctx.lineTo(x + size * .21, y - size * .75);
  ctx.lineTo(x + size * .16, y - size * .39); ctx.lineTo(x - size * .24, y - size * .25); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#244e672c"; ctx.beginPath(); ctx.moveTo(x + size * .21, y - size * .75);
  ctx.lineTo(x + size * .66, y - size * .28); ctx.lineTo(x + size * .74, y + size * .13);
  ctx.lineTo(x + size * .18, y); ctx.lineTo(x + size * .16, y - size * .39); ctx.closePath(); ctx.fill();
}

function kelp(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, lean: number, phase: number, time: number, color: string) {
  const sway = Math.sin(time * .65 + phase) * height * .055, tipX = x + lean + sway;
  // Broad curved ribbons keep the plants legible without many tiny leaf paths.
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x - 3, y);
  ctx.bezierCurveTo(x - height * .12, y - height * .36, tipX + height * .14, y - height * .63, tipX, y - height);
  ctx.bezierCurveTo(tipX - height * .13, y - height * .65, x + height * .02, y - height * .31, x + 3, y);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#b3e0a332"; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(x, y - 3);
  ctx.bezierCurveTo(x - height * .045, y - height * .34, tipX + height * .04, y - height * .66, tipX, y - height + 3); ctx.stroke();
  for (let leaf = 0; leaf < 3; leaf++) {
    const side = leaf % 2 ? -1 : 1, ly = y - height * (.23 + leaf * .19), lx = x + (lean + sway) * (.25 + leaf * .16);
    ctx.beginPath(); ctx.moveTo(lx, ly + 4);
    ctx.quadraticCurveTo(lx + side * height * .2, ly - height * .02, lx + side * height * .17, ly - height * .16);
    ctx.quadraticCurveTo(lx + side * height * .04, ly - height * .11, lx, ly + 4); ctx.fill();
  }
}

function coral(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, variant: number) {
  const color = variant % 2 ? "#d19c9a" : "#cfac78";
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, size * .075); ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - size * .06, y - size * .3, x + size * .02, y - size * .74);
  for (let branch = 0; branch < 4; branch++) {
    const side = branch % 2 ? 1 : -1, by = y - size * (.19 + branch * .13), reach = size * (.33 - branch * .035);
    ctx.moveTo(x, by + size * .13); ctx.quadraticCurveTo(x + side * reach, by + size * .02, x + side * reach, by - size * .2);
    ctx.moveTo(x + side * reach * .73, by + size * .015); ctx.lineTo(x + side * reach * 1.22, by - size * .09);
  }
  ctx.stroke();
  for (let bulb = 0; bulb < 5; bulb++) {
    const bx = x + size * (.5 + bulb * .1), by = y - size * (.08 + Math.sin(bulb * 1.7) * .045);
    oval(ctx, bx, by, size * .095, size * (.12 + bulb % 2 * .03), variant % 2 ? "#bc8cac" : "#c8b27c");
    oval(ctx, bx - size * .015, by - size * .035, size * .045, size * .025, "#f3dfbe49");
  }
}

function island(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, variant: number) {
  oval(ctx, x, y + 6, size * 1.35, size * .25, "#b7f7dd25");
  oval(ctx, x, y + 4, size * 1.05, size * .17, "#e2efbd86");
  oval(ctx, x, y, size * .88, size * .17, "#e1d5a4c4");
  oval(ctx, x - size * .17, y - size * .1, size * .6, size * .21, "#568f7bab");
  oval(ctx, x + size * .24, y - size * .11, size * .37, size * .17, "#74a984a6");
  rock(ctx, x + size * .58, y - 1, size * .24, variant);
  ctx.strokeStyle = "#dfffe072"; ctx.lineWidth = 1; ctx.beginPath();
  ctx.ellipse(x, y + 7, size * 1.17, size * .21, 0, .12, Math.PI - .12); ctx.stroke();
}

/** A bounded scenery pass in CSS pixels, beneath creatures and HUDs.
 * Camera offsets scroll the anchored reef pattern; time only moves water and kelp.
 * It needs no image assets, actor state, randomness, or retained frame state. */
export function paintOceanScenery(ctx: CanvasRenderingContext2D, options: OceanSceneryOptions): void {
  const { width, height } = options;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  const surface = clamp(options.surfaceY ?? 0, 0, height), waterHeight = height - surface;
  if (waterHeight <= 0) return;
  const zoom = Number.isFinite(options.zoom) ? clamp(options.zoom!, .42, 1.5) : 1;
  const cameraX = Number.isFinite(options.cameraX) ? options.cameraX * zoom : 0;
  const cameraY = Number.isFinite(options.cameraY) ? options.cameraY! * zoom : 0;
  const time = options.reducedMotion || !Number.isFinite(options.elapsed) ? 0 : options.elapsed;
  ctx.save();
  const inheritedAlpha = Number.isFinite(ctx.globalAlpha) ? ctx.globalAlpha : 1;
  const wash = ctx.createLinearGradient(0, surface, 0, height);
  wash.addColorStop(0, "#b6f8df0c"); wash.addColorStop(.5, "#168daf00"); wash.addColorStop(1, "#0d435529");
  ctx.fillStyle = wash; ctx.fillRect(0, surface, width, waterHeight);
  // Gentle caustics stay translucent, leaving fish silhouettes and words clear.
  ctx.lineWidth = 1; ctx.strokeStyle = "#ddfff516";
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
  // Two layers share a fixed world rhythm. Draw cost is capped even on wide screens.
  const count = Math.min(5, Math.max(3, Math.ceil(width / 320))), span = width + 280, spacing = span / count;
  const floorDrift = Math.sin(cameraY * .0012) * Math.min(12, waterHeight * .035);
  for (let layer = 0; layer < 2; layer++) {
    const factor = layer ? .18 : .08;
    ctx.globalAlpha = inheritedAlpha * (layer ? .74 : .42);
    for (let pocket = 0; pocket < count; pocket++) {
      const x = wrap(pocket * spacing + (layer ? 128 : 17) - cameraX * factor, span) - 140;
      const edge = clamp((Math.abs(x / width - .5) * 2 - .35) / .4, 0, 1);
      const size = clamp(width / 500, .95, 1.12) * (layer ? .7 + edge * .3 : .67);
      // Remote edge ledges sit above bottom controls; the closer layer has taller
      // kelp rising from lower pockets. The centre keeps a much lower sea floor.
      const lift = layer ? .1 + edge * .17 : .06 + edge * (surface ? .55 : .22);
      const y = height - waterHeight * lift + floorDrift * (layer ? 1 : .5);
      const reach = Math.min(layer ? 238 : 94, height * .34, waterHeight * .72) * size;
      oval(ctx, x + 14, y + 6, 110 * size, 20 * size, "#0c496338");
      oval(ctx, x, y, 96 * size, 17 * size, layer ? "#c9d4a240" : "#acd8b32f");
      for (let stalk = 0; stalk < 4; stalk++) {
        const baseX = x + (stalk - 1.5) * 20 * size, plantHeight = Math.min(reach * (.62 + stalk % 3 * .16), Math.max(1,y - surface - 18));
        kelp(ctx, baseX, y - 4, plantHeight, (stalk - 1.5) * 12 * size, pocket * 1.31 + stalk, time, stalk % 2 ? "#438f79" : "#347f78");
      }
      rock(ctx, x - 43 * size, y - 4, 36 * size, pocket);
      rock(ctx, x + 23 * size, y - 1, 45 * size, pocket + 1);
      rock(ctx, x + 53 * size, y + 3, 25 * size, pocket);
      coral(ctx, x - 12 * size, y - 6, 66 * size, pocket);
    }
  }
  ctx.globalAlpha = inheritedAlpha;
  if (options.islands) {
    // Small shoals read as remote islands, without adding a sky to the map.
    const islandSpan = width + 220;
    for (let index = 0; index < 2; index++) {
      const x = wrap(width * (.32 + index * .57) + 110 - cameraX * .055, islandSpan) - 110;
      island(ctx, x, surface + 11 + index * 5, Math.min(62, width * .13) * (index ? .8 : 1), index);
    }
  }
  ctx.restore();
}
