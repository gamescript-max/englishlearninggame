"use client";

import { gameImageURL } from "@/lib/game-image-assets";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { PlantId, PlaygroundTask } from "@/lib/playground-content";
import type { PlaygroundGameProps } from "@/components/playground-types";
import "./garden-game.css";

const GARDEN_PLANTS: PlantId[] = ["carrot", "tomato", "sunflower", "strawberry", "corn", "rose"];
const PLANT_NAMES: Record<PlantId, { en: string; zh: string }> = {
  carrot: { en: "carrot", zh: "胡萝卜" }, tomato: { en: "tomato", zh: "番茄" },
  sunflower: { en: "sunflower", zh: "向日葵" }, strawberry: { en: "strawberry", zh: "草莓" },
  corn: { en: "corn", zh: "玉米" }, rose: { en: "rose", zh: "玫瑰" },
};

/** Original vector plants; no downloaded character or game artwork. */
export function PlantArt({ plant, stage = "grown", className = "" }: { plant: PlantId; stage?: "seed" | "sprout" | "grown" | "harvested"; className?: string }) {
  if (stage === "seed" || stage === "harvested") return <svg className={`garden-plant-art ${className}`} viewBox="0 0 120 120" aria-hidden="true">
    {stage === "seed" ? <><ellipse cx="53" cy="98" rx="5" ry="3" fill="#e6aa64"/><ellipse cx="68" cy="102" rx="5" ry="3" fill="#f7cb77"/><path d="M45 107Q60 98 76 108" fill="none" stroke="#70432a" strokeWidth="4" strokeLinecap="round"/></> : <><path d="M57 107V85M57 96Q40 89 42 82Q55 80 57 96M58 95Q75 89 75 81Q60 80 58 95" fill="#81c75b" stroke="#4d9852" strokeWidth="3"/><circle cx="91" cy="28" r="10" fill="#fff8c5"/><path d="m87 28 3 3 5-6" fill="none" stroke="#75a749" strokeWidth="3" strokeLinecap="round"/></>}
  </svg>;
  if (stage === "sprout") return <svg className={`garden-plant-art ${className}`} viewBox="0 0 120 120" aria-hidden="true"><path d="M60 110V68" fill="none" stroke="#499750" strokeWidth="7" strokeLinecap="round"/><path d="M58 89C25 86 27 56 30 57C48 55 60 66 58 89M63 78C93 74 95 47 89 48C73 47 59 60 63 78" fill="#80cf69" stroke="#499750" strokeWidth="3"/><path d="m34 63 19 18m29-26-16 17" stroke="#b5e887" strokeWidth="3" strokeLinecap="round"/></svg>;
  return <svg className={`garden-plant-art ${className}`} viewBox="0 0 120 120" aria-hidden="true">
    {plant === "carrot" && <><path d="M58 37C44 29 36 13 42 8C54 10 60 24 61 35M64 34C65 15 77 8 81 12C81 25 73 35 64 39M59 34C55 12 61 4 66 6C72 21 66 30 62 38" fill="#5ba74e"/><path d="M43 35Q59 29 77 37Q84 54 62 110Q39 83 38 51Z" fill="#f68732" stroke="#d46525" strokeWidth="3"/><path d="m45 53 13 4m11 12 7-1m-29 9 11 4" stroke="#cc6024" strokeWidth="3" strokeLinecap="round"/><path d="M48 41Q42 65 58 93" fill="none" stroke="#ffb96b" strokeWidth="5" strokeLinecap="round"/></>}
    {plant === "tomato" && <><path d="M62 28V16Q59 6 69 7" fill="none" stroke="#45894b" strokeWidth="5"/><path d="M30 38Q54 26 63 34Q87 24 99 42Q112 75 89 96Q62 111 35 96Q10 73 30 38" fill="#f3584f" stroke="#cd433d" strokeWidth="3"/><path d="m63 31-21-7 9 14-15 4 24 2 9 13 2-15 21-3-17-6 2-11Z" fill="#589b46"/><path d="M36 49Q26 63 33 76" fill="none" stroke="#ffafa0" strokeWidth="7" strokeLinecap="round"/><circle cx="82" cy="81" r="8" fill="#e34740"/></>}
    {plant === "sunflower" && <><path d="M60 105V55" stroke="#568f41" strokeWidth="7" strokeLinecap="round"/><path d="M59 95Q22 86 29 72Q51 69 59 95M63 87Q96 80 90 65Q71 68 63 87" fill="#85bc4c" stroke="#568f41" strokeWidth="2"/>{Array.from({ length: 10 }, (_, i) => <ellipse key={i} cx="60" cy="19" rx="10" ry="17" fill="#ffc748" stroke="#eda633" strokeWidth="2" transform={`rotate(${i * 36} 60 42)`}/>)}<circle cx="60" cy="42" r="22" fill="#a96939" stroke="#7f4c2c" strokeWidth="3"/><circle cx="53" cy="37" r="2" fill="#583c2b"/><circle cx="67" cy="37" r="2" fill="#583c2b"/><path d="M53 47Q60 53 68 47" fill="none" stroke="#583c2b" strokeWidth="2.5" strokeLinecap="round"/><path d="M46 27Q56 21 68 27" fill="none" stroke="#ca9456" strokeWidth="4" strokeLinecap="round"/></>}
    {plant === "strawberry" && <><path d="M60 38Q59 22 64 11" fill="none" stroke="#4c9244" strokeWidth="5"/><path d="M24 40Q44 24 61 37Q82 26 98 44Q106 72 62 106Q19 78 24 40Z" fill="#f15c66" stroke="#ce3d53" strokeWidth="3"/><path d="m59 37-23-10 11 19-18 1 24 6 9 13 7-14 25-8-17-3 10-17-23 13Z" fill="#6cab51"/>{[[38,58],[61,65],[84,60],[47,79],[74,80],[61,94]].map(([x,y]) => <ellipse key={x+y} cx={x} cy={y} rx="2" ry="4" fill="#ffe7a2" transform={`rotate(12 ${x} ${y})`}/>)}<path d="M33 49Q29 61 38 70" fill="none" stroke="#ffafb0" strokeWidth="6" strokeLinecap="round"/></>}
    {plant === "corn" && <><path d="M42 87Q38 56 46 23Q57 3 68 14Q84 35 79 87" fill="#fbd355" stroke="#d8a933" strokeWidth="3"/>{Array.from({ length: 7 }, (_, row) => <g key={row}>{[49,60,71].map(x => <rect key={x} x={x-4} y={22+row*8} width="8" height="6" rx="3" fill={x === 49 ? "#ffe992" : "#ecc13f"}/>)}</g>)}<path d="M56 110Q18 76 25 44Q51 59 61 91Q72 54 99 35Q102 80 67 111" fill="#75b752" stroke="#4c9146" strokeWidth="3"/><path d="M32 57Q40 82 58 102M90 51Q85 78 66 101" fill="none" stroke="#b4d875" strokeWidth="3" strokeLinecap="round"/></>}
    {plant === "rose" && <><path d="M59 109V60" stroke="#4a9150" strokeWidth="6" strokeLinecap="round"/><path d="M58 93Q28 84 35 72Q52 72 58 93M63 85Q92 79 86 65Q70 66 63 85" fill="#75b958" stroke="#4a9150" strokeWidth="2"/><path d="M27 32Q23 14 45 14Q59 1 76 12Q99 9 99 32Q113 54 89 67Q77 83 56 71Q31 78 24 55Q14 42 27 32" fill="#f27577" stroke="#cf5158" strokeWidth="3"/><path d="M31 32Q60 32 83 18Q71 40 89 54Q60 70 35 52Q52 48 61 34Q52 30 43 35" fill="#e65761" stroke="#bd3d49" strokeWidth="3"/><path d="M45 40Q54 29 66 36Q76 45 63 51Q51 55 46 45" fill="#f7a09d" stroke="#bd3d49" strokeWidth="3"/></>}
  </svg>;
}

