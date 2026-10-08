"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Eye, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import { WordArt } from "@/components/word-art";
import { getWord, type Exercise } from "@/lib/course";

export interface BonusGameProps {
  exercise: Exercise;
  disabled: boolean;
  hinted: boolean;
  onAnswer: (answer: string) => void;
  /** Revealing cards again must be recorded as a hint by the parent. */
  onHint?: () => void;
  /** Replay the target after the preview is covered. */
  onPreviewEnd?: () => void;
}

const touchButton: CSSProperties = { minWidth: 56, minHeight: 56, touchAction: "manipulation" };
const previewDuration = 3500;

export function MemoryGame({ exercise, disabled, hinted, onAnswer, onHint, onPreviewEnd }: BonusGameProps) {
  const [previewing, setPreviewing] = useState(true);
  const [flipped, setFlipped] = useState<string | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!previewing || disabled) return;
    const timer = setTimeout(() => { setPreviewing(false); onPreviewEnd?.(); }, previewDuration);
    return () => clearTimeout(timer);
  }, [previewing, disabled, onPreviewEnd]);
  useEffect(() => () => {
    if (revealTimer.current !== null) clearTimeout(revealTimer.current);
  }, []);

  function choose(id: string) {
    if (disabled || previewing || flipped !== null) return;
    setFlipped(id);
    onAnswer(id);
    if (id !== exercise.answer) {
      revealTimer.current = setTimeout(() => {
        setFlipped(null);
        revealTimer.current = null;
      }, 1100);
    }
  }

  function revealAgain() {
    if (disabled || !onHint || previewing || flipped !== null) return;
    onHint();
    setPreviewing(true);
  }

  return <div className="memory-game bonus-game">
    <p className="bonus-instruction" role="status">{previewing ? "先记住图片在哪里，盖牌后听声音找宝藏。" : "听一听，翻开对应的宝藏卡！"}</p>
    <div className={`memory-grid ${previewing ? "is-previewing" : ""}`}>
      {exercise.options.map((id, index) => {
        const visible = previewing || flipped === id || (hinted && id === exercise.answer);
        const targetHint = hinted && id === exercise.answer;
        return <button
          key={id}
          className={`memory-card ${visible ? "is-face-up" : "is-face-down"} ${targetHint ? "hinted" : ""} ${flipped === id ? id === exercise.answer ? "is-found" : "is-miss" : ""}`}
          style={touchButton}
          disabled={disabled || previewing || flipped !== null}
          aria-label={visible ? `第 ${index + 1} 张图卡：${getWord(id).zh}` : `翻开第 ${index + 1} 张宝藏卡`}
          onClick={() => choose(id)}
        >
          {visible ? <WordArt id={id}/> : <span className="memory-card-back" aria-hidden="true"><Sparkles size={42}/><span>{index + 1}</span></span>}
          <small>{visible ? "记住这个位置" : "点我翻牌"}</small>
        </button>;
      })}
    </div>
    <div className="bonus-actions">
      {previewing
        ? <button className="secondary-button" style={touchButton} disabled={disabled} onClick={() => { setPreviewing(false); onPreviewEnd?.(); }}><Check size={20}/>我记住啦，盖牌</button>
        : onHint && <button className="secondary-button" style={touchButton} disabled={disabled || flipped !== null} onClick={revealAgain}><Eye size={20}/>再看一次（使用提示）</button>}
    </div>
  </div>;
}

interface LetterTile { id: number; letter: string }

