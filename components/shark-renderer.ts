import { SHARK_SURFACE_Y, sharkCamera, sharkIsOcean, sharkSurfaceScreenY, sharkWorldToScreen, type SharkFood, type SharkWorld } from "@/lib/shark-engine";
import { getSharkToken, stageForShark } from "@/lib/shark-content";

import { drawNaturalSwimmer, SHARK_ART_INDEX, SHARK_PREY_ART, type SharkImages } from "./shark-sprites";
export { loadSharkImages, type SharkImages } from "./shark-sprites";

export interface SharkHudRect { x: number; y: number; w: number; h: number }
export interface SharkFoodLabelRect extends SharkHudRect { foodId: string }
export interface SharkPaintOptions { reducedMotion?: boolean; hudRects?: SharkHudRect[]; images?: SharkImages }
type Rect = SharkHudRect;
type Particle = { x: number; y: number; vx: number; vy: number; born: number; life: number; size: number; color: string };
type PaintMemory = { particles: Particle[]; pickups: Set<string>; stage: number; previousStage: number; changedAt: number };
type FoodView = { food: SharkFood; x: number; y: number; radius: number };
const memories = new WeakMap<SharkWorld, PaintMemory>();
const tau = Math.PI * 2;
const fontFamily = '"Trebuchet MS", "Arial Rounded MT Bold", Arial, sans-serif';
const foodColors = ["#aebcc8", "#a2b5bc", "#ced3d0", "#85999d", "#9ea69b", "#94a6b3"];
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(.01, rx), Math.max(.01, ry), 0, 0, tau); ctx.fillStyle = color; ctx.fill();
}
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, color: string) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fillStyle = color; ctx.fill();
}
function linear(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, stops: [number, string][]) {
  const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
  for (const [at, color] of stops) gradient.addColorStop(at, color);
  return gradient;
}
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(.001, radius));
  gradient.addColorStop(0, color); gradient.addColorStop(1, "#ffffff00");
  ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
function stroke(ctx: CanvasRenderingContext2D, color: string, width: number) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }

function paintOcean(ctx: CanvasRenderingContext2D, world: SharkWorld, width: number, height: number, stage: number, time: number) {
  const horizon = sharkSurfaceScreenY(height), offset = world.player.x * .024;
  ctx.fillStyle = linear(ctx, 0, 0, 0, horizon, [[0, "#86bcdc"], [.65, "#c4dfeb"], [1, "#eaf1ef"]]); ctx.fillRect(0, 0, width, horizon + 5);
  const sun = ctx.createRadialGradient(width * .77, horizon * .34, 1, width * .77, horizon * .34, Math.max(34, horizon * .55));
  sun.addColorStop(0, "#fff9df85"); sun.addColorStop(1, "#fff9df00"); ctx.fillStyle = sun; ctx.fillRect(0, 0, width, horizon);
  // Thin cloud banks and remote coast leave a clear sky above the playable sea plane.
  for (let cloud = 0; cloud < 4; cloud++) {
    const cx = ((cloud * 263 + 97 - offset * .4) % (width + 240) + width + 240) % (width + 240) - 120;
    ellipse(ctx, cx, horizon * (.22 + cloud % 2 * .17), 58 + cloud * 8, 5 + cloud % 2 * 3, "#ffffff35");
  }
  for (let coast = 0; coast < 3; coast++) {
    const cx = ((coast * width * .51 + 42 - offset) % (width + 180) + width + 180) % (width + 180) - 90;
    ctx.fillStyle = coast === 1 ? "#819ca266" : "#a0b4b566"; ctx.beginPath(); ctx.moveTo(cx - 100, horizon + 1);
    ctx.lineTo(cx - 78, horizon - 4); ctx.lineTo(cx - 42, horizon - 12 - stage * 2); ctx.lineTo(cx - 10, horizon - 9); ctx.lineTo(cx + 17, horizon - 23); ctx.lineTo(cx + 38, horizon - 15); ctx.lineTo(cx + 81, horizon - 6); ctx.lineTo(cx + 110, horizon + 2); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = linear(ctx, 0, horizon, 0, height, [[0, "#5ca9bb"], [.09, "#278ca9"], [.48, "#1a7396"], [1, stage === 1 || stage === 3 ? "#174f72" : "#1d6181"]]);
  ctx.beginPath(); ctx.moveTo(0, horizon);
  for (let point = 0; point <= 48; point++) { const x = point / 48 * width; ctx.lineTo(x, horizon + Math.sin(x * .022 + time * 1.15 + offset * .04) * 2.7); }
  ctx.lineTo(width, height); ctx.lineTo(0, height); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.rect(0, horizon + 5, width, height - horizon - 5); ctx.clip();
  for (let ray = 0; ray < 4; ray++) {
    const x = width * (.17 + ray * .22);
    ctx.fillStyle = linear(ctx, x, horizon, x + height * .2, height, [[0, "#d6edf01b"], [1, "#d6edf000"]]);
    ctx.beginPath(); ctx.moveTo(x, horizon); ctx.lineTo(x + width * .055, horizon); ctx.lineTo(x + height * .27, height); ctx.lineTo(x + height * .13, height); ctx.closePath(); ctx.fill();
  }
  for (let row = 0; row < 5; row++) {
    const depth = (row + 1) / 6, y = horizon + (height - horizon) * depth;
    ctx.strokeStyle = row < 2 ? "#cde9e724" : "#b2dbe915"; ctx.lineWidth = 1;
    for (let band = 0; band < 3; band++) {
      ctx.beginPath();
      for (let point = 0; point <= 8; point++) { const x = width * (band / 3 + point / 24), py = y + Math.sin(x * .024 + time * .45 + row) * (3 + depth * 4); if (!point) ctx.moveTo(x, py); else ctx.lineTo(x, py); }
      ctx.stroke();
    }
  }
  ctx.restore();
  // Small whitecaps stay on the surface instead of suggesting an ocean-floor reef.
  ctx.lineCap = "round";
  for (let crest = 0; crest < 15; crest++) {
    const x = ((crest * 137.7 - world.player.x * .13 + time * 9) % (width + 110) + width + 110) % (width + 110) - 55;
    const y = horizon + 3 + crest % 3 * 5 + Math.sin(time * .8 + crest) * 1.5, span = 9 + crest % 4 * 6;
    ctx.beginPath(); ctx.moveTo(x, y + 1.5); ctx.quadraticCurveTo(x + span * .55, y - 2, x + span, y); stroke(ctx, crest % 3 ? "#e7f3ed84" : "#f7fff3c9", crest % 3 ? 1.25 : 1.8);
  }
}

function backgroundStars(ctx: CanvasRenderingContext2D, world: SharkWorld, width: number, height: number, time: number, reducedMotion: boolean) {
  ctx.save(); const inheritedAlpha = ctx.globalAlpha;
  for (let index = 0; index < 62; index++) {
    const x = ((index * 191.91 + 47 - world.player.x * .022) % width + width) % width;
    const y = ((index * 79.31 + 31 - world.player.y * .022) % height + height) % height;
    const alpha = reducedMotion ? .48 : .34 + Math.sin(time * .35 + index * 1.71) * .14;
    ctx.globalAlpha = inheritedAlpha * alpha; ellipse(ctx, x, y, index % 9 === 0 ? 1.7 : .9, index % 9 === 0 ? 1.7 : .9, index % 4 === 0 ? "#a9ddff" : "#fff4ed");
    if (index % 17 === 0) {
      ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); stroke(ctx, "#cfe8ff", .8);
    }
  }
  ctx.restore();
}

