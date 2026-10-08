import test from "node:test";
import assert from "node:assert/strict";
import {advanceSwimState,createSwimState,fishCenterOffset,fishFinRows,fishStrip,sampleSwim,softBodyRow,swimProfileFor,swimStripCount} from "../lib/adventure-motion";

test("swimming bends the tail while the face stays stable, with continuous strip joins",()=>{
  const profile=swimProfileFor("goldfish"),state=advanceSwimState(createSwimState("fish-a",0),{dt:.08,heading:.3,speed:150,width:90,active:true,reducedMotion:false},profile),motion=sampleSwim(state,profile,90);
  assert.equal(fishCenterOffset(1,profile,motion),0);
  assert.equal(fishCenterOffset(.85,profile,motion),0);
  assert.ok(Math.abs(fishCenterOffset(0,profile,motion))>.1);
  for(let i=0;i<17;i++){const a=fishStrip(i,18,90,profile,motion),b=fishStrip(i+1,18,90,profile,motion);assert.ok(Math.abs(a.y0+a.width*a.shearY-b.y0)<1e-10);}
  assert.notEqual(createSwimState("fish-a",0).phase,createSwimState("fish-b",0).phase);
});

test("slow fish have a visible tail stroke and a travelling body wave instead of subpixel jitter",()=>{
  const profile=swimProfileFor("goldfish"),width=40;
  let state=createSwimState("slow-fish",0);
  const tails:number[]=[],middles:number[]=[],faces:number[]=[],finHeights:number[]=[];
  for(let frame=0;frame<240;frame++){
    state=advanceSwimState(state,{dt:1/60,heading:0,speed:18,width,active:true,reducedMotion:false},profile);
    const motion=sampleSwim(state,profile,width);
    tails.push(fishCenterOffset(0,profile,motion));middles.push(fishCenterOffset(.35,profile,motion));faces.push(fishCenterOffset(.86,profile,motion));
    finHeights.push(fishFinRows(.4,25,profile,motion)[0].height);
  }
  const range=(values:number[])=>Math.max(...values)-Math.min(...values);
  assert.ok(range(tails)>width*.1,"even slow fish have a complete visible tail stroke");
  assert.ok(range(middles)>width*.025,"the wave travels through the rear body");
  assert.ok(faces.every(y=>y===0),"the face retains its natural shape");
  assert.ok(range(finHeights)>1,"existing fin pixels flex from a stable root");
  assert.notEqual(createSwimState("fish-1",0).tempo,createSwimState("fish-2",0).tempo);
  const individuals=Array.from({length:16},(_,i)=>createSwimState(`food-${i+1}`,0));
  assert.ok(Math.max(...individuals.map(s=>s.phase))-Math.min(...individuals.map(s=>s.phase))>4,"neighbouring IDs do not beat their tails almost in sync");
  assert.ok(Math.max(...individuals.map(s=>s.tempo))-Math.min(...individuals.map(s=>s.tempo))>.1);
  assert.equal(swimProfileFor("manta-ray").family,"flap");
  assert.equal(swimProfileFor("seal").family,"tail");
});
test("swimming phase freezes on pause; upright travel stays visible through turns",()=>{
  const p=swimProfileFor("goldfish");let state=createSwimState("player",Math.PI/2);
  for(let n=0;n<120;n++)state=advanceSwimState(state,{dt:1/60,heading:Math.PI/2,speed:150,width:80,active:true,reducedMotion:false},p);
  assert.ok(Math.abs(sampleSwim(state,p,80).bank)>.99,"vertical travel cannot flatten a fish forever");
  assert.equal(advanceSwimState(state,{dt:.1,heading:1,speed:150,width:80,active:false,reducedMotion:false},p),state);
  const still=sampleSwim(state,p,80,true);assert.deepEqual([still.amplitude,still.curve,still.bob,still.pulse],[0,0,0,0]);assert.equal(swimStripCount(80,true,true),1);
});
test("jellyfish and octopus animate lower soft parts without pulling their eyes into a tail",()=>{
  for(const species of ["small-jellyfish","octopus"]){const p=swimProfileFor(species),m=sampleSwim(createSwimState(species,0),p,100);assert.ok(p.upright);assert.equal(softBodyRow(.2,p,m,100,130).dx,0);assert.notEqual(softBodyRow(.9,p,m,100,130).dx,0);}
  assert.equal(swimProfileFor("eel").family,"wave");assert.equal(swimProfileFor("small-starfish").family,"drift");
});
