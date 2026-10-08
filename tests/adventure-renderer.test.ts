import assert from "node:assert/strict";
import test from "node:test";
import { paintAdventure, prepareOceanSprite, type AdventureImages } from "../components/adventure-renderer";
import { cameraForWorld, createAdventureWorld } from "../lib/adventure-engine";
import art from "../lib/adventure-art.json";
import ecologyArt from "../lib/ecology-art.json";
import { getAdventureWord, getOceanSpecies, oceanEvolution } from "../lib/adventure-catalog";
import { naturalOceanArt, naturalOceanAtlases } from "../lib/natural-ocean-art";
import { swimProfileFor } from "../lib/adventure-motion";
import type { OceanSceneryImages } from "../components/ocean-scenery-sprites";
import { getVisibleOceanScenery } from "../lib/ocean-scenery-layout";

type Matrix = [number, number, number, number, number, number];
const sceneryImages: OceanSceneryImages = {sprites:Array.from({length:4},(_,index)=>({image:{id:`reef-${index}`} as unknown as CanvasImageSource,w:480,h:400}))};

function canvasProbe() {
  const draws: unknown[][] = [], rotations: number[] = [], scales: number[][] = [], transforms: number[][] = [];
  const scenery: number[][] = [], gradients: number[][] = [];
  const drawMatrices: Matrix[] = [], matrixStack: Matrix[] = [];
  let matrix: Matrix = [1,0,0,1,0,0];
  const multiply = ([g,h,i,j,k,l]:Matrix) => {const [a,b,c,d,e,f]=matrix;matrix=[a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f];};
  const context = {
    clearRect() {}, fillRect() {}, save() {matrixStack.push([...matrix]);}, restore() {matrix=matrixStack.pop()!;}, scale(x: number,y: number) { scales.push([x,y]);multiply([x,0,0,y,0,0]); }, translate(x:number,y:number) {multiply([1,0,0,1,x,y]);}, strokeRect() {},
    beginPath() {}, closePath() {}, clip() {}, rect() {}, roundRect() {}, fill() {}, setLineDash() {}, arc() {}, stroke() {}, fillText() {}, transform(...next:Matrix) {transforms.push(next);multiply(next);}, moveTo() {}, lineTo() {},
    createLinearGradient(...points:number[]) { gradients.push(points); return {addColorStop() {}}; }, ellipse(...points:number[]) { scenery.push(points); }, bezierCurveTo() {}, quadraticCurveTo() {},
    rotate(angle: number) { rotations.push(angle);multiply([Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),0,0]); }, drawImage(...args: unknown[]) { draws.push(args);drawMatrices.push([...matrix]); },
  } as unknown as CanvasRenderingContext2D;
  const images = {...Object.fromEntries(["snake", "words", "sea", "snakeBreeds", "cards", "expandedWords"].map(id => [id, { id, width: 1536, height: 1024 }])),ocean:naturalOceanAtlases.map((atlas,index)=>({id:`ocean-${index}`,width:atlas.width,height:atlas.height}))} as unknown as AdventureImages;
  return { context, images, draws, drawMatrices, rotations, scales, transforms, scenery, gradients };
}

test("ocean scenery is below creatures, stays out of snake mode and does not change simulation state", () => {
  for (const mode of ["fish", "snake"] as const) {
    const world = createAdventureWorld(mode, 18), probe = canvasProbe();
    probe.images.scenery=sceneryImages;
    world.actors = [];
    cameraForWorld(world,800,600);
    const before = structuredClone(world);
    paintAdventure(probe.context, world, probe.images, 800, 600, false, undefined, true);
    assert.deepEqual(world, before, "scenery cannot consume RNG, move fish, or alter progress");
    assert.equal(probe.gradients.length > 0, mode === "fish");
    assert.equal(probe.scenery.length > 0, mode === "fish");
    if (mode === "fish") {
      const sea = probe.draws.find(call => call[0] === probe.images.sea)!;
      assert.deepEqual(sea.slice(5), [0,0,800,600], "the ocean backdrop keeps CSS-pixel scenery aligned at every camera zoom");
      assert.ok(probe.draws.some(call => probe.images.ocean.includes(call[0] as HTMLImageElement)), "original fish sprites remain visible above the scene");
      const plants=probe.draws.map((call,index)=>sceneryImages.sprites.some(sprite=>sprite.image===call[0])?index:-1).filter(index=>index>=0);
      assert.ok(plants.length>0,"the realistic plant images are used in fish mode");
      assert.ok(plants.every(index=>index>probe.draws.indexOf(sea)&&index<probe.draws.findIndex(call=>probe.images.ocean.includes(call[0] as HTMLImageElement))),"plant textures are layered between the backdrop and creatures");
    } else {
      assert.ok(!probe.draws.some(call=>sceneryImages.sprites.some(sprite=>sprite.image===call[0])),"snake mode does not draw ocean plant images");
    }
  }
});

