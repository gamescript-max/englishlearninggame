import test from "node:test";
import assert from "node:assert/strict";
import { createAdventureFullscreen } from "../lib/adventure-fullscreen";

function fixture(native: "absent" | "resolve" | "reject" | "reject-once" | "throw" | "delayed" = "absent") {
  const listeners = new Map<string, Set<(event: KeyboardEvent) => void>>(), states: boolean[] = [];
  let requests = 0, exits = 0, blocked = false, release = () => {};
  const root: { requestFullscreen?: (options?: FullscreenOptions) => Promise<void> } = {};
  const doc = {
    body: { style: { overflow: "clip" } }, documentElement: root, fullscreenElement: null as object | null,
    addEventListener(name: string, fn: (event: KeyboardEvent) => void) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
    removeEventListener(name: string, fn: (event: KeyboardEvent) => void) { listeners.get(name)?.delete(fn); },
    exitFullscreen() { exits++; doc.fullscreenElement = null; event("fullscreenchange"); return Promise.resolve(); },
  };
  function event(name: string, value: Partial<KeyboardEvent> = {}) { for (const fn of listeners.get(name) ?? []) fn(value as KeyboardEvent); }
  function enter() { doc.fullscreenElement = root; event("fullscreenchange"); }
  if (native !== "absent") root.requestFullscreen = options => {
    requests++; assert.equal(options?.navigationUI, "hide");
    if (native === "throw") throw new Error("not allowed");
    if (native === "reject" || native === "reject-once" && requests === 1) return Promise.reject(new Error("not allowed"));
    if (native === "delayed") return new Promise<void>(resolve => { release = () => { enter(); resolve(); }; });
    enter(); return Promise.resolve();
  };
  const controller = createAdventureFullscreen(doc as unknown as Document, value => states.push(value), () => !blocked);
  return { controller, doc, states, event, release: () => release(), block: (value: boolean) => { blocked = value; }, requests: () => requests, exits: () => exits, listeners: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0) };
}

test("initial entry expands the map and locks scrolling before any interaction", () => {
  const f = fixture(); f.controller.enter();
  assert.deepEqual(f.states, [true]); assert.equal(f.doc.body.style.overflow, "hidden");
  f.controller.enter(); f.controller.requestNative();
  assert.deepEqual(f.states, [true]); assert.equal(f.requests(), 0);
  f.controller.dispose(); assert.equal(f.doc.body.style.overflow, "clip"); assert.equal(f.listeners(), 0);
});

test("first interaction retries denied initial native fullscreen without collapsing the map", async () => {
  const f = fixture("reject-once"); f.controller.enter(); await Promise.resolve();
  assert.equal(f.requests(), 1); assert.deepEqual(f.states, [true]); assert.equal(f.doc.fullscreenElement, null);
  f.controller.requestNative(); await Promise.resolve();
  assert.equal(f.requests(), 2); assert.equal(f.doc.fullscreenElement, f.doc.documentElement);
  assert.deepEqual(f.states, [true]); assert.equal(f.doc.body.style.overflow, "hidden");
  f.controller.requestNative(); assert.equal(f.requests(), 2);
  f.controller.dispose(); assert.equal(f.exits(), 1); assert.equal(f.doc.body.style.overflow, "clip");
});

test("an explicit exit disables gesture retries until the user reopens the map", async () => {
  for (const mode of ["reject-once", "resolve"] as const) {
    const f = fixture(mode); f.controller.enter(); await Promise.resolve(); f.controller.toggle(); await Promise.resolve();
    assert.deepEqual(f.states, [true, false]); assert.equal(f.doc.body.style.overflow, "clip");
    f.controller.requestNative(); await Promise.resolve();
    assert.equal(f.requests(), 1); assert.equal(f.doc.fullscreenElement, null);
    f.controller.toggle(); await Promise.resolve();
    assert.equal(f.requests(), 2); assert.deepEqual(f.states, [true, false, true]);
    assert.equal(f.doc.fullscreenElement, f.doc.documentElement); f.controller.dispose();
  }
});

