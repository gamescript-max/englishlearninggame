import test from "node:test";
import assert from "node:assert/strict";
import * as content from "../lib/playground-content";
import * as progressState from "../lib/playground-progress";
import { createProgress, type Progress } from "../lib/progress";
import { componentHost, nodeText, type UINode } from "./helpers/component-host";

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void };
function deferred(): Deferred {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mount(mode: content.PlaygroundMode = "pets") {
  let progress = createProgress(), now = 0, currentSpeech: Deferred | null = null, stopCount = 0, unlockCount = 0;
  const speeches: { text: string; language: string; completion: Deferred }[] = [], effects: string[] = [];
  const commits: Progress[] = [];
  const commit = (update: Progress | ((previous: Progress) => Progress)) => {
    progress = typeof update === "function" ? update(progress) : update;
    commits.push(progress); return progress;
  };
  let props = { mode, progress, commit, onBack() {}, onSettings() {}, onSwitch() {}, suspended: false };
  const host = componentHost(new URL("../components/playground.tsx", import.meta.url), "Playground", props, () => ({
    "./garden-game": { GardenGame: "GardenGame", PlantArt: "PlantArt" },
    "./pet-town-game": { PetTownGame: "PetTownGame", PetAvatar: "PetAvatar" },
    "./racing-game": { RacingGame: "RacingGame", CarArt: "CarArt" },
    "./playground.css": {},
    "@/lib/playground-content": content,
    "@/lib/playground-progress": progressState,
    "@/lib/audio": {
      unlockAudio() { unlockCount++; return Promise.resolve(); },
      playSpeech(text: string, language = "en") {
        currentSpeech?.resolve();
        currentSpeech = deferred(); speeches.push({ text, language, completion: currentSpeech });
        return currentSpeech.promise;
      },
      stopSpeech() { stopCount++; currentSpeech?.resolve(); currentSpeech = null; },
      playAdventureEffect(effect: string) { effects.push(effect); },
    },
  }), { Date: { now: () => now } });
  function sync() { props = { ...props, progress }; host.update(props); }
  function game(): UINode {
    const node = host.nodes().find(node => node.type === { garden: "GardenGame", pets: "PetTownGame", racing: "RacingGame" }[mode]);
    assert.ok(node, "The active mini-game must remain in the shared shell"); return node;
  }
  function answer(value: string, node = game()) {
    const task = node.props.task as content.PlaygroundTask;
    (node.props.onAnswer as (value: string, taskId: string) => void)(value, task.id); sync();
  }
  function completeSpeech() {
    const pending = currentSpeech; currentSpeech = null; pending?.resolve();
  }
  return {
    host, speeches, effects, commits, game, answer, progress: () => progress,
    stopCount: () => stopCount, unlockCount: () => unlockCount,
    task: () => game().props.task as content.PlaygroundTask,
    click(label: string) { host.click(host.button(label)); sync(); },
    async flush() { await host.flush(); sync(); },
    async endSpeech() { completeSpeech(); await host.flush(); sync(); },
    async hearIntroductionAndTask() {
      assert.equal(speeches[0].language, "zh");
      completeSpeech(); await host.flush(); sync();
      assert.equal(speeches.at(-1)!.language, "en");
      completeSpeech(); await host.flush(); sync();
    },
    async failSpeech() { currentSpeech?.reject(new Error("声音加载失败，请重试")); currentSpeech = null; await host.flush(); sync(); },
    advance(milliseconds: number) {
      let remaining = milliseconds;
      while (remaining > 0) { const step = Math.min(1000, remaining); now += step; host.advance(step); sync(); remaining -= step; }
    },
    update(next: Partial<typeof props>) { props = { ...props, ...next }; host.update(props); },
  };
}

for (const mode of content.playgroundModes) {
  test(`${mode}: one correct task saves one reward and automatically narrates the next task`, async () => {
    const session = mount(mode); await session.hearIntroductionAndTask();
    const originalGame = session.game(), originalTask = session.task();
    assert.equal(session.progress().playground.modes[mode].current.listenCount, 1);
    session.answer(originalTask.target, originalGame);
    session.answer(originalTask.target, originalGame);
    const saved = session.progress().playground.modes[mode];
    assert.equal(saved.completed, 1, "a rapid second completion cannot award the next task");
    assert.equal(saved.coins, 10); assert.equal(saved.firstCorrect, 1);
    assert.equal(session.progress().playground.records.length, 1);
    assert.equal(session.task().id, originalTask.id, "the success scene remains visible during its animation");
    assert.equal(session.game().props.disabled, true);
    assert.deepEqual(session.effects, ["correct"]);
    const delay = mode === "racing" ? 1300 : 1400;
    session.advance(delay - 1); await session.flush();
    assert.equal(session.speeches.length, 2, "the animation must finish before the next instruction");
    session.advance(1); await session.flush();
    assert.notEqual(session.task().id, originalTask.id);
    assert.equal(session.game().props.disabled, false);
    assert.equal(session.speeches.length, 3, "the child never needs a second start button");
    assert.equal(session.speeches[2].text, session.task().promptEn);
    session.answer(originalTask.target, originalGame);
    assert.equal(session.progress().playground.modes[mode].completed, 1, "an old callback cannot answer the new task");
    assert.equal(session.progress().playground.modes[mode].coins, 10);
    assert.equal(session.progress().playground.modes[mode].current.attempts, 0);
    session.host.unmount();
  });

  test(`${mode}: answering during the welcome guide skips directly to the next English task`, async () => {
    const session = mount(mode), firstTask = session.task(), canceledGuide = session.speeches[0].completion;
    assert.equal(session.speeches.length, 1); assert.equal(session.speeches[0].language, "zh");
    session.answer(firstTask.target); await session.flush();
    assert.equal(session.progress().playground.modes[mode].completed, 1);
    assert.equal(session.progress().playground.modes[mode].coins, 10);
    assert.equal(session.progress().playground.records[0].listenCount, 0, "an interrupted welcome is not a completed English listen");
    canceledGuide.resolve(); await session.flush();
    assert.equal(session.speeches.length, 1, "a canceled old guide cannot start its old English sentence");
    session.advance(mode === "racing" ? 1300 : 1400); await session.flush();
    const nextTask = session.task();
    assert.notEqual(nextTask.id, firstTask.id);
    assert.equal(session.speeches.length, 2);
    assert.equal(session.speeches[1].language, "en", "the welcome must never repeat after a fast first answer");
    assert.equal(session.speeches[1].text, nextTask.promptEn);
    canceledGuide.resolve(); await session.flush();
    assert.equal(session.speeches.length, 2, "late guide completion cannot replace the current English task");
    assert.equal(session.speeches.filter(speech => speech.language === "zh").length, 1);
    assert.equal(session.speeches.some(speech => speech.language === "en" && speech.text === firstTask.promptEn), false);
    await session.endSpeech();
    assert.equal(session.progress().playground.modes[mode].current.listenCount, 1);
    session.host.unmount();
  });
}

test("a wrong pet choice retries the same task and a hint never counts as an independent first answer", async () => {
  const session = mount(); await session.hearIntroductionAndTask();
  const task = session.task(); session.answer("pet:kitten");
  assert.equal(session.task().id, task.id);
  assert.equal(session.progress().playground.modes.pets.current.attempts, 1);
  assert.equal(session.progress().playground.modes.pets.current.firstCorrect, false);
  assert.equal(session.progress().playground.modes.pets.coins, 0);
  assert.equal(session.game().props.disabled, false, "wrong choices stay immediately playable");
  assert.deepEqual(session.effects, ["retry"]);
  await session.endSpeech(); session.click("帮帮我");
  assert.equal(session.game().props.hinted, true);
  assert.ok(nodeText(session.host.byClass("playground-command")[0]).includes(task.promptZh));
  session.answer(task.target);
  const saved = session.progress().playground.modes.pets, record = session.progress().playground.records[0];
  assert.equal(saved.completed, 1); assert.equal(saved.firstCorrect, 0); assert.equal(saved.hints, 1);
  assert.equal(record.attempts, 2); assert.equal(record.hintUsed, true); assert.equal(record.firstCorrect, false);
  assert.equal(record.listenCount, 2, "completed initial and retry English instructions are counted separately");
  session.host.unmount();

  const hintedFirst = mount("garden"); await hintedFirst.hearIntroductionAndTask();
  hintedFirst.click("帮帮我"); hintedFirst.answer(hintedFirst.task().target);
  assert.equal(hintedFirst.progress().playground.modes.garden.firstCorrect, 0);
  assert.equal(hintedFirst.progress().playground.records[0].attempts, 1);
  assert.equal(hintedFirst.progress().playground.records[0].hintUsed, true);
  hintedFirst.host.unmount();
});

test("manual pause cancels incomplete narration and time; resume replays exactly one current instruction", async () => {
  const session = mount(); await session.endSpeech();
  const task = session.task(); assert.equal(session.speeches.length, 2);
  session.click("暂停游戏"); await session.flush();
  assert.equal(session.game().props.disabled, true);
  assert.equal(session.progress().playground.modes.pets.current.listenCount, 0);
  session.answer(task.target); session.advance(12000); await session.flush();
  assert.equal(session.progress().playground.modes.pets.completed, 0);
  assert.equal(session.progress().playground.modes.pets.totalSeconds, 0);
  assert.equal(session.speeches.length, 2);
  session.click("继续和伙伴玩"); await session.flush();
  assert.equal(session.game().props.disabled, false);
  assert.equal(session.speeches.length, 3); assert.equal(session.speeches.at(-1)!.text, task.promptEn);
  await session.endSpeech();
  assert.equal(session.progress().playground.modes.pets.current.listenCount, 1);
  assert.ok(session.unlockCount() > 0);
  session.host.unmount();
});

for (const event of ["learning-pause", "native-background", "pagehide"]) {
  test(`${event} cancels narration even when document.hidden stays false and requires a resume`, async () => {
    const session = mount("garden"); await session.endSpeech();
    const beforeStops = session.stopCount(), task = session.task();
    session.host.event("window", event); await session.flush();
    assert.ok(session.stopCount() > beforeStops);
    assert.equal(session.game().props.disabled, true);
    assert.equal(session.progress().playground.modes.garden.current.listenCount, 0, "a canceled resolved promise is not a complete listen");
    session.answer(task.target); session.advance(12000);
    assert.equal(session.progress().playground.modes.garden.completed, 0);
    assert.equal(session.progress().playground.modes.garden.totalSeconds, 0);
    assert.equal(session.speeches.length, 2);
    session.click("继续和伙伴玩"); await session.flush();
    assert.equal(session.speeches.length, 3);
    await session.endSpeech(); assert.equal(session.progress().playground.modes.garden.current.listenCount, 1);
    session.host.unmount(); assert.equal(session.host.timerCount(), 0); assert.equal(session.host.listenerCount(), 0);
  });
}

test("visibility cancellation cannot count a partial sentence, and a new replay invalidates old completions", async () => {
  const session = mount("racing"); await session.endSpeech();
  const old = session.speeches.at(-1)!;
  session.host.visibility(true); await session.flush(); session.advance(12000);
  assert.equal(session.game().props.disabled, true);
  assert.equal(session.progress().playground.modes.racing.current.listenCount, 0);
  assert.equal(session.progress().playground.modes.racing.totalSeconds, 0);
  session.host.visibility(false); await session.flush();
  assert.equal(session.speeches.length, 3);
  session.click("重听英语任务"); await session.flush();
  assert.equal(session.speeches.length, 4);
  old.completion.resolve(); await session.flush();
  assert.equal(session.progress().playground.modes.racing.current.listenCount, 0);
  await session.endSpeech(); assert.equal(session.progress().playground.modes.racing.current.listenCount, 1);
  session.host.unmount();
});

test("audio-error retries cannot play behind a pause, and closing settings preserves the paused lesson", async () => {
  const session = mount(); await session.endSpeech(); await session.failSpeech();
  assert.equal(session.host.byClass("playground-audio-error").length, 1);
  session.click("暂停游戏"); const before = session.speeches.length;
  session.click("重试声音"); await session.flush();
  assert.equal(session.speeches.length, before, "the error retry follows the same pause gate as the main replay");
  session.click("继续和伙伴玩"); await session.flush();
  assert.equal(session.speeches.length, before + 1);
  session.update({ suspended: true }); session.host.event("window", "learning-pause"); await session.flush();
  const inSettings = session.speeches.length;
  session.update({ suspended: false }); await session.flush();
  assert.equal(session.game().props.disabled, true);
  assert.equal(session.speeches.length, inSettings, "closing settings does not silently restart the child");
  session.click("继续和伙伴玩"); await session.flush();
  assert.equal(session.speeches.length, inSettings + 1);
  await session.endSpeech(); assert.equal(session.progress().playground.modes.pets.current.listenCount, 1);
  session.host.unmount();
});

test("leaving during a guide or success clears timers/listeners and cannot narrate another task", async () => {
  const guide = mount(); const pendingGuide = guide.speeches[0].completion;
  guide.host.unmount(); pendingGuide.resolve(); await guide.flush(); guide.advance(4000);
  assert.equal(guide.speeches.length, 1, "a canceled Chinese guide cannot launch English after leaving");
  assert.equal(guide.host.timerCount(), 0); assert.equal(guide.host.listenerCount(), 0);
  assert.equal(guide.progress().playground.modes.pets.current.listenCount, 0);

  const success = mount("garden"); await success.hearIntroductionAndTask(); success.answer(success.task().target);
  assert.equal(success.progress().playground.modes.garden.coins, 10);
  success.host.unmount(); success.advance(4000); await success.flush();
  assert.equal(success.speeches.length, 2, "an old success deadline cannot start the next instruction");
  assert.equal(success.progress().playground.modes.garden.completed, 1);
  assert.equal(success.progress().playground.modes.garden.coins, 10);
  assert.equal(success.host.timerCount(), 0); assert.equal(success.host.listenerCount(), 0);
});
