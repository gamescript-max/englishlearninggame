import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { getWord, type Exercise } from "../lib/course";
import type { BonusGameProps } from "../components/bonus-games";

type Node = { type: unknown; key?: unknown; props: Record<string, unknown> };
type Effect = { deps?: unknown[]; cleanup?: () => void };
type Hook = { value: unknown } | { current: unknown } | Effect;
const source = ts.transpileModule(readFileSync(new URL("../components/bonus-games.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// A small hook/timer host tests the actual component event handlers without a
// browser, audio, storage, or a DOM. Renders and effects flush after each event.
function mount(name: "MemoryGame" | "SpellingGame" | "SceneGame", initial: BonusGameProps) {
  const hooks: Hook[] = [];
  const timers = new Map<number, { due: number; callback: () => void }>();
  let hookIndex = 0, nextTimer = 0, now = 0;
  let props = initial, tree: Node, pending: (() => void)[] = [];
  const exports: Record<string, (props: BonusGameProps) => Node> = {};
  const jsx = (type: unknown, props: Record<string, unknown>, key?: unknown) => ({ type, props, key });
  const react = {
    useState(initial: unknown) {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      const state = hooks[index] as { value: unknown };
      return [state.value, (next: unknown) => { state.value = typeof next === "function" ? next(state.value) : next; }];
    },
    useRef(initial: unknown) {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { current: initial };
      return hooks[index];
    },
    useEffect(setup: () => void | (() => void), deps?: unknown[]) {
      const index = hookIndex++, previous = hooks[index] as Effect | undefined;
      if (previous && deps && previous.deps && deps.length === previous.deps.length && deps.every((value, i) => Object.is(value, previous.deps![i]))) return;
      pending.push(() => {
        previous?.cleanup?.();
        const cleanup = setup();
        hooks[index] = { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined };
      });
    },
  };
  vm.runInNewContext(source, {
    exports,
    require(id: string) {
      if (id === "react") return react;
      if (id === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (id === "@/lib/course") return { getWord };
      if (id === "@/components/word-art") return { WordArt: "WordArt" };
      if (id === "lucide-react") return Object.fromEntries(["Box", "Check", "Eye", "RotateCcw", "Sparkles", "Table2", "Undo2"].map(name => [name, name]));
      throw new Error(`Unexpected component dependency: ${id}`);
    },
    setTimeout(callback: () => void, delay: number) { const id = ++nextTimer; timers.set(id, { due: now + delay, callback }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
  });
  function render() {
    hookIndex = 0; pending = []; tree = exports[name](props);
    for (const effect of pending) effect();
  }
  function nodes() {
    const found: Node[] = [];
    function visit(value: unknown) {
      if (Array.isArray(value)) { for (const child of value) visit(child); return; }
      if (!value || typeof value !== "object" || !("props" in value)) return;
      const node = value as Node; found.push(node); visit(node.props.children);
    }
    visit(tree); return found;
  }
  function byClass(name: string) { return nodes().filter(node => String(node.props.className ?? "").split(" ").includes(name)); }
  function click(node: Node) {
    if (node.props.disabled) return false;
    assert.equal(typeof node.props.onClick, "function");
    (node.props.onClick as () => void)(); render(); return true;
  }
  function button(label: string) {
    const found = nodes().find(node => node.type === "button" && text(node).includes(label));
    assert.ok(found, `Missing button: ${label}`); return found;
  }
  render();
  return {
    nodes, byClass, click, button,
    update(next: Partial<BonusGameProps>) { props = { ...props, ...next }; render(); },
    advance(milliseconds: number) {
      const end = now + milliseconds;
      for (;;) {
        const next = [...timers.entries()].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        now = next[1].due; timers.delete(next[0]); next[1].callback(); render();
      }
      now = end;
    },
    timerCount: () => timers.size,
    unmount() { for (const hook of hooks) if ("cleanup" in hook) hook.cleanup?.(); },
  };
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node && typeof node === "object" && "props" in node ? text((node as Node).props.children) : "";
}
function question(kind: Exercise["kind"], wordId = "cat"): Exercise {
  return { id: `test-${kind}-${wordId}`, kind, wordId, promptEn: getWord(wordId).en, promptZh: "测试操作", answer: wordId, options: wordId === "banana" ? ["banana", "apple", "orange", "cake"] : wordId === "teddy-bear" ? ["teddy-bear", "ball", "kite", "doll"] : ["dog", "cat", "bird", "fish"] };
}
function base(exercise: Exercise, answers: string[] = []): BonusGameProps {
  return { exercise, disabled: false, hinted: false, onAnswer: answer => answers.push(answer) };
}
function fill(host: ReturnType<typeof mount>, letters: string) {
  for (const letter of letters) {
    const tile = host.byClass("letter-tile").find(node => text(node) === letter && !node.props.disabled);
    assert.ok(tile, `No unused tile for ${letter}`); host.click(tile);
  }
}

test("memory waits for audio readiness, then covers after 3.5 seconds and replays exactly once", () => {
  let replays = 0;
  const host = mount("MemoryGame", { ...base(question("memory")), disabled: true, onPreviewEnd: () => replays++ });
  host.advance(10000); assert.equal(host.timerCount(), 0); assert.equal(host.byClass("is-face-up").length, 4);
  assert.equal(host.click(host.button("我记住啦")), false);
  host.update({ disabled: false }); host.advance(3499);
  assert.equal(host.byClass("is-face-up").length, 4); assert.equal(replays, 0);
  host.advance(1); assert.equal(host.byClass("is-face-down").length, 4); assert.equal(replays, 1);
  host.advance(10000); assert.equal(replays, 1);
});

test("manual memory cover cancels the countdown; leaving either timer phase clears all timers", () => {
  let replays = 0;
  const host = mount("MemoryGame", { ...base(question("memory")), onPreviewEnd: () => replays++ });
  host.advance(1000); host.click(host.button("我记住啦"));
  assert.equal(host.timerCount(), 0); assert.equal(host.byClass("is-face-down").length, 4);
  host.advance(5000); assert.equal(replays, 1);
  const preview = mount("MemoryGame", { ...base(question("memory")), onPreviewEnd: () => replays++ });
  preview.unmount(); assert.equal(preview.timerCount(), 0); preview.advance(5000); assert.equal(replays, 1);
  host.click(host.byClass("memory-card")[0]); assert.equal(host.timerCount(), 1);
  host.unmount(); assert.equal(host.timerCount(), 0); host.advance(2000);
});

test("a wrong memory card records one attempt and covers after 1.1 seconds; a correct card stays found", () => {
  const answers: string[] = [], host = mount("MemoryGame", base(question("memory"), answers));
  host.advance(3500); host.click(host.byClass("memory-card")[0]);
  assert.deepEqual(answers, ["dog"]); assert.equal(host.byClass("is-miss").length, 1);
  assert.equal(host.click(host.byClass("memory-card")[1]), false);
  host.advance(1099); assert.equal(host.byClass("is-miss").length, 1);
  host.advance(1); assert.equal(host.byClass("is-face-down").length, 4);
  host.click(host.byClass("memory-card")[1]); assert.deepEqual(answers, ["dog", "cat"]);
  host.advance(2000); assert.equal(host.byClass("is-found").length, 1); assert.equal(host.timerCount(), 0);
});

test("memory re-preview invokes the hint callback and keeps only the hinted target visible afterwards", () => {
  let hints = 0, replays = 0;
  const host = mount("MemoryGame", { ...base(question("memory")), onHint: () => hints++, onPreviewEnd: () => replays++ });
  host.advance(3500); host.click(host.button("再看一次"));
  assert.equal(hints, 1); assert.equal(host.byClass("is-face-up").length, 4);
  host.update({ hinted: true }); host.advance(3500);
  assert.equal(replays, 2); assert.equal(host.byClass("is-face-up").length, 1);
  assert.match(String(host.byClass("hinted")[0].props["aria-label"]), /猫/);
});

test("repeated spelling letters remain distinct tiles and answer only on explicit check", () => {
  const answers: string[] = [], host = mount("SpellingGame", base(question("spell", "banana"), answers));
  const bank = host.byClass("letter-tile");
  assert.equal(new Set(bank.map(node => node.key)).size, 6);
  assert.equal(bank.map(text).sort().join(""), "aaabnn");
  assert.notEqual(bank.map(text).join(""), "banana");
  assert.equal(host.click(host.button("检查单词")), false);
  fill(host, "banana"); assert.deepEqual(answers, []);
  assert.equal(host.byClass("is-used").length, 6); host.click(host.button("检查单词"));
  assert.deepEqual(answers, ["banana"]);
  host.update({ disabled: true }); assert.equal(host.click(host.button("检查单词")), false);
  assert.deepEqual(answers, ["banana"]);
});

test("multiword spelling separates the two words and supports undo and reset without answering", () => {
  const answers: string[] = [], host = mount("SpellingGame", base(question("spell", "teddy-bear"), answers));
  assert.equal(host.byClass("spelling-word-group").length, 2);
  assert.equal(host.byClass("letter-slot").length, 9);
  fill(host, "teddy"); host.click(host.button("撤回")); assert.equal(host.byClass("is-filled").length, 4);
  fill(host, "y"); host.click(host.button("重新排"));
  assert.equal(host.byClass("is-filled").length, 0); assert.equal(host.byClass("is-used").length, 0);
  assert.deepEqual(answers, []); fill(host, "teddybear"); host.click(host.button("检查单词"));
  assert.deepEqual(answers, ["teddy-bear"]);
});

test("an incorrect spelling stays editable and can be corrected without automatic completion", () => {
  const answers: string[] = [], host = mount("SpellingGame", base(question("spell"), answers));
  fill(host, "tac"); host.click(host.button("检查单词"));
  assert.deepEqual(answers, ["dog"]); assert.equal(host.byClass("needs-adjustment").length, 1);
  host.click(host.byClass("letter-slot")[0]); host.click(host.byClass("letter-slot")[2]); fill(host, "ct");
  assert.deepEqual(answers, ["dog"]); assert.equal(host.byClass("needs-adjustment").length, 0);
  host.click(host.button("检查单词")); assert.deepEqual(answers, ["dog", "cat"]);
  host.update({ hinted: true }); assert.equal(host.byClass("spelling-model").length, 1);
  assert.equal(host.byClass("hinted").length, 3);
});

test("scene cards render the provided order, counts and picture variants, and submit the scene id", () => {
  const answers: string[] = [], exercise: Exercise = {
    ...question("scene"), answer: "under", options: ["three", "under", "one"],
    scenes: [
      { id: "three", wordId: "cat", count: 3, variant: "review" },
      { id: "under", wordId: "ball", position: "under" },
      { id: "one", wordId: "dog", count: 1 },
    ],
  };
  const host = mount("SceneGame", base(exercise, answers));
  assert.deepEqual(host.byClass("scene-card").map(node => node.key), ["three", "under", "one"]);
  assert.equal(host.byClass("scene-object").length, 5);
  assert.equal(host.byClass("scene-object").filter(node => node.props.variant === "review").length, 3);
  assert.equal(host.byClass("scene-position-under").length, 1);
  assert.match(String(host.byClass("scene-card")[1].props["aria-label"]), /桌子下面/);
  host.click(host.byClass("scene-card")[1]); assert.deepEqual(answers, ["under"]);
  host.update({ disabled: true, hinted: true }); assert.equal(host.click(host.byClass("scene-card")[0]), false);
  assert.deepEqual(answers, ["under"]); assert.equal(host.byClass("hinted")[0].key, "under");
  for (const card of host.byClass("scene-card")) assert.equal((card.props.style as { minHeight: number }).minHeight, 56);
});
