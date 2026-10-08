import { loadGameImage } from "@/lib/game-image-loader";

export interface OceanPlantSprite { image: CanvasImageSource; w: number; h: number }
export interface OceanSceneryImages { readonly sprites: readonly OceanPlantSprite[] }
export const OCEAN_PLANT_ATLAS = "/images/natural-seabed-plants-v2.png";
// Original atlas coordinates include each complete specimen and its rock base.
// Generative layouts are not exact grids: separate bounds prevent neighbouring
// holdfast pixels from leaking into another plant's transparent top margin.
export const OCEAN_PLANT_RECTS = [
  { x: 50, y: 25, w: 600, h: 638 }, { x: 650, y: 25, w: 557, h: 638 },
  { x: 35, y: 667, w: 585, h: 590 }, { x: 635, y: 675, w: 574, h: 585 },
] as const;

// Alpha bounds from scripts/seaweed-assets-source.json, with 3px padding.
// The lossless runtime image has identical pixels: no per-entry scan/readback.
const plantCrops = [
  {x:72,y:48,w:554,h:602}, {x:663,y:36,w:514,h:614},
  {x:47,y:673,w:559,h:569}, {x:644,y:694,w:545,h:547},
] as const;

let loading: Promise<OceanSceneryImages> | undefined;

/** Shared by both games. Decode and isolate the four plants once, before play. */
export function loadOceanSceneryImages(): Promise<OceanSceneryImages> {
  loading ??= preparePlants().catch(error => { loading = undefined; throw error; });
  return loading;
}

async function preparePlants(): Promise<OceanSceneryImages> {
  const atlas = await loadGameImage(OCEAN_PLANT_ATLAS);
  const sprites: OceanPlantSprite[] = [];
  for (const {x,y,w,h} of plantCrops) {
    if (x + w > atlas.naturalWidth || y + h > atlas.naturalHeight) throw new Error("海底植物的图片还没加载好，点一下重试。");
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("海底植物的图片还没加载好，点一下重试。");
    ctx.drawImage(atlas, x, y, w, h, 0, 0, w, h);
    sprites.push({ image: canvas, w, h });
  }
  return { sprites };
}
