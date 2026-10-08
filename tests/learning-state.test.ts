import test from "node:test";
import assert from "node:assert/strict";
import { createLearningProgress, recordRecall, recallDueAt, dueRecallWords, startLearning, answerLearning, finishLearning, markLearningHint } from "../lib/learning-state";
import { createProgress, serializeBackup, parseBackup, startRun, submitAnswer } from "../lib/progress";
import { learningUnits, diagnosticActivity, allLearningWords, learningActivities, phonicsActivities } from "../lib/learning-content";
import audio from "../lib/audio-manifest.json";
const morning=Date.parse("2026-10-04T09:00:00+08:00");
test("spaced recall schedules 1, 3 and 7 days, cannot advance early or twice on one day, and help restarts",()=>{
  let p=recordRecall(createLearningProgress(),"cat",true,false,morning);
  assert.equal(p.cards.cat.dueAt,recallDueAt(morning,1));
  const tomorrow=morning+86400000;
  p=recordRecall(p,"cat",true,true,tomorrow);assert.equal(p.cards.cat.stage,1);assert.equal(p.cards.cat.dueAt,recallDueAt(tomorrow,3));
  const due=p.cards.cat.dueAt;
  p=recordRecall(p,"cat",true,true,tomorrow+1000);assert.equal(p.cards.cat.dueAt,due);
  p=recordRecall(p,"cat",true,true,tomorrow+86400000);assert.equal(p.cards.cat.stage,1);
  p=recordRecall(p,"cat",true,false,due+3600000);p=recordRecall(p,"cat",true,true,due+3600100);assert.equal(p.cards.cat.stage,2);assert.equal(p.cards.cat.dueAt,recallDueAt(due,7));
  p=recordRecall(p,"cat",false,true,due+7200000);assert.equal(p.cards.cat.stage,0);assert.equal(p.cards.cat.dueAt,recallDueAt(due,1));
  assert.deepEqual(dueRecallWords(p,p.cards.cat.dueAt),["cat"]);
});
test("practice retries preserve the first error and help, while diagnostic immediately records incorrect answers",()=>{
  const task=learningUnits[0].activities[0].tasks[0];
  let p=startLearning(createLearningProgress(),"family-listen",[task.id]);
  p=answerLearning(p,task,task.options!.find(option=>option.id!==task.answer)!.id).progress;assert.equal(p.active!.index,0);assert.equal(p.active!.mistakes,1);
  const retry=answerLearning(p,task,task.answer!);assert.equal(retry.completed,true);assert.equal(retry.progress.active!.answers[0].firstCorrect,false);
  const d=diagnosticActivity.tasks[0];p=startLearning(createLearningProgress(),diagnosticActivity.id,diagnosticActivity.tasks.map(task=>task.id));
  const result=answerLearning(p,d,d.options!.find(option=>option.id!==d.answer)!.id,undefined,morning,true);
  assert.equal(result.progress.active!.index,1);assert.equal(result.progress.active!.answers[0].correct,false);
  const helped=answerLearning(markLearningHint(startLearning(createLearningProgress(),"family-listen",[task.id])),task,task.answer!);assert.equal(helped.progress.active!.answers[0].firstCorrect,false);
});
test("oral assessment requires explicit adult observation and is independent of recording count",()=>{
  const task=diagnosticActivity.tasks.find(task=>task.kind==="speak")!;
  let p=startLearning({...createLearningProgress(),speakingPractice:500},diagnosticActivity.id,[task.id]);
  assert.equal(answerLearning(p,task,"").progress.active!.index,0);
  p=answerLearning(p,task,"",1,morning,true).progress;assert.equal(p.active!.answers[0].correct,false);assert.equal(p.active!.answers[0].hintUsed,true);
  p=startLearning(createLearningProgress(),diagnosticActivity.id,[task.id]);p=answerLearning(p,task,"",2,morning,true).progress;assert.equal(p.active!.answers[0].firstCorrect,true);
});
test("full diagnostic persists four skills, resumes through versioned backup, and settles only once",()=>{
  let p=createProgress();p.learning=startLearning(p.learning,diagnosticActivity.id,diagnosticActivity.tasks.map(task=>task.id),morning);
  for(const [i,task] of diagnosticActivity.tasks.entries()){
    p.learning=answerLearning(p.learning,task,task.answer??task.acceptedAnswers?.[0]??"",task.kind==="speak"||task.adultReviewRecommended?2:undefined,morning+i*1000,true).progress;
    p=parseBackup(serializeBackup(p,morning));
  }
  p.learning=finishLearning(p.learning,true,morning+30000);assert.equal(p.learning.reports.length,1);assert.equal(p.learning.reports[0].answers.length,24);
  assert.deepEqual([...new Set(p.learning.reports[0].answers.map(answer=>answer.skill))].sort(),["listening","reading","speaking","writing"]);
  assert.deepEqual(finishLearning(p.learning,true),p.learning);assert.equal(p.stars,0);assert.deepEqual(parseBackup(serializeBackup(p)),p);
  const corrupt=structuredClone(p);corrupt.learning.reports[0].answers[0].skill="writing";assert.throws(()=>parseBackup(serializeBackup(corrupt)));
  const fake=structuredClone(p);fake.learning.completed["family-listen"]={at:morning,independent:99,total:99};assert.throws(()=>parseBackup(serializeBackup(fake)));
});
test("old local profiles and v1 backups retain game records while migrating recall; v2 requires new data",()=>{
  let p=startRun(createProgress(),"animals-1",morning);p=submitAnswer(p,p.activeRun!.exercises[0].answer,morning).progress;
  const legacy=JSON.parse(serializeBackup(p));legacy.version=1;delete legacy.progress.learning;
  const migrated=parseBackup(JSON.stringify(legacy));assert.equal(migrated.attempts.length,1);assert.equal(Object.keys(migrated.learning.cards).length,1);assert.equal(migrated.stars,0);
  legacy.version=2;assert.throws(()=>parseBackup(JSON.stringify(legacy)));
});
test("learning duration counts answering intervals and bounds a long idle gap",()=>{
  const task=learningUnits[0].activities[0].tasks[0];
  let p=startLearning(createLearningProgress(),"family-listen",[task.id],morning);
  p=answerLearning(p,task,task.options!.find(option=>option.id!==task.answer)!.id,undefined,morning+30000).progress;
  assert.equal(p.totalSeconds,30);
  p=answerLearning(p,task,task.answer!,undefined,morning+3600000).progress;
  assert.equal(p.totalSeconds,150);
});
test("new content has five themes, valid scenes and fixed speech; phonics uses whole words",()=>{
  assert.equal(learningUnits.length,5);assert.equal(allLearningWords.length,64);
  const speech=audio.speech.en as Record<string,string>,ids=new Set(allLearningWords.map(word=>word.id));
  for(const activity of learningActivities){
    for(const task of activity.tasks){assert.ok(speech[task.audioText??task.promptEn],task.id);if(task.kind==="choose")assert.ok(task.options?.some(option=>option.id===task.answer));for(const scene of [...(task.scenes??[]),...(task.options??[]).map(option=>option.scene).filter(Boolean)]) for(const object of scene!.objects??[])assert.ok(ids.has(object.wordId));}
    for(const task of activity.tasks){assert.ok((audio.speech.zh as Record<string,string>)[task.promptZh],task.promptZh);for(const example of task.exampleAnswers??[])assert.ok(speech[example],example);if(task.hintZh)assert.ok((audio.speech.zh as Record<string,string>)[task.hintZh],task.hintZh);}
    for(const page of activity.pages??[])assert.ok(speech[page.en]);
  }
  for(const activity of phonicsActivities)for(const word of activity.phonics!.words)assert.ok(speech[word]);
  for(const skill of ["listening","reading","writing","speaking"])assert.equal(diagnosticActivity.tasks.filter(task=>task.skill===skill).length,6);
  assert.ok(diagnosticActivity.tasks.filter(task=>task.skill==="listening").every(task=>task.captionMode==="after-answer"));
});