function GardenToolArt({ id }: { id: string }) {
  if (GARDEN_PLANTS.includes(id as PlantId)) return <PlantArt plant={id as PlantId}/>;
  if (id === "water") return <svg viewBox="0 0 120 120" aria-hidden="true"><path d="M28 56Q17 33 37 30L49 49" fill="none" stroke="#427faa" strokeWidth="9"/><path d="m78 54 26-17 7 9-25 27" fill="#75bfe0" stroke="#427faa" strokeWidth="4"/><path d="M29 48h54l5 46H25Z" fill="#7dc7e7" stroke="#427faa" strokeWidth="4"/><ellipse cx="55" cy="48" rx="27" ry="7" fill="#badff0" stroke="#427faa" strokeWidth="3"/><path d="M50 80Q39 65 53 60Q67 71 57 80Z" fill="#e8faff"/><path d="m110 56-4 6m5 6-5 6m4 6-4 6" stroke="#92d8f5" strokeWidth="4" strokeLinecap="round"/></svg>;
  if (id === "basket") return <svg viewBox="0 0 120 120" aria-hidden="true"><path d="M31 62V50Q31 11 60 11Q89 11 89 50V62" fill="none" stroke="#b58148" strokeWidth="10"/><path d="m19 48 10 53h63l11-53Z" fill="#e5b774" stroke="#ac763f" strokeWidth="4"/><path d="M27 62h69M29 76h64M33 90h58M42 52l3 46m15-46v46m18-46-3 46" stroke="#c48d4e" strokeWidth="4"/><path d="M19 47h84" stroke="#f3d394" strokeWidth="10" strokeLinecap="round"/></svg>;
  if (id === "sun") return <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="28" fill="#ffd56b" stroke="#eeaf47" strokeWidth="3"/>{Array.from({length:8},(_,i)=><path key={i} d="M60 12V22" transform={`rotate(${i*45} 60 60)`} stroke="#eeaf47" strokeWidth="7" strokeLinecap="round"/>)}<circle cx="50" cy="56" r="3" fill="#a16b30"/><circle cx="70" cy="56" r="3" fill="#a16b30"/><path d="M51 68Q60 76 69 68" fill="none" stroke="#a16b30" strokeWidth="3" strokeLinecap="round"/></svg>;
  return <svg viewBox="0 0 120 120" aria-hidden="true"><path d="M74 12 44 72" stroke="#bc9867" strokeWidth="10" strokeLinecap="round"/><path d="m46 66-21-7Q9 85 23 102Q45 111 65 78Z" fill="#7da9bc" stroke="#4c7b94" strokeWidth="4"/><path d="m34 75-8 18" stroke="#bce0ed" strokeWidth="4" strokeLinecap="round"/></svg>;
}

