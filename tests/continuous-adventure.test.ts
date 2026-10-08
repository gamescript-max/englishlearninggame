import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../lib/adventure-engine";
import * as content from "../lib/adventure-content";
import * as state from "../lib/adventure-progress";
import * as catalog from "../lib/adventure-catalog";
import * as treasure from "../lib/ocean-treasure";
import * as scoring from "../lib/ocean-score";
import ecologyArt from "../lib/ecology-art.json";
import flatSnakeArt from "../lib/snake-flat-art.json";
import * as naturalArt from "../lib/natural-ocean-art";
import * as fullscreen from "../lib/adventure-fullscreen";
import { createProgress, type Progress } from "../lib/progress";
import { componentHost, nodeText } from "./helpers/component-host";

type Deferred = { resolve: () => void; reject: (error: Error) => void; promise: Promise<void> };
function deferred(): Deferred {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { resolve, reject, promise };
}
function mount(mode: content.AdventureMode = "fish", delayedUnlock = false, existing?: Progress, options: { deferredImages?: boolean } = {}) {
  let progress = existing ?? createProgress(); progress.adventure = state.startAdventure(progress.adventure, mode);
  let now = 0, nextRAF = 0, world!: engine.AdventureWorld, currentSpeech: Deferred | null = null;
  let rejectCommit = false, backCount = 0, paints = 0, unlocks = 0, imageLoads = 0, advances = 0;
  const imageRequests: Deferred[] = [];
  const imageModes: content.AdventureMode[] = [];
  const commits: Progress[] = [];
  const raf = new Map<number, (time: number) => void>(), speeches: string[] = [], effects: string[] = [], eats: number[] = [], unlock = deferred();
  const inputTarget = { matches: () => false, closest: () => null };
  const commit = (fn: Progress | ((p: Progress) => Progress)) => {
    if (rejectCommit) { rejectCommit = false; return progress; }
    progress = typeof fn === "function" ? fn(progress) : fn; commits.push(progress); return progress;
  };
  let props = { mode, progress, commit, onBack: () => { backCount++; progress = { ...progress, adventure: state.leaveAdventure(progress.adventure) }; }, onSettings() {}, suspended: false };
  const host = componentHost(new URL("../components/continuous-adventure.tsx", import.meta.url), "ContinuousAdventureSession", props, () => ({
    "@/lib/adventure-engine": {
      ...engine,
      createAdventureWorld(...args: Parameters<typeof engine.createAdventureWorld>) { world = engine.createAdventureWorld(...args); return world; },
      advanceAdventure(...args: Parameters<typeof engine.advanceAdventure>) { advances++; return engine.advanceAdventure(...args); },
    },
    "@/lib/adventure-content": content, "@/lib/adventure-progress": state,
    "@/lib/adventure-catalog": catalog, "@/lib/ecology-art.json": {default:ecologyArt},
    "@/lib/ocean-treasure":treasure,
    "@/lib/ocean-score":scoring,
    "@/lib/adventure-fullscreen":fullscreen,
    "@/components/ui/dialog":{Dialog:"Dialog",DialogContent:"DialogContent",DialogTitle:"h2",DialogDescription:"p"},
    "@/lib/snake-flat-art.json": {default:flatSnakeArt},
    "@/lib/natural-ocean-art":naturalArt,
    "@/lib/game-image-assets": { gameImageURL: (source: string) => source },
    "@/lib/adventure-art.json": { default: { fish: Array.from({ length: 6 }, () => ({ x: 0, y: 0, w: 100, h: 100 })), snake: [{ x: 0, y: 0, w: 100, h: 100 }] } },
    "./adventure-renderer": {
      loadAdventureImages(requestedMode: content.AdventureMode) {
        imageModes.push(requestedMode);
        imageLoads++;
        if (!options.deferredImages) return Promise.resolve({});
        const request = deferred(); imageRequests.push(request); return request.promise.then(() => ({}));
      },
      paintAdventure() { paints++; },
    },
    "./ocean-volume-layer": { createOceanVolumeLayer() { return null; } },
    "@/lib/audio": {
      unlockAudio: () => { unlocks++; return delayedUnlock ? unlock.promise : Promise.resolve(); },
      playSpeech(text: string) { speeches.push(text); currentSpeech = deferred(); return currentSpeech.promise; },
      stopSpeech() { currentSpeech?.resolve(); currentSpeech = null; },
      playAdventureEffect(effect: string) { effects.push(effect); },
      playAdventureEat() { eats.push(now); },
    },
  }), {
    ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame(callback: (time: number) => void) { const id = ++nextRAF; raf.set(id, callback); return id; },
    cancelAnimationFrame(id: number) { raf.delete(id); },
  });
  const canvasNode = host.nodes().find(node => node.type === "canvas")!;
  (canvasNode.props.ref as { current: unknown }).current = { width: 0, height: 0, getContext: () => ({ setTransform() {} }) };
  const frameNode = host.byClass("adventure-world")[0];
  (frameNode.props.ref as { current: unknown }).current = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 540 }) };
  function sync() { props = { ...props, progress }; host.update(props); }
  function click(label: string) { host.click(host.button(label)); sync(); }
  function key(key = "ArrowRight", target = inputTarget) { host.event("window", "keydown", { key, target, preventDefault() {} }); sync(); }
  function advance(milliseconds: number) {
    const end = now + milliseconds;
    while (now < end) {
      now = Math.min(end, now + 1000 / 60);
      const frames = [...raf.values()]; raf.clear(); for (const callback of frames) callback(now); sync();
    }
  }
  async function flush() { await host.flush(); sync(); }
  return {
    host, speeches, effects, eats, commits, world: () => world, progress: () => progress, backCount: () => backCount, rafCount: () => raf.size,
    click, key, advance,
    pointer() {
      (frameNode.props.onPointerDown as (event: unknown) => void)({ pointerId: 1, clientX: 700, clientY: 300, target: inputTarget, currentTarget: { setPointerCapture() {} } }); sync();
    },
    flush,
    async ready() { await flush(); advance(1000 / 30); await flush(); },
    paints: () => paints, unlocks: () => unlocks, imageLoads: () => imageLoads, advances: () => advances, imageModes,
    async resolveImages(index = imageRequests.length - 1) { imageRequests[index].resolve(); await flush(); },
    async rejectImages(index = imageRequests.length - 1) { imageRequests[index].reject(new Error("图片暂时离线")); await flush(); },
    update(next: Partial<typeof props>) { props = { ...props, ...next }; host.update(props); },
    replaceProgress(next: Progress, render = true) { progress = next; if (render) sync(); },
    async endSpeech() { currentSpeech?.resolve(); await host.flush(); sync(); },
    async failSpeech() { currentSpeech?.reject(new Error("声音加载失败，请重听")); await host.flush(); sync(); },
    async unlock() { unlock.resolve(); await host.flush(); sync(); },
    rejectNextCommit() { rejectCommit = true; },
    collectCurrent() { const actor = world.actors.find(item => item.kind === "mission" && item.choiceId === world.mission?.answer)!; actor.x = world.player.x + 2; actor.y = world.player.y; advance(1000 / 30); },
    snack(wordId?: string) { const food = world.actors.find(item => item.kind === "food")!; food.x = world.player.x + 2; food.y = world.player.y; food.wordId = wordId; advance(1000 / 30); },
  };
}

