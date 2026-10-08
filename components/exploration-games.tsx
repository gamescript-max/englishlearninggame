"use client";

import { gameImageURL } from "@/lib/game-image-assets";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Check, Circle, PackageCheck, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { WordArt } from "@/components/word-art";
import { getWord, type Exercise } from "@/lib/course";

export type ExplorationGameProps = { exercise: Exercise; disabled: boolean; busy: boolean; suspended: boolean; hinted: boolean; onAnswer: (answer: string, exerciseId: string) => void };

export function BubbleGame({ exercise, disabled, busy, suspended, hinted, onAnswer }: ExplorationGameProps) {
  const [collected, setCollected] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const collectedRef = useRef(collected);
  const submitted = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => { if (!busy && !disabled && !suspended) inFlight.current = false; }, [busy, disabled, suspended]);
  const locked = disabled || busy || suspended || done;
  const bubbles = exercise.options.flatMap((id, index) => [
    { token: `${id}-base`, id, variant: "base" as const, slot: index * 2 },
    { token: `${id}-review`, id, variant: "review" as const, slot: index * 2 + 1 },
  ]);
  function pop(token: string, id: string) {
    if (locked || submitted.current || inFlight.current || collectedRef.current.includes(token)) return;
    if (id !== exercise.answer) { inFlight.current = true; onAnswer(id, exercise.id); return; }
    const next = [...collectedRef.current, token]; collectedRef.current = next; setCollected(next);
    if (next.length === 2) { submitted.current = true; setDone(true); onAnswer(id, exercise.id); }
  }
  return <div className={`bubble-game exploration-game ${busy || suspended ? "motion-paused" : ""}`}>
    <div className="mini-game-heading"><span><Sparkles size={23}/>泡泡宝藏</span><strong>目标泡泡 {collected.length}/2</strong></div>
    <div className="bubble-sea" role="group" aria-label="找到两颗目标泡泡，点一下收集">
      {bubbles.map(bubble => <button key={bubble.token} data-token={bubble.token} style={{ animationDelay: `${-bubble.slot * .7}s` }} className={`word-bubble bubble-${bubble.slot} ${collected.includes(bubble.token) ? "popped" : ""} ${hinted && bubble.id === exercise.answer ? "hinted" : ""}`} disabled={locked || collected.includes(bubble.token)} aria-label={`${getWord(bubble.id).zh}泡泡，${bubble.variant === "base" ? "第一张" : "另一张"}`} onClick={() => pop(bubble.token, bubble.id)}>{collected.includes(bubble.token) ? <Check size={37}/> : <WordArt id={bubble.id} variant={bubble.variant}/>}</button>)}
    </div>
    <p className="mini-game-note" role="status">{collected.length === 2 ? "两颗都收好啦，马上听下一个！" : "同一个词有两种图片，找到两颗才能收齐宝藏。"}</p>
  </div>;
}