function paintSpace(ctx: CanvasRenderingContext2D, world: SharkWorld, width: number, height: number, stage: number, time: number, reducedMotion: boolean) {
  ctx.fillStyle = linear(ctx, 0, 0, width * .8, height, stage === 6
    ? [[0, "#153c7d"], [.55, "#215398"], [1, "#429dc2"]]
    : stage < 9 ? [[0, "#111f4c"], [.48, "#29255b"], [1, "#4b356d"]]
      : [[0, "#181434"], [.48, "#322450"], [1, "#253962"]]);
  ctx.fillRect(0, 0, width, height);
  glow(ctx, width * .12, height * .36, width * .7, stage === 6 ? "#438dd832" : "#7864bf35");
  glow(ctx, width * .82, height * .8, Math.max(width, height) * .48, stage > 8 ? "#cf6cbd27" : "#446ed937");
  if (stage >= 9) {
    ctx.save(); ctx.translate(width * .72, height * .23); ctx.rotate(-.35); ctx.scale(1, .4);
    glow(ctx, 0, 0, Math.min(width * .55, 370), "#b798dd26");
    ctx.strokeStyle = "#c7b6f520"; ctx.lineWidth = 12;
    for (let arm = 0; arm < 2; arm++) {
      ctx.beginPath();
      for (let step = 0; step <= 34; step++) {
        const a = step * .17 + arm * Math.PI, r = 5 + step * 6;
        if (!step) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  backgroundStars(ctx, world, width, height, time, reducedMotion);
  if (stage === 6) {
    const radius = Math.max(width * .66, height * .55), x = width * .63, y = height + radius * .63;
    glow(ctx, x, y, radius * 1.11, "#6bdbf75a");
    ellipse(ctx, x, y, radius, radius, "#226eaa");
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, radius, 0, tau); ctx.clip();
    ctx.fillStyle = linear(ctx, x - radius, y - radius, x + radius, y, [[0, "#68cde0"], [.5, "#2f9dc6"], [1, "#225687"]]); ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    ellipse(ctx, x - radius * .3, y - radius * .65, radius * .25, radius * .18, "#69c5a394");
    ellipse(ctx, x + radius * .25, y - radius * .63, radius * .23, radius * .11, "#71caa494");
    ctx.strokeStyle = "#d3ffff55"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.ellipse(x, y, radius * .9, radius * .76, -.12, Math.PI * 1.12, Math.PI * 1.82); ctx.stroke(); ctx.restore();
  } else {
    const x = width * .09, y = height * .13, r = stage === 8 ? 38 : 26;
    glow(ctx, x, y, r * 2.2, stage === 8 ? "#f4b95930" : "#d594ed30");
    ellipse(ctx, x, y, r, r, stage === 8 ? "#dfbc7775" : "#c9a0e36b");
    ctx.save(); ctx.translate(width * .9, height * .77); ctx.rotate(-.35);
    ctx.beginPath(); ctx.ellipse(0, 0, 47, 12, 0, 0, tau); stroke(ctx, "#aacef63c", 5);
    ellipse(ctx, 0, 0, 27, 27, "#75afd550"); ctx.restore();
  }
}

function paintBackground(ctx: CanvasRenderingContext2D, world: SharkWorld, width: number, height: number, stage: number, reducedMotion: boolean) {
  const time = reducedMotion ? 0 : world.elapsed;
  if (stage < 6) paintOcean(ctx, world, width, height, stage, time);
  else paintSpace(ctx, world, width, height, stage, time, reducedMotion);
}

/** Natural anatomy fallback while the transparent animal crops load. */
function drawShark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number, time: number, bite: number, reducedMotion: boolean) {
  const beat = reducedMotion ? 0 : Math.sin(time * 7), open = bite > 0 ? (reducedMotion ? .14 : Math.sin(clamp(1 - bite / .2, 0, 1) * Math.PI) * .40) : 0;
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); if (Math.cos(angle) < 0) ctx.scale(1, -1); ctx.scale(size, size); ctx.lineJoin = "round";
  ctx.save(); ctx.translate(-.96, beat * .055); ctx.rotate(beat * .22);
  ctx.fillStyle = "#526571"; ctx.beginPath(); ctx.moveTo(.18, -.04); ctx.lineTo(-.42, -.54); ctx.lineTo(-.31, -.12); ctx.lineTo(-.25, .02); ctx.lineTo(-.42, .38); ctx.lineTo(.18, .06); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.fillStyle = "#586c77"; ctx.beginPath(); ctx.moveTo(-.28, -.21); ctx.lineTo(-.04, -.67); ctx.quadraticCurveTo(.08, -.41, .29, -.20); ctx.closePath(); ctx.fill();
  ctx.fillStyle = linear(ctx, 0, -.3, 0, .3, [[0, "#708791"], [.45, "#536c77"], [.73, "#9babb0"], [1, "#d5dad7"]]);
  ctx.beginPath(); ctx.moveTo(-1.05, beat * .045); ctx.bezierCurveTo(-.57, -.13, -.43, -.29, .29, -.23); ctx.quadraticCurveTo(.76, -.22, 1.19, -.04); ctx.quadraticCurveTo(.97, .14, .66, .18); ctx.quadraticCurveTo(.16, .30, -.42, .12); ctx.quadraticCurveTo(-.7, .03, -1.05, beat * .045); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#d7dedb"; ctx.beginPath(); ctx.moveTo(-.69, .06); ctx.quadraticCurveTo(.18, .15, 1.14, .02); ctx.quadraticCurveTo(.52, .3, -.22, .18); ctx.closePath(); ctx.fill();
  if (open > 0) { ctx.fillStyle = "#18282d"; ctx.beginPath(); ctx.moveTo(.63, .105); ctx.lineTo(1.14, .045); ctx.lineTo(1.12, .07 + open * .55); ctx.closePath(); ctx.fill(); }
  ctx.save(); ctx.translate(.62, .105); ctx.rotate(open); ctx.fillStyle = "#bcc9c9"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(.51, -.056); ctx.quadraticCurveTo(.40, .095, .10, .08); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.moveTo(.64, .10); ctx.lineTo(1.13, .046); stroke(ctx, "#34484d", .013);
  ctx.save(); ctx.translate(-.03, .14); ctx.rotate(beat * .07); ctx.fillStyle = "#607981"; ctx.beginPath(); ctx.moveTo(-.15, -.02); ctx.lineTo(-.36, .42); ctx.lineTo(.30, .03); ctx.closePath(); ctx.fill(); ctx.restore();
  for (let index = 0; index < 5; index++) { ctx.beginPath(); ctx.moveTo(.43 - index * .065, -.10); ctx.quadraticCurveTo(.36 - index * .065, 0, .40 - index * .065, .105); stroke(ctx, "#3a505ba0", .016); }
  ellipse(ctx, .88, -.077, .029, .031, "#18282b"); ellipse(ctx, .887, -.087, .006, .006, "#c4d7d3"); ellipse(ctx, 1.095, -.022, .008, .006, "#2f454c");
  ctx.restore();
}

