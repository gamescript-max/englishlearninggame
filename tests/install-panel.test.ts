import test from "node:test";
import assert from "node:assert/strict";
import { componentHost, nodeText } from "./helpers/component-host";

type Message = { type: string; done?: number; total?: number; version?: string; ready?: boolean; bytes?: number; message?: string };
class Port {
  peer!: Port;
  closed = false;
  onmessage: ((event: { data: Message }) => void) | null = null;
  postMessage(data: Message) { if (!this.peer.closed) this.peer.onmessage?.({ data }); }
  close() { this.closed = true; }
}
class Channel {
  port1 = new Port();
  port2 = new Port();
  constructor() { this.port1.peer = this.port2; this.port2.peer = this.port1; }
}
class Worker {
  downloads: Port[] = [];
  statuses = 0;
  postMessage(message: Message, ports: Port[]) {
    if (message.type === "STATUS") { ++this.statuses; ports[0].postMessage({ type: "status", ready: false }); }
    if (message.type === "DOWNLOAD") this.downloads.push(ports[0]);
  }
}

test("an activated worker replaces an in-flight old download and stale channel replies cannot contaminate the retry", async () => {
  const oldWorker = new Worker(), newWorker = new Worker();
  const controllerListeners = new Set<() => void>();
  let registrationOptions: unknown;
  const serviceWorker = {
    controller: oldWorker,
    ready: Promise.resolve({ active: oldWorker }),
    register: async (_url: string, options: unknown) => { registrationOptions = options; return { active: oldWorker }; },
    addEventListener: (name: string, listener: () => void) => { if (name === "controllerchange") controllerListeners.add(listener); },
    removeEventListener: (name: string, listener: () => void) => { if (name === "controllerchange") controllerListeners.delete(listener); },
  };
  const windowListeners = new Set<unknown>();
  const host = componentHost(new URL("../components/install-panel.tsx", import.meta.url), "InstallPanel", {}, () => ({
    "@/lib/native-platform": { isNativePlatform: () => false },
  }), {
    navigator: { serviceWorker }, MessageChannel: Channel,
    matchMedia: () => ({ matches: false }),
    window: { isSecureContext: true, addEventListener: (_name: string, listener: unknown) => windowListeners.add(listener), removeEventListener: (_name: string, listener: unknown) => windowListeners.delete(listener) },
    fetch: async () => ({ ok: true, json: async () => ({ version: "new-pack", urls: ["/shell", "/app", "/audio"] }) }),
  });
  await host.flush();
  assert.deepEqual(JSON.parse(JSON.stringify(registrationOptions)), { scope: "/", updateViaCache: "none" });
  host.click(host.button("下载完整离线课程")); await host.flush();
  assert.equal(oldWorker.downloads.length, 1);
  assert.equal(host.button("正在下载").props.disabled, true);
  const obsoletePort = oldWorker.downloads[0].peer;
  const obsoleteHandler = obsoletePort.onmessage!;

  serviceWorker.controller = newWorker;
  for (const listener of controllerListeners) listener();
  await host.flush();
  assert.ok(obsoletePort.closed, "the previous download port is released on controller change");
  assert.equal(obsoletePort.onmessage, null);
  assert.ok(newWorker.statuses > 0, "the new controller is probed for an existing complete pack");
  assert.equal(host.button("下载完整离线课程").props.disabled, false);
  assert.match(nodeText(host.output()), /离线功能已更新，请点下载继续。已保存资源会复用/);

  // Model a reply already queued before close, bypassing the now-null port handler.
  obsoleteHandler({ data: { type: "progress", done: 999, total: 999 } });
  await host.flush();
  assert.ok(!nodeText(host.output()).includes("999/999"));
  host.click(host.button("下载完整离线课程")); await host.flush();
  assert.equal(newWorker.downloads.length, 1, "retry uses the current controller, not registration.active");
  assert.equal(oldWorker.downloads.length, 1);
  newWorker.downloads[0].postMessage({ type: "progress", done: 3, total: 3 });
  await host.flush(); assert.match(nodeText(host.output()), /正在下载 3\/3/);
  newWorker.downloads[0].postMessage({ type: "complete", version: "new-pack", bytes: 1048576 });
  await host.flush();
  assert.match(nodeText(host.output()), /全部课程已保存/);
  assert.equal(host.button("更新 / 检查离线课程").props.disabled, false);
  obsoleteHandler({ data: { type: "error", message: "obsolete failure" } });
  obsoleteHandler({ data: { type: "complete", version: "obsolete-pack", bytes: 0 } });
  await host.flush();
  assert.ok(!nodeText(host.output()).includes("obsolete failure"));
  assert.ok(!nodeText(host.output()).includes("有更新可下载"), "stale completion cannot replace the new pack status");

  host.unmount();
  assert.equal(controllerListeners.size, 0);
  assert.equal(windowListeners.size, 0);
  assert.equal(newWorker.downloads[0].peer.closed, true);
});