export function DeliveryGame({ exercise, disabled, busy, suspended, hinted, onAnswer }: ExplorationGameProps) {
  const [tray, setTray] = useState<{ token: number; id: string }[]>([]);
  const [done, setDone] = useState(false);
  const trayRef = useRef(tray);
  const nextToken = useRef(0), submitted = useRef(false), dragStart = useRef<{ x: number; y: number } | null>(null);
  const inFlight = useRef(false);
  useEffect(() => { if (!busy && !disabled && !suspended) inFlight.current = false; }, [busy, disabled, suspended]);
  const [message, setMessage] = useState("");
  const required = exercise.requiredCount ?? 1;
  const locked = disabled || busy || suspended || done;
  function update(next: typeof tray) { trayRef.current = next; setTray(next); setMessage(""); }
  function add(id: string) { if (!locked && !submitted.current && !inFlight.current && trayRef.current.length < required) update([...trayRef.current, { token: ++nextToken.current, id }]); }
  function remove(token: number) { if (!locked && !submitted.current && !inFlight.current) update(trayRef.current.filter(item => item.token !== token)); }
  function deliver() {
    if (locked || submitted.current || inFlight.current || trayRef.current.length !== required) return;
    inFlight.current = true;
    const wrong = trayRef.current.find(item => item.id !== exercise.answer);
    if (wrong) { setMessage("订单里有一张图不对，可以点托盘拿回来，再听一遍。 "); onAnswer(wrong.id, exercise.id); }
    else { submitted.current = true; setDone(true); setMessage("乐乐收到啦！马上听下一张订单。 "); onAnswer(exercise.answer, exercise.id); }
  }
  function drop(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const moved = Math.hypot(event.clientX - dragStart.current.x, event.clientY - dragStart.current.y) > 18; dragStart.current = null;
    if (!moved) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-delivery-target]");
    if (target) deliver();
  }
  return <div className="delivery-game exploration-game">
    <div className="mini-game-heading"><span><PackageCheck size={23}/>乐乐的订单</span><strong>装 {required} 份同样的图卡</strong></div>
    <div className="delivery-shelf" role="group" aria-label="选择图卡装入托盘">{exercise.options.map(id => <button key={id} disabled={locked || tray.length >= required} className={`delivery-item ${hinted && id === exercise.answer ? "hinted" : ""}`} aria-label={`装入一份${getWord(id).zh}`} onClick={() => add(id)}><WordArt id={id}/><span>装一份</span></button>)}</div>
    <div className="delivery-bottom"><div className="delivery-tray" role="group" aria-label={`托盘，已装${tray.length}份，需要${required}份`} onPointerDown={event => { if (locked || tray.length !== required || (event.target as HTMLElement).closest("button")) return; dragStart.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={drop} onPointerCancel={() => { dragStart.current = null; }}>
      {Array.from({ length: required }, (_, index) => tray[index] ? <button key={tray[index].token} disabled={locked} aria-label={`拿回第${index + 1}份${getWord(tray[index].id).zh}`} onClick={() => remove(tray[index].token)}><WordArt id={tray[index].id}/><Undo2 size={16}/></button> : <span className="tray-slot" key={`empty-${index}`}><Circle size={30}/><small>{index + 1}</small></span>)}
      <span className="tray-handle">托盘 · {tray.length}/{required}</span>
    </div><button className="fox-delivery-target" data-delivery-target="true" disabled={locked || tray.length !== required} onClick={deliver} aria-label="送给乐乐，检查整张订单">
      {/* Existing original mascot is a local bundled asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={gameImageURL("/images/fox.png")} alt="等着收订单的小狐狸乐乐"/><span><PackageCheck size={21}/>送给乐乐</span>
    </button></div>
    <div className="delivery-tools"><button className="text-button" disabled={locked || !tray.length} onClick={() => update([])}><RotateCcw size={19}/>重新装盘</button><p className="mini-game-note" role="status">{message || "点图卡装盘，点托盘拿回。装满后点乐乐，也可以拖托盘过去。"}</p></div>
  </div>;
}

export function ConnectionGame({ exercise, disabled, busy, suspended, hinted, completedWordIds = [], onAnswer }: ExplorationGameProps & { completedWordIds?: string[] }) {
  const [left, setLeft] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  // Options stay within one three-word group; retain its two column orders across prompts.
  const [leftIds] = useState(() => [...exercise.options].sort());
  const [rightIds] = useState(() => [...exercise.options]);
  const submitting = useRef("");
  useEffect(() => { if (!busy && !disabled && !suspended) submitting.current = ""; }, [exercise.id, busy, disabled, suspended]);
  const locked = disabled || busy || suspended || completedWordIds.includes(exercise.wordId);
  function connect(id: string) {
    if (locked || submitting.current === exercise.id) return;
    if (left !== exercise.wordId) { setMessage("先点正在听的那个英文词，再给它找图片。 "); return; }
    submitting.current = exercise.id;
    setMessage(id === exercise.answer ? "连上啦！马上听下一个词。 ": "还没连对，再听一听。 "); onAnswer(id, exercise.id);
  }
  return <div className="connection-game exploration-game">
    <div className="mini-game-heading"><span><Sparkles size={23}/>词语图片桥</span><strong>本组 {leftIds.filter(id => completedWordIds.includes(id)).length}/3</strong></div>
    <div className="connection-board"><div className="connection-words" role="group" aria-label="先选当前英语词">{leftIds.map(id => <button key={id} className={`connect-word ${left === id ? "selected" : ""} ${completedWordIds.includes(id) ? "connected" : ""} ${hinted && id === exercise.wordId ? "hinted" : ""}`} disabled={locked || completedWordIds.includes(id)} aria-label={`英文词 ${getWord(id).en}${completedWordIds.includes(id) ? "，已经连好" : ""}`} onClick={() => { setLeft(id); setMessage(id === exercise.wordId ? "现在点这个词的图片。 ": "先听正在播放的目标词。 "); }}><span lang="en">{getWord(id).en}</span>{completedWordIds.includes(id) && <Check size={20}/>}</button>)}</div>
      <svg className="connection-lines" viewBox="0 0 100 300" preserveAspectRatio="none" aria-hidden="true">{leftIds.filter(id => completedWordIds.includes(id)).map(id => <path key={id} d={`M 0 ${leftIds.indexOf(id) * 100 + 50} C 45 ${leftIds.indexOf(id) * 100 + 50},55 ${rightIds.indexOf(id) * 100 + 50},100 ${rightIds.indexOf(id) * 100 + 50}`} fill="none" stroke="#669ec4" strokeWidth="6" vectorEffect="non-scaling-stroke"/>)}</svg>
      <div className="connection-pictures" role="group" aria-label="再选对应图片">{rightIds.map(id => <button key={id} className={`connect-picture ${completedWordIds.includes(id) ? "connected" : ""} ${hinted && id === exercise.wordId ? "hinted" : ""}`} disabled={locked || completedWordIds.includes(id)} aria-label={`${getWord(id).zh}图片${completedWordIds.includes(id) ? "，已经连好" : ""}`} onClick={() => connect(id)}><WordArt id={id}/>{completedWordIds.includes(id) && <Check size={20}/>}</button>)}</div>
    </div><p className="mini-game-note" role="status">{message || "听英语，点单词，再点图片。连线会留在桥上。"}</p>
  </div>;
}