/** Optional canvas portrait; size is the body's half-length, in CSS pixels. */
export function drawSharkPortrait(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, time = 0, images?: SharkImages): void {
  const sprite = images?.sprites.get(SHARK_ART_INDEX);
  if (sprite) drawNaturalSwimmer(ctx, sprite, x, y, Math.max(1, size) * 2.9, -.04, time, 0, false, 0, true);
  else drawShark(ctx, x, y, Math.max(1, size), -.04, time, 0, false);
}

function drawFish(ctx: CanvasRenderingContext2D, size: number, color: string, time: number, phase: number, reducedMotion: boolean) {
  const wave = reducedMotion ? 0 : Math.sin(time * 6 + phase) * .25;
  ctx.save(); ctx.scale(size, size);
  ctx.save(); ctx.translate(-.83, 0); ctx.rotate(wave);
  ctx.beginPath(); ctx.moveTo(.15, 0); ctx.quadraticCurveTo(-.19, -.29, -.59, -.43); ctx.quadraticCurveTo(-.42, 0, -.59, .43); ctx.quadraticCurveTo(-.18, .3, .15, 0); ctx.fillStyle = color; ctx.fill(); stroke(ctx, "#274f702c", .045); ctx.restore();
  ctx.fillStyle = linear(ctx, -.1, -.55, .2, .58, [[0, "#7b9198"], [.40, color], [.74, "#d8e0da"], [1, "#8da4a9"]]);
  ctx.beginPath(); ctx.moveTo(-.92, 0); ctx.bezierCurveTo(-.58, -.47, .37, -.63, .91, -.24); ctx.bezierCurveTo(1.16, -.07, 1.16, .15, .92, .32); ctx.bezierCurveTo(.37, .65, -.57, .47, -.92, 0); ctx.closePath(); ctx.fill(); stroke(ctx, "#24567d47", .035);
  ctx.beginPath(); ctx.moveTo(-.18, -.42); ctx.quadraticCurveTo(.05, -.82, .32, -.44); ctx.fillStyle = color; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-.07, .35); ctx.quadraticCurveTo(.19 + wave * .12, .76, .40, .27); ctx.fillStyle = color; ctx.fill();
  ellipse(ctx, .78, -.08, .035, .039, "#24353b"); ellipse(ctx, .79, -.09, .007, .008, "#c9dbda");
  ellipse(ctx, -.14, -.27, .42, .075, "#fff5da50");
  ctx.beginPath(); ctx.moveTo(.87, .12); ctx.quadraticCurveTo(.96, .16, 1.02, .105); stroke(ctx, "#315b7280", .035);
  ctx.restore();
}