test("real adventure camera movement and zoom project plant roots with the fish world rather than following the player",()=>{
  const world=createAdventureWorld("fish",22,50);world.actors=[];
  const frames:{camera:{x:number;y:number;zoom:number};roots:Map<string,{x:number;y:number}>}[]=[];
  for(const [width,height,dx,dy] of [[800,600,0,0],[800,600,83,61],[390,844,0,0]]) {
    world.player.x+=dx;world.player.y+=dy;
    const probe=canvasProbe();probe.images.scenery=sceneryImages;
    const camera=paintAdventure(probe.context,world,probe.images,width,height,false,undefined,true);
    const patches=getVisibleOceanScenery({scene:"adventure",width,height,cameraX:camera.x,cameraY:camera.y,zoom:camera.zoom});
    const plantIndices=probe.draws.map((call,index)=>sceneryImages.sprites.some(sprite=>sprite.image===call[0])?index:-1).filter(index=>index>=0);
    assert.ok(patches.length>0);assert.equal(plantIndices.length,patches.length,"reduced motion draws each fixed root exactly once");
    const roots=new Map<string,{x:number;y:number}>();
    for(const [index,patch] of patches.entries()) {
      const drawIndex=plantIndices[index],draw=probe.draws[drawIndex],[a,b,c,d,e,f]=probe.drawMatrices[drawIndex];
      const localX=Number(draw[5])+Number(draw[7])/2,localY=Number(draw[6])+Number(draw[8]);
      const root={x:a*localX+c*localY+e,y:b*localX+d*localY+f};
      assert.ok(Math.abs(root.x-(patch.worldX-camera.x)*camera.zoom)<1e-8,`${patch.id} uses the caller's exact horizontal projection`);
      assert.ok(Math.abs(root.y-(patch.worldY-camera.y)*camera.zoom)<1e-8,`${patch.id} uses the caller's exact vertical projection`);
      roots.set(patch.id,root);
    }
    frames.push({camera,roots});
  }
  const first=frames[0],moved=frames[1],shared=[...first.roots.keys()].filter(id=>moved.roots.has(id));
  assert.ok(shared.length>0,"the camera movement retains some of the same fixed seabed patches");
  for(const id of shared) {
    const from=first.roots.get(id)!,to=moved.roots.get(id)!;
    assert.ok(Math.abs(to.x-from.x+(moved.camera.x-first.camera.x)*first.camera.zoom)<1e-8);
    assert.ok(Math.abs(to.y-from.y+(moved.camera.y-first.camera.y)*first.camera.zoom)<1e-8);
  }
  assert.notEqual(frames[2].camera.zoom,first.camera.zoom,"the phone exercises the real reduced camera zoom");
});

test("snake body displays the consumed word pictures in head-to-tail order and follows vertical turns", () => {
  const world = createAdventureWorld("snake", 1);
  world.actors = [];
  world.player.body = [{ x: 2100, y: 1400 }, { x: 2100, y: 1431 }, { x: 2100, y: 1462 }];
  world.player.collectedWords = ["cat", "toy-car"];
  const probe = canvasProbe();
  paintAdventure(probe.context, world, probe.images, 800, 600, false);
  const cards = probe.draws.filter(call => call[0] === probe.images.words);
  assert.equal(cards.length, 2);
  // The painter lays the tail down first, but each word remains on its own segment.
  assert.deepEqual(cards[0].slice(1, 5), [1280, 768, 256, 256]);
  assert.deepEqual(cards[1].slice(1, 5), [0, 0, 256, 256]);
  assert.ok(Number(cards[0][6]) > Number(cards[1][6]));
  assert.ok(probe.rotations.some(angle => Math.abs(angle + Math.PI / 2) < 1e-9));
});