test("fish and snake wait for all images and the first presented map before accepting play", async () => {
  for (const mode of ["fish", "snake"] as const) {
    const session = mount(mode, false, undefined, { deferredImages: true });
    assert.deepEqual(session.imageModes, [mode], "the loader prepares only the selected game's assets");
    assert.ok(nodeText(session.host.byClass("adventure-loading-card")[0]).includes("正在准备冒险地图"));
    assert.equal(session.host.nodes().find(node => node.type === "canvas")!.props["aria-busy"], true);
    const position = { x: session.world().player.x, y: session.world().player.y };
    session.key(); session.pointer(); session.click("向右"); session.click("重听英语目标"); session.click("乐乐提示"); session.click("成长图鉴");
    session.snack("cat"); session.collectCurrent(); session.advance(12000); await session.flush();
    assert.deepEqual({ x: session.world().player.x, y: session.world().player.y }, position);
    assert.equal(session.world().elapsed, 0); assert.equal(session.advances(), 0); assert.equal(session.paints(), 0);
    assert.equal(session.progress().adventure.modes[mode].xp, 0);
    assert.equal(session.progress().adventure.modes[mode].totalSeconds, 0);
    assert.equal(session.unlocks(), 0); assert.equal(session.speeches.length, 0); assert.equal(session.eats.length, 0); assert.equal(session.effects.length, 0);
    await session.resolveImages();
    assert.ok(nodeText(session.host.byClass("adventure-loading-card")[0]).includes("正在画出冒险地图"));
    session.key(); session.advance(1000 / 60); await session.flush();
    assert.ok(session.paints() > 0); assert.equal(session.host.byClass("adventure-loading-overlay").length, 1);
    assert.equal(session.world().elapsed, 0); assert.equal(session.speeches.length, 0);
    session.advance(1000 / 60); await session.flush();
    assert.equal(session.host.byClass("adventure-loading-overlay").length, 0);
    assert.ok(nodeText(session.host.byClass("adventure-overlay")[0]).includes("拖动地图或按方向键出发"));
    assert.equal(session.host.nodes().some(node => node.type === "button" && nodeText(node).includes("继续游动")), false);
    assert.equal(session.world().elapsed, 0, "loading and first drawing never count as play time");
    session.key(); await session.flush(); session.advance(50);
    assert.ok(session.world().elapsed > 0); assert.equal(session.speeches.length, 1);
    session.host.unmount();
  }
});

test("an image failure blocks play and a successful retry presents the map without losing readiness", async () => {
  const session = mount("fish", false, undefined, { deferredImages: true });
  await session.rejectImages();
  assert.ok(nodeText(session.host.byClass("adventure-loading-card")[0]).includes("图片还没准备好"));
  assert.equal(session.host.nodes().find(node => node.type === "canvas")!.props["aria-busy"], false);
  session.key(); session.snack("tree"); session.advance(5000); await session.flush();
  assert.equal(session.world().elapsed, 0); assert.equal(session.unlocks(), 0); assert.equal(session.progress().adventure.modes.fish.xp, 0);
  session.click("重试图片"); assert.equal(session.imageLoads(), 2);
  assert.ok(nodeText(session.host.byClass("adventure-loading-card")[0]).includes("正在准备冒险地图"));
  await session.resolveImages(); await session.ready();
  assert.equal(session.host.byClass("adventure-loading-overlay").length, 0);
  session.pointer(); await session.flush(); session.advance(50);
  assert.ok(session.world().elapsed > 0); assert.equal(session.speeches.length, 1);
  session.host.unmount();
});