function drawBoat(ctx: CanvasRenderingContext2D, size: number, ship: boolean, time: number) {
  ctx.save(); ctx.scale(size, size); ctx.rotate(Math.sin(time * 1.8) * .04);
  ellipse(ctx, 0, .44, 1.28, .13, "#b8ffff48");
  if (ship) {
    rounded(ctx, -.74, -.68, 1.41, .8, .16, "#eaf8ef");
    rounded(ctx, -.38, -.98, .69, .4, .08, "#91cbd9");
    rounded(ctx, .33, -.96, .17, .37, .045, "#e98b72");
    for (let deck = 0; deck < 2; deck++) for (let window = 0; window < 4; window++) rounded(ctx, -.60 + window * .29, -.52 + deck * .29, .17, .15, .035, "#398cad");
  } else {
    ctx.beginPath(); ctx.moveTo(.02, -.99); ctx.lineTo(.02, -.03); stroke(ctx, "#b48464", .065);
    ctx.beginPath(); ctx.moveTo(-.055, -.91); ctx.bezierCurveTo(-.21, -.7, -.43, -.36, -.74, -.11); ctx.quadraticCurveTo(-.3, -.20, -.055, -.11); ctx.closePath(); ctx.fillStyle = linear(ctx, -.7, -.7, 0, 0, [[0, "#fffdf0"], [1, "#f3dfac"]]); ctx.fill();
    ctx.beginPath(); ctx.moveTo(.095, -.82); ctx.quadraticCurveTo(.35, -.35, .78, -.13); ctx.lineTo(.095, -.12); ctx.closePath(); ctx.fillStyle = "#efad91"; ctx.fill();
    ctx.beginPath(); ctx.moveTo(.05, -.99); ctx.lineTo(.35, -.93); ctx.lineTo(.05, -.80); ctx.fillStyle = "#e78071"; ctx.fill();
  }
  ctx.fillStyle = linear(ctx, 0, -.04, 0, .49, [[0, ship ? "#81d2dc" : "#f7b779"], [.40, ship ? "#3c9bbe" : "#d98965"], [1, ship ? "#266e9c" : "#ad5e56"]]);
  ctx.beginPath(); ctx.moveTo(-1.12, -.035); ctx.lineTo(1.14, -.035); ctx.quadraticCurveTo(.90, .48, .55, .45); ctx.lineTo(-.64, .45); ctx.quadraticCurveTo(-.94, .36, -1.12, -.035); ctx.closePath(); ctx.fill(); stroke(ctx, "#335b793c", .035);
  ctx.beginPath(); ctx.moveTo(-1.0, .08); ctx.lineTo(.98, .08); stroke(ctx, "#ffe8b884", .055);
  if (ship) {
    ctx.beginPath(); ctx.arc(.68, .23, .13, 0, tau); stroke(ctx, "#fff9e9", .055);
  }
  ctx.restore();
}

function drawPalm(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, time: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  ctx.beginPath(); ctx.moveTo(0, .13); ctx.quadraticCurveTo(.12, -.40, -.03, -.78); stroke(ctx, "#c59161", .10);
  ctx.translate(-.03, -.78); ctx.rotate(Math.sin(time) * .03);
  ctx.fillStyle = "#348f72";
  for (let index = 0; index < 5; index++) {
    const angle = -2.9 + index * .62;
    ctx.save(); ctx.rotate(angle); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(.3, -.2, .66, .12); ctx.quadraticCurveTo(.35, .06, 0, 0); ctx.fill(); ctx.restore();
  }
  ellipse(ctx, .03, .03, .075, .07, "#8e7150"); ctx.restore();
}
function drawIsland(ctx: CanvasRenderingContext2D, size: number, time: number) {
  ctx.save(); ctx.scale(size, size);
  ellipse(ctx, 0, .30, 1.22, .42, "#8ce9de4f");
  ellipse(ctx, 0, .23, 1.05, .38, "#d4b781"); ellipse(ctx, -.02, .09, 1.03, .36, "#ffdf9f");
  ellipse(ctx, -.07, -.02, .75, .26, "#8dcca1"); ellipse(ctx, .22, -.12, .44, .23, "#6ab78f");
  drawPalm(ctx, -.28, -.04, .88, time); drawPalm(ctx, .47, -.025, .62, time + 1.2);
  ellipse(ctx, -.65, .11, .10, .075, "#faf0c5"); ellipse(ctx, .75, .13, .08, .06, "#e8cc95");
  ctx.beginPath(); ctx.ellipse(0, .26, 1.15, .43, 0, .10, Math.PI * .86); stroke(ctx, "#d3fff6b0", .05); ctx.restore();
}

function drawEarth(ctx: CanvasRenderingContext2D, size: number) {
  ctx.save(); ctx.scale(size, size);
  glow(ctx, 0, 0, 1.25, "#64d6ed4a");
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, .89, 0, tau); ctx.clip();
  ctx.fillStyle = linear(ctx, -.65, -.75, .72, .79, [[0, "#9ae8e6"], [.3, "#45badd"], [.7, "#288ebf"], [1, "#1c568d"]]); ctx.fillRect(-1, -1, 2, 2);
  ctx.fillStyle = "#7bc89b";
  ctx.beginPath(); ctx.moveTo(-.75, -.47); ctx.bezierCurveTo(-.35, -.61, -.38, -.2, -.08, -.28); ctx.lineTo(.07, -.02); ctx.lineTo(-.18, .17); ctx.lineTo(-.24, .53); ctx.quadraticCurveTo(-.47, .42, -.42, .13); ctx.lineTo(-.71, -.04); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(.32, -.70); ctx.quadraticCurveTo(.55, -.40, .83, -.50); ctx.lineTo(.82, -.1); ctx.lineTo(.57, .0); ctx.lineTo(.4, .36); ctx.lineTo(.20, .06); ctx.lineTo(.30, -.16); ctx.lineTo(.14, -.34); ctx.closePath(); ctx.fill();
  ellipse(ctx, .59, .5, .21, .13, "#82c998");
  ctx.strokeStyle = "#f1ffff80"; ctx.lineWidth = .055;
  for (const [x, y] of [[-.1, -.56], [-.49, .21], [.39, .28]]) { ctx.beginPath(); ctx.ellipse(x, y, .31, .075, -.1, 0, Math.PI * 1.5); ctx.stroke(); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(0, 0, .89, 0, tau); stroke(ctx, "#b7fbf7b0", .034); ellipse(ctx, -.30, -.55, .22, .065, "#d9ffff50"); ctx.restore();
}