test("off-camera food is culled while the visible tail of an off-camera snake is retained", () => {
  const world = createAdventureWorld("snake", 2);
  world.actors = [
    { id: "near", x: 2100, y: 1350, radius: 15, heading: 0, kind: "food", color: "yellow", wordId: "ball" },
    { id: "far", x: 50, y: 50, radius: 15, heading: 0, kind: "food", color: "yellow", wordId: "doll" },
    { id: "tail-visible", x: 70, y: 70, radius: 14, heading: 0, kind: "bot", color: "green", body: [{ x: 70, y: 70 }, { x: 2100, y: 1450 }] },
  ];
  const probe = canvasProbe();
  const camera = paintAdventure(probe.context, world, probe.images, 800, 600, false);
  const cards = probe.draws.filter(call => call[0] === probe.images.words);
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].slice(1, 5), [1024, 512, 256, 256]);
  const snakes = probe.draws.filter(call => call[0] === probe.images.snake);
  assert.equal(snakes.length, 1, "the off-camera bot retains its visible green tail");
  assert.equal(probe.draws.filter(call => call[0] === probe.images.snakeBreeds).length,1,"the child's new corn-snake head is visible");
  assert.deepEqual(snakes[0].slice(1, 5), [art.snake[5].x, art.snake[5].y, art.snake[5].w, art.snake[5].h]);
  const sea = probe.draws.find(call => call[0] === probe.images.sea)!;
  assert.ok(Number(sea[3]) < probe.images.sea.width);
  assert.ok(Number(sea[4]) < probe.images.sea.height);
  assert.equal(sea[5], camera.x);
  assert.equal(sea[6], camera.y);
});

test("each growing fish uses its authored atlas rectangle without distorting the image ratio", () => {
  for (let stage = 0; stage < oceanEvolution.length; stage++) {
    const world = createAdventureWorld("fish", 3, oceanEvolution[stage].xp);
    world.actors = [];
    world.player.stage = stage;
    const probe = canvasProbe();
    paintAdventure(probe.context, world, probe.images, 800, 600, false, undefined, true);
    const species = getOceanSpecies(oceanEvolution[stage].speciesId)!;
    const expected = naturalOceanArt(species.artIndex);
    const fish = probe.draws.filter(call => call[0] === probe.images.ocean[expected.atlas]);
    assert.equal(fish.length, 1);
    assert.deepEqual(fish[0].slice(1, 5), [expected.x, expected.y, expected.w, expected.h]);
    assert.ok(Math.abs(Number(fish[0][8]) / Number(fish[0][7]) - expected.h / expected.w) < 1e-9);
  }
});

test("scattered plants, school cards and transport cards retain their actual image sources", () => {
  const world = createAdventureWorld("snake", 21);
  world.actors = ["flower","book","bus"].map((wordId,index) => ({id:`card-${index}`,kind:"food" as const,color:"yellow" as const,x:world.player.x+(index-1)*85,y:world.player.y-80,radius:24,heading:0,wordId}));
  const probe = canvasProbe(); paintAdventure(probe.context,world,probe.images,800,600,false);
  const source = getAdventureWord("book")!.imageRect!;
  const school = probe.draws.filter(call=>call[0]===probe.images.expandedWords);
  assert.equal(school.length,1); assert.deepEqual(school[0].slice(1,5),[source.x,source.y,source.width,source.height]);
  const extra = probe.draws.filter(call=>call[0]===probe.images.cards);
  assert.equal(extra.length,2);
  for (const [index,id] of ["flower","bus"].entries()) { const rect=ecologyArt.cards[getAdventureWord(id)!.spriteIndex]; assert.deepEqual(extra[index].slice(1,5),[rect.x,rect.y,rect.w,rect.h]); }
});

