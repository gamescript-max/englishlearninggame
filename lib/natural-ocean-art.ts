import atlas from './natural-ocean-art.json';
import { gameImageURL } from './game-image-assets';

// Display masks remove neighbouring silhouettes caught by the atlas crop; PNG pixels stay intact.
const exclusions: Record<number, {x:number;y:number;w:number;h:number}[]> = {
  85: [{x:242,y:0,w:24,h:49}],
  86: [{x:0,y:104,w:24,h:42}],
  87: [{x:0,y:0,w:2,h:179},{x:221,y:0,w:46,h:52}],
  88: [{x:0,y:58,w:46,h:51},{x:275,y:0,w:12,h:51}],
  90: [{x:250,y:95,w:6,h:18}],
  91: [{x:0,y:50,w:6,h:16}],
};
const separator = [[582,780],[550,850],[520,882],[505,890],[500,900],[490,973]];
function exclusionPaths(index:number, rect:{x:number;y:number}) {
  const points = index === 91 ? [...separator,[770,973],[770,780]] : index === 92 ? [...separator,[256,973],[256,780]] : [];
  return points.length ? [points.map(([x,y])=>({x:x-rect.x,y:y-rect.y}))] : [];
}
export function naturalSpriteClip(rect: {w:number;h:number;exclusions?:{x:number;y:number;w:number;h:number}[];exclusionPaths?:{x:number;y:number}[][]}) {
  const path = (x:number,y:number,w:number,h:number) => `M${x},${y}h${w}v${h}h${-w}Z`;
  return path(0,0,rect.w,rect.h) + (rect.exclusions??[]).map(r=>path(r.x,r.y,r.w,r.h)).join("") + (rect.exclusionPaths??[]).map(points=>points.map((p,i)=>`${i?"L":"M"}${p.x},${p.y}`).join("")+"Z").join("");
}

/** Source rectangles retain each animal's own silhouette and natural proportions. */
export function naturalOceanArt(index: number) {
  const rect = atlas.ocean[index];
  const image = atlas.atlases[rect.atlas];
  return { ...rect, src: gameImageURL(image.src), sourceSrc: image.src, imageWidth: image.width, imageHeight: image.height, exclusions: exclusions[index] ?? [], exclusionPaths:exclusionPaths(index,rect) };
}
export function naturalColorArt(color: string) {
  const index = Math.max(0, ['red', 'blue', 'yellow', 'green'].indexOf(color));
  const rect = atlas.colors[index];
  const image = atlas.atlases[rect.atlas];
  return { ...rect, src: gameImageURL(image.src), sourceSrc: image.src, imageWidth: image.width, imageHeight: image.height };
}
export const naturalOceanAtlases = atlas.atlases;