function drawPlanet(ctx: CanvasRenderingContext2D, size: number, phase: number) {
  ctx.save(); ctx.scale(size, size); ctx.rotate(-.22);
  const peach = Math.sin(phase) > 0;
  ctx.beginPath(); ctx.ellipse(0, 0, 1.38, .36, 0, Math.PI, tau); stroke(ctx, peach ? "#f9dbad9c" : "#d1c1f7a0", .14);
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, .77, 0, tau); ctx.clip();
  ctx.fillStyle = linear(ctx, -.6, -.65, .7, .7, peach ? [[0, "#ffd8ae"], [.5, "#eaa08f"], [1, "#b6769f"]] : [[0, "#d1c9ff"], [.5, "#a39ade"], [1, "#626baa"]]); ctx.fillRect(-1, -1, 2, 2);
  for (let stripe = 0; stripe < 3; stripe++) {
    ctx.beginPath(); ctx.moveTo(-1, -.39 + stripe * .34); ctx.bezierCurveTo(-.25, -.54 + stripe * .34, .25, -.2 + stripe * .34, 1, -.34 + stripe * .34); stroke(ctx, peach ? "#ffeac441" : "#c4e4ff44", .13);
  }
  ctx.restore(); ctx.beginPath(); ctx.ellipse(0, 0, 1.38, .36, 0, 0, Math.PI); stroke(ctx, peach ? "#f9dbadc7" : "#d1c1f7c5", .14);
  ellipse(ctx, -.24, -.46, .22, .055, "#fff9f17a"); ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, size: number, time: number) {
  ctx.save(); ctx.scale(size, size);
  glow(ctx, 0, 0, 1.45, "#ffd87840");
  ctx.fillStyle = "#efad61";
  for (let ray = 0; ray < 9; ray++) {
    ctx.save(); ctx.rotate(ray / 9 * tau + time * .08); rounded(ctx, -.055, -.99, .11, .26, .055, "#efbf75"); ctx.restore();
  }
  ctx.fillStyle = linear(ctx, -.47, -.55, .55, .7, [[0, "#fff4ba"], [.35, "#ffdc7e"], [1, "#edaa63"]]);
  ctx.beginPath(); ctx.arc(0, 0, .71, 0, tau); ctx.fill();
  ellipse(ctx, -.22, -.35, .27, .07, "#fffdec8f");
  ellipse(ctx, -.21, -.025, .045, .065, "#976739"); ellipse(ctx, .21, -.025, .045, .065, "#976739");
  ctx.beginPath(); ctx.moveTo(-.15, .19); ctx.quadraticCurveTo(0, .31, .15, .19); stroke(ctx, "#af783c", .04); ctx.restore();
}

function drawGalaxy(ctx: CanvasRenderingContext2D, size: number, time: number) {
  ctx.save(); ctx.scale(size, size); ctx.rotate(-.24 + time * .025); ctx.scale(1, .65);
  glow(ctx, 0, 0, 1.28, "#c8a5f469");
  ctx.lineCap = "round";
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    for (let step = 0; step <= 20; step++) {
      const angle = arm / 3 * tau + step * .22, r = .055 + step * .05;
      if (!step) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r); else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    stroke(ctx, ["#d9b9f1", "#a9d7f0", "#eda9d5"][arm], .115);
  }
  for (let star = 0; star < 12; star++) {
    const a = star * 2.4, r = .35 + star % 5 * .15;
    ellipse(ctx, Math.cos(a) * r, Math.sin(a) * r, .027, .027, "#fcf4d6");
  }
  glow(ctx, 0, 0, .34, "#fff1c9"); ellipse(ctx, 0, 0, .13, .13, "#fff7dc"); ctx.restore();
}

function drawUniverse(ctx: CanvasRenderingContext2D, size: number, time: number) {
  ctx.save(); ctx.scale(size, size);
  glow(ctx, 0, 0, 1.25, "#d5acf53a");
  ctx.fillStyle = linear(ctx, -.5, -.7, .7, .7, [[0, "#8783c0"], [.25, "#635f9b"], [.75, "#39396d"], [1, "#2c3e65"]]); ctx.beginPath(); ctx.arc(0, 0, .88, 0, tau); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, .86, 0, tau); ctx.clip();
  glow(ctx, -.3, .15, .78, "#ee8dc95a"); glow(ctx, .45, -.20, .62, "#7bbcee55");
  ctx.beginPath(); ctx.moveTo(-.52, -.22); ctx.lineTo(-.18, -.40); ctx.lineTo(.12, -.13); ctx.lineTo(.37, -.31); stroke(ctx, "#e3e9fc63", .025);
  for (const [x, y] of [[-.52, -.22], [-.18, -.40], [.12, -.13], [.37, -.31], [-.51, .48], [.58, .34]]) ellipse(ctx, x, y, .032, .032, "#ffeac6");
  ctx.save(); ctx.translate(.16, .18); ctx.rotate(time * .03); ctx.beginPath(); ctx.ellipse(0, 0, .37, .1, -.38, 0, tau); stroke(ctx, "#dbc0edb0", .055); ellipse(ctx, 0, 0, .17, .17, "#d3c1e5"); ctx.restore();
  ellipse(ctx, -.48, .20, .095, .095, "#e5c297"); ctx.restore();
  ctx.beginPath(); ctx.arc(0, 0, .88, 0, tau); stroke(ctx, "#d6c0f9b0", .035);
  ctx.beginPath(); ctx.ellipse(0, 0, 1.14, .44, -.3, 0, tau); stroke(ctx, "#b0d7f062", .035); ctx.restore();
}