test("active fish rendering changes tail geometry while preserving atlas bounds and freezes when paused",()=>{
  const world=createAdventureWorld("fish",4,50);world.actors=[];
  const first=canvasProbe();paintAdventure(first.context,world,first.images,800,600,false);
  world.elapsed=.08;world.player.x+=12;
  const second=canvasProbe();paintAdventure(second.context,world,second.images,800,600,false);
  const species=getOceanSpecies(world.player.speciesId!)!,rect=naturalOceanArt(species.artIndex),fish=second.draws.filter(c=>c[0]===second.images.ocean[rect.atlas]);
  const tailEnd=1-swimProfileFor(species.id).headLock;
  assert.equal(fish.length,Math.ceil(18*tailEnd)*6+1,"the rear body and fin cells share exact edges, while the face remains stable");
  assert.ok(Math.abs(Number(fish.at(-1)![3])-rect.w*(1-tailEnd))<1e-9);
  for(const call of fish){assert.ok(Number(call[1])>=rect.x&&Number(call[1])+Number(call[3])<=rect.x+rect.w+1e-9);assert.ok(Number(call[2])>=rect.y&&Number(call[2])+Number(call[4])<=rect.y+rect.h+1e-9);assert.ok(Number(call[8])>0);}
  assert.notDeepEqual(second.transforms,first.transforms,"the actual Canvas body transforms change, not just the sprite's position");
  const paused=canvasProbe();paintAdventure(paused.context,world,paused.images,800,600,false);
  assert.deepEqual(paused.draws.filter(c=>c[0]===paused.images.ocean[rect.atlas]).map(c=>c.slice(1)),fish.map(c=>c.slice(1)));
  assert.deepEqual(paused.transforms,second.transforms,"pause freezes the actual bending matrices as well as fin rows");
});

test("natural fish keep their silhouette while turning through both facing directions",()=>{
  const world=createAdventureWorld("fish",14,50);world.actors=[];
  let sawReverse=false;
  for(let frame=0;frame<90;frame++){
    world.elapsed+=1/60;world.player.heading=frame/90*Math.PI*2;
    const probe=canvasProbe();paintAdventure(probe.context,world,probe.images,800,600,false);
    const scales=probe.scales.slice(1);
    assert.ok(scales.every(([x,y])=>Math.abs(x)===1&&Math.abs(y)===1),"turning never squeezes the photo to zero height");
    if(scales.some(([,y])=>y<0))sawReverse=true;
    const rect=naturalOceanArt(getOceanSpecies(world.player.speciesId!)!.artIndex);
    assert.ok(probe.draws.some(call=>call[0]===probe.images.ocean[rect.atlas]));
  }
  assert.ok(sawReverse);
});

test("fin cells share every edge and join the fixed face without texture steps",()=>{
  const point=(m:number[],x:number,y:number)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
  const same=(a:number[],b:number[])=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-9));
  for (const xp of [50,1650]) {
    const world=createAdventureWorld("fish",24,xp);world.actors=[];
    const initial=canvasProbe();paintAdventure(initial.context,world,initial.images,800,600,false);
    for(let frame=0;frame<18;frame++){
      world.elapsed+=.08;world.player.x+=8;
      const probe=canvasProbe();paintAdventure(probe.context,world,probe.images,800,600,false);
      const tailEnd=1-swimProfileFor(world.player.speciesId!).headLock,count=Math.ceil(18*tailEnd);
      for(let col=0;col<count;col++)for(let row=0;row<3;row++){
        const a=probe.transforms[col*6+row*2],b=probe.transforms[col*6+row*2+1];
        same(point(a,0,0),point(b,0,0));same(point(a,1,1),point(b,1,1));
        if(col+1<count){const next=probe.transforms[(col+1)*6+row*2],nextB=probe.transforms[(col+1)*6+row*2+1];same(point(a,1,0),point(next,0,0));same(point(a,1,1),point(nextB,0,1));}
        else {const rect=naturalOceanArt(getOceanSpecies(world.player.speciesId!)!.artIndex),w=world.player.radius*3.2,h=w*rect.h/rect.w;const edge=[0,.29,.73,1];same(point(a,1,0),[(tailEnd-.5)*w,(edge[row]-.5)*h]);same(point(a,1,1),[(tailEnd-.5)*w,(edge[row+1]-.5)*h]);}
      }
    }
  }
});

