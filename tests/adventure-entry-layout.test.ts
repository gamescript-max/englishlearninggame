import test from "node:test";
import assert from "node:assert/strict";
import * as course from "../lib/course";
import * as domain from "../lib/progress";
import * as destinations from "../lib/destinations";
import * as adventureProgress from "../lib/adventure-progress";
import * as playgroundContent from "../lib/playground-content";
import { componentHost, type UINode } from "./helpers/component-host";

const ui = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));

test("the side rail keeps additional entries with both existing games and disables them until ready", () => {
  const opened: string[] = [];
  const child: UINode = { type: "button", props: { className: "adventure-entry entry-shark", disabled: true } };
  let props = { progress: domain.createProgress(), ready: false, onOpen: (mode: string) => opened.push(mode), children: child };
  const host = componentHost(new URL("../components/continuous-adventure.tsx", import.meta.url), "AdventureEntries", props, () => ({
    "@/components/ui/dialog": {}, "@/lib/adventure-engine": {}, "@/lib/adventure-content": {},
    "@/lib/adventure-progress": adventureProgress, "@/lib/audio": {}, "./adventure-renderer": {},
    "@/lib/natural-ocean-art": {}, "@/lib/ecology-art.json": { default: {} },
    "@/lib/game-image-assets": { gameImageURL: (source: string) => source },
    "@/lib/snake-flat-art.json": { default: {} }, "@/lib/adventure-catalog": {},
    "@/lib/ocean-treasure": {}, "@/lib/adventure-fullscreen": {},
  }));
  const rail = host.byClass("adventure-side-rail")[0];
  assert.equal(rail.type, "section");
  assert.equal(host.byClass("adventure-entry").length, 3);
  assert.ok(host.nodes().includes(child));
  for (const entry of host.byClass("adventure-entry")) assert.equal(host.click(entry), false);
  assert.equal(opened.length, 0);

  props = { ...props, ready: true, children: { ...child, props: { ...child.props, disabled: false, onClick: () => opened.push("shark") } } };
  host.update(props);
  host.click(host.button("海洋成长冒险"));
  host.click(host.button("贪吃蛇连续版"));
  host.click(host.byClass("entry-shark")[0]);
  assert.deepEqual(opened, ["fish", "snake", "shark"]);
  host.unmount();
});

test("the homepage mounts one compact shark entry inside its rail and preserves hydration navigation guard", async () => {
  let ready = false;
  const initial = domain.createProgress();
  const host = componentHost(new URL("../components/game-app.tsx", import.meta.url), "default", {}, react => ({
    "@/lib/course": course, "@/lib/progress": domain, "@/lib/destinations": destinations,
    "@/lib/game-image-assets": { gameImageURL: (source: string) => source },
    "@/lib/adventure-progress": adventureProgress, "@/lib/playground-content": playgroundContent,
    "@/lib/use-progress": { useProgress() {
      const [progress, setProgress] = react.useState(initial);
      const current = react.useRef(progress) as { current: domain.Progress };
      return { progress, current, ready, firstVisit: false, storageError: "", externalChange: 0, retry() {},
        commit(update: domain.Progress | ((previous: domain.Progress) => domain.Progress)) {
          current.current = typeof update === "function" ? update(current.current) : update;
          setProgress(current.current); return current.current;
        } };
    } },
    "@/lib/audio": { playSpeech: () => Promise.resolve(), playEffect: () => Promise.resolve(), setAudioSettings() {},
      setMusicTheme() {}, stopSpeech() {}, preloadSpeech() {}, stopAllAudio() {}, unlockAudio: () => Promise.resolve() },
    "@/lib/native-platform": { initNativePlatform: () => Promise.resolve(() => {}), exitNativeApp: () => Promise.resolve(), saveBackup: () => Promise.resolve() },
    "@/components/ui/dialog": ui(["Dialog", "DialogContent", "DialogDescription", "DialogHeader", "DialogTitle"]),
    "@/components/ui/alert-dialog": ui(["AlertDialog", "AlertDialogAction", "AlertDialogCancel", "AlertDialogContent", "AlertDialogDescription", "AlertDialogFooter", "AlertDialogHeader", "AlertDialogTitle"]),
    "@/components/ui/progress": ui(["Progress"]), "@/components/ui/switch": ui(["Switch"]), "@/components/ui/slider": ui(["Slider"]),
    "@/components/recorder": ui(["Recorder"]), "@/components/word-art": ui(["WordArt"]),
    "@/components/learning-studio": ui(["LearningStudio"]), "@/components/learning-report": ui(["LearningReport"]),
    "@/components/install-panel": ui(["InstallPanel"]), "@/components/bonus-games": ui(["MemoryGame", "SceneGame", "SpellingGame"]),
    "@/components/snake-game": ui(["SnakeGame"]), "@/components/catch-game": ui(["CatchGame"]),
    "@/components/adventure-map": ui(["WorldMap", "LessonTrail"]),
    "@/components/continuous-adventure": ui(["AdventureEntries", "AdventureReport", "ContinuousAdventure"]),
    "@/components/playground": ui(["Playground", "PlaygroundEntries", "PlaygroundReport"]),
    "@/components/shark-feast": ui(["SharkFeast", "SharkFeastEntry", "SharkFeastReport"]),
    "@/components/exploration-games": ui(["BubbleGame", "DeliveryGame", "ConnectionGame"]),
    "@/components/speech-caption": ui(["SpeechCaption"]), "@/components/use-webmcp": { useWebMCP() {} },
  }));
  const rail = () => host.nodes().find(node => node.type === "AdventureEntries")!;
  const entry = () => host.nodes().find(node => node.type === "SharkFeastEntry")!;
  assert.equal(host.nodes().filter(node => node.type === "SharkFeastEntry").length, 1);
  assert.equal(rail().props.children, entry());
  assert.equal(entry().props.compact, true);
  assert.equal(entry().props.ready, false);
  (entry().props.onOpen as () => void)();
  host.update({});
  assert.ok(rail());
  assert.equal(host.nodes().some(node => node.type === "SharkFeast"), false);

  ready = true; host.update({});
  assert.equal(entry().props.ready, true);
  (entry().props.onOpen as () => void)();
  host.update({}); await host.flush();
  const game = host.nodes().find(node => node.type === "SharkFeast");
  assert.ok(game);
  assert.equal(host.nodes().some(node => node.type === "AdventureEntries"), false);
  (game.props.onBack as () => void)();
  host.update({});
  assert.equal(rail().props.children, entry());
  assert.equal(host.nodes().filter(node => node.type === "SharkFeastEntry").length, 1);
  host.unmount();
});