function foodVisualSize(food: SharkFood): number {
  // The smallest alphabet fish still has room for a letter and its expressive eye.
  return food.kind === "fish" && /^[A-Z]$/.test(food.tokenId) ? Math.max(21, food.size) : food.size;
}
function foodRadius(food: SharkFood): number { return foodVisualSize(food) * (food.kind === "fish" ? 1.9 : food.kind === "planet" ? 1.4 : food.kind === "boat" || food.kind === "ship" ? 1.25 : 1.2); }
function drawFood(ctx: CanvasRenderingContext2D, view: FoodView, time: number, reducedMotion: boolean, images?: SharkImages) {
  const { food, x, y, radius } = view;
  ctx.save(); ctx.translate(x, y);
  if (!food.edible) {
    ctx.beginPath(); ctx.ellipse(0, 0, radius + 7, radius * .73 + 7, 0, 0, tau); ctx.setLineDash([4, 7]); stroke(ctx, "#e9eff283", 1.25); ctx.setLineDash([]);
  }
  const heading = food.kind === "fish" ? food.angle : 0;
  ctx.rotate(heading); if (food.kind === "fish" && Math.cos(heading) < 0) ctx.scale(1, -1);
  const localTime = reducedMotion ? 0 : time;
  switch (food.kind) {
    case "fish": {
      const sprite = images?.sprites.get(SHARK_PREY_ART[hash(food.id) % SHARK_PREY_ART.length]);
      if (sprite) drawNaturalSwimmer(ctx, sprite, 0, 0, foodVisualSize(food) * 2.7, 0, localTime, food.phase, reducedMotion);
      else drawFish(ctx, foodVisualSize(food), foodColors[hash(food.id) % foodColors.length], localTime, food.phase, reducedMotion);
      break;
    }
    case "boat": ctx.translate(0, -food.size * .40); drawBoat(ctx, food.size, false, localTime + food.phase); break;
    case "ship": ctx.translate(0, -food.size * .40); drawBoat(ctx, food.size, true, localTime + food.phase); break;
    case "island": drawIsland(ctx, food.size, localTime + food.phase); break;
    case "earth": drawEarth(ctx, food.size); break;
    case "planet": drawPlanet(ctx, food.size, food.phase); break;
    case "star": drawStar(ctx, food.size, localTime); break;
    case "galaxy": drawGalaxy(ctx, food.size, localTime); break;
    case "universe": drawUniverse(ctx, food.size, localTime); break;
  }
  ctx.restore();
  if (!food.edible) drawLock(ctx, x + radius * .76, y - radius * .58);
}

function drawLock(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save(); ellipse(ctx, x, y, 12, 12, "#e7eff1d9");
  ctx.beginPath(); ctx.arc(x, y - 2.5, 4, Math.PI, tau); stroke(ctx, "#647d96", 1.8);
  rounded(ctx, x - 5, y - 2, 10, 8, 2, "#647d96"); ellipse(ctx, x, y + 1, 1, 1.3, "#f3f8f9"); ctx.restore();
}

function overlap(a: Rect, b: Rect): number { return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); }
function textLines(ctx: CanvasRenderingContext2D, text: string, sentence: boolean): string[] {
  if (!sentence) return [text];
  const words = text.split(/\s+/);
  if (words.length < 2) return [text];
  let split = 1, best = Infinity;
  for (let index = 1; index < words.length; index++) {
    const left = ctx.measureText(words.slice(0, index).join(" ")).width, right = ctx.measureText(words.slice(index).join(" ")).width;
    const score = Math.max(left, right) + Math.abs(left - right) * .18;
    if (score < best) { best = score; split = index; }
  }
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}

function paintFoodLabels(ctx: CanvasRenderingContext2D, views: FoodView[], world: SharkWorld, width: number, height: number, hudRects?: SharkHudRect[]): SharkFoodLabelRect[] {
  const labels: SharkFoodLabelRect[] = [];
  const mobile = width < 600, textSize = mobile ? 17 : 19, letterSize = mobile ? 24 : 26;
  const fallbackHud: Rect[] = [
    { x: Math.max(0, width / 2 - 170), y: 0, w: Math.min(width, 340), h: Math.min(110, height * .2) },
    { x: 0, y: 0, w: 70, h: 85 }, { x: width - 70, y: 0, w: 70, h: 85 },
  ];
  if (mobile) {
    const controlWidth = Math.min(130, width * .31), controlHeight = Math.min(190, height * .26);
    fallbackHud.push({ x: 0, y: height - controlHeight, w: controlWidth, h: controlHeight }, { x: width - controlWidth, y: height - controlHeight, w: controlWidth, h: controlHeight });
  }
  const visibleHud = (hudRects ?? fallbackHud).filter(rect => [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) && rect.w > 0 && rect.h > 0);
  const player = sharkWorldToScreen(world.player, sharkCamera(world, width, height));
  const occupied: Rect[] = [{ x: player.x - world.player.size * 1.5, y: player.y - world.player.size * .85, w: world.player.size * 3, h: world.player.size * 1.7 }, ...visibleHud];
  ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // Nearer edible English gets first choice of label space, keeping the player's next target clear.
  const sorted = [...views].sort((a, b) => Number(b.food.edible) - Number(a.food.edible) || Math.hypot(a.x - width / 2, a.y - height / 2) - Math.hypot(b.x - width / 2, b.y - height / 2));
  for (const view of sorted) {
    const token = getSharkToken(view.food.tokenId);
    if (!token) continue;
    const seaFish = sharkIsOcean(world) && view.food.kind === "fish", minimumY = seaFish ? sharkSurfaceScreenY(height) + 8 : 12;
    const maxDistance = Math.max(100, view.radius * 1.25);
    if (seaFish) {
      const body = { x: view.x - view.food.size * 1.35, y: view.y - view.food.size * .7, w: view.food.size * 2.7, h: view.food.size * 1.4 };
      if (visibleHud.some(hud => overlap(body, hud) >= body.w * body.h * .88)) continue;
    }
    const letter = /^[A-Z]$/.test(token.en);
    if (letter && view.food.kind === "fish" && view.x > 17 && view.x < width - 17 && view.y > 20 && view.y < height - 20) {
      const fontSize = Math.max(letterSize, Math.min(34, view.food.size * 1.22));
      ctx.font = `800 ${fontSize}px ${fontFamily}`;
      const badgeW = Math.max(27, ctx.measureText(token.en).width + 10), badgeH = fontSize + 4;
      const letterRect = { x: view.x - badgeW / 2 - view.food.size * .13, y: view.y - badgeH / 2, w: badgeW, h: badgeH };
      if (letterRect.y >= minimumY && occupied.every(other => overlap(letterRect, other) === 0)) {
        rounded(ctx, letterRect.x, letterRect.y, badgeW, badgeH, badgeH / 2, "#fff9e9ec");
        ctx.fillStyle = view.food.edible ? "#214e6c" : "#657189"; ctx.fillText(token.en, view.x - view.food.size * .13, view.y + 1); occupied.push(letterRect);
        labels.push({ ...letterRect, foodId: view.food.id }); continue;
      }
    }
    ctx.font = `800 ${textSize}px ${fontFamily}`;
    const lines = textLines(ctx, token.en, token.id.startsWith("sentence-"));
    const labelWidth = Math.min(width - 20, Math.max(...lines.map(line => ctx.measureText(line).width)) + 24);
    const labelHeight = lines.length * (textSize + 5) + 14;
    const bodyHeight = view.radius * .67;
    const candidates: Rect[] = [];
    for (const side of [1, -1]) for (const distance of [1, 1.75, 2.5]) for (const shift of [0, -.45, .45]) {
      const x = clamp(view.x - labelWidth / 2 + shift * labelWidth, 10, width - labelWidth - 10);
      const y = clamp(view.y + side * (bodyHeight + labelHeight / 2 + 10) * distance - labelHeight / 2, minimumY, height - labelHeight - 12);
      candidates.push({ x, y, w: labelWidth, h: labelHeight });
    }
    // Actual DOM overlays can move with wrapping, orientation and safe-area insets.
    // Their top and bottom edges provide exact alternatives to the nearby positions.
    for (const hud of visibleHud) for (const y of [hud.y - labelHeight - 9, hud.y + hud.h + 9]) for (const shift of [0, -.45, .45]) {
      candidates.push({ x: clamp(view.x - labelWidth / 2 + shift * labelWidth, 10, width - labelWidth - 10), y: clamp(y, minimumY, height - labelHeight - 12), w: labelWidth, h: labelHeight });
    }
    let rect: Rect | undefined, best = Infinity;
    for (const candidate of candidates) {
      if (seaFish && (candidate.y < minimumY || Math.hypot(candidate.x + candidate.w / 2 - view.x, candidate.y + candidate.h / 2 - view.y) > maxDistance)) continue;
      const collisions = occupied.reduce((sum, other) => sum + overlap({ x: candidate.x - 4, y: candidate.y - 4, w: candidate.w + 8, h: candidate.h + 8 }, other), 0);
      if (collisions > 0) continue;
      const score = Math.hypot(candidate.x + candidate.w / 2 - view.x, candidate.y + candidate.h / 2 - view.y);
      if (score < best) { best = score; rect = candidate; }
    }
    // Keep the picture without a badge when every available slot is obscured.
    if (!rect) continue;
    occupied.push(rect);
    ctx.beginPath(); ctx.moveTo(view.x, view.y + Math.sign(rect.y + rect.h / 2 - view.y) * Math.min(bodyHeight, 22)); ctx.lineTo(rect.x + rect.w / 2, rect.y + (rect.y > view.y ? 0 : rect.h)); stroke(ctx, view.food.edible ? "#ecfff9b0" : "#dce5f18a", 1.5);
    rounded(ctx, rect.x, rect.y + 3, rect.w, rect.h, 14, "#15426822");
    rounded(ctx, rect.x, rect.y, rect.w, rect.h, 14, view.food.edible ? "#fffbedf5" : "#e9edf6ef");
    ctx.strokeStyle = view.food.edible ? "#fffffff2" : "#c3d0df"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = view.food.edible ? "#224d6b" : "#607088";
    lines.forEach((line, index) => ctx.fillText(line, rect.x + rect.w / 2, rect.y + 7 + (textSize + 5) * (index + .5)));
    labels.push({ ...rect, foodId: view.food.id });
  }
  ctx.restore();
  return labels;
}

