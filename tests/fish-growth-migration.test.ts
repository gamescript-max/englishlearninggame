import test from "node:test";
import assert from "node:assert/strict";
import { createAdventureProgress, getCurrentAdventureTask, recordAdventureChoice, saveAdventureGrowth, validateAdventureProgress } from "../lib/adventure-progress";
import { collectOceanPoints } from "../lib/ocean-score";
import { createAdventureWorld } from "../lib/adventure-engine";

function oldBackup() {
  let p=createAdventureProgress();
  const task=getCurrentAdventureTask(p,"fish");
  p=recordAdventureChoice(p,"fish",task,task.answer,10);
  p=saveAdventureGrowth(p,"fish",19,["cat"],0,10,1);
  p.oceanScore=collectOceanPoints(p.oceanScore,"cat","old-card");
  const {fishGrowthVersion: _version,fishRouteVersion: _route,...legacy}=p;
  void _version; void _route;
  return legacy;
}
test("legacy card and target points become growth once, retaining learning and treasure records",()=>{
  const old=oldBackup(),migrated=validateAdventureProgress(old);
  assert.equal(migrated.modes.fish.xp,34);
  assert.equal(migrated.fishGrowthVersion,2);
  assert.deepEqual(migrated.modes.fish.unlockedStages,[0,1]);
  assert.deepEqual(migrated.records,old.records);
  assert.deepEqual(migrated.oceanTreasure,old.oceanTreasure);
  assert.deepEqual(validateAdventureProgress(JSON.parse(JSON.stringify(migrated))),migrated);
  assert.equal(createAdventureWorld("fish",1,migrated.modes.fish.xp).player.xp,34);
});
test("older backups without a score ledger do not receive retrospective task points",()=>{
  const {oceanScore: _score,...old}=oldBackup();void _score;
  assert.equal(validateAdventureProgress(old).modes.fish.xp,19);
});
test("old six- and twenty-form prefixes migrate while forged new-version unlocks fail",()=>{
  for (const size of [6,20]) {
    const old=oldBackup();old.modes.fish.xp=1_000_000_000;old.modes.fish.unlockedStages=Array.from({length:size},(_,i)=>i);
    old.oceanScore={cardCount:1_000_000_000,taskBaseline:1,recentPickups:[]};
    const migrated=validateAdventureProgress(old);
    assert.equal(migrated.modes.fish.xp,6_000_000_000);
    assert.equal(migrated.modes.fish.unlockedStages.length,28);
    assert.deepEqual(validateAdventureProgress(migrated),migrated);
    assert.equal(createAdventureWorld("fish",1,migrated.modes.fish.xp).player.xp,migrated.modes.fish.xp);
    const forged=structuredClone(migrated);forged.modes.fish.unlockedStages=old.modes.fish.unlockedStages;
    assert.throws(()=>validateAdventureProgress(forged));
  }
  const damaged=oldBackup();damaged.modes.fish.xp=20_000_000_000;damaged.modes.fish.unlockedStages=Array.from({length:20},(_,i)=>i);
  assert.throws(()=>validateAdventureProgress(damaged));
});
test("invalid old scores or missing task records are rejected before any growth transfer",()=>{
  const damaged=oldBackup();damaged.oceanScore.taskBaseline=2;
  assert.throws(()=>validateAdventureProgress(damaged));
  const missing=oldBackup();missing.records=[];
  assert.throws(()=>validateAdventureProgress(missing));
});

test("the largest valid pruned legacy ledger survives migration, import and world restart",()=>{
  const old=oldBackup(),fish=old.modes.fish;
  fish.xp=1_000_000_000;fish.unlockedStages=Array.from({length:20},(_,i)=>i);
  fish.completedTasks=fish.firstChoices=1_000_000_000;fish.firstCorrect=0;fish.taskIndex=1_000_000_000%12;fish.round=Math.floor(1_000_000_000/12);
  old.records=[];old.oceanScore={cardCount:1_000_000_000,taskBaseline:0,recentPickups:[]};
  const migrated=validateAdventureProgress(old);
  assert.equal(migrated.modes.fish.xp,16_000_000_000);
  assert.equal(validateAdventureProgress(JSON.parse(JSON.stringify(migrated))).modes.fish.xp,16_000_000_000);
  assert.equal(createAdventureWorld("fish",1,migrated.modes.fish.xp).player.xp,16_000_000_000);
});

test("old twenty-four-form growth retains its XP and gains only eligible appended forms",()=>{
  for(const xp of [0,30000,37999,38000,47999,48000,60000,75000,16_000_000_000]) {
    const current=saveAdventureGrowth(createAdventureProgress(),"fish",xp,[],0,10,1);
    const {fishRouteVersion:_route,...old}=structuredClone(current);void _route;
    old.modes.fish.unlockedStages=old.modes.fish.unlockedStages.slice(0,24);
    const migrated=validateAdventureProgress(old);
    assert.equal(migrated.modes.fish.xp,xp);
    assert.equal(migrated.fishRouteVersion,2);
    assert.deepEqual(migrated.modes.fish.unlockedStages,current.modes.fish.unlockedStages);
    assert.deepEqual(validateAdventureProgress(migrated),migrated);
  }
});

test("new marked routes reject truncated, reordered, duplicated and prematurely unlocked growth",()=>{
  const valid=saveAdventureGrowth(createAdventureProgress(),"fish",75000,[],0,10,1);
  for(const changed of [valid.modes.fish.unlockedStages.slice(0,24),[...valid.modes.fish.unlockedStages].reverse(),[...valid.modes.fish.unlockedStages.slice(0,-1),26]]) {
    const corrupt=structuredClone(valid);corrupt.modes.fish.unlockedStages=changed;
    assert.throws(()=>validateAdventureProgress(corrupt));
  }
  const early=createAdventureProgress();early.modes.fish.unlockedStages=[0,1];assert.throws(()=>validateAdventureProgress(early));
  const {fishGrowthVersion:_growth,...inconsistent}=valid;void _growth;assert.throws(()=>validateAdventureProgress(inconsistent));
});