test("image completion cannot draw or unlock play after leaving or unmounting", async () => {
  const leaving = mount("fish", false, undefined, { deferredImages: true });
  leaving.click("收好冒险返回地图"); await leaving.resolveImages(); leaving.advance(100);
  assert.equal(leaving.paints(), 0); assert.equal(leaving.rafCount(), 0); assert.equal(leaving.unlocks(), 0); leaving.host.unmount();
  const unmounted = mount("snake", false, undefined, { deferredImages: true });
  unmounted.host.unmount(); await unmounted.resolveImages(); unmounted.advance(100);
  assert.equal(unmounted.paints(), 0); assert.equal(unmounted.rafCount(), 0); assert.equal(unmounted.unlocks(), 0);
  const presenting = mount("fish", false, undefined, { deferredImages: true });
  await presenting.resolveImages(); presenting.advance(1000 / 60); assert.ok(presenting.rafCount() >= 2);
  presenting.host.unmount(); presenting.advance(100); await presenting.flush();
  assert.equal(presenting.rafCount(), 0); assert.equal(presenting.host.byClass("adventure-loading-overlay").length, 1, "the late presentation callback cannot publish readiness");
});

test("settings during loading keep the prepared map paused until an explicit input", async () => {
  const session = mount("fish", false, undefined, { deferredImages: true });
  session.update({ suspended: true }); await session.resolveImages(); await session.ready();
  session.key(); session.advance(1000); assert.equal(session.world().elapsed, 0); assert.equal(session.unlocks(), 0);
  session.update({ suspended: false }); session.advance(1000); assert.equal(session.world().elapsed, 0);
  session.key(); await session.flush(); session.advance(50); assert.ok(session.world().elapsed > 0);
  session.host.unmount();
});

test("fish and snake fullscreen switches preserve the live world, current task and paused state",async()=>{
  for(const mode of ["fish","snake"] as const) {
    const session=mount(mode);await session.ready();session.key();await session.flush();await session.endSpeech();session.advance(200);
    assert.equal(session.host.byClass("adventure-fullscreen").length,1,"both games enter with a full map");
    session.click("退出全屏地图");assert.equal(session.host.byClass("adventure-fullscreen").length,0);
    session.key("ArrowDown");assert.equal(session.host.byClass("adventure-fullscreen").length,0,"moving after a manual exit does not re-enter fullscreen");
    const running=session.world();session.click("全屏地图");session.advance(150);assert.equal(session.world(),running);assert.ok(running.elapsed>.2,"entering fullscreen keeps the moving world active");
    session.click("退出全屏地图");const afterExit=running.elapsed;session.advance(150);assert.ok(running.elapsed>afterExit,"exiting fullscreen never silently pauses the game");
    session.click("暂停冒险");const world=session.world(), elapsed=world.elapsed, taskIndex=session.progress().adventure.modes[mode].taskIndex;
    session.click("全屏地图");assert.equal(session.host.byClass("adventure-fullscreen").length,1);
    assert.equal(session.host.button("退出全屏地图").props["aria-pressed"],true);
    session.advance(200);assert.equal(session.world(),world);assert.equal(world.elapsed,elapsed);
    session.click("退出全屏地图");assert.equal(session.host.byClass("adventure-fullscreen").length,0);
    assert.equal(session.progress().adventure.modes[mode].taskIndex,taskIndex);
    session.click("全屏地图");session.click("成长图鉴");session.host.event("document","keydown",{key:"Escape"});
    assert.equal(session.host.byClass("adventure-fullscreen").length,1,"Escape belongs to the open book");
    session.click("收好图鉴");session.host.event("document","keydown",{key:"Escape"});
    assert.equal(session.host.byClass("adventure-fullscreen").length,0);
    session.click("全屏地图");session.click("收好冒险返回地图");assert.equal(session.backCount(),1);session.host.unmount();
    assert.equal(session.host.listenerCount(),0);
  }
});

test("fish card collection earns an optional box, saves one draw and resumes safely after hearing the prize",async()=>{
  const session=mount();await session.ready();session.key();await session.flush();await session.endSpeech();
  for(const id of ["cat","dog","tree","bus","apple"]) {session.snack(id);await session.flush();await session.endSpeech();}
  assert.equal(session.progress().adventure.oceanTreasure.earned,1);
  assert.equal(session.host.byClass("ocean-treasure-dialog").length,0,"reaching five never interrupts with an automatic popup");
  session.click("开启海洋宝箱，可开1个");const stopped=session.world().elapsed;
  session.key("ArrowDown");session.advance(200);assert.equal(session.world().elapsed,stopped);
  const button=session.host.button("打开宝箱抽贴纸 · 剩余1个");session.host.click(button);session.host.click(button);await session.flush();
  assert.equal(session.progress().adventure.oceanTreasure.opened,1,"rapid double tap opens one saved ticket");
  const species=catalog.getOceanSpecies(session.progress().adventure.oceanTreasure.lastPrize!)!;
  assert.equal(session.speeches.filter(text=>text===species.en).length,1);
  session.click("收好宝藏，继续游");await session.flush();session.advance(150);assert.ok(session.world().elapsed>stopped);
  session.host.unmount();
});

