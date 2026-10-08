import assert from "node:assert/strict";
import test from "node:test";
import audioManifest from "../lib/audio-manifest.json";
import { getSharkToken, sharkContentForTier, sharkLetters, sharkSentences, sharkSpeech, sharkStages, sharkWelcomeGuide, sharkWords, stageForShark } from "../lib/shark-content";

test("shark collection teaches all 26 letters, common words and short existing speech sentences", () => {
  assert.deepEqual(sharkLetters.map(token => token.id), Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
  assert.ok(sharkLetters.every(token => token.id === token.en && token.en === token.speech));
  assert.equal(sharkWords.length, 24);
  assert.equal(sharkSentences.length, 24);
  const spoken = audioManifest.speech.en as Record<string, string>;
  for (const token of [...sharkWords, ...sharkSentences]) {
    assert.ok(spoken[token.speech], `${token.speech} reuses available offline speech`);
    assert.ok(token.zh.length > 0);
    assert.equal(getSharkToken(token.id), token);
    assert.ok(sharkSpeech.en.includes(token.speech));
  }
  for (const speech of ["I can run.", "This is a cat.", "I like apples."]) assert.ok(sharkSentences.some(token => token.speech === speech));
  assert.equal(new Set([...sharkLetters, ...sharkWords, ...sharkSentences].map(token => token.id)).size, 74);
  assert.ok(sharkSpeech.zh.includes(sharkWelcomeGuide));
  assert.equal(sharkContentForTier("words"), sharkWords);
  assert.equal(getSharkToken("unknown"), undefined);
});

test("every growth boundary switches objects and future goals while cosmic play stays open", () => {
  assert.deepEqual(sharkStages.map(stage => stage.at), [0, 12, 26, 46, 56, 72, 96, 124, 158, 198, 244]);
  for (let index = 0; index < sharkStages.length; index++) {
    const stage = sharkStages[index];
    assert.equal(stageForShark(stage.at).stageIndex, index);
    assert.equal(stageForShark(stage.at).kind, stage.kind);
    assert.ok(stageForShark(stage.at).nextAt > stage.at);
    if (index) assert.equal(stageForShark(stage.at - 1).stageIndex, index - 1);
  }
  assert.equal(stageForShark(25).tier, "letters");
  assert.equal(stageForShark(26).tier, "words");
  assert.equal(stageForShark(45).tier, "words");
  assert.equal(stageForShark(46).tier, "sentences");
  assert.equal(stageForShark(244).nextAt, 300);
  assert.equal(stageForShark(300).cycle, 1);
  assert.equal(stageForShark(300).currentAt, 300);
  assert.equal(stageForShark(300).nextAt, 356);
  assert.equal(stageForShark(244 + 56 * 100).nextAt, 244 + 56 * 101);
  assert.equal(stageForShark(Number.NaN).stageIndex, 0);
});
