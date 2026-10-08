import test from "node:test";
import assert from "node:assert/strict";
import { collectOceanCard, createOceanTreasure, openOceanTreasure, oceanStickerIds, validateOceanTreasure } from "../lib/ocean-treasure";
import { createProgress, serializeBackup as exportBackup, parseBackup as importBackup } from "../lib/progress";

function earnedBoxes(count:number) {
  let state=createOceanTreasure();
  for(let i=0;i<count*5;i++)state=collectOceanCard(state,["cat","dog","tree","bus","apple"][i%5],`pickup-${i}`);
  return state;
}
test("five distinct English cards earn a box; duplicates and repeated pickup receipts cannot earn twice",()=>{
  let state=collectOceanCard(createOceanTreasure(),"cat","first");
  state=collectOceanCard(state,"cat","duplicate-word");assert.equal(state.creditedCards,1);
  for(const id of ["dog","tree","bus","apple"])state=collectOceanCard(state,id,id);
  assert.equal(state.earned,1);assert.deepEqual(state.roundCards,[]);
  assert.equal(collectOceanCard(state,"cat","first"),state,"same physical card cannot count again after the set resets");
  state=collectOceanCard(state,"cat","next-round-cat");assert.equal(state.roundCards.length,1);
  assert.equal(collectOceanCard(state,"unknown-word","bad"),state);assert.equal(collectOceanCard(state,"dog",""),state);
});
test("boxes are saved once per displayed ticket; all eight stickers arrive before repeats",()=>{
  let state=earnedBoxes(10);const seed=20261005;
  state=openOceanTreasure(state,seed,0);const first=state;
  assert.equal(openOceanTreasure(state,seed,0),state,"double tap on the same displayed ticket is idempotent");
  for(let i=1;i<8;i++)state=openOceanTreasure(state,seed,i);
  assert.equal(Object.keys(state.prizes).length,8);assert.ok(Object.values(state.prizes).every(n=>n===1));
  state=openOceanTreasure(state,seed,8);assert.equal(state.prizes[first.lastPrize!],2);
  state=openOceanTreasure(state,seed,9);assert.equal(openOceanTreasure(state,seed,10),state,"no box without five earned cards");
  assert.deepEqual(validateOceanTreasure(state,seed),state);assert.deepEqual([...Object.keys(state.prizes)].sort(),[...oceanStickerIds].sort());
});
test("backup restores a partial set, unopened boxes and fixed prizes; old profiles start without retroactive tickets",()=>{
  const progress=createProgress(),seed=progress.adventure.modes.fish.seed;
  progress.adventure.oceanTreasure=collectOceanCard(openOceanTreasure(earnedBoxes(2),seed,0),"flower","partial");
  const restored=importBackup(exportBackup(progress));assert.deepEqual(restored.adventure.oceanTreasure,progress.adventure.oceanTreasure);
  assert.equal(restored.stars,progress.stars);assert.equal(restored.adventure.modes.fish.xp,0);
  const old=JSON.parse(exportBackup(progress));delete old.progress.adventure.oceanTreasure;
  assert.deepEqual(importBackup(JSON.stringify(old)).adventure.oceanTreasure,createOceanTreasure());
});
test("invalid box balances, unknown words, inconsistent stickers and corrupt fields are rejected",()=>{
  const seed=20261005,valid=openOceanTreasure(earnedBoxes(2),seed,0);
  for(const mutation of [{opened:3},{earned:200},{creditedCards:1},{roundCards:["cat","cat"]},{roundCards:["not-a-word"]},{lastPrize:"blue-whale"},{prizes:{goldfish:99}},{recentPickups:["a","a"]},{extraField:true}]) {
    assert.throws(()=>validateOceanTreasure({...valid,...mutation},seed));
  }
  assert.throws(()=>validateOceanTreasure(null,seed));
});
