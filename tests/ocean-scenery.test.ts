import assert from "node:assert/strict";
import test from "node:test";
import { paintOceanScenery, type OceanSceneryOptions } from "../components/ocean-scenery";

function sceneryProbe() {
  const calls: {method:string;args:unknown[]}[] = [], alpha: number[] = [];
  const context = {globalAlpha:.6} as CanvasRenderingContext2D;
  for (const method of ["beginPath","closePath","fill","stroke","fillRect","moveTo","lineTo","ellipse","bezierCurveTo","quadraticCurveTo"] as const) {
    Object.assign(context, {[method]:(...args:unknown[]) => calls.push({method,args})});
  }
  context.save = () => {alpha.push(context.globalAlpha);};
  context.restore = () => {context.globalAlpha = alpha.pop()!;};
  context.createLinearGradient = (...args:number[]) => {
    calls.push({method:"gradient",args});
    return {addColorStop:(...stops:unknown[]) => calls.push({method:"stop",args:stops})} as CanvasGradient;
  };
  return {context,calls};
}

const scene: OceanSceneryOptions = {width:800,height:600,cameraX:1700,cameraY:1100,elapsed:0,islands:true};

test("the anchored scenery scrolls with the camera and has deterministic pause/reduced-motion poses", () => {
  const options = Object.freeze({...scene}), first = sceneryProbe(), paused = sceneryProbe();
  paintOceanScenery(first.context,options); paintOceanScenery(paused.context,options);
  assert.deepEqual(first.calls,paused.calls,"identical camera and simulation time keep every plant and light still");
  const moving = sceneryProbe(); paintOceanScenery(moving.context,{...options,cameraX:options.cameraX+60});
  assert.notDeepEqual(moving.calls.filter(c=>c.method==="ellipse"),first.calls.filter(c=>c.method==="ellipse"),"reefs move relative to the viewport rather than being attached to the player");
  const reduced = sceneryProbe(), later = sceneryProbe();
  paintOceanScenery(reduced.context,{...options,reducedMotion:true});
  paintOceanScenery(later.context,{...options,elapsed:999,reducedMotion:true});
  assert.deepEqual(later.calls,reduced.calls,"reduced motion removes all time-driven scenery changes");
  assert.equal(first.context.globalAlpha,.6,"scenery must preserve the caller's compositing state");
});

test("scenery has a fixed draw budget across wide viewports and keeps reef geometry in the water", () => {
  const wide = sceneryProbe(), huge = sceneryProbe();
  paintOceanScenery(wide.context,{...scene,width:2560});
  paintOceanScenery(huge.context,{...scene,width:25600});
  assert.equal(huge.calls.length,wide.calls.length,"viewport width cannot grow per-frame scenery work indefinitely");
  assert.ok(huge.calls.length<3000,"scenery leaves a bounded draw budget for animated fish");
  const phone = sceneryProbe(), horizon = 337;
  paintOceanScenery(phone.context,{...scene,width:390,height:844,surfaceY:horizon,islands:false});
  const kelp = phone.calls.filter(c=>c.method==="bezierCurveTo").map(c=>c.args as number[]);
  assert.ok(kelp.length>0);
  assert.ok(kelp.every(points=>points.filter((_,i)=>i%2===1).every(y=>y>=horizon)),"reefs cannot appear above the ocean surface");
  assert.ok(kelp.some(points=>points.at(-1)!<550),"phone kelp remains visible above the bottom controls");
  assert.ok(phone.calls.some(c=>c.method==="ellipse" && Number(c.args[1])>horizon && Number(c.args[1])<550),"edge reef and coral ledges remain visible above the phone controls");
  for (const call of huge.calls) for (const value of call.args) if(typeof value==="number") assert.ok(Number.isFinite(value));
  const empty = sceneryProbe();
  paintOceanScenery(empty.context,{...scene,width:0});
  paintOceanScenery(empty.context,{...scene,surfaceY:scene.height});
  assert.equal(empty.calls.length,0,"no water or zero viewport needs no scenery work");
});
