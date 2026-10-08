import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

export type UINode = { type: unknown; props: Record<string, unknown> };
type Effect = { deps?: unknown[]; cleanup?: () => void };
type Hook = { value: unknown } | { current: unknown } | Effect;
let nextHostId = 0;
export function nodeText(value: unknown): string {
  if (Array.isArray(value)) return value.map(nodeText).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value && typeof value === "object" && "props" in value ? nodeText((value as UINode).props.children) : "";
}

/** Runs actual component handlers/effects with deterministic timers; no browser or DOM. */
export function componentHost(path: URL, exportName: string, initialProps: unknown,
  dependencies: (react: { useState: (initial: unknown) => [unknown, (next: unknown) => void]; useRef: (initial: unknown) => Hook; useId: () => string }) => Record<string, unknown>,
  globals: Record<string, unknown> = {}) {
  const hooks: Hook[] = [], listeners = new Map<string, Set<(event: unknown) => void>>();
  const hostId = ++nextHostId;
  const timers = new Map<number, { due: number; delay: number; repeat: boolean; callback: () => void }>();
  let hookIndex = 0, nextTimer = 0, now = 0, dirty = true, props = initialProps, tree: UINode;
  let pending: { previous?: Effect; setup: () => void | (() => void); effect: Effect }[] = [];
  const react = {
    useCallback(callback: unknown) { return callback; },
    useId() {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { value: `:component-host-${hostId}-${index}:` };
      return (hooks[index] as { value: string }).value;
    },
    useState(initial: unknown): [unknown, (next: unknown) => void] {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      const state = hooks[index] as { value: unknown };
      return [state.value, (next: unknown) => {
        const value = typeof next === "function" ? next(state.value) : next;
        if (!Object.is(state.value, value)) { state.value = value; dirty = true; }
      }];
    },
    useRef(initial: unknown) {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect(setup: () => void | (() => void), deps?: unknown[]) {
      const index = hookIndex++, previous = hooks[index] as Effect | undefined;
      if (previous?.deps && deps && deps.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps![i]))) return;
      const effect = { deps };
      hooks[index] = effect; pending.push({ previous, setup, effect });
    },
  };
  function events(surface: string) {
    return {
      addEventListener(name: string, listener: (event: unknown) => void) {
        const key = `${surface}:${name}`;
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key)!.add(listener);
      },
      removeEventListener(name: string, listener: (event: unknown) => void) { listeners.get(`${surface}:${name}`)?.delete(listener); },
    };
  }
  const document = { ...events("document"), hidden: false };
  const window = { ...events("window"), scrollTo() {} };
  const exports: Record<string, (props: unknown) => UINode> = {};
  const mocks = dependencies(react);
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  function timer(callback: () => void, delay: number, repeat: boolean) {
    const id = ++nextTimer; timers.set(id, { callback, due: now + delay, delay, repeat }); return id;
  }
  vm.runInNewContext(source, {
    exports, document, window, ...globals,
    require(id: string) {
      if (id === "react") return react;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (id === "lucide-react") return new Proxy({}, { get: (_, key) => String(key) });
      if (id in mocks) return mocks[id];
      throw new Error(`Unmocked dependency: ${id}`);
    },
    setInterval: (callback: () => void, delay: number) => timer(callback, delay, true),
    clearInterval: (id: number) => timers.delete(id),
    setTimeout: (callback: () => void, delay: number) => timer(callback, delay, false),
    clearTimeout: (id: number) => timers.delete(id),
  });
  function render() {
    for (let pass = 0; dirty; pass++) {
      assert.ok(pass < 30, "Effects did not settle"); dirty = false; hookIndex = 0; pending = [];
      tree = exports[exportName](props);
      // React cleans all changed effects before starting their replacements.
      for (const effect of pending) effect.previous?.cleanup?.();
      for (const effect of pending) {
        const cleanup = effect.setup(); effect.effect.cleanup = typeof cleanup === "function" ? cleanup : undefined;
      }
    }
  }
  function nodes() {
    const result: UINode[] = [];
    function visit(value: unknown) {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== "object" || !("props" in value)) return;
      const node = value as UINode; result.push(node); visit(node.props.children);
    }
    visit(tree); return result;
  }
  function byClass(name: string) { return nodes().filter(node => String(node.props.className ?? "").split(" ").includes(name)); }
  function button(label: string) {
    const node = nodes().find(node => node.type === "button" && (node.props["aria-label"] === label || nodeText(node).includes(label)));
    assert.ok(node, `Missing button ${label}`); return node;
  }
  function click(node: UINode) {
    if (node.props.disabled) return false;
    assert.equal(typeof node.props.onClick, "function"); (node.props.onClick as () => void)(); render(); return true;
  }
  render();
  return {
    nodes, byClass, button, click,
    output: () => tree,
    state: (index: number) => (hooks[index] as { value: unknown }).value,
    update(next: unknown) { props = next; dirty = true; render(); },
    advance(milliseconds: number) {
      const end = now + milliseconds;
      for (;;) {
        const next = [...timers.entries()].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due;
        if (next[1].repeat) next[1].due += next[1].delay; else timers.delete(next[0]);
        next[1].callback(); render();
      }
      now = end;
    },
    event(surface: "window" | "document", name: string, event: unknown = {}) { for (const listener of listeners.get(`${surface}:${name}`) ?? []) listener(event); render(); },
    visibility(hidden: boolean) { document.hidden = hidden; for (const listener of listeners.get("document:visibilitychange") ?? []) listener({}); render(); },
    timerCount: () => timers.size,
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    async flush() { for (let i = 0; i < 12; i++) { await Promise.resolve(); render(); } },
    unmount() { for (const hook of hooks) if ("cleanup" in hook) hook.cleanup?.(); },
  };
}
