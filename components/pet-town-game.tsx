"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import type { PlaygroundGameProps } from "@/components/playground-types";
import "./pet-town-game.css";

type PetKind = "puppy" | "kitten" | "bunny";
type CareAction = "feed" | "drink" | "wash" | "sleep" | "play";
type PetMood = "happy" | "hungry" | "sleepy" | "washing" | "neutral";

const pets: { id: PetKind; en: string; zh: string; name: string }[] = [
  { id: "puppy", en: "puppy", zh: "小狗", name: "豆豆" },
  { id: "kitten", en: "kitten", zh: "小猫", name: "咪咪" },
  { id: "bunny", en: "bunny", zh: "小兔", name: "绵绵" },
];
const careSteps: { action: CareAction; label: string; item: string }[] = [
  { action: "feed", label: "吃饱饱", item: "carrot" },
  { action: "drink", label: "喝水", item: "water" },
  { action: "wash", label: "洗香香", item: "soap" },
  { action: "sleep", label: "睡好觉", item: "bed" },
  { action: "play", label: "一起玩", item: "ball" },
];

/** Original SVG artwork: every pet has its own face, body and moving tail. */
export function PetAvatar({ pet, mood = "neutral", className = "" }: { pet: PetKind; mood?: PetMood; className?: string }) {
  const gradientId = useId().replace(/:/g, "");
  const sleepy = mood === "sleepy";
  const puppy = pet === "puppy", kitten = pet === "kitten";
  const fur = puppy ? ["#ffd39b", "#df975e"] : kitten ? ["#fff3de", "#efc791"] : ["#ffffff", "#e9dcef"];
  return <svg viewBox="0 0 210 220" className={`pet-town-avatar pet-town-avatar-${pet} pet-town-mood-${mood} ${className}`} role="img" aria-label={`${pets.find(value => value.id === pet)?.zh}，${sleepy ? "安心休息" : "等你照顾"}`}>
    <defs><linearGradient id={`${gradientId}-fur`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor={fur[0]}/><stop offset="1" stopColor={fur[1]}/></linearGradient><radialGradient id={`${gradientId}-shine`}><stop stopColor="white" stopOpacity=".9"/><stop offset="1" stopColor="white" stopOpacity="0"/></radialGradient></defs>
    <ellipse cx="108" cy="207" rx="65" ry="10" fill="#3d7b5b" opacity=".18"/>
    {puppy ? <path className="pet-town-tail" d="M151 173 C199 169 199 138 186 126 C191 157 166 153 149 155" fill="#bb7449"/> : kitten ? <path className="pet-town-tail" d="M156 174 C193 169 187 148 177 130 C167 110 184 98 191 108" fill="none" stroke="#ebac6c" strokeWidth="19" strokeLinecap="round"/> : <circle className="pet-town-tail" cx="163" cy="178" r="19" fill="#fff"/>}
    <g className="pet-town-breathe">
      <ellipse cx="107" cy="159" rx="54" ry="46" fill={`url(#${gradientId}-fur)`}/>
      <ellipse cx="107" cy="163" rx="30" ry="30" fill={puppy ? "#fff1dc" : "#fffaf3"}/>
      <ellipse cx="72" cy="195" rx="26" ry="13" fill={fur[1]}/><ellipse cx="143" cy="195" rx="26" ry="13" fill={fur[1]}/>
      <path d="M65 148 Q40 160 53 175 Q65 184 77 170" fill={fur[0]}/><path d="M149 148 Q175 160 161 175 Q149 184 137 170" fill={fur[0]}/>
      {puppy ? <><path d="M59 61 C28 52 26 107 43 121 Q67 129 76 74" fill="#ab6c45"/><path d="M151 61 C182 52 188 100 169 117 Q147 122 139 71" fill="#ab6c45"/></> : kitten ? <><path d="M47 73 L45 27 Q48 18 57 25 L90 60" fill="#edb978"/><path d="M159 73 L166 27 Q163 18 154 25 L122 60" fill="#fff3de"/><path d="M54 59 L53 34 77 59" fill="#f9a6aa"/><path d="M153 59 L158 34 135 59" fill="#f9a6aa"/></> : <><path d="M65 71 C37 41 48 -8 66 4 C80 18 83 48 83 73" fill="#f9f1ff"/><path d="M123 71 C122 45 131 -6 150 6 C166 23 152 58 146 78" fill="#f9f1ff"/><path d="M64 57 C51 31 56 7 63 15 C72 27 71 42 74 63" fill="#f6b8ca"/><path d="M134 62 C134 42 143 14 148 20 C154 35 144 51 141 65" fill="#f6b8ca"/></>}
      <ellipse cx="105" cy="94" rx={puppy ? 62 : 64} ry="52" fill={`url(#${gradientId}-fur)`}/>
      {puppy ? <path d="M109 46 C140 41 165 70 166 91 C142 97 129 72 109 46" fill="#bc7950"/> : kitten ? <><path d="M43 79 Q52 49 88 43 Q91 65 80 80" fill="#eead6e"/><path d="M141 59 Q165 73 168 106 L144 108 Q130 80 141 59" fill="#cf9163"/><path d="M86 49 L91 67 M104 45 L104 65 M119 49 L114 67" stroke="#cb8c55" strokeWidth="6" strokeLinecap="round"/></> : null}
      <ellipse cx="105" cy="113" rx="32" ry="22" fill={puppy ? "#fff1db" : "#fffaf6"}/>
      <ellipse cx="70" cy="111" rx="12" ry="7" fill="#f294a1" opacity=".48"/><ellipse cx="141" cy="111" rx="12" ry="7" fill="#f294a1" opacity=".48"/>
      {sleepy ? <><path d="M68 91 Q79 82 88 91 M123 91 Q133 82 143 91" fill="none" stroke="#4c3b3e" strokeWidth="5" strokeLinecap="round"/></> : <g className="pet-town-eyes"><ellipse cx="79" cy="92" rx="7" ry="10" fill="#3d3438"/><ellipse cx="132" cy="92" rx="7" ry="10" fill="#3d3438"/><circle cx="81" cy="89" r="2.5" fill="white"/><circle cx="134" cy="89" r="2.5" fill="white"/></g>}
      <path d={puppy ? "M95 105 Q105 98 116 105 Q113 114 105 114 Q98 114 95 105" : "M99 106 Q105 101 113 106 L106 113 Z"} fill={puppy ? "#47353a" : "#e88496"}/>
      <path className="pet-town-mouth" d="M106 113 L106 118 M93 120 Q101 126 106 119 Q111 126 120 120" fill="none" stroke="#755158" strokeWidth="3" strokeLinecap="round"/>
      {mood === "happy" ? <path d="M100 121 Q105 119 112 122 L111 131 Q105 137 101 130Z" fill="#ed8893"/> : null}
      {kitten || !puppy ? <path d="M55 109 L36 105 M56 117 L35 118 M153 109 L176 104 M152 117 L177 119" stroke="#b88680" strokeWidth="2.2" strokeLinecap="round"/> : null}
      <ellipse cx="78" cy="59" rx="18" ry="8" fill={`url(#${gradientId}-shine)`}/>
      <path d="M83 142 Q105 155 130 142" fill="none" stroke={puppy ? "#54b8ba" : kitten ? "#ef889e" : "#b093dc"} strokeWidth="10" strokeLinecap="round"/><circle cx="107" cy="149" r="9" fill="#ffd262"/><path d="M107 144 L109 148 113 149 110 152 111 156 107 154 103 156 104 152 101 149 105 148Z" fill="#eb9d39"/>
    </g>
  </svg>;
}

function CareItem({ item }: { item: string }) {
  return <svg viewBox="0 0 100 80" aria-hidden="true" className="pet-town-item-art">
    {item === "bone" ? <><path d="M27 31 C11 7 0 37 17 41 C0 52 17 74 29 53 L69 53 C86 77 100 51 84 43 C100 28 80 9 69 30Z" fill="#fff1ce" stroke="#d1aa70" strokeWidth="3"/><path d="M33 37 H65" stroke="#fff" strokeWidth="5" strokeLinecap="round"/></> : item === "fish" ? <><path d="M75 40 L96 20 91 58Z" fill="#6fbccf"/><ellipse cx="45" cy="40" rx="34" ry="24" fill="#83d2e0"/><path d="M33 18 L47 4 55 20 M32 62 L48 74 54 61" fill="#44a9c2"/><circle cx="25" cy="36" r="5" fill="#244953"/><circle cx="26" cy="34" r="1.6" fill="white"/><path d="M45 23 Q34 40 46 57" fill="none" stroke="#e0f7fa" strokeWidth="4"/></> : item === "carrot" ? <><path d="M45 24 C25 26 35 57 59 75 C69 44 69 19 45 24" fill="#fa9a44"/><path d="M47 27 Q22 13 28 5 Q43 4 48 22 M50 23 Q54 0 63 4 Q69 16 54 29 M50 23 Q72 9 79 15 Q76 28 55 29" fill="#66b969"/><path d="M43 38 L55 41 M49 53 L60 55" stroke="#d97336" strokeWidth="3" strokeLinecap="round"/></> : item === "water" || item === "milk" || item === "juice" ? <><path d="M26 17 L31 69 Q50 78 69 69 L75 17Z" fill={item === "water" ? "#b1e8f4" : "#fff4db"} stroke="#56a6bd" strokeWidth="3"/><path d="M30 36 Q51 30 71 36 L67 65 Q50 73 33 65Z" fill={item === "juice" ? "#ffc765" : item === "milk" ? "#fffdf7" : "#65c9e5"}/><ellipse cx="50" cy="17" rx="24" ry="6" fill="#eefaff" stroke="#56a6bd" strokeWidth="3"/><path d="M39 45 V62" stroke="white" strokeWidth="5" strokeLinecap="round"/>{item === "water" && <path d="M83 17 Q68 39 82 41 Q96 39 83 17" fill="#71cdea"/>}</> : item === "soap" ? <><rect x="20" y="30" width="60" height="36" rx="15" fill="#ffa6c5" stroke="#e675a5" strokeWidth="3"/><ellipse cx="48" cy="42" rx="19" ry="6" fill="#ffd8e6"/><circle cx="25" cy="19" r="9" fill="#d2f4fa" stroke="#93d4e2" strokeWidth="2"/><circle cx="71" cy="15" r="12" fill="#e2f8ff" stroke="#a5dce8" strokeWidth="2"/><circle cx="88" cy="37" r="6" fill="#d6f3fa"/></> : item === "bed" || item === "blanket" ? <><path d="M14 23 L14 68 M86 42 V69" stroke="#bb8e66" strokeWidth="7" strokeLinecap="round"/><path d="M16 35 H71 Q86 35 87 51 V60 H15Z" fill="#f2bc7e"/><rect x="19" y="27" width="27" height="19" rx="8" fill="#fff7df"/><path d="M44 36 H73 Q84 36 84 46 V54 H44Z" fill="#aea1e6"/><path d="M50 42 H74" stroke="#d9cff6" strokeWidth="5" strokeLinecap="round"/></> : item === "ball" ? <><circle cx="50" cy="40" r="32" fill="#f3a76f"/><path d="M22 25 Q46 43 21 57 M71 15 Q42 32 76 60 M28 14 Q59 30 51 72" fill="none" stroke="#fff1ae" strokeWidth="11"/><ellipse cx="38" cy="18" rx="11" ry="5" fill="white" opacity=".45"/></> : item === "apple" ? <><path d="M51 23 C25 9 7 38 24 63 Q38 77 50 66 Q71 79 81 55 C93 26 72 13 51 23" fill="#f47e76"/><path d="M52 25 Q47 5 60 6" fill="none" stroke="#875b41" strokeWidth="5"/><path d="M55 13 Q74 0 80 12 Q72 24 55 13" fill="#66b968"/><path d="M28 31 Q21 43 26 50" fill="none" stroke="#ffd1c5" strokeWidth="5" strokeLinecap="round"/></> : item === "brush" ? <><path d="M46 44 L70 70" stroke="#e7b570" strokeWidth="13" strokeLinecap="round"/><ellipse cx="37" cy="31" rx="24" ry="18" transform="rotate(-40 37 31)" fill="#e4b46e"/><path d="M20 30 L36 44 M28 22 L44 36 M37 16 L51 29" stroke="#936b48" strokeWidth="3"/></> : <><rect x="24" y="19" width="53" height="44" rx="14" fill="#9fdacf"/><path d="M36 39 L45 47 65 29" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round"/></>}
  </svg>;
}

export function PetTownGame({ task, state, disabled, hinted, onAnswer, onInteract }: PlaygroundGameProps<"pets">) {
  const [selection, setSelection] = useState<{ taskId: string; item: string | null; pet: PetKind | null }>({ taskId: "", item: null, pet: null });
  const [celebration, setCelebration] = useState<{ taskId: string; pet: PetKind; action: CareAction; item: string } | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (celebrationTimer.current) clearTimeout(celebrationTimer.current); }, []);
  if (task.mode !== "pets") return null;
  const activePet = selection.taskId === task.id ? selection.pet : null;
  const selected = selection.taskId === task.id ? selection.item : null;
  const targetPet = pets.find(pet => pet.id === task.pet)!;
  const finishedSteps = (pet: PetKind) => Math.min(5, Math.floor(state.index / 3) + (state.index % 3 > pets.findIndex(value => value.id === pet) ? 1 : 0));

  function chooseItem(id: string) {
    if (disabled) return;
    onInteract();
    setSelection({ taskId: task.id, item: id, pet: activePet });
  }
  function giveItem(pet: PetKind, item = selected) {
    if (disabled) return;
    onInteract();
    setSelection({ taskId: task.id, item, pet });
    if (!item) return;
    const answer = pet === task.pet ? item : `pet:${pet}`;
    if (answer === task.target) {
      setCelebration({ taskId: task.id, pet, action: task.action, item });
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
      celebrationTimer.current = setTimeout(() => setCelebration(null), 1500);
    }
    onAnswer(answer, task.id);
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>, item: string) {
    if (disabled || event.button !== 0) return;
    onInteract(); suppressClick.current = false;
    dragRef.current = { id: item, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8) current.moved = true;
    if (current.moved) setDrag({ id: current.id, x: Math.max(52, Math.min(window.innerWidth - 52, event.clientX)), y: event.clientY });
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = null; setDrag(null);
    if (!current.moved) return;
    suppressClick.current = true;
    const destination = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-pet-town-pet]")?.dataset.petTownPet as PetKind | undefined;
    if (destination && pets.some(pet => pet.id === destination)) giveItem(destination, current.id);
    else chooseItem(current.id);
  }

  return <section className="pet-town-game" aria-label="萌宠照顾小镇">
    <div className="pet-town-story"><span className="pet-town-story-icon" aria-hidden="true">♥</span><div><strong>{state.round > 0 ? `第 ${state.round + 1} 轮的小镇生活` : "欢迎来到萌宠小镇"}</strong><span>{hinted ? `${targetPet.name}在等你：${careSteps.find(step => step.action === task.action)?.label}` : "三位小伙伴都有小心愿，听一听吧。"}</span></div><span className="pet-town-day-count">{Math.min(15, state.index + 1)} / 15</span></div>
    <div className={`pet-town-yard ${selected ? "pet-town-holding-item" : ""}`}>
      <div className="pet-town-cloud pet-town-cloud-one"/><div className="pet-town-cloud pet-town-cloud-two"/><div className="pet-town-sun" aria-hidden="true"/>
      <div className="pet-town-mountain pet-town-mountain-one"/><div className="pet-town-mountain pet-town-mountain-two"/>
      <div className="pet-town-town-label"><span aria-hidden="true">✿</span> 小伙伴的幸福庭院 <span aria-hidden="true">✿</span></div>
      <div className="pet-town-pet-row">{pets.map(pet => {
        const cared = finishedSteps(pet.id);
        const action = celebration?.pet === pet.id ? celebration.action : null;
        const mood: PetMood = action === "sleep" ? "sleepy" : action === "wash" ? "washing" : action ? "happy" : cared === 4 ? "sleepy" : cared > 0 ? "happy" : "hungry";
        return <div className={`pet-town-plot pet-town-plot-${pet.id} ${activePet === pet.id ? "pet-town-active" : ""} ${hinted && task.pet === pet.id ? "pet-town-hinted" : ""}`} key={pet.id}>
          <div className="pet-town-house" aria-hidden="true"><div className="pet-town-house-roof"/><span className="pet-town-house-window"/><span className="pet-town-house-door"/><span className="pet-town-house-heart">♥</span></div>
          <div className="pet-town-flower-bed" aria-hidden="true">{Array.from({ length: Math.max(1, cared) }, (_, index) => <span key={index} style={{ animationDelay: `${index * .15}s` }}>✿</span>)}</div>
          <button type="button" className={`pet-town-pet-button ${action ? `pet-town-care-${action}` : ""}`} data-pet-town-pet={pet.id} disabled={disabled} onClick={() => giveItem(pet.id)} aria-pressed={activePet === pet.id} aria-label={`${selected ? "把选好的物品给" : "看看"}${pet.name}${pet.zh}${hinted && task.pet === pet.id ? "，这是目标伙伴" : ""}`}>
            <PetAvatar pet={pet.id} mood={mood}/>
            {action === "wash" && <span className="pet-town-bubbles" aria-hidden="true"><i/><i/><i/><i/><i/></span>}
            {action === "sleep" && <span className="pet-town-sleep" aria-hidden="true">Z<span>z</span><small>z</small></span>}
            {(action === "feed" || action === "drink") && <span className="pet-town-snack" aria-hidden="true"><CareItem item={celebration!.item}/></span>}
            {action === "play" && <span className="pet-town-rolling-ball" aria-hidden="true"><CareItem item="ball"/></span>}
            {action && <span className="pet-town-loved" aria-hidden="true">♥<i>♥</i><b>♥</b></span>}
            {selected && !disabled && <span className="pet-town-drop-label">给我吧！</span>}
          </button>
          <div className="pet-town-pet-name"><strong>{pet.name}</strong><span>{pet.en} · {pet.zh}</span></div>
          <div className="pet-town-care-track" aria-label={`${pet.zh}已完成 ${cared} 项照顾`}>{careSteps.map((step, index) => <span key={step.action} className={index < cared ? "pet-town-step-done" : ""} title={step.label}><CareItem item={step.item}/><span className="sr-only">{step.label}{index < cared ? "已完成" : "待完成"}</span>{index < cared && <b aria-hidden="true">✓</b>}</span>)}</div>
        </div>;
      })}</div>
      <div className="pet-town-path" aria-hidden="true"/><div className="pet-town-yard-flowers" aria-hidden="true">✿ <span>✿</span> ✿</div>
    </div>
    <div className="pet-town-instruction" role="status">{disabled ? "小伙伴好开心！马上听下一句英语。" : selected ? `已选好 ${task.options.find(option => option.id === selected)?.zh ?? "物品"}，现在点一下要照顾的小伙伴。` : "听英语 → 选用品 → 点小伙伴，也可以把用品拖过去。"}</div>
    <div className="pet-town-items" aria-label="照顾用品">{task.options.map(option => <button key={option.id} type="button" className={`pet-town-item ${selected === option.id ? "pet-town-item-selected" : ""} ${hinted && option.id === task.target ? "pet-town-item-hinted" : ""}`} aria-pressed={selected === option.id} aria-label={`${option.en}，${option.zh}${hinted && option.id === task.target ? "，正确用品" : ""}`} disabled={disabled} onPointerDown={event => startDrag(event, option.id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { dragRef.current = null; setDrag(null); }} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } chooseItem(option.id); }}><CareItem item={option.id}/><strong>{option.en}</strong><span>{option.zh}</span>{selected === option.id && <i aria-hidden="true">✓</i>}</button>)}</div>
    <p className="pet-town-learning-note">每听懂一句，小伙伴就多一份照顾，院子也会开出新的花。</p>
    {drag && <div className="pet-town-drag-item" style={{ left: drag.x, top: drag.y }} aria-hidden="true"><CareItem item={drag.id}/></div>}
  </section>;
}
