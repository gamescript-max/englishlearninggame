import { SHARK_SURFACE_Y, SHARK_WORLD_WIDTH } from "./shark-engine";

export type OceanSceneryScene = "adventure" | "shark";

export interface OceanSceneryPatch {
  readonly id: string;
  readonly variant: number;
  /** Bottom-centre root, in world coordinates. */
  readonly worldX: number;
  readonly worldY: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly flipX: boolean;
  readonly opacity: number;
}

export interface ProjectedOceanPatch extends OceanSceneryPatch {
  /** The repeated world-space root, including its horizontal world turn. */
  readonly repeatedWorldX: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface OceanSceneryView {
  readonly width: number;
  readonly height: number;
  /** Top-left camera, before zoom, as used by the creature renderer. */
  readonly cameraX: number;
  readonly cameraY?: number;
  readonly zoom?: number;
  readonly scene: OceanSceneryScene;
  /** Water clipping boundary only; never used to place or resize a patch. */
  readonly surfaceY?: number;
}

export const MAX_VISIBLE_OCEAN_PATCHES = 14;
export const ADVENTURE_SCENERY_BOUNDS = Object.freeze({ width: 4200, height: 2800 });
/** The floor and raised shoals keep their depth when the viewport rotates. */
export const SHARK_SCENERY_FLOOR_Y = SHARK_SURFACE_Y + 600;

// Each value comes from its own seed. There is no retained RNG or simulation state.
function fraction(seed: number): number {
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
}

function makePatches(scene: OceanSceneryScene): readonly OceanSceneryPatch[] {
  const patches: OceanSceneryPatch[] = [];
  const count = scene === "adventure" ? 96 : 24;
  const worldWidth = scene === "adventure" ? ADVENTURE_SCENERY_BOUNDS.width : SHARK_WORLD_WIDTH;
  const salt = scene === "adventure" ? 0x4912a : 0x7b095;
  // Rejection sampling gives irregular gaps and clumps without a repeating grid.
  // This runs once for each scene, outside the frame loop.
  for (let candidate = 0; candidate < 4096 && patches.length < count; candidate++) {
    const seed = salt + candidate * 19;
    const worldX = scene === "adventure"
      ? 75 + fraction(seed) * (worldWidth - 150)
      : fraction(seed) * worldWidth;
    const worldY = scene === "adventure"
      ? 310 + fraction(seed + 1) * (ADVENTURE_SCENERY_BOUNDS.height - 400)
      : SHARK_SURFACE_Y + 200 + fraction(seed + 1) * 400;
    const overlaps = patches.some(patch => {
      const rawX = Math.abs(worldX - patch.worldX);
      const dx = scene === "shark" ? Math.min(rawX, worldWidth - rawX) : rawX;
      const dy = worldY - patch.worldY;
      return scene === "shark" ? dx < 82 : Math.hypot(dx, dy) < 190;
    });
    if (overlaps) continue;
    const height = scene === "adventure"
      ? 130 + fraction(seed + 2) * 125
      : Math.min(125 + fraction(seed + 2) * 130, worldY - SHARK_SURFACE_Y - 32);
    patches.push(Object.freeze({
      id: `${scene}-reef-${candidate}`,
      variant: Math.floor(fraction(seed + 3) * 4),
      worldX,
      worldY,
      worldWidth: height * (.85 + fraction(seed + 4) * .65),
      worldHeight: height,
      flipX: fraction(seed + 5) > .5,
      opacity: .68 + fraction(seed + 6) * .2,
    }));
  }
  return Object.freeze(patches);
}

const adventurePatches = makePatches("adventure");
const sharkPatches = makePatches("shark");

/** Fixed scene data: camera, canvas size and animation time cannot change it. */
export function getOceanSceneryPatches(scene: OceanSceneryScene): readonly OceanSceneryPatch[] {
  return scene === "shark" ? sharkPatches : adventurePatches;
}

/** Project fixed roots exactly like actors, then cull their entire sprite bounds.
 * The sprite budget is independent of canvas size. Shark repeats only at its
 * actual world seam; it never wraps scenery at a viewport or screen edge. */
export function getVisibleOceanScenery(view: OceanSceneryView): readonly ProjectedOceanPatch[] {
  const { width, height } = view;
  const zoom = view.zoom ?? 1;
  const cameraY = view.cameraY ?? 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0
    || !Number.isFinite(zoom) || zoom <= 0 || !Number.isFinite(view.cameraX) || !Number.isFinite(cameraY)) return [];
  const surface = Number.isFinite(view.surfaceY) ? Math.max(0, view.surfaceY!) : 0;
  if (surface >= height) return [];
  const candidates: ProjectedOceanPatch[] = [];
  const wrapped = view.scene === "shark";
  const centerX = view.cameraX + width / (2 * zoom);
  if (!Number.isFinite(centerX)) return [];
  for (const patch of getOceanSceneryPatches(view.scene)) {
    // Three copies cover either seam on normal viewports. On exceptional canvases
    // the fixed budget intentionally draws only the closest world repetitions.
    const turn = wrapped ? Math.round((centerX - patch.worldX) / SHARK_WORLD_WIDTH) : 0;
    for (let copy = 0; copy < (wrapped ? 3 : 1); copy++) {
      const repeated = wrapped ? turn + copy - 1 : 0;
      const repeatedWorldX = patch.worldX + repeated * (wrapped ? SHARK_WORLD_WIDTH : 0);
      const x = (repeatedWorldX - view.cameraX) * zoom;
      const y = (patch.worldY - cameraY) * zoom;
      const projectedWidth = patch.worldWidth * zoom, projectedHeight = patch.worldHeight * zoom;
      const left = x - projectedWidth / 2, right = x + projectedWidth / 2;
      const top = y - projectedHeight, bottom = y;
      if (![left, right, top, bottom].every(Number.isFinite)) continue;
      if (right <= 0 || left >= width || bottom <= surface || top >= height) continue;
      candidates.push({ ...patch, repeatedWorldX, x, y, width: projectedWidth, height: projectedHeight, left, top, right, bottom });
    }
  }
  // A stable priority avoids re-placing roots or resizing sprites to fill a view.
  // Repeat distance only decides which duplicate survives very wide canvases.
  candidates.sort((a, b) => a.id.localeCompare(b.id)
    || Math.abs(a.x - width / 2) - Math.abs(b.x - width / 2));
  const visible = candidates.slice(0, MAX_VISIBLE_OCEAN_PATCHES);
  return visible.sort((a, b) => a.worldY - b.worldY || a.x - b.x);
}
