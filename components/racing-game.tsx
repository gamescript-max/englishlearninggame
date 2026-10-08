"use client";

import { useCallback, useEffect, useId, useRef, useState, type PointerEvent, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, Flag, Package } from "lucide-react";
import type { PlaygroundGameProps } from "@/components/playground-types";
import { createRacingCar, pauseRacingCar, racingDestinationAt, racingDestinations, racingSize, routeRacingCar, steerRacingCar, stepRacingCar, type RacingCar, type RacingDirection, type RacingPoint } from "@/lib/racing-engine";
import "./racing-game.css";

const directionKeys: Record<string, RacingDirection> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
const directions = [{ id: "up", label: "向上开", Icon: ArrowUp }, { id: "left", label: "向左开", Icon: ArrowLeft }, { id: "down", label: "向下开", Icon: ArrowDown }, { id: "right", label: "向右开", Icon: ArrowRight }] as const;
const cargoIcons: Record<string, string> = { apple: "🍎", milk: "🥛", ball: "⚽", book: "📚", flower: "🌷", water: "💧" };
const cargoNames: Record<string, string> = { apple: "苹果", milk: "牛奶", ball: "足球", book: "书", flower: "鲜花", water: "水" };

export function CarArt({ color = "#ffb339" }: { color?: string }) {
  const id = useId().replaceAll(":", "");
  return <svg viewBox="-40 -28 80 56" x="-40" y="-28" width="80" height="56" aria-hidden="true"><defs><linearGradient id={`racing-car-${id}`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffdf7e"/><stop offset="1" stopColor={color}/></linearGradient></defs><ellipse cx="-1" cy="5" rx="37" ry="21" fill="#213858" opacity=".2"/><rect x="-23" y="-25" width="13" height="9" rx="4" fill="#243a53"/><rect x="15" y="-25" width="13" height="9" rx="4" fill="#243a53"/><rect x="-23" y="16" width="13" height="9" rx="4" fill="#243a53"/><rect x="15" y="16" width="13" height="9" rx="4" fill="#243a53"/><rect x="-35" y="-21" width="72" height="42" rx="15" fill={`url(#racing-car-${id})`} stroke="#cb751c" strokeWidth="2"/><rect x="-10" y="-16" width="27" height="32" rx="8" fill="#fff8dd"/><path d="M10-13 L21-10 L21 10 L10 13Z" fill="#66c8eb"/><path d="M-8-12 L-14-9 L-14 9 L-8 12Z" fill="#80d9ee"/><path d="M30-15 V-9 M30 9 V15" stroke="#fffbe4" strokeWidth="5" strokeLinecap="round"/><rect x="-35" y="-12" width="4" height="8" rx="2" fill="#ef5e48"/><rect x="-35" y="4" width="4" height="8" rx="2" fill="#ef5e48"/><path d="M-26-14H-20" stroke="#fff0b4" strokeWidth="4" strokeLinecap="round"/></svg>;
}

function TownArt({ id }: { id: string }) {
  return <>
    <defs>
      <linearGradient id={`${id}-grass`} x2="0" y2="1"><stop stopColor="#bbe897"/><stop offset="1" stopColor="#7cc797"/></linearGradient>
      <linearGradient id={`${id}-water`} x2="1" y2="1"><stop stopColor="#79d8e9"/><stop offset="1" stopColor="#37abc8"/></linearGradient>
      <linearGradient id={`${id}-roof`} x2="0" y2="1"><stop stopColor="#ff9271"/><stop offset="1" stopColor="#df684e"/></linearGradient>
      <pattern id={`${id}-dots`} width="70" height="60" patternUnits="userSpaceOnUse"><circle cx="21" cy="30" r="2" fill="#ffffff" opacity=".22"/><path d="M40 43l3-6 3 6" fill="none" stroke="#5eaf84" strokeWidth="2" opacity=".32"/></pattern>
    </defs>
    <rect width="1000" height="660" fill={`url(#${id}-grass)`}/><rect width="1000" height="660" fill={`url(#${id}-dots)`}/>
    <path d="M660 415Q777 377 839 436Q911 408 1000 460V660H700Q732 586 684 541Q623 469 660 415" fill="#f8e5aa"/>
    <path d="M709 442Q815 406 875 463Q945 439 1000 494V660H741Q774 581 728 536Q681 484 709 442" fill={`url(#${id}-water)`}/>
    <path d="M729 459Q813 434 873 483M764 592Q818 579 864 601M884 551Q940 535 990 551" stroke="#defbfa" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".5"/>
    <ellipse cx="328" cy="244" rx="80" ry="51" fill="#6cbc8c" opacity=".6"/><ellipse cx="325" cy="236" rx="70" ry="45" fill={`url(#${id}-water)`}/>
    <path d="M285 229Q307 218 330 229M332 248Q352 237 377 246" stroke="#c7f6ee" strokeWidth="5" strokeLinecap="round" fill="none"/>
    <g fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M160 150H840V530H160ZM160 340H840M500 150V530" stroke="#59a782" strokeWidth="68"/><path d="M160 150H840V530H160ZM160 340H840M500 150V530" stroke="#a8b1aa" strokeWidth="56"/><path d="M160 150H840V530H160ZM160 340H840M500 150V530" stroke="#f9efc9" strokeWidth="3" strokeDasharray="18 19"/></g>
    <g stroke="#fff9e3" strokeWidth="5" opacity=".9">{[455,465,475,485,495,505,515,525,535,545].map(x=><path key={x} d={`M${x} 314V328`}/>)}{[310,320,330,340,350,360,370].map(y=><path key={y} d={`M812 ${y}H827`}/>)}</g>
    <g transform="translate(95 58)"><ellipse cx="12" cy="39" rx="62" ry="20" fill="#537e67" opacity=".2"/><rect x="-36" y="-4" width="92" height="47" rx="7" fill="#fff1bf"/><path d="M-46-5L9-41 67-5Z" fill={`url(#${id}-roof)`}/><rect x="1" y="13" width="28" height="31" rx="3" fill="#cb8a42"/><path d="M4 16L26 39M26 16L4 39" stroke="#ffe8a6" strokeWidth="3"/><rect x="-22" y="7" width="16" height="14" fill="#78cce5"/><path d="M-36 40H54" stroke="#d49a4c" strokeWidth="4"/></g>
    <g transform="translate(480 59)"><ellipse cy="28" rx="62" ry="17" fill="#547e67" opacity=".2"/><rect x="-54" y="-13" width="108" height="43" rx="6" fill="#fff4ce"/><path d="M-62-13L0-42 62-13Z" fill="#809ccf"/><rect x="-12" y="6" width="24" height="26" rx="4" fill="#6284b0"/>{[-40,-23,24,41].map(x=><rect key={x} x={x-6} y="-2" width="12" height="12" rx="2" fill="#80cee2"/>)}<circle cy="-24" r="8" fill="#fff9ec"/><path d="M0-29V-24H4" stroke="#6481a3" strokeWidth="2"/></g>
    <g transform="translate(852 62)"><ellipse cy="22" rx="58" ry="21" fill="#5baa70"/><path d="M-34 24V-20M31 23V-20" stroke="#ae8653" strokeWidth="6"/><path d="M-43-20H40" stroke="#fbe18c" strokeWidth="6"/><path d="M-18-17V10M16-17V10" stroke="#fff0b5" strokeWidth="2"/><rect x="-20" y="9" width="39" height="7" rx="3" fill="#d38b53"/><path d="M-63 12Q-53-15-45 12M49 12Q58-15 67 12" fill="#79c664"/></g>
    <g transform="translate(921 298)"><ellipse cy="34" rx="56" ry="18" fill="#537e67" opacity=".2"/><rect x="-43" y="-14" width="85" height="48" rx="6" fill="#fff0d7"/><path d="M-49-19H48V-8H-49Z" fill="#f48185"/>{[-43,-25,-7,11,29].map(x=><path key={x} d={`M${x}-18h9v16h-9z`} fill="#fff7e7"/>)}<rect x="6" y="2" width="21" height="32" rx="3" fill="#83d0db"/><rect x="-30" y="2" width="25" height="22" rx="3" fill="#83d0db"/></g>
    <g transform="translate(139 563)"><ellipse cy="32" rx="55" ry="17" fill="#537e67" opacity=".2"/><rect x="-38" y="-6" width="76" height="40" rx="5" fill="#fff0d4"/><path d="M-48-6L0-44 47-6Z" fill="#b998d9"/><rect x="-10" y="11" width="20" height="23" rx="4" fill="#b082a5"/><rect x="-28" y="3" width="13" height="14" rx="2" fill="#78d0e1"/><rect x="17" y="3" width="13" height="14" rx="2" fill="#78d0e1"/></g>
    <g transform="translate(855 580)"><path d="M0 38V-26" stroke="#d79965" strokeWidth="7"/><path d="M0-26Q-36-60-57-17Q-20-26 0-26M0-26Q32-65 56-21Q22-30 0-26M0-26Q-8-68-25-58Q-25-34 0-26" fill="#53b576"/><path d="M-25 28H28" stroke="#ffeece" strokeWidth="5" strokeLinecap="round"/><path d="M-10 23L-4 3 12 23Z" fill="#fb9782"/></g>
    {[[68,220],[77,407],[283,94],[655,96],[684,228],[292,457],[410,604],[609,594],[921,174],[616,426]].map(([x,y],index)=><g key={index} transform={`translate(${x} ${y})`}><ellipse cy="17" rx="19" ry="10" fill="#3e925f" opacity=".27"/><path d="M0 15V-8" stroke="#ad8656" strokeWidth="6"/><circle cy="-14" r="20" fill={index%2 ? "#61b677" : "#73c77b"}/><circle cx="-5" cy="-20" r="11" fill="#94d68f" opacity=".6"/></g>)}
    {[[222,595],[694,70],[334,406],[941,401],[333,561]].map(([x,y],index)=><g key={index} transform={`translate(${x} ${y})`}><path d="M0 11V-3" stroke="#56a26c" strokeWidth="3"/><circle cy="-4" r="6" fill={index%2 ? "#ffd776" : "#ffabb0"}/><circle cy="-4" r="2" fill="#ffefd4"/></g>)}
  </>;
}

export function RacingGame(props: PlaygroundGameProps<"racing">) {
  const { task, state, disabled, hinted, onAnswer, onInteract } = props;
  const cursor = `${state.round}:${state.index}:${task.id}`;
  const [car, setCar] = useState(createRacingCar), [running, setRunning] = useState(false), [arrival, setArrival] = useState<{ destination: string; cursor: string } | null>(null);
  const carRef = useRef<RacingCar>(car), board = useRef<HTMLDivElement>(null), runningRef = useRef(false);
  const gates = useRef({ disabled }), callbacks = useRef({ onAnswer, onInteract }), taskRef = useRef(task);
  const currentCursor = useRef(cursor), travelCursor = useRef(cursor), submission = useRef<string | null>(null), previousTask = useRef(cursor), previousDock = useRef<string | null>(null);
  const pressedKeys = useRef<string[]>([]), pointer = useRef<{ id: number; start: RacingPoint; latest: RacingPoint } | null>(null), lastFrame = useRef<number | null>(null);
  const mapId = `racing-${useId().replaceAll(":", "")}`;
  useEffect(() => { gates.current = { disabled }; callbacks.current = { onAnswer, onInteract }; taskRef.current = task; currentCursor.current = cursor; }, [disabled, onAnswer, onInteract, task, cursor]);
  useEffect(() => {
    if (previousTask.current !== cursor) { previousTask.current = cursor; submission.current = null; previousDock.current = null; }
    if (!disabled) submission.current = null;
  }, [cursor, disabled]);

  function commit(next: RacingCar) { carRef.current = next; setCar(next); }
  function pause() { runningRef.current = false; setRunning(false); pressedKeys.current = []; pointer.current = null; lastFrame.current = null; commit(pauseRacingCar(carRef.current)); }
  function interact() {
    if (document.hidden || gates.current.disabled) return false;
    callbacks.current.onInteract(); runningRef.current = true; setRunning(true); return true;
  }
  const deliver = useCallback((destination: string) => {
    if (gates.current.disabled || document.hidden || travelCursor.current !== currentCursor.current || submission.current === currentCursor.current) return;
    previousDock.current = destination; submission.current = currentCursor.current;
    carRef.current = pauseRacingCar(carRef.current); setCar(carRef.current); setArrival({ destination, cursor: currentCursor.current });
    callbacks.current.onAnswer(destination, taskRef.current.id);
  }, []);
  function goTo(point: RacingPoint) {
    if (!interact()) return;
    setArrival(null); submission.current = null; travelCursor.current = currentCursor.current;
    const next = routeRacingCar(carRef.current, point); commit(next);
    // A fresh order may use the same stop; tapping its sign is an explicit new delivery.
    if (!next.moving) { const destination = racingDestinationAt(next); if (destination) deliver(destination); }
  }
  function steer(direction: RacingDirection) { if (!interact()) return false; setArrival(null); submission.current = null; travelCursor.current = currentCursor.current; commit(steerRacingCar(carRef.current, direction)); return true; }
  function stopSteering() { if (carRef.current.direction) commit(steerRacingCar(carRef.current, null)); }

  useEffect(() => {
    if (!running || disabled || !car.moving) return;
    let frame = 0;
    const tick = (now: number) => {
      if (document.hidden || !runningRef.current || gates.current.disabled) { lastFrame.current = null; return; }
      // Restoring progress or moving to another task must never apply a route from the old order.
      if (travelCursor.current !== currentCursor.current) { commit(pauseRacingCar(carRef.current)); lastFrame.current = null; return; }
      const dt = lastFrame.current === null ? 0 : Math.min((now - lastFrame.current) / 1000, .05); lastFrame.current = now;
      const next = stepRacingCar(carRef.current, dt);
      if (next !== carRef.current) { carRef.current = next; setCar(next); }
      const destination = racingDestinationAt(next);
      if (!destination) previousDock.current = null;
      else if (destination !== previousDock.current && next.distance > 2 && !submission.current && (next.direction !== null || !next.route.length)) {
        deliver(destination);
      }
      frame = requestAnimationFrame(tick);
    };
    lastFrame.current = null; frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); lastFrame.current = null; };
  }, [running, disabled, car.moving, deliver]);

  useEffect(() => {
    const visibility = () => { if (document.hidden) pause(); };
    const cancel = () => pause();
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", cancel); window.addEventListener("learning-pause", cancel); window.addEventListener("native-background", cancel);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", cancel); window.removeEventListener("learning-pause", cancel); window.removeEventListener("native-background", cancel); };
    // Background events only read current mutable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || gates.current.disabled || document.hidden) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button,input,textarea,select,[contenteditable=true],[role=dialog]")) return;
      const direction = directionKeys[event.key] ?? directionKeys[event.key.toLowerCase()];
      if (!direction) return;
      event.preventDefault(); if (!pressedKeys.current.includes(event.key)) pressedKeys.current.push(event.key); steer(direction);
    };
    const keyUp = (event: KeyboardEvent) => {
      if (!pressedKeys.current.includes(event.key)) return;
      pressedKeys.current = pressedKeys.current.filter(key => key !== event.key);
      const target = event.target as HTMLElement | null;
      if (target?.closest("button,input,textarea,select,[contenteditable=true],[role=dialog]")) { pressedKeys.current = []; stopSteering(); return; }
      const latest = pressedKeys.current.at(-1);
      if (latest) steer(directionKeys[latest] ?? directionKeys[latest.toLowerCase()]); else stopSteering();
    };
    window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp); window.addEventListener("blur", pause);
    return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", pause); };
    // Inputs read current refs; no game listeners remain after leaving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pointAt(event: PointerEvent<HTMLDivElement>): RacingPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) / bounds.width * racingSize.width, y: (event.clientY - bounds.top) / bounds.height * racingSize.height };
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button") || disabled) return;
    const point = pointAt(event); pointer.current = { id: event.pointerId, start: point, latest: point };
    event.currentTarget.setPointerCapture(event.pointerId); goTo(point);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointer.current || pointer.current.id !== event.pointerId) return;
    const point = pointAt(event), previous = pointer.current.latest;
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 35) return;
    pointer.current.latest = point; goTo(point);
  }
  function cancelPointer() { pointer.current = null; commit(pauseRacingCar(carRef.current)); }
  if (task.mode !== "racing") return null;
  const target = racingDestinations.find(destination => destination.id === task.destination)!;
  const currentArrival = arrival?.cursor === cursor ? arrival.destination : null;
  const isRight = currentArrival === task.destination;
  return <div className={`racing-game ${disabled || !running ? "racing-paused" : ""}`}>
    <div className="racing-cargo"><span className="racing-cargo-icon" aria-hidden="true">{cargoIcons[task.cargo]}</span><div><small><Package size={15}/>这一车装着</small><strong>{cargoNames[task.cargo]}</strong></div><span className="racing-cargo-tip">点地图开车 · 到站自动送达</span></div>
    <div className="racing-board" ref={board} aria-label="欢乐送货小镇，可点击建筑开车，也可拖动地图选择行驶位置" role="group" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={()=>{pointer.current=null;}} onPointerCancel={cancelPointer}>
      <svg className="racing-town" viewBox="0 0 1000 660" preserveAspectRatio="none" aria-hidden="true"><TownArt id={mapId}/>
        {car.route.length>0&&<path d={`M${car.x},${car.y} ${car.route.map(point=>`L${point.x},${point.y}`).join(" ")}`} stroke="#fef7b0" strokeWidth="9" fill="none" strokeDasharray="8 16" strokeLinecap="round" opacity=".9"/>}
        <g className="racing-car-motion" transform={`translate(${car.x} ${car.y}) rotate(${car.heading*180/Math.PI})`}><ellipse cx="0" cy="7" rx="40" ry="26" fill="#28584c" opacity=".18"/>{car.moving&&<g className="racing-exhaust"><circle cx="-48" cy="0" r="5" fill="white" opacity=".7"/><circle cx="-61" cy="1" r="4" fill="white" opacity=".4"/></g>}<g transform="scale(1.12)"><CarArt/></g></g>
        <g transform={`translate(${car.x} ${car.y-38})`}><circle r="20" fill="#fffdf2" stroke="#f5b73b" strokeWidth="3"/><text textAnchor="middle" dominantBaseline="central" fontSize="24">{cargoIcons[task.cargo]}</text></g>
      </svg>
      {racingDestinations.map(destination=><button key={destination.id} className={`racing-destination racing-destination-${destination.id} ${hinted&&destination.id===task.destination?"racing-hinted":""} ${currentArrival===destination.id ? "racing-arrived" : ""}`} style={{left:`clamp(40px, ${destination.x/10}%, calc(100% - 40px))`,top:`clamp(32px, ${(destination.y+40)/6.6}%, calc(100% - 32px))`,"--racing-destination-color":destination.color} as CSSProperties} disabled={disabled} onClick={()=>goTo(destination.dock)} aria-label={`开车到${destination.zh}，${destination.en}`}><span lang="en">{destination.en}</span><small>{destination.zh}</small><Flag size={15}/></button>)}
      {!running&&!disabled&&<span className="racing-ready-note">点一条路，马上出发！</span>}
      {hinted&&<div className="racing-hint" role="status">跟着发光路标去 <strong lang="en">{target.en}</strong></div>}
    </div>
    <div className="racing-bottom"><div className="racing-directions" role="group" aria-label="按住方向按钮开车">{directions.map(({id,label,Icon})=><button key={id} className={`racing-direction racing-direction-${id}`} disabled={disabled} aria-label={label} onPointerDown={event=>{event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);steer(id);}} onPointerUp={stopSteering} onPointerCancel={stopSteering} onLostPointerCapture={stopSteering} onClick={event=>{if(event.detail===0&&steer(id)){commit({...carRef.current,direction:null,route:[{x:Math.max(58,Math.min(942,carRef.current.x+(id==="left"?-100:id==="right"?100:0))),y:Math.max(54,Math.min(606,carRef.current.y+(id==="up"?-100:id==="down"?100:0)))}],moving:true});}}}><Icon size={27}/></button>)}</div><p className="racing-feedback" role="status">{currentArrival ? isRight ? "送到啦！下一张订单马上来。" : "这里还在等别的货物，再听一遍，开去另一站吧。" : "听订单，自己找地方。点建筑能沿着道路自动开过去，也能按住方向键开车。"}</p><button className="racing-pause-button" disabled={disabled} onClick={()=>{if(running)pause();else interact();}} aria-label={running ? "停车休息" : "继续开车"}>{running?<Pause size={23}/>:<Play size={23}/>}<span>{running?"停车":"出发"}</span></button></div>
  </div>;
}
