"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw, Worm } from "lucide-react";
import { WordArt } from "@/components/word-art";
import { getWord, type Exercise } from "@/lib/course";
import { createSnakeBoard, initialSnake, snakeSize, stepSnake, turnSnake, type Direction, type SnakeBoard } from "@/lib/snake";

export type SnakeGameProps = { exercise: Exercise; disabled: boolean; busy: boolean; suspended: boolean; hinted: boolean; found: number; collectedWordIds?: string[]; onAnswer: (answer: string, exerciseId: string) => void };
const directions = [{ id: "up", label: "向上", Icon: ArrowUp }, { id: "left", label: "向左", Icon: ArrowLeft }, { id: "down", label: "向下", Icon: ArrowDown }, { id: "right", label: "向右", Icon: ArrowRight }] as const;
const keyboard: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };

export function SnakeGame({ exercise, disabled, busy, suspended, hinted, found, collectedWordIds = [], onAnswer }: SnakeGameProps) {
  const [board, setBoard] = useState(() => createSnakeBoard(exercise, initialSnake(1 + found)));
  const boardRef = useRef(board);
  const questionRef = useRef(exercise.id);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const [slow, setSlow] = useState(true);
  const [wantsRun, setWantsRun] = useState(false);
  const wantsRunRef = useRef(false);
  const gates = useRef({ disabled, busy, suspended });
  useEffect(() => { gates.current = { disabled, busy, suspended }; }, [disabled, busy, suspended]);
  function commit(next: SnakeBoard) { boardRef.current = next; setBoard(next); }
  function intent(value: boolean) { wantsRunRef.current = value; setWantsRun(value); }
  function pause() {
    intent(false);
    pointer.current = null;
    if (!["done", "collision"].includes(boardRef.current.phase)) commit({ ...boardRef.current, queued: null, phase: "paused" });
  }

  useEffect(() => {
    if (questionRef.current === exercise.id) return;
    questionRef.current = exercise.id;
    // Food changes, while the grown snake stays with the child between questions.
    commit(createSnakeBoard(exercise, boardRef.current.body, boardRef.current.direction));
  }, [exercise]);

  useEffect(() => {
    if (board.phase !== "running" || disabled || busy || suspended || !wantsRun) return;
    const questionId = exercise.id;
    const timer = setInterval(() => {
      if (document.hidden || gates.current.disabled || gates.current.busy || gates.current.suspended || !wantsRunRef.current || questionRef.current !== questionId || boardRef.current.phase !== "running") return;
      const next = stepSnake(boardRef.current, exercise.answer);
      commit(next.board);
      // Commit and lock the board before notifying the learning system.
      if (next.board.phase === "collision") intent(false);
      if (next.eaten) onAnswer(next.eaten, questionId);
    }, slow ? 850 : 600);
    return () => clearInterval(timer);
  }, [board.phase, disabled, busy, suspended, wantsRun, exercise.id, exercise.answer, onAnswer, slow]);

  useEffect(() => {
    // A modal/background signal must cancel running intention, even between voices.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (suspended || document.hidden) { pause(); return; }
    const active = boardRef.current;
    if (busy || disabled) {
      if (active.phase === "running") commit({ ...active, phase: "paused" });
    } else if (wantsRun && ["ready", "paused", "wrong"].includes(active.phase)) {
      // Next target, replay and retry resume automatically only after audio ends.
      commit({ ...active, phase: "running" });
    }
    // Reconcile external audio with the child's explicit running intention.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id, busy, disabled, suspended, wantsRun]);

  useEffect(() => {
    const visibility = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pause);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pause); };
    // These listeners use refs so hiding the page also pauses between targets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function turn(direction: Direction) {
    if (suspended || document.hidden || (disabled && !busy) || ["done", "wrong"].includes(boardRef.current.phase)) return;
    if (boardRef.current.phase === "collision") commit(createSnakeBoard(exercise, initialSnake(1 + found)));
    intent(true);
    const next = turnSnake(boardRef.current, direction);
    commit({ ...next, phase: busy || disabled ? "paused" : "running" });
  }
  function toggle() {
    if (wantsRunRef.current) { pause(); return; }
    if (disabled || busy || suspended || ["done", "collision"].includes(boardRef.current.phase)) return;
    intent(true);
    commit({ ...boardRef.current, phase: "running" });
  }
  function restart() {
    if (disabled || busy || suspended || boardRef.current.phase === "done") return;
    intent(true);
    commit({ ...createSnakeBoard(exercise, initialSnake(1 + found)), phase: "running" });
  }
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input,textarea,select,[contenteditable=true]") || target?.closest("[role=dialog]")) return;
      const direction = keyboard[event.key] ?? keyboard[event.key.toLowerCase()];
      if (direction) { event.preventDefault(); turn(direction); }
      else if (event.code === "Space" && target?.tagName !== "BUTTON") { event.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
    // Event listeners track the current input/voice availability, using boardRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, busy, suspended]);

  function swipe(event: PointerEvent<HTMLDivElement>) {
    if (!pointer.current) return;
    const dx = event.clientX - pointer.current.x, dy = event.clientY - pointer.current.y;
    pointer.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    turn(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up");
  }
  const movementLocked = (disabled && !busy) || suspended || ["done", "wrong"].includes(board.phase);
  const status = board.phase === "collision" ? "碰到边缘或自己啦！按方向或点重来，再出发。" : board.phase === "wrong" ? "这条小蛇还不对，再听同一个目标，听完自动出发。" : board.phase === "done" ? "吃到啦，大蛇长大了！马上听下一个目标。" : busy || disabled ? wantsRun ? "方向准备好啦！听完英语，小蛇就出发。" : "可以先按方向准备好，小蛇会等你听清英语。" : board.phase === "running" ? "每吃到一张正确词图，就长出它的方块！" : "按任意方向，或在草地滑动，就能出发！";

  return <div className="snake-game bonus-game" data-phase={board.phase}>
    <div className="snake-board" role="group" aria-label="大蛇吃小蛇英语棋盘，用方向按钮、滑动或键盘控制" onPointerDown={event => { if (movementLocked) return; pointer.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={swipe} onPointerCancel={() => { pointer.current = null; }}>
      {Array.from({ length: snakeSize * snakeSize }, (_, index) => {
        const x = index % snakeSize, y = Math.floor(index / snakeSize);
        const segment = board.body.findIndex(cell => cell.x === x && cell.y === y);
        // Pictures belong to body positions, not coordinates which are discarded on movement.
        const collected = segment > 0 ? collectedWordIds[collectedWordIds.length - segment] : undefined;
        const food = board.foods.find(food => food.x === x && food.y === y);
        return <div key={index} data-body-word={collected} className={`snake-cell ${segment === 0 ? `snake-head facing-${board.direction}` : segment > 0 ? `snake-body ${collected ? "collected-segment" : ""}` : ""} ${food ? "snake-food" : ""} ${food && hinted && food.wordId === exercise.answer ? "hinted" : ""}`}>
          {segment === 0 ? <span className="snake-head-sprite" role="img" aria-label="大蛇的头"/> : collected ? <WordArt id={collected} className="snake-collected-word"/> : food ? <><Worm className="little-snake" aria-hidden="true"/><WordArt id={food.wordId} className="snake-word"/></> : null}
          {collected && <span className="sr-only">蛇身第{segment}格：已吃到的{getWord(collected).zh}</span>}
          {food && <span className="sr-only">第{y + 1}行第{x + 1}列：带着{getWord(food.wordId).zh}图卡的小蛇</span>}
        </div>;
      })}
      {board.phase === "collision" && <div className="snake-board-message"><Worm size={38}/><strong>点重来，再出发！</strong></div>}
    </div>
    <aside className="snake-sidebar">
      <div className="snake-toolbar"><span><Worm size={25}/><span>吃到 {Math.min(found, 6)}/6<br/>大蛇 {board.body.length} 格</span></span><button className="snake-speed" disabled={board.phase === "running"} aria-pressed={slow} onClick={() => setSlow(value => !value)}>{slow ? "慢慢走" : "轻快走"}</button></div>
      <div className="snake-controls"><div className="snake-dpad" aria-label="大蛇方向按钮">{directions.map(direction => <button className={`direction-${direction.id}`} key={direction.id} disabled={movementLocked} aria-label={direction.label} onClick={() => turn(direction.id)}><direction.Icon size={29}/><span>{direction.label}</span></button>)}</div><div className="snake-actions"><button className="primary-button" aria-label={wantsRun ? "暂停小蛇" : board.phase === "ready" ? "开始游戏" : "继续游戏"} disabled={!wantsRun && (disabled || busy || suspended || ["done", "collision"].includes(board.phase))} onClick={toggle}>{wantsRun ? <><Pause size={24}/><span>暂停</span></> : <><Play size={24} fill="currentColor"/><span>{board.phase === "ready" ? "开始" : "继续"}</span></>}</button><button className="secondary-button" aria-label="重置位置并出发，保留长度与已完成进度" disabled={disabled || busy || suspended || board.phase === "done"} onClick={restart}><RotateCcw size={24}/><span>重来</span></button></div></div>
      <p className="snake-status" role="status">{status}</p>
    </aside>
  </div>;
}