function shuffledLetters(exercise: Exercise): LetterTile[] {
  const tiles = getWord(exercise.wordId).en.replaceAll(" ", "").toLowerCase().split("").map((letter, id) => ({ letter, id }));
  let seed = 2166136261;
  for (const char of `${exercise.id}:${exercise.options.join(":")}`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  for (let index = tiles.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const other = seed % (index + 1);
    [tiles[index], tiles[other]] = [tiles[other], tiles[index]];
  }
  const answer = getWord(exercise.wordId).en.replaceAll(" ", "").toLowerCase();
  if (tiles.map(tile => tile.letter).join("") === answer && tiles.length > 1) tiles.push(tiles.shift()!);
  return tiles;
}

export function SpellingGame({ exercise, disabled, hinted, onAnswer }: BonusGameProps) {
  const word = getWord(exercise.wordId);
  const compact = word.en.replaceAll(" ", "").toLowerCase();
  const [tiles] = useState(() => shuffledLetters(exercise));
  const [slots, setSlots] = useState<number[]>(() => Array(compact.length).fill(-1));
  const [needsAdjustment, setNeedsAdjustment] = useState(false);
  const wrongAnswer = exercise.options.find(option => option !== exercise.answer);
  const complete = slots.every(id => id !== -1);
  const parts = word.en.split(" ");
  const groups = parts.map((part, index) => ({
    start: parts.slice(0, index).reduce((offset, previous) => offset + previous.length, 0),
    length: part.length,
  }));

  function addTile(id: number) {
    if (disabled || slots.includes(id)) return;
    const empty = slots.indexOf(-1);
    if (empty === -1) return;
    setSlots(previous => previous.map((value, index) => index === empty ? id : value));
    setNeedsAdjustment(false);
  }

  function removeSlot(index: number) {
    if (disabled) return;
    setSlots(previous => previous.map((value, slotIndex) => slotIndex === index ? -1 : value));
    setNeedsAdjustment(false);
  }

  function undo() {
    const index = slots.findLastIndex(id => id !== -1);
    if (index !== -1) removeSlot(index);
  }

  function check() {
    if (disabled || !complete || !wrongAnswer) return;
    const assembled = slots.map(id => tiles.find(tile => tile.id === id)!.letter).join("");
    const correct = assembled === compact;
    setNeedsAdjustment(!correct);
    onAnswer(correct ? exercise.answer : wrongAnswer);
  }

  return <div className="spelling-game bonus-game">
    <p className="bonus-instruction">听单词，点字母把它拼起来。点已放好的字母可以拿回来。</p>
    <WordArt id={exercise.wordId} className="spelling-picture"/>
    {hinted && <p className="spelling-model">按这个顺序试一试：<strong lang="en">{word.en}</strong></p>}
    <div className={`spelling-slots ${needsAdjustment ? "needs-adjustment" : ""}`} aria-label="单词拼写位置">
      {groups.map((group, groupIndex) => <div className="spelling-word-group" key={groupIndex}>
        {Array.from({ length: group.length }, (_, letterIndex) => {
          const index = group.start + letterIndex;
          const chosen = tiles.find(tile => tile.id === slots[index]);
          const matchesHint = hinted && chosen?.letter === compact[index];
          return <button
            key={index}
            className={`letter-slot ${chosen ? "is-filled" : ""} ${matchesHint ? "hinted" : ""}`}
            style={touchButton}
            disabled={disabled || !chosen}
            aria-label={`第 ${index + 1} 个字母：${chosen ? chosen.letter.toUpperCase() + "，点一下拿回来" : "还没放好"}`}
            onClick={() => removeSlot(index)}
          ><span lang="en">{chosen?.letter || ""}</span>{hinted && !chosen && <small lang="en">{compact[index]}</small>}</button>;
        })}
      </div>)}
    </div>
    <div className="letter-bank" aria-label="可选择的字母">
      {tiles.map((tile, index) => <button key={tile.id} className={`letter-tile ${slots.includes(tile.id) ? "is-used" : ""}`} style={touchButton} disabled={disabled || slots.includes(tile.id) || complete} aria-label={`字母 ${tile.letter.toUpperCase()}，第 ${index + 1} 块`} onClick={() => addTile(tile.id)}><span lang="en">{tile.letter}</span></button>)}
    </div>
    <p className="spelling-status" role="status">{needsAdjustment ? "再调整一下字母顺序，准备好后点检查。" : complete ? "字母都放好啦，点检查看看。" : "一块一块放好，再点检查。"}</p>
    <div className="bonus-actions spelling-actions">
      <button className="secondary-button" style={touchButton} disabled={disabled || slots.every(id => id === -1)} onClick={undo}><Undo2 size={20}/>撤回</button>
      <button className="secondary-button" style={touchButton} disabled={disabled || slots.every(id => id === -1)} onClick={() => { setSlots(Array(compact.length).fill(-1)); setNeedsAdjustment(false); }}><RotateCcw size={20}/>重新排</button>
      <button className="primary-button" style={touchButton} disabled={disabled || !complete || !wrongAnswer} onClick={check}><Check size={20}/>检查单词</button>
    </div>
  </div>;
}

const positionDescriptions = { in: "盒子里面", on: "桌子上面", under: "桌子下面" };

export function SceneGame({ exercise, disabled, hinted, onAnswer }: BonusGameProps) {
  const scenes = exercise.scenes ?? [];
  return <div className="scene-game bonus-game">
    <p className="bonus-instruction">听一听整句话，找出符合描述的那幅图。</p>
    <div className="scene-grid">
      {scenes.map((scene, index) => {
        const word = getWord(scene.wordId);
        const count = scene.count ?? 1;
        const description = `${count} 个${word.zh}${scene.position ? `在${positionDescriptions[scene.position]}` : ""}`;
        return <button key={scene.id} className={`scene-card ${hinted && scene.id === exercise.answer ? "hinted" : ""}`} style={touchButton} disabled={disabled} aria-label={`选择第 ${index + 1} 幅图：${description}`} onClick={() => onAnswer(scene.id)}>
          <span className={`scene-illustration ${scene.position ? `scene-position scene-position-${scene.position}` : `scene-count scene-count-${count}`}`} role="img" aria-label={description}>
            <span className="scene-stage" aria-hidden="true">
              {scene.position && <span className="scene-furniture"/>}
              <span className="scene-objects">{Array.from({ length: count }, (_, objectIndex) => <WordArt key={objectIndex} id={scene.wordId} variant={scene.variant ?? "base"} className="scene-object"/>)}</span>
              {scene.position === "in" && <span className="scene-furniture scene-box-front"/>}
            </span>
          </span>
          <small>第 {index + 1} 幅图</small>
        </button>;
      })}
    </div>
  </div>;
}
