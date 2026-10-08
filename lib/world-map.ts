import { lessons } from "./course";
import { destinations, type DestinationId } from "./destinations";
import { diagnosticActivity, getLearningActivity, getLearningWord, learningUnits, phonicsActivities, storyActivities } from "./learning-content";
import type { Progress } from "./progress";

export type MapIslandId = DestinationId | "family" | "school" | "body" | "daily" | "weather";
export interface MapIsland { id: MapIslandId; title: string; kind: "topic" | "learning" | "game"; x: number; y: number; sprite: number; step?: number }

const placements: Record<MapIslandId, { x: number; y: number; sprite: number; step?: number }> = {
  animals: { x: 12, y: 23, sprite: 0, step: 1 },
  food: { x: 37, y: 13, sprite: 1, step: 2 },
  toys: { x: 63, y: 25, sprite: 2, step: 3 },
  family: { x: 87, y: 16, sprite: 7, step: 4 },
  school: { x: 85, y: 49, sprite: 8, step: 5 },
  body: { x: 63, y: 58, sprite: 9, step: 6 },
  daily: { x: 37, y: 45, sprite: 10, step: 7 },
  weather: { x: 12, y: 58, sprite: 11, step: 8 },
  bubbles: { x: 17, y: 84, sprite: 3 },
  delivery: { x: 43, y: 82, sprite: 4 },
  connections: { x: 66, y: 84, sprite: 5 },
  stars: { x: 88, y: 80, sprite: 6 },
};
export const mapIslands: MapIsland[] = [
  ...destinations.map(destination => ({ id: destination.id, title: destination.title, kind: destination.topicId ? "topic" as const : "game" as const, ...placements[destination.id] })),
  ...learningUnits.map(unit => ({ id: unit.id as MapIslandId, title: unit.title, kind: "learning" as const, ...placements[unit.id as MapIslandId] })),
];
export const mainMapRoute: MapIslandId[] = ["animals", "food", "toys", "family", "school", "body", "daily", "weather"];
export const gameMapRoute: MapIslandId[] = ["weather", "bubbles", "delivery", "connections", "stars"];

const islandIds = new Set(mapIslands.map(island => island.id));
const lessonMap = new Map(lessons.map(lesson => [lesson.id, lesson]));
const taskLocations = new Map<string, MapIslandId>();
for (const unit of learningUnits) for (const activity of unit.activities) for (const task of activity.tasks) taskLocations.set(task.id, unit.id as MapIslandId);
const specialLocations: Record<string, MapIslandId> = {
  "story-cat-blue-ball": "animals", "story-family-picnic": "family", "story-rainy-school-day": "school", "a1-readiness": "school",
};
for (const activity of [...storyActivities, ...phonicsActivities, diagnosticActivity]) {
  const location = specialLocations[activity.id] ?? "school";
  for (const task of activity.tasks) taskLocations.set(task.id, location);
}

function taskIsland(taskId: string | undefined): MapIslandId | undefined {
  if (!taskId) return undefined;
  const mapped = taskLocations.get(taskId);
  if (mapped) return mapped;
  const word = taskId.startsWith("recall-") ? getLearningWord(taskId.slice(7)) : undefined;
  return word && islandIds.has(word.unitId as MapIslandId) ? word.unitId as MapIslandId : undefined;
}
function activityIsland(activityId: string, taskId?: string): MapIslandId | undefined {
  const activity = getLearningActivity(activityId);
  if (activity?.unitId && islandIds.has(activity.unitId as MapIslandId)) return activity.unitId as MapIslandId;
  return specialLocations[activityId] ?? (activity?.phonics ? "school" : taskIsland(taskId));
}
function lessonIsland(lessonId: string): MapIslandId | undefined {
  const lesson = lessonMap.get(lessonId);
  if (!lesson) return undefined;
  return ({ 11: "bubbles", 12: "delivery", 13: "connections", 14: "stars" } as Record<number, MapIslandId>)[lesson.order] ?? lesson.topicId;
}

export interface MapFocus { id: MapIslandId; at: number; state: "active" | "recent" | "start" }
/** Derive location from saved events, so older paused runs cannot override newer learning. */
export function getCurrentMapDestination(progress: Progress): MapFocus {
  type Candidate = MapFocus & { source: number };
  let best: Candidate | undefined;
  function offer(id: MapIslandId | undefined, at: number, state: "active" | "recent", source: number) {
    if (!id || !islandIds.has(id) || !Number.isFinite(at)) return;
    const candidate = { id, at, state, source };
    if (!best || at > best.at || at === best.at && (
      Number(state === "active") > Number(best.state === "active") ||
      state === best.state && (source > best.source || source === best.source && id.localeCompare(best.id) < 0)
    )) best = candidate;
  }
  if (progress.activeRun) offer(lessonIsland(progress.activeRun.lessonId), progress.activeRun.lastActiveAt, "active", 0);
  const active = progress.learning.active;
  if (active) offer(activityIsland(active.activityId, active.taskIds[Math.min(active.index, active.taskIds.length - 1)]), active.lastActiveAt ?? active.startedAt, "active", 1);
  for (const answer of progress.attempts) offer(lessonIsland(answer.lessonId), answer.answeredAt, "recent", 0);
  for (const [id, completed] of Object.entries(progress.completed)) offer(lessonIsland(id), completed.lastCompletedAt ?? completed.completedAt, "recent", 0);
  for (const answer of progress.learning.records) offer(taskIsland(answer.taskId), answer.at, "recent", 1);
  for (const [id, completed] of Object.entries(progress.learning.completed)) {
    const taskIds = new Set(getLearningActivity(id)?.tasks.map(task => task.id));
    const last = progress.learning.records.filter(answer => taskIds.has(answer.taskId) && answer.at <= completed.at).sort((a,b) => b.at-a.at)[0];
    offer(activityIsland(id, last?.taskId), completed.at, "recent", 1);
  }
  for (const report of progress.learning.reports) offer("school", report.at, "recent", 1);
  for (const mode of ["fish", "snake"] as const) {
    const state = progress.adventure.modes[mode];
    if (state.lastAt) offer(mode === "fish" ? "bubbles" : "animals", state.lastAt, progress.adventure.activeMode === mode ? "active" : "recent", 2);
  }
  if (!best) return { id: "animals", at: 0, state: "start" };
  return { id: best.id, at: best.at, state: best.state };
}
