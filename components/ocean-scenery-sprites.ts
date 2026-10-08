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

let loading: Promise<OceanSceneryImages> | undefined;

/** Shared by both games. Decode and isolate the four plants once, before play. */
export function loadOceanSceneryImages(): Promise<OceanSceneryImages> {
  loading ??= preparePlants().catch(error => { loading = undefined; throw error; });
  return loading;
}

async function preparePlants(): Promise<OceanSceneryImages> {
  const atlas = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("海底植物的图片还没加载好，点一下重试。"));
    image.src = OCEAN_PLANT_ATLAS;
  });
  try {
    const sprites: OceanPlantSprite[] = [];
    for (const {x,y,w,h} of OCEAN_PLANT_RECTS) {
      if (x + w > atlas.naturalWidth || y + h > atlas.naturalHeight) throw new Error("海底植物的图片还没加载好，点一下重试。");
      const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("海底植物的图片还没加载好，点一下重试。");
      ctx.drawImage(atlas, x, y, w, h, 0, 0, w, h);
      // Read alpha to remove only transparent padding; source pixels remain intact.
      const pixels = ctx.getImageData(0, 0, w, h).data;
      let left: number = w, right = -1, top: number = h, bottom = -1;
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
        if (pixels[(py * w + px) * 4 + 3] <= 12) continue;
        left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
      }
      if (right < left) throw new Error("海底植物的图片还没加载好，点一下重试。");
      left = Math.max(0, left - 3); top = Math.max(0, top - 3);
      right = Math.min(w - 1, right + 3); bottom = Math.min(h - 1, bottom + 3);
      const crop = document.createElement("canvas"); crop.width = right - left + 1; crop.height = bottom - top + 1;
      const cropped = crop.getContext("2d");
      if (!cropped) throw new Error("海底植物的图片还没加载好，点一下重试。");
      cropped.drawImage(canvas, left, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
      sprites.push({ image: crop, w: crop.width, h: crop.height });
    }
    return { sprites };
  } finally { atlas.onload = null; atlas.onerror = null; atlas.src = ""; }
}