function growthStage(plot: number, index: number): "seed" | "sprout" | "grown" | "harvested" {
  if (index > 12 + plot) return "harvested";
  if (index > 6 + plot) return "grown";
  if (index > plot) return "sprout";
  return "seed";
}

export function GardenGame({ task, state, hinted, disabled, onAnswer, onInteract }: PlaygroundGameProps<"garden">) {
  const [selection, setSelection] = useState<{ taskId: string; id: string } | null>(null);
  const [note, setNote] = useState<{ taskId: string; text: string } | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [celebration, setCelebration] = useState<{ taskId: string; plot: number; action: PlaygroundTask["action"] } | null>(null);
  const dragStart = useRef<{ id: string; x: number; y: number; moved: boolean; taskId: string } | null>(null);
  const suppressClick = useRef(false);
  const selected = selection?.taskId === task.id ? selection.id : "";
  const currentNote = note?.taskId === task.id ? note.text : "";
  const action = task.action;

  function applyTool(plot: number, chosen = selected) {
    if (disabled || !chosen) {
      if (!disabled) setNote({ taskId: task.id, text: "先从工具篮选一个，再点发光的地块。" });
      return;
    }
    onInteract();
    if (plot !== task.plot) {
      setNote({ taskId: task.id, text: `找找发光的 ${task.plot + 1} 号地块，乐乐在等你！` });
      return;
    }
    if (chosen === task.target) setCelebration({ taskId: task.id, plot, action });
    else setNote({ taskId: task.id, text: "再听一听任务，换个工具试试。" });
    onAnswer(chosen, task.id);
  }

  function beginDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (disabled || event.button !== 0) return;
    onInteract();
    suppressClick.current = false;
    setSelection({ taskId: task.id, id });
    dragStart.current = { id, x: event.clientX, y: event.clientY, moved: false, taskId: task.id };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = dragStart.current;
    if (!start || start.taskId !== task.id || disabled) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) start.moved = true;
    if (start.moved) setDrag({ id: start.id, x: event.clientX, y: event.clientY });
  }
  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const start = dragStart.current;
    dragStart.current = null;
    setDrag(null);
    if (!start?.moved) return;
    suppressClick.current = true;
    if (disabled || start.taskId !== task.id) return;
    const plotElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-garden-plot]");
    if (plotElement) applyTool(Number(plotElement.dataset.gardenPlot), start.id);
  }

  return <div className={`garden-game ${disabled ? "garden-waiting" : ""}`}>
    <div className="garden-scene" role="group" aria-label="乐乐的小花园，选择工具后点发光的地块">
      <div className="garden-sun" aria-hidden="true"><GardenToolArt id="sun"/></div>
      <span className="garden-cloud garden-cloud-one" aria-hidden="true"/><span className="garden-cloud garden-cloud-two" aria-hidden="true"/>
      <span className="garden-hill garden-hill-one" aria-hidden="true"/><span className="garden-hill garden-hill-two" aria-hidden="true"/>
      <div className="garden-sign"><span aria-hidden="true">✿</span><strong>乐乐的小花园</strong><small lang="en">Little Fox Garden</small></div>
      <div className="garden-fence" aria-hidden="true">{Array.from({length:16}, (_,i)=><i key={i}/>)}</div>
      <span className="garden-pond" aria-hidden="true"><i/><i/></span>
      <div className="garden-beds">
        {GARDEN_PLANTS.map((plant, plot) => {
          const stage = growthStage(plot, state.index);
          const active = plot === task.plot;
          const effect = celebration?.plot === plot && celebration.taskId === task.id;
          return <button key={plot} type="button" data-garden-plot={plot} className={`garden-plot garden-stage-${stage} ${active ? "garden-plot-active" : ""} ${hinted && active ? "garden-plot-hinted" : ""}`} disabled={disabled} onClick={() => applyTool(plot)} aria-label={`${plot + 1}号地块${stage === "seed" ? "，等待种植" : `，${PLANT_NAMES[plant].zh}`}${active ? "，当前任务地块" : ""}`}>
            <span className="garden-soil" aria-hidden="true"><i/><i/><i/></span>
            <span className="garden-crop"><PlantArt plant={plant} stage={stage}/></span>
            <span className="garden-plot-number">{plot + 1}</span>
            {active && <span className="garden-plot-callout" aria-hidden="true">{action === "plant" ? "种在这里" : action === "water" ? "给它浇水" : "摘下来"}<span>↓</span></span>}
            {stage !== "seed" && <span className="garden-crop-label" lang="en">{PLANT_NAMES[plant].en}</span>}
            {effect && <span key={celebration?.taskId} className={`garden-plot-effect garden-effect-${celebration?.action}`} aria-hidden="true">{Array.from({length:6}, (_,i)=><i key={i} style={{"--garden-particle": i} as CSSProperties}>{celebration?.action === "water" ? "💧" : celebration?.action === "harvest" ? "✦" : "✿"}</i>)}</span>}
          </button>;
        })}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element -- Shared static mascot works in both the public and offline builds. */}
      <img src={gameImageURL("/images/fox.png")} className="garden-fox" alt="乐乐看着花园" draggable={false}/>
      <span className="garden-butterfly garden-butterfly-one" aria-hidden="true"><i/><i/></span>
      <span className="garden-butterfly garden-butterfly-two" aria-hidden="true"><i/><i/></span>
      <span className="garden-flower garden-flower-one" aria-hidden="true">✿</span><span className="garden-flower garden-flower-two" aria-hidden="true">✿</span>
    </div>
    <div className="garden-tool-shelf" role="group" aria-label="工具篮，先选择一个种子或工具">
      <div className="garden-tool-title"><strong>{action === "plant" ? "挑一颗种子" : action === "water" ? "选好浇水工具" : "带上收获工具"}</strong><span>点击或拖到发光地块</span></div>
      <div className="garden-tools" data-garden-tool-count={task.options.length}>{task.options.map(option => <button key={option.id} type="button" disabled={disabled} aria-pressed={selected === option.id} aria-label={`${option.en}，${option.zh}`} className={`garden-tool ${selected === option.id ? "garden-tool-selected" : ""} ${hinted && option.id === task.target ? "garden-tool-hinted" : ""}`} onPointerDown={event => beginDrag(event, option.id)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={() => {dragStart.current = null; setDrag(null);}} onClick={event => {
        if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; }
        if (!disabled) { onInteract(); setSelection({ taskId: task.id, id: option.id }); setNote(null); }
      }}><span className="garden-tool-picture"><GardenToolArt id={option.id}/></span><strong lang="en">{option.en}</strong><small>{option.zh}</small>{selected === option.id && <span className="garden-tool-check" aria-hidden="true">✓</span>}</button>)}</div>
    </div>
    <p className="garden-instruction" role="status">{currentNote || (selected ? `选好了 ${task.options.find(option => option.id === selected)?.zh ?? "工具"}，点发光地块吧！` : "种下种子 → 浇浇水 → 收获果实，让整个花园长起来！")}</p>
    {drag && <div className="garden-drag-ghost" aria-hidden="true" style={{ left: drag.x, top: drag.y }}><GardenToolArt id={drag.id}/></div>}
  </div>;
}
