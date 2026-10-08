import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../lib/shark-engine";
import * as content from "../lib/shark-content";
import * as state from "../lib/shark-progress";
import * as fullscreen from "../lib/adventure-fullscreen";
import * as naturalArt from "../lib/natural-ocean-art";
import { createProgress, type Progress } from "../lib/progress";
import type { SharkFoodLabelRect } from "../components/shark-renderer";
import { componentHost, nodeText } from "./helpers/component-host";

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (error: Error) => void };
function deferred(): Deferred {
  let resolve!: () => void, reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mount(options: { welcome?: boolean; unlockFails?: boolean; deferImages?: boolean; canvasFails?: boolean } = {}) {
  let progress = createProgress(), now = 0, nextRaf = 0, world!: engine.SharkWorld, currentSpeech: Deferred | null = null;
  if (!options.welcome) progress.shark = { ...progress.shark, lastAt: 1 };
  let imageLoads = 0;
  let canvasFails = !!options.canvasFails;
  const imageRequests: Deferred[] = [], imagePaints: boolean[] = [];
  let unlockFails = !!options.unlockFails, stops = 0, unlocks = 0, paints = 0, disconnects = 0, backs = 0, duplicateNext = false, retrySaves = 0, backups = 0;
  const raf = new Map<number, (time: number) => void>(), listeners = new Map<string, Set<(event: unknown) => void>>();
  const speeches: { text: string; language: string; completion: Deferred }[] = [], controls: engine.SharkControl[] = [], bites: number[] = [], commits: Progress[] = [];
  let paintedRects: { x: number; y: number; w: number; h: number }[] = [];
  let renderedLabels: SharkFoodLabelRect[] | undefined;
  function events(surface: string) {
    return {
      addEventListener(name: string, listener: (event: unknown) => void) { const key = `${surface}:${name}`; if (!listeners.has(key)) listeners.set(key, new Set()); listeners.get(key)!.add(listener); },
      removeEventListener(name: string, listener: (event: unknown) => void) { listeners.get(`${surface}:${name}`)?.delete(listener); },
    };
  }
  const document = { ...events("document"), hidden: false, documentElement: {}, body: { style: { overflow: "scroll" } }, fullscreenElement: null };
  let nextMedia = 0;
  const window = { ...events("window"), devicePixelRatio: 2, matchMedia: () => ({ matches: false, ...events(`media-${++nextMedia}`) }) };
  class InputTarget { closest() { return null; } }
  const commit = (change: Progress | ((previous: Progress) => Progress)) => { progress = typeof change === "function" ? change(progress) : change; commits.push(progress); return progress; };
  let props = { progress, commit, onBack: () => { backs++; }, onSettings() {}, suspended: false, storageError: "", onRetryStorage: () => { retrySaves++; }, onBackup: () => { backups++; } };
  const host = componentHost(new URL("../components/shark-feast.tsx", import.meta.url), "SharkFeast", props, () => ({
    "@/lib/natural-ocean-art": naturalArt, "@/lib/shark-content": content, "@/lib/shark-progress": state, "@/lib/adventure-fullscreen": fullscreen,
    "@/lib/shark-engine": {
      ...engine,
      createSharkWorld(saved: state.SharkProgress) { world = engine.createSharkWorld(saved, 123456); world.foods = []; return world; },
      stepSharkWorld(live: engine.SharkWorld, control: engine.SharkControl, dt: number) {
        controls.push({ ...control }); const result = engine.stepSharkWorld(live, control, dt);
        if (duplicateNext && result.pickups.length) { duplicateNext = false; return { ...result, pickups: [...result.pickups, result.pickups[0]] }; }
        return result;
      },
    },
    "./shark-renderer": {
      loadSharkImages() {
        imageLoads++;
        if (options.deferImages) { const request = deferred(); imageRequests.push(request); return request.promise.then(() => ({ sprites: new Map() })); }
        return Promise.resolve({ sprites: new Map() });
      },
      paintSharkWorld(_context: unknown, _world: unknown, _width: number, _height: number, options: { hudRects: typeof paintedRects; images?: unknown }) { paints++; imagePaints.push(!!options.images); paintedRects = options.hudRects; return renderedLabels; },
    }, "./shark-feast.css": {},
    "@/lib/audio": {
      unlockAudio() { unlocks++; return unlockFails ? Promise.reject(new Error("声音没有开启")) : Promise.resolve(); },
      playSpeech(text: string, language = "en") { currentSpeech = deferred(); speeches.push({ text, language, completion: currentSpeech }); return currentSpeech.promise; },
      stopAllAudio() { stops++; currentSpeech?.resolve(); currentSpeech = null; },
      playAdventureEat() { bites.push(now); },
    },
  }), {
    document, window, HTMLElement: InputTarget, Date: { now: () => Math.floor(now) },
    ResizeObserver: class { observe() {} disconnect() { disconnects++; } },
    requestAnimationFrame(callback: (time: number) => void) { const id = ++nextRaf; raf.set(id, callback); return id; },
    cancelAnimationFrame(id: number) { raf.delete(id); },
  });
  const canvas = {
    width: 0, height: 0, getContext: () => canvasFails ? null : ({ setTransform() {} }),
    getBoundingClientRect: () => ({ left: 100, top: 40, width: 900, height: 600 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
  };
  const canvasNode = host.nodes().find(node => node.type === "canvas")!;
  (canvasNode.props.ref as { current: unknown }).current = canvas;
  (host.byClass("shark-feast-scene")[0].props.ref as { current: unknown }).current = {
    getBoundingClientRect: () => ({ left: 100, top: 40, width: 900, height: 600 }),
    querySelectorAll: () => [{ getBoundingClientRect: () => ({ left: 400, top: 56, width: 350, height: 100 }) }],
  };
  function sync() { props = { ...props, progress }; host.update(props); }
  function fire(surface: string, name: string, event: unknown = {}) { for (const listener of listeners.get(`${surface}:${name}`) ?? []) listener(event); sync(); }
  fire("window", "resize");
  function advance(milliseconds: number) {
    const end = now + milliseconds;
    while (now < end - .00001) {
      now = Math.min(end, now + 1000 / 60);
      const frames = [...raf.values()]; raf.clear(); for (const callback of frames) callback(now); sync();
    }
  }
  function key(key = "ArrowRight") { fire("document", "keydown", { key, target: new InputTarget(), preventDefault() {} }); }
  function click(label: string) { host.click(host.button(label)); sync(); }
  async function flush() { await host.flush(); sync(); }
  async function ready() { await flush(); advance(1000 / 60); await flush(); assert.equal(host.byClass("shark-loading-overlay").length, 0, "images and the initial canvas frame must finish before playing"); }
  return {
    host, speeches, controls, bites, commits, document, canvas, world: () => world, progress: () => progress,
    paints: () => paints, paintedRects: () => paintedRects, disconnects: () => disconnects, stops: () => stops, unlocks: () => unlocks, backs: () => backs, retrySaves: () => retrySaves, backups: () => backups,
    rafCount: () => raf.size, listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    key, click, fire, advance, flush, ready, imagePaints,
    update(change: Partial<typeof props>) { props = { ...props, ...change }; host.update(props); },
    replaceProgress(next: Progress, render = true) { progress = next; if (render) sync(); },
    spaceOnButton() {
      const target = Object.assign(new InputTarget(), { closest(selector: string) { return selector.includes("button") ? {} : null; } });
      let prevented = false;
      fire("document", "keydown", { key: " ", code: "Space", target, preventDefault() { prevented = true; } });
      return prevented;
    },
    unlockWorks() { unlockFails = false; },
    imageLoads: () => imageLoads,
    resolveImages(index = imageRequests.length - 1) { imageRequests[index].resolve(); },
    rejectImages(index = imageRequests.length - 1) { imageRequests[index].reject(new Error("offline")); },
    canvasWorks() { canvasFails = false; },
    duplicateNext() { duplicateNext = true; },
    labels(rectangles: SharkFoodLabelRect[]) { renderedLabels = rectangles; },
    async endSpeech() { const pending = currentSpeech; currentSpeech = null; pending?.resolve(); await flush(); },
    async failSpeech() { const pending = currentSpeech; currentSpeech = null; pending?.reject(new Error("声音加载失败")); await flush(); },
    visibility(hidden: boolean) { document.hidden = hidden; fire("document", "visibilitychange"); },
    collect(tokenId: string) {
      world.foods = [{ id: `test:${tokenId}`, tokenId, x: world.player.x + 2, y: world.player.y, kind: "fish", vx: 0, vy: 0, size: 10, angle: 0, phase: 0, edible: true }];
      advance(1000 / 30); world.foods = [];
    },
    pointer(x: number, y: number) {
      (canvasNode.props.onPointerDown as (event: unknown) => void)({ button: 0, pointerId: 1, clientX: x, clientY: y, currentTarget: canvas, preventDefault() {} }); sync();
    },
    drag(x: number, y: number) {
      (canvasNode.props.onPointerMove as (event: unknown) => void)({ pointerId: 1, clientX: x, clientY: y, currentTarget: canvas }); sync();
    },
    release() { (canvasNode.props.onPointerUp as (event: unknown) => void)({ pointerId: 1, currentTarget: canvas }); sync(); },
    prey(tokenId: string) {
      const food: engine.SharkFood = { id: `moving:${tokenId}`, tokenId, x: world.player.x + 200, y: world.player.y, kind: "fish", vx: 60, vy: 0, size: 10, angle: 0, phase: 0, edible: true };
      world.foods = [food]; world.nearbyFoodIds = [food.id]; return food;
    },
  };
}

test("a pickup saves immediately once and serial English listens count only completed playback", async () => {
  const session = mount(); await session.ready(); session.key(); session.advance(40);
  session.duplicateNext(); session.collect("A"); session.collect("B"); await session.flush();
  assert.equal(session.progress().shark.letters, 2); assert.equal(session.progress().shark.recentPickups.length, 2);
  assert.equal(session.progress().shark.listenCount, 0, "queued and playing English is not a completed listen");
  assert.equal(session.bites.length, 2, "a repeated pickup callback cannot repeat bite feedback");
  assert.deepEqual(session.speeches.map(speech => speech.text), ["A"]);
  await session.endSpeech(); assert.equal(session.progress().shark.listenCount, 1);
  assert.deepEqual(session.speeches.map(speech => speech.text), ["A", "B"]);
  await session.endSpeech(); assert.equal(session.progress().shark.listenCount, 2);
  assert.equal(session.progress().stars, 0, "free-swim exposure never awards assessment stars");
  session.host.unmount();
});

test("three pending voices gate new collection without dropping English or slowing swimming", async () => {
  const session = mount(); await session.ready(); session.key(); session.advance(40);
  for (const letter of ["A", "B", "C", "D"]) session.collect(letter);
  session.collect("E"); assert.equal(session.progress().shark.letters, 4);
  assert.equal(session.controls.at(-1)!.canCollect, false);
  const before = { ...session.world().player }; session.advance(1000);
  assert.ok(Math.abs(engine.sharkDistance(before, session.world().player) - engine.SHARK_MOVE_SPEED) < 1, "voice backpressure leaves swim speed at 370px/s");
  await session.endSpeech(); session.collect("E"); assert.equal(session.progress().shark.letters, 5);
  for (let index = 0; index < 4; index++) await session.endSpeech();
  assert.deepEqual(session.speeches.map(speech => speech.text), ["A", "B", "C", "D", "E"]);
  assert.equal(session.progress().shark.listenCount, 5);
  session.host.unmount();
});

test("background pauses discard no pending English and settings closing requires explicit continue", async () => {
  const session = mount(); await session.ready(); session.key(); session.advance(40); session.collect("A"); session.collect("B");
  const elapsed = session.world().elapsed, old = session.speeches[0].completion;
  session.fire("window", "native-background"); session.fire("window", "pagehide"); await session.flush(); session.advance(12000);
  assert.equal(session.world().elapsed, elapsed); assert.equal(session.rafCount(), 0); assert.equal(session.progress().shark.listenCount, 0);
  old.resolve(); await session.flush(); assert.equal(session.speeches.length, 1, "a late canceled completion never starts queued English");
  session.update({ suspended: true }); session.update({ suspended: false }); await session.flush();
  assert.equal(session.host.byClass("shark-pause-overlay").length, 1); assert.equal(session.speeches.length, 1);
  session.click("继续游"); await session.flush(); assert.equal(session.speeches.at(-1)!.text, "A");
  await session.endSpeech(); assert.equal(session.speeches.at(-1)!.text, "B");
  await session.endSpeech(); assert.equal(session.progress().shark.listenCount, 2);
  session.host.unmount();
});

test("external records freeze the old world and cleanup cannot overwrite a newly imported record", async () => {
  const session = mount(); await session.ready(); session.key(); session.advance(10400); session.collect("A");
  const imported = { ...createProgress(), shark: { ...state.createSharkProgress(), totalSeconds: 777, lastAt: 100 } };
  session.replaceProgress(imported); const elapsed = session.world().elapsed; await session.flush(); session.advance(3000);
  assert.equal(session.world().elapsed, elapsed); assert.equal(session.progress(), imported);
  assert.ok(nodeText(session.host.byClass("shark-pause-card")[0]).includes("记录"));
  session.host.unmount(); assert.equal(session.progress(), imported);

  const cleanup = mount(); await cleanup.ready(); cleanup.key(); cleanup.advance(5300); cleanup.replaceProgress(imported, false); cleanup.host.unmount();
  assert.equal(cleanup.progress(), imported, "a parent import just before unmount is protected by the commit guard");
});

test("unmount cancels RAF, speech, all listeners and body fullscreen overflow without late narration", async () => {
  const session = mount({ welcome: true });
  await session.ready();
  assert.equal(session.document.body.style.overflow, "hidden"); assert.equal(session.canvas.width, 1800); assert.equal(session.canvas.height, 1200);
  assert.deepEqual(JSON.parse(JSON.stringify(session.paintedRects())), [{ x: 300, y: 16, w: 350, h: 100 }], "renderer exclusions use actual HUD bounds relative to the scene");
  session.key(); session.advance(40); session.collect("A"); const oldGuide = session.speeches[0].completion;
  assert.ok(session.paints() > 0); assert.ok(session.rafCount() > 0);
  session.host.unmount(); oldGuide.resolve(); await session.flush(); session.advance(3000);
  assert.equal(session.speeches.length, 1); assert.equal(session.progress().shark.listenCount, 0);
  assert.equal(session.rafCount(), 0); assert.equal(session.listenerCount(), 0); assert.equal(session.host.timerCount(), 0);
  assert.equal(session.disconnects(), 1); assert.equal(session.document.body.style.overflow, "scroll"); assert.ok(session.stops() > 0);
});

test("audio unlock failure before any pickup can be retried, and a failed English item retains its queue", async () => {
  const session = mount({ unlockFails: true }); await session.ready(); session.key(); await session.flush();
  assert.equal(session.progress().shark.letters, 0); assert.equal(session.host.byClass("shark-audio-error").length, 1);
  const unlocks = session.unlocks(); session.unlockWorks(); session.click("重试声音"); await session.flush();
  assert.ok(session.unlocks() > unlocks); assert.equal(session.host.byClass("shark-audio-error").length, 0);
  session.advance(40); session.collect("A"); session.collect("B"); await session.failSpeech();
  session.collect("C"); assert.equal(session.progress().shark.letters, 2, "failed audio pauses collection while swimming remains active");
  session.click("重试声音"); await session.flush(); assert.equal(session.speeches.at(-1)!.text, "A");
  await session.endSpeech(); assert.equal(session.speeches.at(-1)!.text, "B"); await session.endSpeech();
  assert.equal(session.progress().shark.listenCount, 2); session.host.unmount();
});

test("pointer and direction controls start freely, fullscreen Escape retains the world, and welcome runs once", async () => {
  const session = mount({ welcome: true }); await session.ready(); session.pointer(775, 490); session.advance(50); await session.flush();
  const world = session.world(); assert.ok(world.elapsed > 0); assert.ok(session.controls.some(control => !!control.target));
  assert.equal(session.speeches[0].text, content.sharkGuides.welcome);
  session.fire("document", "keydown", { key: "Escape", defaultPrevented: false });
  assert.equal(session.host.byClass("shark-feast-expanded").length, 0); assert.equal(session.world(), world);
  session.click("向下游"); session.advance(50); assert.equal(session.host.byClass("shark-feast-expanded").length, 0);
  await session.endSpeech(); session.collect("A"); await session.endSpeech(); session.click("暂停游玩"); session.click("继续游"); await session.flush();
  assert.equal(session.speeches.filter(speech => speech.language === "zh").length, 1);
  session.click("返回地图"); assert.equal(session.backs(), 1); assert.equal(session.rafCount(), 0); session.host.unmount();
});

test("tapping moving prey follows its live position, while dragging or arrows immediately take control", async () => {
  const session = mount(); await session.ready(); const prey = session.prey("A"); session.pointer(750, 40 + engine.sharkWorldToScreen(session.world().player, engine.sharkCamera(session.world(), 900, 600)).y); session.release(); session.advance(200);
  assert.ok(prey.x > 1800); assert.ok(session.controls.at(-1)!.target!.x > 1800, "a tap follows the swimming prey instead of its old click position");
  session.advance(1100); await session.flush(); assert.equal(session.progress().shark.letters, 1, "a six-year-old can collect a moving letter with one tap");
  session.world().foods = []; session.prey("B"); session.pointer(750, 40 + engine.sharkWorldToScreen(session.world().player, engine.sharkCamera(session.world(), 900, 600)).y); session.drag(500, 500); session.advance(50);
  const manualTarget = session.controls.at(-1)!.target!.x; session.advance(50);
  assert.equal(session.controls.at(-1)!.target!.x, manualTarget, "a deliberate drag releases the tracked prey");
  session.key("ArrowUp"); session.advance(50); assert.equal(session.controls.at(-1)!.target, undefined); assert.equal(session.controls.at(-1)!.direction!.y, -1);
  session.host.unmount(); assert.equal(session.rafCount(), 0); assert.equal(session.listenerCount(), 0);
});

test("tapping a displaced English label follows its live prey and dragging releases it", async () => {
  for (const tokenId of ["cat", "sentence-like-read"]) {
    const session = mount(); await session.ready(); const prey = session.prey(tokenId);
    session.labels([{ foodId: prey.id, x: 300, y: 430, w: 150, h: 60 }]);
    session.pointer(475, 500); session.release(); session.advance(200);
    assert.ok(session.controls.at(-1)!.target!.x > 1800, "a label outside the body radius follows the moving prey");
    assert.ok(Math.abs(session.controls.at(-1)!.target!.y - prey.y) < 1, "tracking updates with the prey each frame");
    session.pointer(475, 500); session.drag(500, 520); session.advance(50);
    const manualTarget = { ...session.controls.at(-1)!.target! }; session.advance(50);
    assert.deepEqual(session.controls.at(-1)!.target, manualTarget, "dragging releases the label-selected prey");
    session.host.unmount();
  }
});

test("label hit areas cannot select removed, hidden, offscreen or oversized prey", async () => {
  for (const invalid of ["removed", "hidden", "offscreen", "oversized", "locked"]) {
    const session = mount(); await session.ready(); const prey = session.prey("A"), world = session.world();
    session.labels([{ foodId: prey.id, x: 300, y: 430, w: 150, h: 60 }]);
    if (invalid === "removed") world.foods = [];
    if (invalid === "hidden") world.nearbyFoodIds = [];
    if (invalid === "offscreen") prey.x = world.player.x + 1000;
    if (invalid === "oversized") prey.size = world.player.size;
    if (invalid === "locked") prey.edible = false;
    session.pointer(475, 500); session.release(); session.advance(50);
    const target = session.controls.at(-1)!.target!;
    assert.equal(target.x, 1525, `${invalid} labels keep the ordinary water target`);
    assert.equal(target.y, 460 + engine.sharkCamera(world, 900, 600).y);
    session.host.unmount();
  }
});

test("fullscreen storage failure stays visible with retry and backup, and pause never falsely claims saved growth", async () => {
  const session = mount({ unlockFails: true }); await session.ready(); session.key(); await session.flush();
  session.update({ storageError: "设备空间不足，请先导出备份。" });
  assert.equal(session.host.byClass("shark-feast-expanded").length, 1);
  assert.equal(session.host.byClass("shark-alert-stack").length, 1);
  assert.equal(session.host.byClass("shark-storage-error").length, 1); assert.equal(session.host.byClass("shark-audio-error").length, 1);
  assert.ok(nodeText(session.host.byClass("shark-storage-error")[0]).includes("暂存在本页面"));
  assert.equal(session.host.byClass("shark-pause-overlay").length, 0, "storage failure preserves current practice");
  session.click("重试保存"); session.click("备份成长"); assert.equal(session.retrySaves(), 1); assert.equal(session.backups(), 1);
  session.click("暂停游玩"); const pauseText = nodeText(session.host.byClass("shark-pause-card")[0]);
  assert.ok(pauseText.includes("暂存在本页面")); assert.equal(pauseText.includes("已经保存"), false);
  session.click("重试保存"); assert.equal(session.retrySaves(), 2, "saving remains reachable from the fullscreen paused scene");
  session.update({ storageError: "" }); assert.equal(session.host.byClass("shark-storage-error").length, 0);
  assert.ok(nodeText(session.host.byClass("shark-pause-card")[0]).includes("已经保存")); session.host.unmount();
});


test("touch jump and Space start swimming, rise above the water, freeze on pause, and resume to a splash", async () => {
  const session = mount(); await session.ready(); session.click("跃出海面"); await session.flush();
  assert.ok(session.rafCount() > 0, "the jump button starts play without a Start step");
  assert.equal(session.world().jump.phase, "approach");
  session.advance(300); assert.equal(session.world().jump.phase, "air");
  assert.ok(session.world().player.y < engine.SHARK_SURFACE_Y);
  session.click("暂停游玩"); const height = session.world().player.y;
  session.advance(600); assert.equal(session.world().player.y, height);
  session.fire("document", "keydown", { key: " ", code: "Space", target: {}, preventDefault() {} });
  assert.equal(session.world().player.y, height, "Space cannot start a paused world");
  session.click("继续游"); session.advance(1100); assert.equal(session.world().jump.splash, 1);
  session.fire("document", "keydown", { key: " ", code: "Space", repeat: false, target: {}, preventDefault() {} });
  assert.equal(session.world().jump.phase, "approach");
  session.host.unmount(); assert.equal(session.rafCount(), 0);
});

test("deferred images block every play input until the first loaded canvas frame", async () => {
  const session = mount({ deferImages: true, welcome: true }), initial = session.progress(), player = { ...session.world().player };
  assert.ok(nodeText(session.host.byClass("shark-loading-card")[0]).includes("正在准备"));
  assert.equal(nodeText(session.host.byClass("shark-loading-card")[0]).includes("%"), false);
  assert.equal(session.host.byClass("shark-first-guide").length, 0);
  session.key(); session.pointer(775, 490); session.drag(500, 500); session.release(); session.click("向下游"); session.click("跃出海面");
  session.fire("document", "keydown", { key: " ", code: "Space", target: {}, preventDefault() {} });
  session.collect("A"); session.advance(12000); await session.flush();
  assert.equal(session.world().elapsed, 0); assert.deepEqual(session.world().player, player); assert.equal(session.world().jump.phase, "idle");
  assert.equal(session.controls.length, 0); assert.equal(session.speeches.length, 0); assert.equal(session.unlocks(), 0); assert.equal(session.bites.length, 0);
  assert.equal(session.progress(), initial); assert.equal(session.commits.length, 0); assert.equal(session.paints(), 0); assert.equal(session.rafCount(), 0);

  session.resolveImages(); await session.flush();
  assert.ok(session.paints() > 0); assert.ok(session.imagePaints.every(Boolean), "the initial canvas uses the loaded art");
  assert.ok(nodeText(session.host.byClass("shark-loading-card")[0]).includes("正在画出海洋"));
  assert.deepEqual(session.host.nodes().filter(node => node.type === "li" && node.props["data-state"]).map(node => node.props["data-state"]), ["done", "current"]);
  session.key(); session.pointer(775, 490); session.release(); session.click("向下游");
  assert.equal(session.world().elapsed, 0); assert.equal(session.controls.length, 0); assert.equal(session.unlocks(), 0);
  await session.ready();
  session.advance(1000); assert.equal(session.world().elapsed, 0, "early inputs never queue a later start");
  assert.equal(session.host.byClass("shark-first-guide").length, 1);
  session.key(); session.advance(40); await session.flush();
  assert.ok(session.world().elapsed > 0); assert.equal(session.speeches[0].text, content.sharkGuides.welcome);
  session.collect("A"); assert.equal(session.progress().shark.letters, 1);
  session.host.unmount();
});

test("deferred image failure holds growth and sound until retry loads and paints the ocean", async () => {
  const session = mount({ deferImages: true, welcome: true }), initial = session.progress();
  session.rejectImages(); await session.flush();
  assert.equal(session.imageLoads(), 1); assert.ok(session.host.button("重试图片"));
  assert.equal(session.host.byClass("shark-feast-canvas")[0].props["aria-busy"], false, "an error has stopped loading and exposes its retry action");
  assert.ok(nodeText(session.host.byClass("shark-loading-card")[0]).includes("还没准备好"));
  session.key(); session.pointer(775, 490); session.release(); session.click("向上游"); session.click("跃出海面"); session.collect("A"); session.advance(12000);
  assert.equal(session.progress(), initial); assert.equal(session.world().elapsed, 0); assert.equal(session.controls.length, 0);
  assert.equal(session.speeches.length, 0); assert.equal(session.unlocks(), 0); assert.equal(session.bites.length, 0); assert.equal(session.paints(), 0);
  session.click("重试图片"); assert.equal(session.imageLoads(), 2);
  assert.equal(session.host.byClass("shark-feast-canvas")[0].props["aria-busy"], true);
  assert.ok(nodeText(session.host.byClass("shark-loading-card")[0]).includes("正在准备"));
  session.key(); session.advance(2000); assert.equal(session.world().elapsed, 0);
  session.resolveImages(); await session.ready();
  assert.equal(session.progress(), initial); assert.equal(session.world().elapsed, 0);
  session.click("向下游"); session.advance(40); session.collect("A");
  assert.equal(session.progress().shark.letters, 1); assert.ok(session.unlocks() > 0);
  session.host.unmount();
});

test("an unavailable canvas stays blocked with the completed image phase and can retry", async () => {
  const session = mount({ deferImages: true, canvasFails: true });
  session.resolveImages(); await session.flush();
  const steps = session.host.nodes().filter(node => node.type === "li" && node.props["data-state"]);
  assert.deepEqual(steps.map(node => node.props["data-state"]), ["done", "error"]);
  assert.ok(nodeText(session.host.byClass("shark-loading-card")[0]).includes("画面还没画好"));
  session.key(); session.advance(2000); assert.equal(session.controls.length, 0); assert.equal(session.paints(), 0);
  session.canvasWorks(); session.click("重试图片"); session.resolveImages(); await session.ready();
  session.key(); session.advance(40); assert.ok(session.world().elapsed > 0);
  session.host.unmount();
});

test("leaving or unmounting ignores late image success and failure and cancels the readiness frame", async () => {
  for (const exit of ["leave", "unmount"]) for (const result of ["success", "failure"]) {
    const session = mount({ deferImages: true });
    const before = nodeText(session.host.byClass("shark-loading-card")[0]);
    if (exit === "leave") session.click("返回地图"); else session.host.unmount();
    if (result === "success") session.resolveImages(); else session.rejectImages();
    await session.flush(); session.advance(2000);
    assert.equal(session.paints(), 0); assert.equal(session.rafCount(), 0); assert.equal(session.controls.length, 0);
    assert.equal(session.unlocks(), 0); assert.equal(nodeText(session.host.byClass("shark-loading-card")[0]), before);
    if (exit === "leave") { assert.equal(session.backs(), 1); session.host.unmount(); }
    assert.equal(session.listenerCount(), 0); assert.equal(session.document.body.style.overflow, "scroll");
  }
  for (const exit of ["leave", "unmount"]) {
    const session = mount({ deferImages: true }); session.resolveImages(); await session.flush();
    assert.equal(session.rafCount(), 1); const paints = session.paints();
    if (exit === "leave") session.click("返回地图"); else session.host.unmount();
    assert.equal(session.rafCount(), 0); session.advance(2000); await session.flush();
    assert.equal(session.paints(), paints); assert.equal(session.controls.length, 0); assert.equal(session.unlocks(), 0);
    assert.equal(session.host.byClass("shark-first-guide").length, 0, "a canceled readiness callback never opens gameplay");
    if (exit === "leave") session.host.unmount();
  }
});

test("loading completion preserves suspension, background pause and record conflict gates", async () => {
  for (const gate of ["settings", "background"]) {
    const session = mount({ deferImages: true });
    if (gate === "settings") session.update({ suspended: true }); else session.fire("window", "native-background");
    if (gate === "settings") {
      session.rejectImages(); await session.flush();
      assert.equal(session.host.byClass("shark-loading-overlay").length, 1, "loading failures remain reachable while settings pause the game");
      session.click("重试图片"); assert.equal(session.imageLoads(), 2);
    }
    session.resolveImages(); await session.ready(); session.key(); session.advance(2000);
    assert.equal(session.world().elapsed, 0); assert.equal(session.unlocks(), 0); assert.equal(session.host.byClass("shark-pause-overlay").length, 1);
    if (gate === "settings") { session.click("继续游"); assert.equal(session.unlocks(), 0); session.update({ suspended: false }); }
    session.click("继续游"); session.advance(40); assert.ok(session.world().elapsed > 0);
    session.host.unmount();
  }
  const session = mount({ deferImages: true });
  const imported = { ...createProgress(), shark: { ...state.createSharkProgress(), totalSeconds: 777, lastAt: 100 } };
  session.replaceProgress(imported); session.resolveImages(); await session.ready(); session.key(); session.advance(2000);
  assert.equal(session.progress(), imported); assert.equal(session.world().elapsed, 0); assert.equal(session.unlocks(), 0);
  assert.ok(nodeText(session.host.byClass("shark-pause-card")[0]).includes("记录")); session.host.unmount(); assert.equal(session.progress(), imported);
});


test("Space leaves focused UI buttons to their native activation instead of hijacking a jump", async () => {
  const session = mount(); await session.ready(); session.key(); session.advance(40);
  assert.equal(session.spaceOnButton(), false);
  assert.equal(session.world().jump.phase, "idle");
  session.click("暂停游玩"); assert.equal(session.rafCount(), 0);
  session.host.unmount();
});
