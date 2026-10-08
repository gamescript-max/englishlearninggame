import test from "node:test";
import assert from "node:assert/strict";
import { beginSpeechCaption, clearSpeechCaption, getServerSpeechCaption, getSpeechCaption, subscribeSpeechCaption, updateSpeechCaption } from "../lib/speech-caption";

test("captions preserve the complete sentence, with playback lifecycle and cleanup", () => {
  clearSpeechCaption();
  let updates = 0; const unsubscribe = subscribeSpeechCaption(() => updates++);
  const sentence = "Can I have some water, please?";
  beginSpeechCaption(1, sentence);
  assert.deepEqual(getSpeechCaption(), { requestId: 1, text: sentence, phase: "loading" });
  updateSpeechCaption(1, "playing"); assert.equal(getSpeechCaption()?.phase, "playing");
  updateSpeechCaption(1, "ended"); assert.equal(getSpeechCaption()?.text, sentence);
  assert.equal(updates, 3);
  clearSpeechCaption(); assert.equal(getSpeechCaption(), null);
  unsubscribe(); beginSpeechCaption(2, "The teddy bear is under the table.");
  assert.equal(updates, 4); clearSpeechCaption(); assert.equal(getServerSpeechCaption(), null);
});
test("stale playback completion and failure cannot overwrite a newer English caption", () => {
  beginSpeechCaption(10, "Listen and find the cat.");
  beginSpeechCaption(11, "Put the ball in the box.");
  const current = getSpeechCaption();
  updateSpeechCaption(10, "ended"); updateSpeechCaption(10, "error");
  assert.equal(getSpeechCaption(), current);
  updateSpeechCaption(11, "playing"); assert.equal(getSpeechCaption()?.text, "Put the ball in the box.");
  clearSpeechCaption(); updateSpeechCaption(11, "playing");
  assert.equal(getSpeechCaption(), null, "navigation or recording cannot revive a stopped subtitle");
});