test("feeding moves the original lower face, stays inside every growth-form crop, and freezes on pause",()=>{
  for(const stage of oceanEvolution) {
    const world=createAdventureWorld("fish",24,stage.xp);world.actors=[];
    const first=canvasProbe();paintAdventure(first.context,world,first.images,800,600,false);
    world.elapsed=.16;
    const idle=canvasProbe();paintAdventure(idle.context,world,idle.images,800,600,false);
    world.player.ateAt=0;
    const bite=canvasProbe();paintAdventure(bite.context,world,bite.images,800,600,false);
    assert.notDeepEqual([bite.transforms,bite.scales,bite.rotations],[idle.transforms,idle.scales,idle.rotations],`${stage.speciesId} has an eating pose`);
    const rect=naturalOceanArt(getOceanSpecies(stage.speciesId)!.artIndex);
    const fish=bite.draws.filter(c=>c[0]===bite.images.ocean[rect.atlas]);
    for(const call of fish) {
      assert.ok(Number(call[1])>=rect.x&&Number(call[1])+Number(call[3])<=rect.x+rect.w+1e-9);
      assert.ok(Number(call[2])>=rect.y&&Number(call[2])+Number(call[4])<=rect.y+rect.h+1e-9);
    }
    const paused=canvasProbe();paintAdventure(paused.context,world,paused.images,800,600,false);
    assert.deepEqual(paused.transforms,bite.transforms);assert.deepEqual(paused.scales,bite.scales);assert.deepEqual(paused.rotations,bite.rotations);
    const still=canvasProbe();paintAdventure(still.context,world,still.images,800,600,false,undefined,true);
    assert.equal(still.draws.filter(c=>c[0]===still.images.ocean[rect.atlas]).length,1,"reduced motion retains a single original image");
  }
});

test("repaired late forms render from an isolated sprite in both ordinary fish and player paths",()=>{
  for (const index of [85,86,87,88,90,91,92]) {
    const rect=naturalOceanArt(index),calls:unknown[][]=[],regions:number[][]=[];
    let clipRule:string|undefined;
    const image={id:"original"} as HTMLImageElement;
    const points:number[][]=[];
    const context={save(){},restore(){},beginPath(){},moveTo(x:number,y:number){points.push([x,y]);},lineTo(x:number,y:number){points.push([x,y]);},closePath(){},rect(...r:number[]){regions.push(r);},clip(rule:string){clipRule=rule;},drawImage(...args:unknown[]){calls.push(args);}};
    const isolated={width:0,height:0,getContext:()=>context} as unknown as HTMLCanvasElement;
    assert.equal(prepareOceanSprite(image,rect,()=>isolated),isolated);
    assert.equal(clipRule,"evenodd");assert.deepEqual(regions[0],[0,0,rect.w,rect.h]);
    assert.deepEqual(regions.slice(1),rect.exclusions.map(r=>[r.x,r.y,r.w,r.h]));
    assert.deepEqual(points,rect.exclusionPaths.flat().map(p=>[p.x,p.y]));
    assert.deepEqual(calls,[[image,rect.x,rect.y,rect.w,rect.h,0,0,rect.w,rect.h]]);
    const stage=oceanEvolution.find(s=>getOceanSpecies(s.speciesId)!.artIndex===index)!;
    const world=createAdventureWorld("fish",24,stage.xp);world.actors=[{id:"neighbor",kind:"food",color:"blue",radius:40,heading:0,x:world.player.x+100,y:world.player.y,speciesId:stage.speciesId}];
    const probe=canvasProbe();probe.images.oceanSprites=new Map([[index,isolated]]);
    paintAdventure(probe.context,world,probe.images,800,600,false,undefined,true);
    assert.equal(probe.draws.filter(c=>c[0]===isolated).length,2);
    assert.ok(!probe.draws.some(c=>c[0]===probe.images.ocean[rect.atlas]),"neighbour silhouettes cannot reappear during gameplay");
  }
});
