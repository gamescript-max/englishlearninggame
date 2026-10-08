import test from "node:test";
import assert from "node:assert/strict";
import * as course from "../lib/course";
import * as domain from "../lib/progress";
import * as destinations from "../lib/destinations";
import * as adventureProgress from "../lib/adventure-progress";
import * as playgroundContent from "../lib/playground-content";
import type { SnakeGameProps } from "../components/snake-game";
import type { ExplorationGameProps } from "../components/exploration-games";
import { componentHost, nodeText } from "./helpers/component-host";

type Cue = { kind: string; text: string; pending: boolean; end: () => void; fail: () => void };
function mount(lessonId = "animals-10") {
  let initial = domain.createProgress();
  const prerequisite = Number(course.getLesson(lessonId).prerequisiteLessonId?.split("-")[1] ?? 0);
  for (let order = 1; order <= prerequisite; order++) {
    initial = domain.startRun(initial, `animals-${order}`);
    while (initial.activeRun && initial.activeRun.index < 6) initial = domain.submitAnswer(initial, initial.activeRun.exercises[initial.activeRun.index].answer).progress;
    initial = domain.settleRun(initial);
  }
  initial = domain.startRun(initial, lessonId);
  let saved = initial, foreground: Cue | undefined;
  const cues: Cue[] = [];
  function play(kind: string, text: string) {
    foreground?.end();
    return new Promise<void>((resolve, reject) => {
      const cue: Cue = { kind, text, pending: true,
        end() { if (!cue.pending) return; cue.pending = false; if (foreground === cue) foreground = undefined; resolve(); },
        fail() { cue.pending = false; if (foreground === cue) foreground = undefined; reject(new Error("测试声音加载失败")); },
      };
      cues.push(cue); foreground = cue;
    });
  }
  const ui = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));
  const host = componentHost(new URL("../components/game-app.tsx", import.meta.url), "default", {}, react => ({
    "@/lib/course": course, "@/lib/progress": domain,
    "@/lib/game-image-assets": { gameImageURL: (source: string) => source },
    "@/lib/use-progress": { useProgress() {
      const [progress, setProgress] = react.useState(initial);
      const current = react.useRef(progress) as { current: domain.Progress };
      return { progress, current, ready: true, firstVisit: false, storageError: "", externalChange: 0, retry() {},
        commit(update: domain.Progress | ((previous: domain.Progress) => domain.Progress)) {
          saved = typeof update === "function" ? update(current.current) : update; current.current = saved; setProgress(saved); return saved;
        },
      };
    } },
    "@/lib/audio": { playSpeech: (text: string, language = "en") => play(language, text), playEffect: (text: string) => play("effect", text),
      setAudioSettings() {}, setMusicTheme() {}, stopSpeech() { foreground?.end(); }, preloadSpeech() {}, stopAllAudio() { foreground?.end(); }, unlockAudio: () => Promise.resolve(), },
    "@/components/ui/dialog": ui(["Dialog", "DialogContent", "DialogDescription", "DialogHeader", "DialogTitle"]),
    "@/components/ui/alert-dialog": ui(["AlertDialog", "AlertDialogAction", "AlertDialogCancel", "AlertDialogContent", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogHeader", "AlertDialogTitle"]),
    "@/components/ui/progress": ui(["Progress"]), "@/components/ui/switch": ui(["Switch"]), "@/components/ui/slider": ui(["Slider"]),
    "@/components/recorder": ui(["Recorder"]), "@/components/word-art": ui(["WordArt"]),
    "@/components/learning-studio":ui(["LearningStudio"]), "@/components/learning-report":ui(["LearningReport"]), "@/components/install-panel":ui(["InstallPanel"]),
    "@/lib/native-platform":{initNativePlatform:()=>Promise.resolve(()=>{}),exitNativeApp:()=>Promise.resolve(),saveBackup:()=>Promise.resolve()},
    "@/components/bonus-games": ui(["MemoryGame", "SceneGame", "SpellingGame"]), "@/components/snake-game": ui(["SnakeGame"]),
    "@/components/catch-game": ui(["CatchGame"]), "@/components/adventure-map": ui(["WorldMap", "LessonTrail"]),
    "@/components/continuous-adventure": ui(["AdventureEntries", "AdventureReport", "ContinuousAdventure"]),
    "@/components/playground": ui(["Playground", "PlaygroundEntries", "PlaygroundReport"]),
    "@/components/shark-feast": ui(["SharkFeast", "SharkFeastEntry", "SharkFeastReport"]),
    "@/lib/playground-content": playgroundContent,
    "@/lib/adventure-progress": adventureProgress,
    "@/components/exploration-games": ui(["BubbleGame", "DeliveryGame", "ConnectionGame"]),
    "@/lib/destinations": destinations,
    "@/components/speech-caption": ui(["SpeechCaption"]), "@/components/use-webmcp": { useWebMCP() {} },
  }));
  function snake() { const node = host.nodes().find(node => node.type === "SnakeGame"); assert.ok(node, "Snake game should be mounted"); return node.props as unknown as SnakeGameProps; }
  function exploration() { const node = host.nodes().find(node => ["BubbleGame", "DeliveryGame", "ConnectionGame", "CatchGame"].includes(String(node.type))); assert.ok(node, "Exploration game should be mounted"); return node.props as unknown as ExplorationGameProps; }
  function pending(kind: string) { const cue = cues.findLast(cue => cue.pending && cue.kind === kind); assert.ok(cue, `Missing ${kind} cue`); return cue; }
  return { ...host, snake, exploration, pending, cues, saved: () => saved,
    async start() { host.click(host.button("继续冒险")); await host.flush(); pending("zh").end(); await host.flush(); pending("en").end(); await host.flush(); },
  };
}

test("the first core lesson goes directly to playable cards, with its demonstration optional", async () => {
  const host = mount("animals-1"); await host.start();
  assert.equal(host.byClass("intro-panel").length, 0); assert.equal(host.byClass("option-grid").length, 1);
  assert.ok(host.byClass("word-card").every(node => node.props.disabled === false));
  host.click(host.button("看看乐乐怎么做")); await host.flush(); assert.equal(host.byClass("intro-panel").length, 1);
  host.click(host.button("准备好啦，去找找")); await host.flush();
  assert.equal(host.byClass("intro-panel").length, 0); assert.equal(host.pending("en").text, host.saved().activeRun!.exercises[0].promptEn);
  host.pending("en").end(); await host.flush(); host.unmount();
});

test("snake consumes six targets without continue clicks, speaks every next sentence, and settles once", async () => {
  const host = mount(); await host.start(); const runId = host.saved().activeRun!.id;
  for (let index = 0; index < 6; index++) {
    const snake = host.snake(); assert.equal(snake.found, index); assert.equal(snake.disabled, false); assert.equal(snake.busy, false);
    assert.ok(nodeText(host.byClass("english-prompt")[0]).includes(snake.exercise.promptEn));
    snake.onAnswer(snake.exercise.answer, snake.exercise.id); await host.flush();
    assert.equal(host.saved().activeRun!.index, index + 1);
    assert.equal(host.nodes().some(node => node.type === "Recorder"), false, "No per-answer recording step");
    assert.equal(host.snake().disabled, true); host.pending("effect").end(); await host.flush();
    if (index < 5) {
      assert.equal(host.snake().found, index + 1); assert.equal(host.snake().busy, true);
      assert.equal(host.pending("en").text, host.snake().exercise.promptEn);
      host.pending("en").end(); await host.flush();
    }
  }
  assert.equal(host.saved().activeRun, null); assert.equal(host.saved().stars, 2); assert.ok(host.saved().completed["animals-10"]);
  assert.ok(host.saved().settledRuns.includes(runId)); assert.equal(host.saved().attempts.filter(answer => answer.lessonId === "animals-10").length, 6);
  assert.equal(host.byClass("result-panel").length, 1); assert.equal(domain.settleRun(host.saved()).stars, 2); host.unmount();
});

for (const order of [11, 12, 13, 14]) test(`new game ${order} advances six prompts safely through feedback, group changes and final settlement`, async () => {
  const host = mount(`animals-${order}`); await host.start();
  const beforeStars = host.saved().stars;
  for (let index = 0; index < 6; index++) {
    const game = host.exploration(), groupOptions = host.saved().activeRun!.exercises[Math.floor(index / 3) * 3].options;
    assert.equal(game.disabled, false); assert.equal(game.busy, false);
    game.onAnswer(game.exercise.answer, game.exercise.id); await host.flush();
    assert.equal(host.saved().activeRun!.index, index + 1);
    assert.equal(host.exploration().exercise.id, game.exercise.id, "feedback still displays the answered exercise");
    if (order === 13) assert.deepEqual(host.exploration().exercise.options, groupOptions, "feedback never reads the next board, including after question six");
    game.onAnswer(game.exercise.answer, game.exercise.id); await host.flush();
    assert.equal(host.saved().activeRun!.index, index + 1, "old callback cannot submit twice");
    host.pending("effect").end(); await host.flush();
    if (index < 5) { assert.equal(host.exploration().busy, true); host.pending("en").end(); await host.flush(); }
  }
  assert.equal(host.saved().activeRun, null); assert.equal(host.saved().stars, beforeStars + 1);
  assert.equal(host.byClass("result-panel").length, 1); assert.equal(domain.settleRun(host.saved()).stars, beforeStars + 1); host.unmount();
});
test("the celebration starts the next unlocked adventure directly, with no map or duplicated reward", async () => {
  const host = mount(); await host.start();
  for (let index = 0; index < 6; index++) {
    const game = host.snake(); game.onAnswer(game.exercise.answer, game.exercise.id); await host.flush();
    host.pending("effect").end(); await host.flush();
    if (index < 5) { host.pending("en").end(); await host.flush(); }
  }
  const completedRunId = host.saved().settledRuns.at(-1);
  assert.equal(host.saved().stars, 2);
  host.click(host.button("继续下一冒险")); await host.flush();
  assert.equal(host.saved().activeRun!.lessonId, "animals-2");
  assert.equal(host.byClass("result-panel").length, 0);
  assert.equal(host.nodes().some(node => node.type === "WorldMap" || node.type === "LessonTrail"), false);
  assert.equal(host.byClass("option-grid").length, 1);
  assert.equal(host.saved().stars, 2);
  assert.equal(host.saved().settledRuns.filter(id => id === completedRunId).length, 1);
  host.pending("zh").end(); await host.flush();
  assert.equal(host.pending("en").text, host.saved().activeRun!.exercises[0].promptEn);
  host.pending("en").end(); await host.flush(); host.unmount();
});

test("wrong consumption replays the same target; failed replay blocks movement until retry", async () => {
  const host = mount(); await host.start(); const snake = host.snake();
  snake.onAnswer(snake.exercise.options.find(id => id !== snake.exercise.answer)!, snake.exercise.id); await host.flush();
  assert.equal(host.saved().activeRun!.index, 0); assert.equal(host.snake().busy, true);
  host.pending("effect").end(); await host.flush(); assert.equal(host.pending("en").text, snake.exercise.promptEn);
  host.pending("en").fail(); await host.flush(); assert.equal(host.snake().disabled, true); assert.equal(host.snake().busy, false);
  host.click(host.button("重试声音")); await host.flush(); host.pending("en").end(); await host.flush();
  assert.equal(host.snake().disabled, false); assert.equal(host.saved().activeRun!.current.attempts, 1);
  assert.equal(host.saved().activeRun!.current.firstCorrect, false); host.unmount();
});
test("background cancellation never counts an unheard cue or starts next audio while hidden", async () => {
  const host = mount(); host.click(host.button("继续冒险")); await host.flush(); host.pending("zh").end(); await host.flush();
  host.visibility(true); await host.flush(); assert.equal(host.saved().activeRun!.current.listenCount, 0);
  assert.equal(host.cues.some(cue => cue.pending), false);
  host.visibility(false); await host.flush(); host.pending("en").end(); await host.flush();
  const snake = host.snake(); snake.onAnswer(snake.exercise.answer, snake.exercise.id); await host.flush();
  host.visibility(true); await host.flush();
  assert.equal(host.saved().activeRun!.index, 1); assert.equal(host.saved().activeRun!.current.listenCount, 0);
  assert.equal(host.cues.some(cue => cue.pending), false);
  host.visibility(false); await host.flush(); assert.equal(host.pending("en").text, host.snake().exercise.promptEn);
  host.pending("en").end(); await host.flush(); assert.equal(host.saved().activeRun!.current.listenCount, 1); host.unmount();
});
test("old question callback cannot answer the next target", async () => {
  const host = mount(); await host.start(); const old = host.snake();
  old.onAnswer(old.exercise.answer, old.exercise.id); await host.flush(); host.pending("effect").end(); await host.flush();
  old.onAnswer(old.exercise.answer, old.exercise.id); await host.flush();
  assert.equal(host.saved().activeRun!.index, 1); assert.equal(host.saved().activeRun!.current.attempts, 0); host.unmount();
});
test("pagehide stops continuation even before document.hidden changes; pageshow restores the target", async () => {
  const host = mount(); await host.start(); const snake = host.snake();
  snake.onAnswer(snake.exercise.answer, snake.exercise.id); await host.flush();
  host.event("window", "pagehide"); await host.flush();
  assert.equal(host.saved().activeRun!.index, 1); assert.equal(host.cues.some(cue => cue.pending), false);
  host.event("window", "pageshow"); await host.flush();
  assert.equal(host.pending("en").text, host.snake().exercise.promptEn);
  host.pending("en").end(); await host.flush();
  for (let index = 1; index < 6; index++) {
    const next = host.snake(); next.onAnswer(next.exercise.answer, next.exercise.id); await host.flush();
    if (index === 5) host.event("window", "pagehide"); else host.pending("effect").end();
    await host.flush();
    if (index < 5) { host.pending("en").end(); await host.flush(); }
  }
  assert.equal(host.saved().activeRun, null); assert.equal(host.saved().stars, 2);
  assert.equal(host.cues.some(cue => cue.pending), false, "Hidden final settlement must not restart reward audio"); host.unmount();
});