test("a rejected treasure save preserves the ticket and cannot show or speak an unsaved prize",async()=>{
  const existing=createProgress();
  for(let i=0;i<5;i++)existing.adventure.oceanTreasure=treasure.collectOceanCard(existing.adventure.oceanTreasure,["cat","dog","tree","bus","apple"][i],`old-${i}`);
  const session=mount("fish",false,existing);await session.ready();session.click("开启海洋宝箱，可开1个");
  session.rejectNextCommit();session.click("打开宝箱抽贴纸 · 剩余1个");await session.flush();
  assert.equal(session.progress().adventure.oceanTreasure.opened,0);assert.equal(session.speeches.length,0);
  assert.ok(nodeText(session.host.byClass("adventure-status")[0]).includes("学习记录已更新"));session.host.unmount();
});

test("live keyboard gates prevent movement through a book/settings dialog and never intercept typing", async () => {
  const session = mount(); await session.ready(); session.key(); await session.flush(); session.advance(200);
  session.click("成长图鉴"); const stopped = session.world().elapsed;
  session.key("ArrowUp"); session.advance(500); assert.equal(session.world().elapsed, stopped);
  session.click("收好图鉴"); session.advance(300); assert.equal(session.world().elapsed, stopped, "closing a book does not silently resume");
  session.key("ArrowUp"); await session.flush(); session.advance(150); assert.ok(session.world().elapsed > stopped);
  session.update({ suspended: true }); const inSettings = session.world().elapsed;
  session.key(); session.advance(250); assert.equal(session.world().elapsed, inSettings);
  session.update({ suspended: false }); session.advance(250); assert.equal(session.world().elapsed, inSettings);
  session.host.event("window", "keydown", { key: "ArrowDown", target: { matches: () => true, closest: () => null }, preventDefault() { throw new Error("A text input must retain its arrow keys"); } });
  assert.equal(session.world().elapsed, inSettings);
  session.key(); await session.flush(); session.advance(100); assert.ok(session.world().elapsed > inSettings);
  session.host.unmount();
});

test("replay/hint start exactly one narration; canceled unlock cannot speak after backgrounding", async () => {
  for (const action of ["重听英语目标", "乐乐提示"]) {
    const session = mount(); await session.ready(); session.click(action); await session.flush();
    assert.equal(session.speeches.length, 1);
    assert.equal(session.progress().adventure.modes.fish.listenCount, 1);
    if (action === "乐乐提示") assert.equal(session.progress().adventure.modes.fish.hints, 1);
    session.host.unmount();
  }
  const delayed = mount("fish", true); await delayed.ready(); delayed.click("听乐乐讲怎么玩");
  delayed.host.visibility(true); await delayed.unlock();
  assert.equal(delayed.speeches.length, 0, "late audio unlock cannot start the Chinese introduction behind a paused screen");
  const stopped = delayed.world().elapsed; delayed.host.visibility(false); delayed.advance(1500);
  assert.equal(delayed.world().elapsed, stopped);
  delayed.host.unmount();
});

test("audio failure leaves safe free motion but cannot record answers until a successful retry", async () => {
  const session = mount(); await session.ready(); session.key(); await session.flush(); await session.failSpeech();
  const before = session.world().elapsed; session.collectCurrent();
  assert.equal(session.progress().adventure.modes.fish.completedTasks, 0);
  assert.ok(session.world().elapsed > before);
  assert.ok(session.host.byClass("adventure-status").length > 0);
  session.click("点我重试"); await session.flush(); await session.endSpeech(); session.collectCurrent();
  assert.equal(session.progress().adventure.modes.fish.completedTasks, 1);
  assert.equal(session.progress().adventure.modes.fish.firstCorrect, 1);
  session.advance(700); await session.flush();
  assert.equal(session.speeches.length, 3, "next target narrates automatically, with no second start tap");
  assert.equal(session.progress().adventure.modes.fish.completedTasks, 1);
  session.host.unmount();
});

test("pausing between targets clears the old replay deadline and cannot double-play after resume", async () => {
  const session = mount(); await session.ready(); session.key(); await session.flush(); await session.endSpeech(); session.collectCurrent();
  assert.equal(session.progress().adventure.modes.fish.taskIndex, 1);
  session.click("暂停冒险"); session.advance(2000);
  session.click("继续冒险"); await session.flush(); session.advance(900); await session.flush();
  assert.equal(session.speeches.length, 2, "the resumed sentence is not replaced by an expired transition timer");
  session.host.unmount();
});

test("snacks save growth immediately, elapsed time is saved once, and navigation cannot resurrect an active mode", async () => {
  const session = mount("snake"); await session.ready(); session.key(); await session.flush(); await session.endSpeech(); session.snack("cat");
  assert.equal(session.progress().adventure.modes.snake.xp, 50);
  assert.deepEqual(session.progress().adventure.modes.snake.collectedWords, ["cat"]);
  assert.equal(session.progress().adventure.modes.snake.completedTasks, 0);
  session.advance(2200); session.click("收好冒险返回地图");
  const seconds = session.progress().adventure.modes.snake.totalSeconds;
  assert.equal(seconds, Math.floor(session.world().elapsed));
  assert.equal(session.backCount(), 1); assert.equal(session.progress().adventure.activeMode, null);
  session.host.unmount();
  assert.equal(session.progress().adventure.activeMode, null);
  assert.equal(session.progress().adventure.modes.snake.totalSeconds, seconds);
  assert.equal(session.rafCount(), 0); assert.equal(session.host.listenerCount(), 0);
});

