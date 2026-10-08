import test from "node:test";
import assert from "node:assert/strict";
import { createProgress, startRun } from "../lib/progress";
import { startLearning, answerLearning, finishLearning } from "../lib/learning-state";
import { diagnosticActivity, learningUnits, recallActivity } from "../lib/learning-content";
import { getCurrentMapDestination } from "../lib/world-map";

test("the fox starts on animals and follows the newest active task across both learning systems",()=>{
  let p=createProgress(); assert.deepEqual(getCurrentMapDestination(p),{id:"animals",at:0,state:"start"});
  p=startRun(p,"animals-1",100);
  const activity=learningUnits[4].activities[0];
  p.learning=startLearning(p.learning,activity.id,activity.tasks.map(task=>task.id),200);
  assert.equal(getCurrentMapDestination(p).id,"weather");
  p.activeRun!.lastActiveAt=300; assert.equal(getCurrentMapDestination(p).id,"animals");
});
test("a newer completion beats a stale pause, and repeat games use their last completion time",()=>{
  const p=startRun(createProgress(),"animals-1",100);
  p.learning.completed["family-listen"]={at:200,independent:8,total:8};
  assert.deepEqual(getCurrentMapDestination(p),{id:"family",at:200,state:"recent"});
  p.completed["animals-1"]={completedAt:50,lastCompletedAt:400,completions:2};
  assert.equal(getCurrentMapDestination(p).id,"animals"); assert.equal(getCurrentMapDestination(p).at,400);
});
test("the four standalone games place the fox on their own island",()=>{
  for(const [order,id] of [[11,"bubbles"],[12,"delivery"],[13,"connections"],[14,"stars"]] as const){
    const p=createProgress();p.completed[`animals-${order}`]={completedAt:10,lastCompletedAt:20,completions:1};
    assert.equal(getCurrentMapDestination(p).id,id);
  }
});
test("mixed recall follows the current word and keeps the last word after settlement",()=>{
  const p=createProgress(), tasks=[recallActivity.tasks.find(t=>t.id==="recall-cat")!,recallActivity.tasks.find(t=>t.id==="recall-sun")!];
  p.learning=startLearning(p.learning,"spaced-recall",tasks.map(t=>t.id),100);
  assert.equal(getCurrentMapDestination(p).id,"animals");
  p.learning=answerLearning(p.learning,tasks[0],tasks[0].answer!,undefined,200).progress;
  assert.equal(getCurrentMapDestination(p).id,"weather");
  p.learning=answerLearning(p.learning,tasks[1],tasks[1].answer!,undefined,300).progress;
  assert.equal(getCurrentMapDestination(p).id,"weather");
  p.learning=finishLearning(p.learning,false,400);
  assert.deepEqual(getCurrentMapDestination(p),{id:"weather",at:400,state:"recent"});
});
test("daily speaking uses the selected theme; observations and story activities have explicit locations",()=>{
  const p=createProgress(), weather=learningUnits[4].activities.find(a=>a.skill==="speaking")!;
  p.learning=startLearning(p.learning,"daily-speaking",[weather.tasks[0].id],100);
  assert.equal(getCurrentMapDestination(p).id,"weather");
  for(const [activity,id] of [["story-cat-blue-ball","animals"],["story-family-picnic","family"],["story-rainy-school-day","school"],["phonics-at","school"],["a1-readiness","school"]] as const){
    p.learning.active=null;p.learning.completed={};p.learning.completed[activity]={at:200,independent:1,total:1};
    assert.equal(getCurrentMapDestination(p).id,id);
  }
  assert.equal(p.learning.completed["school-listen"],undefined,"observations do not complete school lessons");
});
test("wrong answers and finished-but-unsettled sessions remain on the current island",()=>{
  const p=createProgress(),activity=learningUnits[1].activities[0],task=activity.tasks[0];
  p.learning=startLearning(p.learning,activity.id,[task.id],100);
  p.learning=answerLearning(p.learning,task,"wrong",undefined,200).progress;
  assert.equal(getCurrentMapDestination(p).at,200);assert.equal(getCurrentMapDestination(p).id,"school");
  p.learning=answerLearning(p.learning,task,task.answer!,undefined,300).progress;
  assert.equal(getCurrentMapDestination(p).state,"active");assert.equal(getCurrentMapDestination(p).id,"school");
});
test("equal timestamps have stable active priority and unknown data safely falls back",()=>{
  const p=startRun(createProgress(),"animals-1",100);
  p.learning=startLearning(p.learning,diagnosticActivity.id,[diagnosticActivity.tasks[0].id],100);
  assert.equal(getCurrentMapDestination(p).id,"school");
  p.learning.completed["family-listen"]={at:100,independent:1,total:1};
  assert.equal(getCurrentMapDestination(p).id,"school");
  const empty=createProgress();empty.learning.completed.unknown={at:500,independent:1,total:1};
  assert.equal(getCurrentMapDestination(empty).id,"animals");
});
