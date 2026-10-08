"use client";
/* eslint-disable @next/next/no-img-element -- Local artwork is shared with the offline entry. */

import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, LockKeyhole, Play, Sparkles, Star } from "lucide-react";
import { WordArt } from "@/components/word-art";
import { learningUnits } from "@/lib/learning-content";
import { destinationLessons, destinations, type DestinationId } from "@/lib/destinations";
import { getLesson, getTopic } from "@/lib/course";
import { isLessonUnlocked, type Progress } from "@/lib/progress";
import { gameMapRoute, getCurrentMapDestination, mainMapRoute, mapIslands, type MapIslandId } from "@/lib/world-map";
import { gameImageURL } from "@/lib/game-image-assets";
import { loadGameImage } from "@/lib/game-image-loader";
import { loadOceanSceneryImages } from "@/components/ocean-scenery-sprites";

function IslandArt({ sprite }: { sprite: number }) {
  const x = sprite % 4 * 384, y = [35,350,670][Math.floor(sprite / 4)];
  return <svg className="destination-island-art" viewBox={`${x} ${y} 384 325`} aria-hidden="true"><image href={gameImageURL("/images/destination-islands-v1.png")} x="0" y="0" width="1536" height="1024" /></svg>;
}

function MapRoutes({ route, kind }: { route: MapIslandId[]; kind: "learning" | "game" }) {
  return <g className={`ocean-route route-${kind}`}>{route.slice(1).map((id,index)=>{
    const from=mapIslands.find(island=>island.id===route[index])!,to=mapIslands.find(island=>island.id===id)!;
    const middle=(from.x+to.x)*5;
    const d=`M ${from.x*10} ${(from.y-4)*10} C ${middle} ${(from.y-4)*10}, ${middle} ${(to.y-4)*10}, ${to.x*10} ${(to.y-4)*10}`;
    return <g key={`${from.id}-${id}`}><path className="ocean-route-shadow" d={d}/><path className="ocean-route-line" d={d}/></g>;
  })}</g>;
}

export function WorldMap({ progress, ready, onOpen, onLearn }: { progress: Progress; ready: boolean; onOpen: (id: DestinationId) => void; onLearn: (unitId: string) => void }) {
  const scroll = useRef<HTMLDivElement>(null);
  const focus = getCurrentMapDestination(progress);
  const currentIsland=mapIslands.find(island=>island.id===focus.id)!;
  useEffect(() => {
    let mounted = true;
    // Finish the visible map first; the shared plant preparation warms both games.
    void Promise.all(["archipelago-ocean-v1", "destination-islands-v1", "fox"].map(name => loadGameImage(`/images/${name}.png`, "high")))
      .then(() => mounted ? loadOceanSceneryImages() : undefined).catch(() => { /* Game entry offers an explicit retry. */ });
    return () => { mounted = false; };
  }, []);
  useEffect(()=>{
    const element=scroll.current;
    if(!ready||!element)return;
    const centerCompanion=()=>{
      if(element.scrollWidth<=element.clientWidth)return;
      element.scrollTo({left:Math.max(0,Math.min(element.scrollWidth-element.clientWidth,element.scrollWidth*currentIsland.x/100-element.clientWidth/2)),behavior:"auto"});
    };
    centerCompanion();
    if(typeof ResizeObserver==="undefined")return;
    const observer=new ResizeObserver(centerCompanion);
    observer.observe(element);
    return()=>observer.disconnect();
  },[focus.id,currentIsland.x,ready]);
  return <section className="world-map-panel">
    <div className="world-map-heading"><div className="world-map-title"><span className="eyebrow">一岛一发现，跟着乐乐走小路</span><h2><Compass size={24}/>乐乐的探索群岛</h2><p className="map-overview"><Sparkles size={18}/>12 座主题小岛 · 42 次游戏冒险 · 20 站听说读写</p></div>
        <div className="map-location-note"><span className="map-location-dot" aria-hidden="true"/><div><small>{focus.state==="active"?"正在冒险":focus.state==="recent"?"最近学到":"从这里出发"}</small><strong>乐乐在{currentIsland.title}</strong></div></div>
        <div className="map-scroll-buttons"><button aria-label="地图向左滑动" onClick={() => scroll.current?.scrollBy({ left: -500, behavior: "smooth" })}><ArrowLeft/></button><span>左右滑动去探索</span><button aria-label="地图向右滑动" onClick={() => scroll.current?.scrollBy({ left: 500, behavior: "smooth" })}><ArrowRight/></button></div></div>
    <div className="map-route-legend"><span><i className="legend-learning" aria-hidden="true"/>1–8 建议学习路径</span><span><i className="legend-game" aria-hidden="true"/><Star size={16}/>自由趣味游览线</span><small>点一座小岛，就能走进它的闯关路线</small></div>
    <div className="world-map-scroll" ref={scroll} tabIndex={0} role="region" aria-label="完整探索岛地图">
      <div className="world-island-art archipelago-map" style={{backgroundImage:`url('${gameImageURL("/images/archipelago-ocean-v1.png")}')`}}>
        <svg className="ocean-routes" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><MapRoutes route={mainMapRoute} kind="learning"/><MapRoutes route={gameMapRoute} kind="game"/></svg>
        {mapIslands.map(island => {
          const unit=island.kind==="learning"?learningUnits.find(unit=>unit.id===island.id):undefined;
          const entries=unit?unit.activities:destinationLessons(island.id as DestinationId);
          const available=Boolean(unit)||entries.some(item=>isLessonUnlocked(progress,item.id));
          const completed=entries.filter(item=>unit?progress.learning.completed[item.id]:progress.completed[item.id]).length;
          const here=focus.id===island.id,done=completed===entries.length;
          return <button className={`archipelago-destination ${island.kind} ${available?"":"locked"} ${here?"is-current":""} ${done?"is-complete":""}`} key={island.id} data-map-island={island.id} disabled={!ready} style={{left:`${island.x}%`,top:`${island.y}%`}} onClick={()=>unit?onLearn(island.id):onOpen(island.id as DestinationId)} aria-current={here?"location":undefined} aria-label={`${island.step?`学习小路第${island.step}站，`:"趣味支线，"}${island.title}，已完成${completed}/${entries.length}${unit?"站":"关"}，${here?"乐乐在这里，":""}进入闯关地图`}>
            <span className="island-picture"><IslandArt sprite={island.sprite}/><span className="island-step" aria-hidden="true">{island.step??<Star size={17} fill="currentColor"/>}</span>{here&&<img className="map-roaming-fox" src={gameImageURL("/images/fox.png")} alt="乐乐站在当前学习的小岛上"/>}</span>
            <span className="island-nameplate"><strong>{island.title}</strong><small>{completed}/{entries.length} {unit?"站 · 听说读写":"关 · 游戏冒险"}</small><span className="island-state">{here?<><span aria-hidden="true">●</span> 乐乐在这里</>:done?<><Check size={14}/>已经走过啦</>:available?<><Play size={12} fill="currentColor"/>点我出发</>:<><LockKeyhole size={13}/>看看小路</>}</span></span>
          </button>;
        })}
      </div>
    </div>
    <div className="map-footer"><span>路线是建议顺序，趣味挑战按原有关卡进度开放</span><span>学习记录会带着乐乐移动，刷新后也记得</span></div>
  </section>;
}