test("both games read each sparse collected card after the task sentence without recording an answer",async()=>{
  for(const mode of ["fish","snake"] as const){
    const s=mount(mode);await s.ready();s.key();await s.flush();
    const first=s.speeches[0];s.world().boostRngState=1000;s.snack("cat");await s.flush();assert.deepEqual(s.speeches,[first],"a word cannot interrupt the complete task sentence");
    await s.endSpeech();s.advance(50);await s.flush();assert.equal(s.speeches.at(-1),"cat");
    const x=s.world().player.x, normal=structuredClone(s.world());
    for(let frame=0;frame<18;frame++) engine.advanceAdventure(normal,1/60,{moving:true,direction:{x:1,y:0}},{answerEnabled:false,safe:true,cardEnabled:false});
    s.advance(300);assert.ok(s.world().player.x>x&&Math.abs(s.world().player.x-normal.player.x)<1e-6,"word playback keeps the same speed as free swimming");
    assert.equal(s.progress().adventure.modes[mode].completedTasks,0);
    await s.endSpeech();s.snack("tree");await s.flush();assert.equal(s.speeches.at(-1),"tree");
    assert.equal(s.progress().adventure.modes[mode].listenCount,1,"card names do not inflate task listen counts");s.host.unmount();
  }
});

test("a correct task card reads its name before automatically speaking the next task",async()=>{
  const s=mount("snake");await s.ready();s.key();await s.flush();await s.endSpeech();s.collectCurrent();await s.flush();
  assert.equal(s.progress().adventure.modes.snake.completedTasks,1);assert.equal(s.speeches.at(-1),"cat");
  s.advance(1400);await s.flush();assert.equal(s.speeches.length,2,"the transition deadline cannot cut off cat");
  await s.endSpeech();s.advance(50);await s.flush();assert.equal(s.speeches.at(-1),"Listen and find the dog.");
  s.collectCurrent();assert.equal(s.progress().adventure.modes.snake.completedTasks,1,"the next target stays gated until its full sentence finishes");s.host.unmount();
});

test("failed card audio waits for retry, keeps the word and cancels safely on background or manual replay",async()=>{
  const s=mount("fish");await s.ready();s.key();await s.flush();await s.endSpeech();s.snack("flower");await s.flush();await s.failSpeech();
  s.advance(1200);await s.flush();assert.equal(s.speeches.length,2);
  s.click("点我重试");await s.flush();assert.equal(s.speeches[2],s.speeches[0]);await s.endSpeech();assert.equal(s.speeches.at(-1),"flower","retry keeps the failed card");
  s.click("重听英语目标");await s.flush();const count=s.speeches.length;await s.endSpeech();assert.equal(s.speeches.length,count+1);assert.equal(s.speeches.at(-1),"flower","a canceled old worker cannot shift away the retried word");
  s.host.visibility(true);await s.endSpeech();const paused=s.world().elapsed;s.advance(800);assert.equal(s.world().elapsed,paused);s.host.unmount();
});

test("boost status follows active play time, survives pause, and clears after six seconds without slowing narration", async () => {
  for (const mode of ["fish", "snake"] as const) {
    const session = mount(mode); await session.ready(); session.key(); await session.flush(); await session.endSpeech();
    session.world().boostRngState = 2000; session.snack("cat"); await session.flush(); session.advance(160);
    assert.ok(nodeText(session.host.byClass("speed-boost-status")[0]).includes("4 倍速度"));
    assert.ok(nodeText(session.host.byClass("adventure-mission")[0]).includes("继续游"));
    const expiry = session.world().speedBoost!.expiresAt;
    session.click("暂停冒险"); const remaining = engine.getAdventureSpeedBoost(session.world()).remaining;
    session.advance(1000); assert.equal(engine.getAdventureSpeedBoost(session.world()).remaining, remaining);
    session.click("继续冒险"); await session.flush(); await session.endSpeech(); await session.endSpeech();
    session.world().actors = [];
    session.advance(600); assert.ok(session.world().elapsed > expiry - remaining);
    session.world().actors = [];
    session.advance(5500);
    assert.equal(engine.getAdventureSpeedBoost(session.world()).multiplier, 1);
    assert.equal(session.host.byClass("speed-boost-status").length, 0);
    assert.ok(session.progress().adventure.modes[mode].xp >= 50);
    session.host.unmount();
  }
});

test("a storage conflict freezes the stale world and stops late saves from replacing a newer record", async () => {
  const session = mount("snake"); await session.ready(); session.key(); await session.flush(); await session.endSpeech(); session.world().boostRngState = 2000; session.rejectNextCommit(); session.snack("dog");
  assert.equal(session.progress().adventure.modes.snake.xp, 0, "the rejected update does not leak old growth into the newer profile");
  const stopped = session.world().elapsed; session.key("ArrowDown"); session.advance(1000);
  assert.equal(session.world().elapsed, stopped);
  assert.equal(session.host.byClass("speed-boost-status").length, 0, "a rejected card cannot advertise an unsaved speed reward");
  session.host.unmount(); assert.equal(session.progress().adventure.modes.snake.xp, 0);
});

