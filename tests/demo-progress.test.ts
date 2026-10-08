import test from "node:test";
import assert from "node:assert/strict";
import * as progress from "../lib/progress";
import { createDemoProgress } from "../lib/demo-progress";
import { componentHost } from "./helpers/component-host";
import type { useProgress } from "../lib/use-progress";

function memoryStorage(initial?: string) {
  const items = new Map<string, string>(initial ? [["little-fox-english-island-v1", initial]] : []);
  return { items, getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); } };
}
function hook(localStorage: ReturnType<typeof memoryStorage>, sessionStorage: Pick<Storage, "getItem" | "setItem">) {
  return componentHost(new URL("../lib/use-progress.ts", import.meta.url), "useProgress", undefined, () => ({
    "./progress": progress, "./demo-progress": { createDemoProgress },
  }), { localStorage, sessionStorage, URLSearchParams, window: { location: { search: "?demo=1" }, addEventListener() {}, removeEventListener() {} } });
}
test("demo hydration, save and reset stay isolated from the real child record", async () => {
  const original = JSON.stringify(progress.createProgress()), local = memoryStorage(original), session = memoryStorage();
  const host = hook(local, session);
  let output = host.output() as unknown as ReturnType<typeof useProgress>;
  assert.equal(output.demoMode, true); assert.equal(output.ready, true); assert.equal(output.progress.stars, 19);
  assert.equal(local.items.get("little-fox-english-island-v1"), original);
  output.commit(progress.startRun(output.progress, "animals-11")); await host.flush();
  output = host.output() as unknown as ReturnType<typeof useProgress>;
  assert.equal(output.progress.activeRun?.lessonId, "animals-11");
  assert.equal(JSON.parse(session.items.get("little-fox-english-island-v1-demo")!).activeRun.lessonId, "animals-11");
  output.commit(progress.createProgress(), true); await host.flush();
  assert.equal(local.items.get("little-fox-english-island-v1"), original); assert.equal(local.items.size, 1); host.unmount();
});
test("unavailable demo storage reports failure and never falls back to the real record", async () => {
  const original = JSON.stringify(progress.createProgress()), local = memoryStorage(original);
  const host = hook(local, { getItem() { throw new Error("Storage unavailable"); }, setItem() { throw new Error("Storage unavailable"); } });
  const output = host.output() as unknown as ReturnType<typeof useProgress>;
  assert.equal(output.demoMode, true); assert.ok(output.storageError);
  output.commit(progress.createProgress(), true); await host.flush();
  assert.ok((host.output() as unknown as ReturnType<typeof useProgress>).storageError);
  assert.equal(local.items.get("little-fox-english-island-v1"), original); host.unmount();
});