function rememberPaint(world: SharkWorld): PaintMemory {
  let memory = memories.get(world);
  if (!memory) { memory = { particles: [], pickups: new Set(), stage: world.stageIndex, previousStage: world.stageIndex, changedAt: world.elapsed }; memories.set(world, memory); }
  const stage = stageForShark(world.total).stageIndex;
  if (stage !== memory.stage) { memory.previousStage = memory.stage; memory.stage = stage; memory.changedAt = world.elapsed; }
  return memory;
}
function paintPickupParticles(ctx: CanvasRenderingContext2D, world: SharkWorld, memory: PaintMemory, width: number, height: number, reducedMotion: boolean) {
  const camera = sharkCamera(world, width, height);
  for (const pickup of world.pickups) {
    if (memory.pickups.has(pickup.pickupId)) continue;
    memory.pickups.add(pickup.pickupId);
    if (reducedMotion) continue;
    const seed = hash(pickup.pickupId);
    const x = world.player.x + Math.cos(world.player.angle) * world.player.size * .85, y = world.player.y + Math.sin(world.player.angle) * world.player.size * .85;
    for (let index = 0; index < 9; index++) {
      const angle = index / 9 * tau + seed % 21 * .1, speed = 28 + index % 4 * 14;
      memory.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 16, born: world.elapsed, life: .55 + index % 3 * .13, size: 2 + index % 3, color: ["#fff2b9", "#aef2e6", "#b6dcff"][index % 3] });
    }
  }
  if (memory.pickups.size > 64) memory.pickups = new Set([...memory.pickups].slice(-32));
  memory.particles = memory.particles.filter(particle => world.elapsed - particle.born < particle.life).slice(-48);
  if (reducedMotion) return;
  ctx.save();
  for (const particle of memory.particles) {
    const age = world.elapsed - particle.born, progress = age / particle.life;
    const point = sharkWorldToScreen({ x: particle.x + particle.vx * age, y: particle.y + particle.vy * age - age * age * 14 }, camera);
    ctx.globalAlpha = (1 - progress) * .8; ellipse(ctx, point.x, point.y, particle.size * (1 - progress * .4), particle.size * (1 - progress * .4), particle.color);
  }
  ctx.restore();
}