test("delayed local snapshots cannot pause continuous snake play or roll back its live task", async () => {
  const s = mount("snake"); await s.ready(); s.key(); await s.flush(); await s.endSpeech();
  const older = s.progress(); s.collectCurrent(); await s.flush(); const latest = s.progress();
  s.update({ progress: older }); s.update({ progress: latest });
  assert.ok(!nodeText(s.host.byClass("adventure-status")[0]).includes("学习记录已更新"));
  const elapsed = s.world().elapsed; s.advance(700); await s.flush();
  assert.ok(s.world().elapsed > elapsed);
  assert.equal(s.host.byClass("adventure-overlay").length, 0, "playing and ordinary pause never open a modal");
  s.click("暂停冒险"); assert.equal(s.host.byClass("adventure-overlay").length, 0);
  s.click("继续冒险"); s.advance(100); assert.ok(s.world().elapsed > elapsed); s.host.unmount();
});

test("snake play has no terminal form after its historical growth milestones", async () => {
  const p = createProgress(); p.adventure = state.saveAdventureGrowth(p.adventure, "snake", 10000, [], 0, Date.now(), 300);
  const s = mount("snake", false, p); await s.ready(); s.key(); await s.flush(); await s.endSpeech(); s.snack();
  assert.ok(s.world().player.length > 300);
  assert.ok(!nodeText(s.host.byClass("adventure-growth")[0]).includes("最高形态")); s.host.unmount();
});

test("targets left behind remain reachable as separated edge navigation buttons, without submitting an answer", async () => {
  const session = mount(); await session.ready(); session.key(); await session.flush();
  session.world().player.x = session.world().width-200; session.advance(300);
  const edgeButtons = session.host.byClass("offscreen");
  assert.equal(edgeButtons.length, new Set(session.world().actors.filter(actor => actor.kind === "mission").map(actor => actor.choiceId)).size, "far copies share one reachable navigator per English choice");
  for (let index = 0; index < edgeButtons.length; index++) {
    const button = edgeButtons[index], rect = button.props.style as { left: number; top: number; width: number; height: number };
    assert.ok(rect.left >= rect.width / 2 && rect.left + rect.width / 2 <= 900);
    assert.ok(rect.top >= rect.height / 2 && rect.top + rect.height / 2 <= 540);
    for (const other of edgeButtons.slice(index + 1)) {
      const next = other.props.style as typeof rect;
      assert.ok(Math.abs(rect.left - next.left) >= (rect.width + next.width) / 2 || Math.abs(rect.top - next.top) >= (rect.height + next.height) / 2, "edge choices must not overlap");
    }
  }
  session.host.click(edgeButtons[0]); session.advance(150);
  assert.ok(Math.abs(session.world().player.heading) > .05, "the navigation button physically turns toward the distant entity");
  assert.equal(session.progress().adventure.modes.fish.completedTasks, 0);
  session.host.unmount();
});

test("English choices reveal the Chinese answer only after an explicit hint", async () => {
  const session = mount(); await session.ready();
  const answerZh = state.getCurrentAdventureTask(session.progress().adventure, "fish").promptZh;
  assert.ok(!nodeText(session.host.byClass("adventure-mission")[0]).includes(answerZh));
  session.key(); await session.flush(); await session.endSpeech();
  assert.ok(!nodeText(session.host.byClass("adventure-mission")[0]).includes(answerZh));
  session.click("乐乐提示"); await session.flush(); await session.endSpeech();
  assert.ok(nodeText(session.host.byClass("adventure-mission")[0]).includes(answerZh));
  assert.equal(session.progress().adventure.modes.fish.current.hintUsed, true);
  session.host.unmount();
});

test("restoring a snake uses the complete repeated body-picture queue instead of its unique-word collection", async () => {
  const saved = createProgress(); saved.adventure = state.saveAdventureGrowth(saved.adventure, "snake", 3, ["cat", "dog", "cat"]);
  assert.equal(saved.adventure.modes.snake.collectedWords.length, 2);
  const restored = mount("snake", false, saved); await restored.ready();
  assert.deepEqual(restored.world().player.collectedWords, ["cat", "dog", "cat"]);
  assert.equal(restored.world().player.body.length, 4);
  restored.host.unmount();
});

test("same-task external XP/body updates freeze before cleanup, while audio settings preserve the running session", async () => {
  for (const render of [true, false]) {
    const session = mount("snake"); await session.ready(); session.key(); await session.flush(); session.snack("cat"); session.advance(1300);
    const beforeTask = state.getCurrentAdventureTask(session.progress().adventure, "snake").instanceKey;
    const external = createProgress(); external.adventure = state.saveAdventureGrowth(external.adventure, "snake", 99, ["dog", "dog", "cat"], 15);
    assert.equal(state.getCurrentAdventureTask(external.adventure, "snake").instanceKey, beforeTask);
    session.replaceProgress(external, render);
    const atImport = session.world().elapsed;
    if (render) { session.key("ArrowDown"); session.advance(800); assert.equal(session.world().elapsed, atImport); }
    session.host.unmount();
    assert.equal(session.progress().adventure.modes.snake.xp, 99);
    assert.deepEqual(session.progress().adventure.modes.snake.bodyWords, ["dog", "dog", "cat"]);
    assert.equal(session.progress().adventure.modes.snake.totalSeconds, 15, "the old world must not add its time into the replacement");
  }
  const settings = mount(); await settings.ready(); settings.key(); await settings.flush(); settings.advance(200);
  const old = settings.progress(), before = settings.world().elapsed;
  settings.replaceProgress({ ...old, settings: { ...old.settings, volume: .4 } });
  settings.advance(300); assert.ok(settings.world().elapsed > before, "changing audio settings preserves the exact adventure reference");
  settings.host.unmount();
});