export function LessonTrail({ destinationId, progress, ready, onBack, onBegin, onLocked }: { destinationId: DestinationId; progress: Progress; ready: boolean; onBack: () => void; onBegin: (id: string) => void; onLocked: (message: string) => void }) {
  const scroll = useRef<HTMLDivElement>(null);
  const destination = destinations.find(item => item.id === destinationId)!;
  const entries = destinationLessons(destinationId);
  const columns = entries.length > 3 ? 7 : 3;
  const points = entries.map((_, index) => ({ x: entries.length > 3 ? 8 + (index < 7 ? index : 13 - index) * 14 : 18 + index * 32, y: entries.length > 3 ? index < 7 ? 31 : 70 : index % 2 ? 64 : 35 }));
  const completed = entries.filter(item => progress.completed[item.id]).length;
  return <section className={`trail-page trail-${destinationId}`}>
    <div className="trail-heading"><button className="secondary-button" onClick={onBack}><ArrowLeft size={22}/>回到大地图</button><div><span className="eyebrow">跟着星星，一关一关去发现</span><h1>{destination.title}</h1><p>{destination.subtitle}</p></div><span className="trail-completed"><Star fill="currentColor" size={22}/>{completed}/{entries.length} 关</span></div>
    <div className="trail-guide"><span><Sparkles size={20}/>{destination.topicId ? "上面认识新朋友，下面解锁 8 种宝藏游戏" : "在不同主题里，玩同一种新挑战"}</span><button className="text-button" onClick={() => scroll.current?.scrollBy({ left: 500, behavior: "smooth" })}>左右滑动看路线<ArrowRight size={20}/></button></div>
    <div className="trail-scroll" ref={scroll} role="region" tabIndex={0} aria-label={`${destination.title}闯关路线，可左右滑动`}>
      <div className={`trail-landscape ${columns === 3 ? "short-trail" : ""}`}>
        <svg className="trail-path" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><polyline points={points.map(point => `${point.x * 10},${point.y * 7}`).join(" ")}/></svg>
        {entries.map((item, index) => {
          const unlocked = isLessonUnlocked(progress, item.id), done = Boolean(progress.completed[item.id]), active = progress.activeRun?.lessonId === item.id;
          const message = item.isReview ? "完成综合任务后的第二天，复习小路就会开放。" : item.prerequisiteLessonId ? `先完成${getTopic(item.topicId).title}第 ${getLesson(item.prerequisiteLessonId).order} 关，这个宝藏就会开放。` : "先完成前面的关卡，就能走到这里。";
          return <button className={`trail-node ${done ? "completed" : ""} ${unlocked ? "available" : "locked"} ${item.isBonus ? "treasure-node" : ""} ${active ? "current-node" : ""}`} key={item.id} disabled={!ready} style={{ left: `${points[index].x}%`, top: `${points[index].y}%` }} onClick={() => unlocked ? onBegin(item.id) : onLocked(message)} aria-label={`${destination.topicId ? `第${item.order}关` : getTopic(item.topicId).title}，${item.title}，${active ? "继续冒险" : done ? "已经完成，可重玩" : unlocked ? "点击进入" : message}`}>
            <span className="trail-node-orb">{item.isBonus ? <WordArt id={getTopic(item.topicId).wordIds[(item.order - 7) % 8]}/> : <strong>{item.order}</strong>}<span className="trail-node-badge">{done ? <Check size={20}/> : unlocked ? <Play size={18} fill="currentColor"/> : <LockKeyhole size={18}/>}</span></span>
            <span className="trail-node-label"><small>{active ? "正在冒险" : item.isBonus ? "宝藏游戏" : item.isReview ? "隔日复习" : "认识新朋友"}</small><strong>{destination.topicId ? item.title : getTopic(item.topicId).title}</strong><span>{done ? "★ 已收集星星" : unlocked ? "点我就出发" : "小路还在等你"}</span></span>
          </button>;
        })}
      </div>
    </div>
  </section>;
}
