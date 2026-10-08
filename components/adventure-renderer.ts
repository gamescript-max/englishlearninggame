import { cameraForWorld, FISH_DRAW_FACTOR, type AdventureActor, type AdventureWorld } from "@/lib/adventure-engine";
import { getAdventureWord, getOceanSpecies, oceanEvolution, snakeBreeds } from "@/lib/adventure-catalog";
import art from "@/lib/adventure-art.json";
import ecologyArt from "@/lib/ecology-art.json";
import flatSnakeArt from "@/lib/snake-flat-art.json";
import { advanceSwimState, createSwimState, fishFinRows, fishStrip, sampleSwim, softBodyRow, swimProfileFor, swimStripCount, swimVisualReach, type SwimState } from "@/lib/adventure-motion";
import { naturalColorArt, naturalOceanArt, naturalOceanAtlases } from "@/lib/natural-ocean-art";
import { feedingOpen, mouthGeometry, mouthProfile } from "@/lib/adventure-feeding";
import { paintOceanScenery } from "./ocean-scenery";
import { loadOceanSceneryImages, type OceanSceneryImages } from "./ocean-scenery-sprites";
import { loadGameImage } from "@/lib/game-image-loader";
import type { AdventureMode } from "@/lib/adventure-content";

export interface AdventureImages {
  snake?: HTMLImageElement; words: HTMLImageElement; sea: HTMLImageElement;
  ocean: HTMLImageElement[]; snakeBreeds?: HTMLImageElement;
  oceanSprites?: Map<number, HTMLCanvasElement>;
  cards: HTMLImageElement; expandedWords: HTMLImageElement;
  scenery?: OceanSceneryImages;
}
type Rect = { x: number; y: number; w: number; h: number };
type SwimRecord = {state:SwimState;x:number;y:number;at:number};
const swimming = new WeakMap<AdventureWorld, Map<string,SwimRecord>>();
const previewTimings = new WeakMap<AdventureWorld, number[]>();
/** Isolate only the affected source crops once, before their tail/fin mesh moves. */
export function prepareOceanSprite(image: HTMLImageElement, rect: Rect & {exclusions:{x:number;y:number;w:number;h:number}[];exclusionPaths?:{x:number;y:number}[][]}, createCanvas = () => document.createElement("canvas")) {
  const canvas = createCanvas(); canvas.width = rect.w; canvas.height = rect.h;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("小伙伴的图片还没加载好，点一下重试。");
  context.save(); context.beginPath(); context.rect(0,0,rect.w,rect.h);
  for (const excluded of rect.exclusions) context.rect(excluded.x,excluded.y,excluded.w,excluded.h);
  for (const points of rect.exclusionPaths??[]) { points.forEach((p,i)=>i?context.lineTo(p.x,p.y):context.moveTo(p.x,p.y)); context.closePath(); }
  context.clip("evenodd");
  context.drawImage(image,rect.x,rect.y,rect.w,rect.h,0,0,rect.w,rect.h);
  context.restore(); return canvas;
}
const adventureLoading = new Map<AdventureMode | "all", Promise<AdventureImages>>();
export function loadAdventureImages(mode?: AdventureMode): Promise<AdventureImages> {
  const key = mode ?? "all", existing = adventureLoading.get(key);
  if (existing) return existing;
  const pending = prepareAdventureImages(mode).catch(error => { adventureLoading.delete(key); throw error; });
  adventureLoading.set(key, pending); return pending;
}
async function prepareAdventureImages(mode?: AdventureMode): Promise<AdventureImages> {
  const names = ["words", "archipelago-ocean-v1", "adventure-cards-v2", "expanded-words-base"];
  const [entries, snakes, ocean, scenery] = await Promise.all([
    Promise.all(names.map(name => loadGameImage(`/images/${name}.png`))),
    mode === "fish" ? [] : Promise.all(["adventure-snakes-v1", "snake-breeds-flat-v3"].map(name => loadGameImage(`/images/${name}.png`))),
    mode === "snake" ? [] : Promise.all(naturalOceanAtlases.map(atlas => loadGameImage(atlas.src))),
    mode === "snake" ? undefined : loadOceanSceneryImages(),
  ]);
  const oceanSprites = new Map<number,HTMLCanvasElement>();
  for (const index of mode === "snake" ? [] : [85,86,87,88,90,91,92]) {
    const rect = naturalOceanArt(index);
    oceanSprites.set(index,prepareOceanSprite(ocean[rect.atlas],rect));
  }
  return { words: entries[0], sea: entries[1], cards: entries[2], expandedWords: entries[3], snake: snakes[0], snakeBreeds: snakes[1], ocean, oceanSprites, scenery };
}
export function paintAdventure(ctx: CanvasRenderingContext2D, world: AdventureWorld, images: AdventureImages, width: number, height: number, hinted: boolean, followId?: string, reducedMotion = false) {
  const previewStart = process.env.NODE_ENV === "development" ? performance.now() : undefined;
  const camera = cameraForWorld(world, width, height);
  ctx.clearRect(0, 0, width, height); ctx.fillStyle = "#71d8e7"; ctx.fillRect(0, 0, width, height);
  const viewWidth = width / camera.zoom, viewHeight = height / camera.zoom;
  if (world.mode === "fish") {
    ctx.drawImage(images.sea, camera.x / world.width * images.sea.width, camera.y / world.height * images.sea.height, viewWidth / world.width * images.sea.width, viewHeight / world.height * images.sea.height, 0, 0, width, height);
    ctx.fillStyle = "#20b7d712"; ctx.fillRect(0, 0, width, height);
    paintOceanScenery(ctx, {width, height, cameraX:camera.x, cameraY:camera.y, zoom:camera.zoom, elapsed:world.elapsed, reducedMotion, scene:"adventure", images:images.scenery});
  }
  ctx.save(); ctx.scale(camera.zoom, camera.zoom); ctx.translate(-camera.x, -camera.y);
  let swimRecords = swimming.get(world);
  if (!swimRecords) { swimRecords = new Map(); swimming.set(world,swimRecords); }
  if (swimRecords.size > 180) { const alive = new Set(["player",...world.actors.filter(a=>!a.consumed).map(a=>a.id)]); for (const id of swimRecords.keys()) if (!alive.has(id)) swimRecords.delete(id); }
  const inView = (x: number, y: number, margin: number) => x + margin >= camera.x && x - margin <= camera.x + viewWidth && y + margin >= camera.y && y - margin <= camera.y + viewHeight;
  const seenNames = new Set<string>(), namedActors = new Set<string>();
  const fishNeighbors = world.actors.filter(actor => !actor.consumed && actor.speciesId && !actor.wordId && actor.kind !== "mission" && inView(actor.x,actor.y,0)).sort((a,b) => Math.hypot(a.x-world.player.x,a.y-world.player.y)-Math.hypot(b.x-world.player.x,b.y-world.player.y));
  const finActors = new Set(fishNeighbors.filter(actor => actor.radius * FISH_DRAW_FACTOR.ambient * camera.zoom >= 85 && ["tail", "flap"].includes(swimProfileFor(actor.speciesId!).family)).slice(0, 3).map(actor => actor.id));
  for (const larger of [false,true]) {
    let count = 0;
    for (const actor of fishNeighbors) {
      if ((actor.radius >= world.player.radius*.88) !== larger || seenNames.has(actor.speciesId!)) continue;
      namedActors.add(actor.id); seenNames.add(actor.speciesId!);
      if (++count >= (larger ? 2 : 5)) break;
    }
  }
  if (world.mode === "snake") {
    ctx.drawImage(images.sea, camera.x / world.width * images.sea.width, camera.y / world.height * images.sea.height, viewWidth / world.width * images.sea.width, viewHeight / world.height * images.sea.height, camera.x, camera.y, viewWidth, viewHeight);
    ctx.fillStyle = "#73d6a636"; ctx.fillRect(camera.x, camera.y, viewWidth, viewHeight);
  }
  ctx.strokeStyle = "#ffffff70"; ctx.lineWidth = 5; ctx.strokeRect(4, 4, world.width - 8, world.height - 8);
  function sprite(image: CanvasImageSource | undefined, rect: Rect & {flipX?:boolean}, x: number, y: number, radius: number, heading = 0, factor = 2.5) {
    if (!image) return;
    const w = radius * factor, h = w * rect.h / rect.w;
    if (!inView(x, y, Math.hypot(w, h) / 2)) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(heading);
    if (Math.cos(heading) < 0) ctx.scale(1, -1);
    if (rect.flipX) ctx.scale(-1,1);
    ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, -w / 2, -h / 2, w, h); ctx.restore();
  }
  function swimmingSprite(image:CanvasImageSource, rect:Rect & {flipX?:boolean}, actor:{x:number;y:number;radius:number;heading:number}, id:string, speciesId:string, factor:number, player=false) {
    const w=actor.radius*factor,h=w*rect.h/rect.w,baseProfile=swimProfileFor(speciesId);
    // The full mouth mask stays inside the rigid head, including long wave swimmers.
    const profile=player&&!baseProfile.upright?{...baseProfile,headLock:Math.max(baseProfile.headLock,1-mouthProfile(speciesId).hinge[0])}:baseProfile;
    if (!inView(actor.x,actor.y,Math.hypot(w,h)/2+w*.2)) return;
    let record=swimRecords!.get(id);
    if (!record) { record={state:createSwimState(id,actor.heading),x:actor.x,y:actor.y,at:world.elapsed};swimRecords!.set(id,record); }
    const dt=world.elapsed-record.at,travel=Math.hypot(actor.x-record.x,actor.y-record.y);
    record.state=advanceSwimState(record.state,{dt,heading:actor.heading,speed:dt>0?travel/dt:0,width:w,active:dt>0,reducedMotion},profile);
    record.x=actor.x;record.y=actor.y;record.at=world.elapsed;
    const motion=sampleSwim(record.state,profile,w,reducedMotion),count=swimStripCount(w*camera.zoom,player,reducedMotion);
    const eating = player ? feedingOpen(world.elapsed,world.player.ateAt,reducedMotion) : 0;
    if(!inView(actor.x,actor.y,swimVisualReach(w,h,motion)))return;
    ctx.save();ctx.translate(actor.x,actor.y+motion.bob);
    const upright=profile.upright,heading=reducedMotion?actor.heading:record.state.heading;
    ctx.rotate(upright?Math.sin(heading)*.16:heading);
    // Keep the source silhouette intact: a turn never squeezes a photograph flat.
    if(!upright)ctx.scale(1,record.state.facing);
    if(!reducedMotion&&record.state.speed>20&&w*camera.zoom>45&&!upright) {
      ctx.save();ctx.strokeStyle="#d8ffff60";ctx.lineWidth=1.4;ctx.beginPath();
      for(let trail=0;trail<2;trail++){ctx.moveTo(-w*.52,trail? h*.13:-h*.13);ctx.lineTo(-w*.72, (trail?1:-1)*h*.17+Math.sin(motion.phase)*2);}
      ctx.stroke();ctx.restore();
    }
    if(count===1||profile.family==="drift") {
      const whole=()=>{ctx.save();if(rect.flipX)ctx.scale(-1,1);ctx.drawImage(image,rect.x,rect.y,rect.w,rect.h,-w/2,-h/2,w,h);ctx.restore();};
      if(eating>0&&profile.family==="drift") {
        const jaw=mouthGeometry(speciesId,w,h,eating,camera.zoom);
        const path=(points:{x:number;y:number}[])=>{points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();};
        ctx.save();ctx.beginPath();path([{x:-w/2,y:-h/2},{x:w/2,y:-h/2},{x:w/2,y:h/2},{x:-w/2,y:h/2}]);path(jaw.polygon);ctx.clip("evenodd");whole();ctx.restore();
        ctx.save();ctx.beginPath();path([jaw.hinge,jaw.lip,jaw.openedLip]);ctx.fillStyle="#102e38";ctx.fill();ctx.restore();
        ctx.save();ctx.transform(1,jaw.shear,0,1,0,-jaw.hinge.x*jaw.shear);ctx.beginPath();path(jaw.polygon);ctx.clip();whole();ctx.restore();
      } else whole();
    } else if(profile.family==="jelly"||profile.family==="arms") {
      const beak=eating>0&&profile.family==="arms"?mouthGeometry(speciesId,w,h,eating,camera.zoom):null;
      const path=(points:{x:number;y:number}[])=>{points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();};
      ctx.save();
      if(beak){ctx.beginPath();path([{x:-w/2,y:-h/2},{x:w/2,y:-h/2},{x:w/2,y:h/2},{x:-w/2,y:h/2}]);path(beak.polygon);ctx.clip("evenodd");}
      for(let strip=0;strip<count;strip++) {
        const v0=strip/count,v1=(strip+1)/count,top=softBodyRow(v0,profile,motion,w,h),bottom=softBodyRow(v1,profile,motion,w,h),rowHeight=h/count;
        ctx.save();ctx.transform(1,0,(bottom.dx-top.dx)/rowHeight,1,top.dx,(v0-.5)*h+top.dy);ctx.scale(top.scaleX,1);
        const sourceHeight=Math.min(rect.h*(v1-v0)+.6,rect.h*(1-v0));
        ctx.drawImage(image,rect.x,rect.y+rect.h*v0,rect.w,sourceHeight,-w/2,0,w,rowHeight+sourceHeight/(rect.h/count)*.15);ctx.restore();
      }
      ctx.restore();
      if(beak){
        ctx.save();ctx.beginPath();path([beak.hinge,beak.lip,beak.openedLip]);ctx.fillStyle="#102e38";ctx.fill();ctx.transform(1,beak.shear,0,1,0,-beak.hinge.x*beak.shear);ctx.beginPath();path(beak.polygon);ctx.clip();ctx.drawImage(image,rect.x,rect.y,rect.w,rect.h,-w/2,-h/2,w,h);ctx.restore();
      }
    } else {
      if(profile.family==="jet")ctx.scale(1+.025*motion.pulse,1-.02*motion.pulse);
      const tailEnd = 1-profile.headLock, tailCount = Math.max(1,Math.ceil(count*tailEnd));
      const flexFins = (profile.family === "tail" || profile.family === "flap") && (player || finActors.has(id));
      for(let strip=0;strip<tailCount;strip++) {
        const band=fishStrip(strip,tailCount,w,profile,motion,tailEnd),sourceU=rect.flipX?1-band.u1:band.u0,sourceWidth=rect.w*(band.u1-band.u0);
        if (flexFins) {
          const left = fishFinRows(band.u0, h, profile, motion), right = fishFinRows(band.u1, h, profile, motion);
          const nextY = band.y0 + band.width * band.shearY;
          for (let row = 0; row < left.length; row++) {
            const a = left[row], b = right[row];
            const points = [{x:band.x0,y:band.y0+a.y},{x:band.x0+band.width,y:nextY+b.y},{x:band.x0+band.width,y:nextY+b.y+b.height},{x:band.x0,y:band.y0+a.y+a.height}];
            texturedQuad(image, rect, {x:rect.x+sourceU*rect.w,y:rect.y+rect.h*a.v0,w:sourceWidth,h:rect.h*(a.v1-a.v0)}, points, !!rect.flipX);
          }
          continue;
        }
        ctx.save();ctx.transform(1,band.shearY,0,1,band.x0,band.y0);
        if(rect.flipX){ctx.translate(band.width,0);ctx.scale(-1,1);}
        const extra=Math.min(.6,rect.w*(1-sourceU)-sourceWidth);
        ctx.drawImage(image,rect.x+sourceU*rect.w,rect.y,sourceWidth+Math.max(0,extra),rect.h,0,-h/2,band.width+Math.max(0,extra)*w/rect.w,h);
        ctx.restore();
      }
      const headWidth=w*(1-tailEnd), sourceU=rect.flipX?0:tailEnd;
      if (eating > 0) {
        const jaw=mouthGeometry(speciesId,w,h,eating,camera.zoom);
        const path=(points:{x:number;y:number}[])=>{points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();};
        const head=()=>{ctx.save();ctx.translate((tailEnd-.5)*w,0);if(rect.flipX){ctx.translate(headWidth,0);ctx.scale(-1,1);}ctx.drawImage(image,rect.x+sourceU*rect.w,rect.y,rect.w*(1-tailEnd),rect.h,0,-h/2,headWidth,h);ctx.restore();};
        // Remove stationary jaw pixels before painting the original jaw in its open pose.
        ctx.save();ctx.beginPath();path([{x:(tailEnd-.5)*w,y:-h/2},{x:w/2,y:-h/2},{x:w/2,y:h/2},{x:(tailEnd-.5)*w,y:h/2}]);path(jaw.polygon);ctx.clip("evenodd");head();ctx.restore();
        // This cavity follows the angled mouth seam, rather than adding an oval.
        ctx.save();ctx.beginPath();path([jaw.hinge,jaw.lip,jaw.openedLip]);ctx.fillStyle="#102e38";ctx.fill();ctx.restore();
        ctx.save();ctx.transform(1,jaw.shear,0,1,0,-jaw.hinge.x*jaw.shear);ctx.beginPath();path(jaw.polygon);ctx.clip();head();ctx.restore();
      } else {
        ctx.save();ctx.translate((tailEnd-.5)*w,0);
        if(rect.flipX){ctx.translate(headWidth,0);ctx.scale(-1,1);}
        ctx.drawImage(image,rect.x+sourceU*rect.w,rect.y,rect.w*(1-tailEnd),rect.h,0,-h/2,headWidth,h);ctx.restore();
      }
    }
    ctx.restore();
  }
  // Adjacent cells share their exact endpoints, including the rigid face boundary.
  // Triangles preserve continuous fin roots without stair-stepping between columns.
  function texturedQuad(image:CanvasImageSource, bounds:Rect, source:Rect, points:{x:number;y:number}[], flipX:boolean) {
    const padding = .45;
    const sx = Math.max(bounds.x,source.x-padding), sy = Math.max(bounds.y,source.y-padding);
    const sw = Math.min(bounds.x+bounds.w,source.x+source.w+padding)-sx, sh = Math.min(bounds.y+bounds.h,source.y+source.h+padding)-sy;
    for (const indices of [[0,1,2],[0,2,3]]) {
      const [a,b,c] = indices.map(index=>points[index]);
      const center={x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3};
      ctx.save();ctx.beginPath();
      for (const [index,point] of [a,b,c].entries()) {
        const dx=point.x-center.x,dy=point.y-center.y,length=Math.hypot(dx,dy)||1;
        const x=point.x+dx/length*.3/camera.zoom,y=point.y+dy/length*.3/camera.zoom;
        if(index===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath();ctx.clip();
      const first=indices[1]===1;
      ctx.transform(first?b.x-a.x:b.x-c.x,first?b.y-a.y:b.y-c.y,first?c.x-b.x:c.x-a.x,first?c.y-b.y:c.y-a.y,a.x,a.y);
      if(flipX){ctx.translate(1,0);ctx.scale(-1,1);}
      ctx.drawImage(image,sx,sy,sw,sh,(sx-source.x)/source.w,(sy-source.y)/source.h,sw/source.w,sh/source.h);
      ctx.restore();
    }
  }
  const labels: {text:string;x:number;y:number;tone:string;size:number}[] = [];
  function label(text: string, x: number, y: number, tone = "neutral", size = 13) { labels.push({text,x,y,tone,size}); }
  function paintLabels() {
    // English names stay readable above fish and clear of the picture cards.
    const occupied = world.actors.filter(a => !a.consumed && a.wordId && inView(a.x,a.y,a.radius*2)).map(a => ({x:a.x-a.radius*1.4,y:a.y-a.radius*1.4,w:a.radius*2.8,h:a.radius*3.6}));
    occupied.push({x:camera.x,y:camera.y,w:Math.min(225,width-150)/camera.zoom,h:96/camera.zoom});
    occupied.push({x:camera.x+viewWidth-140/camera.zoom,y:camera.y,w:140/camera.zoom,h:98/camera.zoom});
    for (const item of labels.sort((a,b) => Number(b.tone === "neutral") - Number(a.tone === "neutral"))) {
      const size = item.size / camera.zoom, h = 25 / camera.zoom;
      const units = [...item.text].reduce((sum,char) => sum + (char.charCodeAt(0)>255 ? 1 : .57),0);
      const w = Math.min(viewWidth-16/camera.zoom, 310/camera.zoom, units * size + 20/camera.zoom);
      let rect: {x:number;y:number;w:number;h:number} | undefined;
      for (const offset of [0,1,2,3]) {
        const x = Math.max(camera.x+8/camera.zoom,Math.min(camera.x+viewWidth-w-8/camera.zoom,item.x-w/2));
        const candidate = {x,y:Math.max(camera.y+8/camera.zoom,item.y-17/camera.zoom-offset*(h+4/camera.zoom)),w,h};
        if (occupied.every(a => candidate.x+w+4/camera.zoom<a.x || candidate.x>a.x+a.w+4/camera.zoom || candidate.y+h+4/camera.zoom<a.y || candidate.y>a.y+a.h+4/camera.zoom)) { rect = candidate; break; }
      }
      if (!rect && item.tone !== "neutral") continue;
      rect ??= {x:Math.max(camera.x+8/camera.zoom,Math.min(camera.x+viewWidth-w-8/camera.zoom,item.x-w/2)),y:Math.max(camera.y+8/camera.zoom,item.y-h),w,h};
      occupied.push(rect);
      ctx.save();ctx.fillStyle=item.tone === "edible" ? "#e6ffdef0" : item.tone === "larger" ? "#ffeeddf0" : "#fffffff0";
      ctx.beginPath();ctx.roundRect(rect.x,rect.y,w,h,10/camera.zoom);ctx.fill();
      ctx.fillStyle=item.tone === "larger" ? "#a25730" : "#265a63";ctx.font=`700 ${size}px sans-serif`;ctx.textAlign="center";
      ctx.fillText(item.text,rect.x+w/2,rect.y+h*.69,w-14/camera.zoom);ctx.restore();
    }
  }
  function card(id: string, x: number, y: number, radius: number, named = true) {
    if (!inView(x, y, radius + 18)) return;
    const word = getAdventureWord(id); if (!word) return;
    let image = images.words, rect: Rect;
    if (word.image.endsWith("adventure-cards-v2.png")) { image = images.cards; rect = ecologyArt.cards[word.spriteIndex]; }
    else if (word.imageRect) { image = images.expandedWords; rect = { x: word.imageRect.x, y: word.imageRect.y, w: word.imageRect.width, h: word.imageRect.height }; }
    else { const w = image.width / 6, h = image.height / 4; rect = { x: word.spriteIndex % 6 * w, y: Math.floor(word.spriteIndex / 6) * h, w, h }; }
    const side = radius * 2, labelHeight = named ? Math.max(20, radius * .48) : 0;
    ctx.save(); ctx.shadowColor = "#0b685233"; ctx.shadowBlur = named ? 7 : 0; ctx.shadowOffsetY = named ? 4 : 0;
    ctx.fillStyle = "#fffdf2"; ctx.beginPath(); ctx.roundRect(x - radius, y - radius, side, side + labelHeight, radius * .32); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    const scale = Math.min(side * .86 / rect.w, side * .86 / rect.h), w = rect.w * scale, h = rect.h * scale;
    ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, x - w / 2, y - h / 2, w, h);
    if (named) { ctx.fillStyle = "#305967"; ctx.font = `700 ${Math.max(12, Math.min(15, radius * .47))}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(word.en, x, y + radius + labelHeight * .7, radius * 2 - 6); }
    ctx.restore();
  }
  function snake(x: number, y: number, radius: number, heading: number, body: {x:number;y:number}[], color: string, words: string[] = [], breedId?: string) {
    const breed = snakeBreeds.find(item => item.id === breedId), index = breed?.artIndex ?? (color === "yellow" ? 1 : color === "green" ? 2 : 0);
    const image = breed ? images.snakeBreeds : images.snake;
    const head = breed ? flatSnakeArt.snake[index] : art.snake[index], segmentArt = breed ? flatSnakeArt.snake[index + 8] : art.snake[index + 3];
    for (let i = body.length - 1; i > 0; i--) {
      const segment = body[i]; if (!inView(segment.x, segment.y, radius * 1.6 + 12)) continue;
      const previous = body[i - 1], next = body[Math.min(i + 1, body.length - 1)], tangent = Math.atan2(previous.y - next.y, previous.x - next.x);
      sprite(image, segmentArt, segment.x, segment.y, radius, tangent, 2.05);
      if (words[i - 1]) card(words[i - 1], segment.x, segment.y, radius * .83, false);
    }
    sprite(image, head, x, y, radius, heading, breed ? 3.5 : 2.65);
  }
  function ocean(actor: AdventureActor) {
    const species = actor.speciesId ? getOceanSpecies(actor.speciesId) : undefined;
    if (species) {
      const rect = naturalOceanArt(species.artIndex);
      const isolated = images.oceanSprites?.get(species.artIndex);
      swimmingSprite(isolated??images.ocean[rect.atlas],isolated?{...rect,x:0,y:0}:rect,actor,actor.id,species.id,FISH_DRAW_FACTOR.ambient);
      const smaller = actor.radius < world.player.radius * .88;
      if (namedActors.has(actor.id)) label(`${smaller ? `+${actor.kind === "food" ? 1 : 3} 成长` : "比我大"} · ${species.en}`, actor.x, actor.y - actor.radius * 1.3 - 18, smaller ? "edible" : "larger");
    } else {
      const rect = naturalColorArt(actor.color);
      swimmingSprite(images.ocean[rect.atlas],rect,actor,actor.id,"fish-fry",2.6);
    }
  }
  function missionRing(actor: AdventureActor) {
    const hint = hinted && actor.choiceId === world.mission?.answer;
    ctx.save(); ctx.strokeStyle = hint ? "#ffe146" : "#ffffff"; ctx.lineWidth = hint ? 5 : 3; ctx.setLineDash(actor.id === followId ? [] : [6, 4]);
    ctx.beginPath(); ctx.arc(actor.x, actor.y, actor.radius + 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#fffdf7"; ctx.font = "18px sans-serif"; ctx.textAlign = "center"; ctx.fillText("🐚", actor.x, actor.y - actor.radius - 17); ctx.restore();
  }
  for (const actor of world.actors) {
    if (actor.consumed) continue;
    // Natural silhouettes can be taller or longer than the collision circle.
    // Fish perform their own source-proportion culling in swimmingSprite.
    if ((world.mode !== "fish" || actor.wordId) && !(world.mode === "snake" && actor.kind === "bot") && !inView(actor.x, actor.y, actor.radius * 2 + 45)) continue;
    if (world.mode === "snake" && actor.kind === "bot") {
      snake(actor.x, actor.y, actor.radius, actor.heading, actor.body ?? [], actor.color, actor.collectedWords ?? [], actor.breedId);
      if (inView(actor.x, actor.y, 60)) { const breed = snakeBreeds.find(item => item.id === actor.breedId); label(`${breed?.en ?? "Snake"} · ${actor.length ?? actor.body?.length ?? 1}`, actor.x, actor.y - actor.radius * 1.9 - 7, (actor.length ?? 1) > world.player.length ? "larger" : "edible", 12); }
    } else if (actor.wordId) card(actor.wordId,actor.x,actor.y,actor.remnant?Math.max(11,actor.radius):Math.max(22,actor.radius*1.3),!actor.remnant);
    else if (world.mode === "snake") sprite(images.snake, art.snake[(actor.color === "green" ? 2 : actor.color === "yellow" ? 1 : 0) + 3], actor.x, actor.y, actor.radius, actor.heading, 2.1);
    else ocean(actor);
    if (actor.kind === "mission") missionRing(actor);
  }
  const player = world.player;
  if (world.protectionUntil > world.elapsed) { ctx.fillStyle = "#c6f8ff66"; ctx.strokeStyle = "#fff8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(player.x, player.y, player.radius * 1.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  if (world.mode === "fish") {
    const species = getOceanSpecies(player.speciesId ?? oceanEvolution[player.stage].speciesId)!;
    const rect = naturalOceanArt(species.artIndex);
    const isolated = images.oceanSprites?.get(species.artIndex);
    swimmingSprite(isolated??images.ocean[rect.atlas],isolated?{...rect,x:0,y:0}:rect,player,"player",species.id,FISH_DRAW_FACTOR.player,true);
    label(`你 · ${species.en} · ${player.xp} 成长`, player.x, player.y - player.radius * 1.7 - 13, "neutral", 16);
  } else { snake(player.x, player.y, player.radius, player.heading, player.body, "red", player.collectedWords, player.breedId); label(`你 · ${player.length} 节`, player.x, player.y - player.radius * 1.8 - 8); }
  paintLabels();ctx.restore();
  const mw = 110, mh = 74, mx = width - mw - 14, my = 14;
  ctx.fillStyle = "#ffffffd9"; ctx.beginPath(); ctx.roundRect(mx, my, mw, mh, 12); ctx.fill(); ctx.fillStyle = "#8cced1"; ctx.fillRect(mx + 8, my + 8, mw - 16, mh - 16);
  for (const actor of world.actors) if (!actor.consumed && actor.kind === "mission") { ctx.fillStyle = "#fff9db"; ctx.beginPath(); ctx.arc(mx + 8 + actor.x / world.width * (mw - 16), my + 8 + actor.y / world.height * (mh - 16), 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = "#f38b36"; ctx.beginPath(); ctx.arc(mx + 8 + player.x / world.width * (mw - 16), my + 8 + player.y / world.height * (mh - 16), 4, 0, Math.PI * 2); ctx.fill();
  if (previewStart !== undefined && ctx.canvas?.dataset) {
    const timings=previewTimings.get(world)??[];timings.push(performance.now()-previewStart);
    if(timings.length>60)timings.shift();previewTimings.set(world,timings);
    if(timings.length%30===0)ctx.canvas.dataset.paintTiming=JSON.stringify({frames:timings.length,average:timings.reduce((a,b)=>a+b,0)/timings.length,max:Math.max(...timings)});
  }
  return camera;
}