test("the fish catalog and plant cards speak inside a paused book and cancel when it closes", async () => {
  const session=mount(); await session.ready(); session.click("成长图鉴"); session.click(`${catalog.oceanSpecies.length} 位水世界伙伴`);
  assert.equal(session.host.nodes().filter(node=>node.type==="article").length,catalog.oceanSpecies.length);
  session.click("听英文 Plankton"); await session.flush(); assert.equal(session.speeches.at(-1),"Plankton");
  const stopped=session.world().elapsed; session.advance(300); assert.equal(session.world().elapsed,stopped);
  session.click("80 张英语图卡"); session.click("植物");
  assert.equal(session.host.nodes().filter(node=>node.type==="article").length,8);
  session.click("听英文 flower"); await session.flush(); assert.equal(session.speeches.at(-1),"flower");
  session.click("收好图鉴"); await session.flush(); session.advance(300); assert.equal(session.world().elapsed,stopped);
  session.key(); await session.flush(); assert.equal(session.speeches.at(-1),state.getCurrentAdventureTask(session.progress().adventure,"fish").promptEn);
  session.host.unmount();
});

test("player death saves a one-segment life immediately while retaining learned cards and lifetime growth", async () => {
  const existing=createProgress(); existing.adventure=state.saveAdventureGrowth(existing.adventure,"snake",80,["cat","flower"],0,10,5);
  const session=mount("snake",false,existing); await session.ready(); session.key(); await session.flush(); await session.endSpeech();
  const world=session.world(); world.protectionUntil=0;
  world.actors=[{id:"large-neighbor",kind:"bot",color:"green",x:world.player.x+2,y:world.player.y,radius:25,heading:0,length:50,body:[],trail:[{x:world.player.x+2,y:world.player.y}],breedId:"green-tree-python",spawnIndex:1}];
  session.advance(1000/30);
  const saved=session.progress().adventure.modes.snake;
  assert.equal(saved.xp,80); assert.equal(saved.runLength,1); assert.deepEqual(saved.bodyWords,[]);
  assert.ok(saved.collectedWords.includes("flower")); assert.equal(saved.completedTasks,0);
  assert.ok(nodeText(session.host.byClass("adventure-status")[0]).includes("从一节重新出发"));
  const restored=engine.createAdventureWorld("snake",saved.seed,saved.xp,saved.bodyWords,saved.runLength);
  assert.equal(restored.player.length,1); assert.equal(restored.player.body.length,1);
  session.host.unmount();
});

test("each ocean English card adds fifty growth, including repeat words; ordinary food adds one", async () => {
  const session = mount("fish"); await session.ready(); session.key(); await session.flush(); await session.endSpeech();
  session.snack("cat"); await session.flush(); await session.endSpeech();
  session.snack("cat"); await session.flush(); await session.endSpeech();
  const saved = session.progress().adventure;
  assert.equal(saved.modes.fish.xp, 100);
  assert.equal(saved.oceanScore.cardCount, 0, "legacy score ledger stays frozen");
  assert.equal(saved.oceanScore.recentPickups.length, 0);
  assert.equal(saved.oceanTreasure.creditedCards, 1, "the treasure's distinct-word rule does not suppress growth");
  assert.equal(saved.modes.fish.xp, 100, "both cards add fifty growth");
  session.snack();
  assert.equal(session.progress().adventure.modes.fish.xp, 101);
  assert.equal(session.progress().adventure.modes.fish.xp, 101);
  assert.equal(session.eats.length, 3, "each successful fish meal plays its eating sound once");
  session.host.unmount();
});

test("a correct shell target carrying an English card earns both rewards and one eating sound", async () => {
  const session = mount("fish"); await session.ready(); session.key(); await session.flush(); await session.endSpeech();
  const target = session.world().actors.find(actor => actor.kind === "mission" && actor.choiceId === session.world().mission!.answer)!;
  target.wordId = "cat"; target.card = true;
  session.collectCurrent(); await session.flush();
  const saved = session.progress().adventure;
  assert.equal(saved.modes.fish.completedTasks, 1);
  assert.equal(saved.oceanScore.cardCount, 0);
  assert.equal(saved.modes.fish.xp, 150);
  assert.equal(saved.modes.fish.xp, 150);
  assert.ok(session.commits.filter(p=>p.adventure.modes.fish.xp>=150).every(p=>p.adventure.modes.fish.completedTasks===1), "reward and task must persist atomically");
  state.validateAdventureProgress(saved);
  assert.equal(session.eats.length, 1);
  assert.equal(session.speeches.at(-1), "cat");
  session.advance(300);
  assert.equal(session.progress().adventure.modes.fish.xp, 150, "a consumed target cannot reward again on later frames");
  assert.equal(session.eats.length, 1);
  session.host.unmount();
});