function paintSurfaceInteraction(ctx: CanvasRenderingContext2D, world: SharkWorld, x: number, y: number, width: number, height: number, reducedMotion: boolean) {
  if (!sharkIsOcean(world)) return;
  const surface = sharkSurfaceScreenY(height), size = world.player.size, jump = world.jump;
  ctx.save();
  if (y < surface || (jump.phase === "air" && y < surface + size)) {
    const altitude = Math.max(0, surface - y), spread = size * (1.0 + altitude / 270);
    ellipse(ctx, x, surface + 5, spread, Math.max(2, size * .085), "#16495845");
    ctx.beginPath(); ctx.ellipse(x, surface + 4, spread * 1.2, 4, 0, 0, tau); stroke(ctx, "#ecf9f165", 1.3);
  }
  if (!reducedMotion && Math.abs(y - surface) < size * 1.35) {
    const drift = Math.sin(world.elapsed * 5) * 1.8;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(x + side * size * .48, surface + 4); ctx.quadraticCurveTo(x + side * size, surface + 7 + drift, x + side * size * 1.65, surface + 5); stroke(ctx, "#f0faf3a0", 1.4);
    }
  }
  if (jump.splashTimer > 0) {
    const point = sharkWorldToScreen({ x: jump.splashX, y: SHARK_SURFACE_Y }, sharkCamera(world, width, height));
    const splashX = Number.isFinite(point.x) ? point.x : x, progress = clamp(1 - jump.splashTimer / .52, 0, 1);
    ctx.globalAlpha *= 1 - progress;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(splashX + side * size * progress * .6, surface + 4, size * (.6 + progress * 1.4), 3 + progress * 3, 0, 0, tau); stroke(ctx, "#f2fff4d9", 2.2);
      if (!reducedMotion) for (let drop = 0; drop < 7; drop++) {
        const speed = 35 + drop * 13, dx = side * (9 + speed * progress * .65), dy = -Math.sin(progress * Math.PI) * (21 + drop % 4 * 9);
        ellipse(ctx, splashX + dx, surface + dy, 1.5 + drop % 2, 2.6 - progress, "#f4fff3db");
      }
    }
  }
  ctx.restore();
}

function paintPlayer(ctx: CanvasRenderingContext2D, world: SharkWorld, width: number, height: number, reducedMotion: boolean, images?: SharkImages) {
  const { x, y } = sharkWorldToScreen(world.player, sharkCamera(world, width, height)), size = world.player.size, space = !sharkIsOcean(world), surface = sharkSurfaceScreenY(height);
  paintSurfaceInteraction(ctx, world, x, y, width, height, reducedMotion);
  ctx.save();
  if (space) glow(ctx, x, y, size * 1.65, "#76e9f329");
  if (!reducedMotion && (space || y > surface + size * .5)) {
    const angle = world.player.angle;
    for (let bubble = 0; bubble < 6; bubble++) {
      const phase = (world.elapsed * .6 + bubble / 6) % 1, behind = size * (1.45 + phase), lateral = Math.sin(bubble * 2.9) * size * .12;
      const bx = x - Math.cos(angle) * behind - Math.sin(angle) * lateral, by = y - Math.sin(angle) * behind + Math.cos(angle) * lateral - phase * 7;
      if (!space && by < surface + 8) continue;
      ctx.globalAlpha = (1 - phase) * .32; ctx.beginPath(); ctx.arc(bx, by, 1.1 + phase * 1.7, 0, tau); stroke(ctx, "#d7edf0", .9);
    }
    ctx.globalAlpha = 1;
  }
  const sprite = images?.sprites.get(SHARK_ART_INDEX), open = world.bite > 0 ? (reducedMotion ? .18 : Math.sin(clamp(1 - world.bite / .2, 0, 1) * Math.PI)) : 0;
  if (sprite) drawNaturalSwimmer(ctx, sprite, x, y, size * 2.9, world.player.angle, world.elapsed, .9, reducedMotion, open, true);
  else drawShark(ctx, x, y, size, world.player.angle, world.elapsed, world.bite, reducedMotion);
  const badgeWidth = 84, badgeY = clamp(y - size * .72 - 29, 12, height - 35);
  rounded(ctx, x - badgeWidth / 2, badgeY, badgeWidth, 23, 11.5, "#eff5edee");
  ctx.font = '800 11px ' + fontFamily; ctx.fillStyle = "#365662"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("YOU · 鲨鲨", x, badgeY + 12);
  ctx.restore();
}

/** Paint in CSS pixels; the caller owns device-pixel-ratio scaling and RAF timing. */
export function paintSharkWorld(ctx: CanvasRenderingContext2D, world: SharkWorld, width: number, height: number, options: SharkPaintOptions = {}): SharkFoodLabelRect[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  const reducedMotion = Boolean(options.reducedMotion), memory = rememberPaint(world), camera = sharkCamera(world, width, height);
  ctx.save(); ctx.clearRect(0, 0, width, height);
  const transition = reducedMotion ? 1 : clamp((world.elapsed - memory.changedAt) / .9, 0, 1);
  if (transition < 1 && memory.previousStage !== memory.stage) {
    paintBackground(ctx, world, width, height, memory.previousStage, reducedMotion);
    ctx.save(); ctx.globalAlpha = transition; paintBackground(ctx, world, width, height, memory.stage, reducedMotion); ctx.restore();
  } else paintBackground(ctx, world, width, height, memory.stage, reducedMotion);
  const views: FoodView[] = [];
  const nearbyIds = world.nearbyFoodIds ? new Set(world.nearbyFoodIds) : undefined;
  for (const food of world.foods.slice(0, 20)) {
    if (nearbyIds && !nearbyIds.has(food.id)) continue;
    const point = sharkWorldToScreen(food, camera), radius = foodRadius(food);
    if (sharkIsOcean(world) && food.kind === "fish" && point.y < sharkSurfaceScreenY(height)) continue;
    if (point.x < -radius || point.y < -radius || point.x > width + radius || point.y > height + radius) continue;
    views.push({ food, ...point, radius });
  }
  for (const view of [...views].sort((a, b) => Number(a.food.edible) - Number(b.food.edible))) {
    ctx.save();
    if (sharkIsOcean(world) && view.food.kind === "fish") { ctx.beginPath(); ctx.rect(0, sharkSurfaceScreenY(height) + 3, width, height); ctx.clip(); }
    drawFood(ctx, view, world.elapsed, reducedMotion, options.images); ctx.restore();
  }
  const labels = paintFoodLabels(ctx, views, world, width, height, options.hudRects);
  paintPlayer(ctx, world, width, height, reducedMotion, options.images);
  paintPickupParticles(ctx, world, memory, width, height, reducedMotion);
  ctx.restore();
  return labels;
}