test("a pending initial native request is not duplicated by early interactions", async () => {
  const f = fixture("delayed"); f.controller.enter(); f.controller.requestNative(); f.controller.enter();
  assert.equal(f.requests(), 1); assert.deepEqual(f.states, [true]);
  f.release(); await Promise.resolve(); assert.equal(f.doc.fullscreenElement, f.doc.documentElement); f.controller.dispose();
});

test("fullscreen fallback locks scrolling, respects modal Escape and restores the prior overflow", () => {
  const f = fixture(); f.controller.toggle(); assert.deepEqual(f.states, [true]); assert.equal(f.doc.body.style.overflow, "hidden");
  f.block(true); f.event("keydown", {key:"Escape"}); assert.deepEqual(f.states, [true]);
  f.block(false); f.event("keydown", {key:"Escape",defaultPrevented:true}); assert.deepEqual(f.states, [true]);
  f.event("keydown", {key:"Escape"}); assert.deepEqual(f.states, [true,false]); assert.equal(f.doc.body.style.overflow, "clip");
  f.controller.dispose(); assert.equal(f.listeners(), 0);
});

test("rejected and synchronous fullscreen failures keep the expanded map usable", async () => {
  for (const mode of ["reject", "throw"] as const) {
    const f = fixture(mode); f.controller.toggle(); await Promise.resolve();
    assert.deepEqual(f.states,[true]); assert.equal(f.requests(),1); assert.equal(f.doc.body.style.overflow,"hidden");
    f.controller.toggle(); assert.deepEqual(f.states,[true,false]); assert.equal(f.exits(),0); f.controller.dispose();
  }
});

test("native system exit updates the map and the next click can request fullscreen again", async () => {
  const f = fixture("resolve"); f.controller.toggle(); await Promise.resolve();
  assert.equal(f.doc.fullscreenElement,f.doc.documentElement);
  f.doc.fullscreenElement = null; f.event("fullscreenchange"); assert.deepEqual(f.states,[true,false]);
  f.controller.requestNative(); assert.equal(f.requests(),1);
  f.controller.toggle(); await Promise.resolve(); assert.equal(f.requests(),2);
  f.controller.toggle(); assert.equal(f.exits(),1); assert.equal(f.doc.body.style.overflow,"clip"); f.controller.dispose();
});

test("exiting before a delayed native entry cannot leave the browser fullscreen", async () => {
  const f = fixture("delayed"); f.controller.toggle(); f.controller.toggle();
  f.release(); await Promise.resolve(); assert.equal(f.exits(),1); assert.equal(f.doc.fullscreenElement,null);
  assert.deepEqual(f.states,[true,false]); assert.equal(f.doc.body.style.overflow,"clip"); f.controller.dispose();
});

test("unmount cleans an owned fullscreen and a late grant without notifying an unmounted component", async () => {
  for (const mode of ["resolve","delayed"] as const) {
    const f = fixture(mode); f.controller.toggle(); if (mode === "resolve") await Promise.resolve();
    f.controller.dispose(); if (mode === "delayed") f.release(); await Promise.resolve();
    assert.equal(f.doc.fullscreenElement,null); assert.equal(f.exits(),1); assert.deepEqual(f.states,[true]);
    assert.equal(f.doc.body.style.overflow,"clip"); assert.equal(f.listeners(),0); f.controller.toggle(); assert.equal(f.requests(),1);
  }
});

test("expanded map never exits an existing fullscreen belonging to another view", () => {
  const f = fixture("resolve"); f.doc.fullscreenElement = f.doc.documentElement;
  f.controller.toggle(); assert.equal(f.requests(),0); f.controller.dispose();
  assert.equal(f.exits(),0); assert.equal(f.doc.fullscreenElement,f.doc.documentElement); assert.equal(f.doc.body.style.overflow,"clip");
});