test("same-frame card growth and target completion are saved in a single valid snapshot", async () => {
  const session=mount("fish");await session.ready();session.key();await session.flush();await session.endSpeech();
  const world=session.world(),target=world.actors.find(a=>a.kind==="mission"&&a.choiceId===world.mission!.answer)!;
  const card=world.actors.find(a=>a.kind==="food")!;
  target.x=card.x=world.player.x+2;target.y=card.y=world.player.y;card.wordId="cat";card.card=true;
  world.actors=[card,target];const commits=session.commits.length;
  session.advance(1000/30);
  assert.equal(session.progress().adventure.modes.fish.xp,150);
  assert.equal(session.progress().adventure.modes.fish.completedTasks,1);
  assert.equal(session.progress().adventure.oceanTreasure.creditedCards,1);
  assert.equal(session.eats.length,2);
  const writes=session.commits.slice(commits);
  assert.equal(writes.length,1);
  for(const p of writes) state.validateAdventureProgress(p.adventure);
  const restored=state.validateAdventureProgress(structuredClone(session.progress().adventure));
  assert.equal(restored.modes.fish.xp,150);assert.equal(restored.modes.fish.completedTasks,1);
  session.host.unmount();
});

test("a three-fish counting target gives one hundred growth only when its entire collection is complete", async () => {
  const existing = createProgress();
  while (state.getCurrentAdventureTask(existing.adventure, "fish").requiredCount !== 3) {
    const task = state.getCurrentAdventureTask(existing.adventure, "fish");
    existing.adventure = state.recordAdventureChoice(existing.adventure, "fish", task, task.answer);
  }
  const session = mount("fish", false, existing); await session.ready(); session.key(); await session.flush(); await session.endSpeech();
  const before = session.progress().adventure.modes.fish.xp;
  const completed = session.progress().adventure.modes.fish.completedTasks, xp = session.progress().adventure.modes.fish.xp;
  for (let collected = 1; collected <= 3; collected++) {
    session.collectCurrent();
    const saved = session.progress().adventure;
    assert.equal(saved.modes.fish.xp, before + (collected === 3 ? 100 : 0));
    assert.equal(saved.modes.fish.completedTasks, completed + Number(collected === 3));
    assert.equal(saved.modes.fish.xp, xp + (collected === 3 ? 100 : 0));
    assert.equal(session.eats.length, collected, "partial counting pickups are successful fish meals too");
  }
  session.advance(200);
  assert.equal(session.progress().adventure.modes.fish.xp, before + 100);
  assert.equal(session.eats.length, 3);
  session.host.unmount();
});

test("wrong or unheard shell targets do not earn growth or play successful eating audio", async () => {
  const session = mount("fish"); await session.ready(); session.key(); await session.flush();
  session.collectCurrent();
  assert.equal(session.progress().adventure.modes.fish.completedTasks, 0);
  assert.equal(session.eats.length, 0, "the listening gate prevents eating the answer early");
  for (const actor of session.world().actors) { actor.x = session.world().width - 100; actor.y = session.world().height - 100; }
  await session.endSpeech();
  const wrong = session.world().actors.find(actor => actor.kind === "mission" && actor.choiceId !== session.world().mission!.answer)!;
  wrong.x = session.world().player.x + 2; wrong.y = session.world().player.y;
  session.advance(1000 / 30);
  const saved = session.progress().adventure;
  assert.equal(saved.modes.fish.completedTasks, 0);
  assert.equal(scoring.oceanPoints(saved.oceanScore, saved.modes.fish.completedTasks), 0);
  assert.equal(saved.modes.fish.xp, 0);
  assert.equal(session.eats.length, 0);
  session.host.unmount();
});

test("rejected fish card and shell-target commits cannot add growth to a newer profile", async () => {
  for (const pickup of ["card", "target"] as const) {
    const session = mount("fish"); await session.ready(); session.key(); await session.flush(); await session.endSpeech();
    session.world().boostRngState = 2000; session.rejectNextCommit();
    if (pickup === "card") session.snack("cat"); else session.collectCurrent();
    const saved = session.progress().adventure;
    assert.equal(saved.oceanScore.cardCount, 0);
    assert.equal(saved.modes.fish.completedTasks, 0);
    assert.equal(scoring.oceanPoints(saved.oceanScore, saved.modes.fish.completedTasks), 0);
    assert.equal(saved.modes.fish.xp, 0);
    session.advance(200);
    assert.ok(nodeText(session.host.byClass("adventure-growth")[0]).includes("成长 0 点"),"rejected growth is never shown as saved growth");
    assert.equal(session.host.byClass("evolution-toast").length,0,"an unsaved evolution cannot be announced");
    assert.equal(session.host.byClass("speed-boost-status").length,0,"an unsaved card cannot show a boost");
    assert.ok(nodeText(session.host.byClass("adventure-status")[0]).includes("学习记录已更新"));
    const stopped = session.world().elapsed; session.advance(500);
    assert.equal(session.world().elapsed, stopped);
    session.host.unmount();
    assert.equal(scoring.oceanPoints(session.progress().adventure.oceanScore, session.progress().adventure.modes.fish.completedTasks), 0);
  }
});

test("snake meals retain their existing feedback and do not affect ocean points", async () => {
  const session = mount("snake"); await session.ready(); session.key(); await session.flush(); await session.endSpeech();
  session.snack("cat"); await session.flush(); await session.endSpeech(); session.collectCurrent();
  const saved = session.progress().adventure;
  assert.equal(saved.modes.snake.completedTasks, 1);
  assert.equal(saved.oceanScore.cardCount, 0);
  assert.equal(scoring.oceanPoints(saved.oceanScore, saved.modes.fish.completedTasks), 0);
  assert.equal(session.eats.length, 0);
  assert.ok(session.effects.includes("correct"));
  assert.ok(session.effects.includes("reward"));
  session.host.unmount();
});
