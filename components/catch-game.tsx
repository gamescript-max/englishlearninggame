"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowLeft, ArrowRight, Pause, ShoppingBasket, Sparkles, Star } from "lucide-react";
import { WordArt } from "@/components/word-art";
import { getWord } from "@/lib/course";
import type { ExplorationGameProps } from "@/components/exploration-games";

export function CatchGame({ exercise, disabled, busy, suspended, hinted, onAnswer }: ExplorationGameProps) {
  const [lane, setLane] = useState(1);
  const [fall, setFall] = useState(0);
  const [wave, setWave] = useState(0);
  const [running, setRunning] = useState(false);
  const [caught, setCaught] = useState(false);
  const laneRef = useRef(1), fallRef = useRef(0), runningRef = useRef(false), submitted = useRef(false), awaitingVoice = useRef(false), pointer = useRef<number | null>(null);
  const questionRef = useRef(exercise.id);
  const gates = useRef({ disabled, busy, suspended });
  useEffect(() => { gates.current = { disabled, busy, suspended }; }, [disabled, busy, suspended]);
  const seed = [...exercise.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const distractors = exercise.options.filter(id => id !== exercise.answer);
  const cards = [exercise.answer, distractors[wave % distractors.length], distractors[(wave + 1) % distractors.length]];
  const offset = (seed + wave) % 3;
  const falling = cards.map((_, index) => cards[(index + offset) % 3]);
  const fallingKey = falling.join(",");
  const inputLocked = suspended || caught || (disabled && !busy);
  function intent(value: boolean) { runningRef.current = value; setRunning(value); }
  function pause() { intent(false); pointer.current = null; }
  function choose(next: number) {
    if (gates.current.suspended || document.hidden || submitted.current || (gates.current.disabled && !gates.current.busy)) return;
    const value = Math.max(0, Math.min(2, next)); laneRef.current = value; setLane(value); intent(true);
  }
  function locate(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    choose(Math.floor((event.clientX - rect.left) / rect.width * 3));
  }
  useEffect(() => {
    if (questionRef.current === exercise.id) return;
    questionRef.current = exercise.id; submitted.current = false; awaitingVoice.current = false; fallRef.current = 0;
    // Preserve basket position and running intent while the next English target plays.
    setFall(0); setWave(0); setCaught(false);
  }, [exercise.id]);
  useEffect(() => {
    // A retry starts a fresh wave after its English replay. Progress stays in the parent.
    if (busy && submitted.current) awaitingVoice.current = true;
    if (!busy && !disabled && awaitingVoice.current) {
      awaitingVoice.current = false; submitted.current = false; fallRef.current = 0;
      setFall(0); setWave(value => value + 1); setCaught(false);
    }
    // Cancel intent in response to an external modal or visibility signal.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (suspended || document.hidden) pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, disabled, suspended]);
  useEffect(() => {
    if (!running || busy || disabled || suspended || submitted.current) return;
    const words = fallingKey.split(",");
    const timer = setInterval(() => {
      if (!runningRef.current || document.hidden || questionRef.current !== exercise.id || submitted.current || gates.current.busy || gates.current.disabled || gates.current.suspended) return;
      const next = fallRef.current + 1;
      fallRef.current = next; setFall(next);
      if (next === 90) {
        submitted.current = true;
        setCaught(true);
        onAnswer(words[laneRef.current], exercise.id);
      }
    }, 55);
    return () => clearInterval(timer);
  }, [running, busy, disabled, suspended, fallingKey, exercise.id, onAnswer]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.matches("input,textarea,select,[contenteditable=true]") || target?.closest("[role=dialog]")) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d"].includes(event.key)) {
        event.preventDefault(); choose(event.key === "ArrowLeft" || event.key === "a" ? laneRef.current - 1 : event.key === "ArrowRight" || event.key === "d" ? laneRef.current + 1 : laneRef.current);
      }
    };
    const hidden = () => { if (document.hidden) pause(); };
    window.addEventListener("keydown", key); window.addEventListener("pagehide", pause); document.addEventListener("visibilitychange", hidden);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("pagehide", pause); document.removeEventListener("visibilitychange", hidden); };
    // Input may prepare a move during a voice, but timers remain gated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, busy, suspended]);

  return <div className="catch-game" data-running={running}>
    <div className="catch-field" role="group" aria-label="星星草地，点轨道或拖动篮子接图卡" onPointerDown={event => { if (inputLocked) return; pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); locate(event); }} onPointerMove={event => { if (pointer.current === event.pointerId) locate(event); }} onPointerUp={() => { pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }}>
      <div className="catch-sky-caption"><Sparkles size={22}/>英语小星星，落进小篮子</div>
      {falling.map((id, index) => <div key={`${wave}:${id}`} className={`catch-star ${hinted && id === exercise.answer ? "hinted" : ""}`} data-word={id} data-lane={index} style={{ left: `${(index + .5) / 3 * 100}%`, top: `calc(${100 * (1 - fall / 90)}px + ${72 * fall / 90}%)` }}><Star className="catch-star-glow" fill="currentColor"/><WordArt id={id}/><span className="sr-only">{getWord(id).zh}图卡，在第{index + 1}条轨道</span></div>)}
      <div className="catch-lanes">{[0, 1, 2].map(index => <button className={lane === index ? "basket-lane selected" : "basket-lane"} key={index} disabled={inputLocked} aria-label={`移到${["左边", "中间", "右边"][index]}轨道`} aria-pressed={lane === index} onClick={() => choose(index)}><span>{index + 1}</span></button>)}</div>
      <div className="catch-basket" style={{ left: `${(lane + .5) / 3 * 100}%` }} aria-label={`篮子在${["左边", "中间", "右边"][lane]}`}><ShoppingBasket size={74}/><span>乐乐的小篮子</span></div>
    </div>
    <div className="catch-controls"><button className="secondary-button" disabled={inputLocked} aria-label="篮子向左" onClick={() => choose(laneRef.current - 1)}><ArrowLeft size={28}/>向左</button><button className="secondary-button" disabled={!running} onClick={pause}><Pause size={24}/>暂停</button><button className="secondary-button" disabled={inputLocked} aria-label="篮子向右" onClick={() => choose(laneRef.current + 1)}><ArrowRight size={28}/>向右</button></div>
    <p className="catch-status" role="status">{busy || disabled ? "先听清目标，也可以先移动篮子准备好。" : caught ? "接住啦！听听乐乐的反馈。" : running ? "接到正确图片，马上听下一句英语！" : "点一条轨道，或按任意方向键，就能出发！"}</p>
  </div>;
}
