"use client";
import { useEffect, type RefObject } from "react";
import { course, lessons } from "@/lib/course";
import { learningUnits, storyActivities, phonicsActivities } from "@/lib/learning-content";
import { getStats, type Progress } from "@/lib/progress";

type Registry = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: { readOnlyHint: boolean }; execute: (input: unknown) => unknown }, options?: { signal: AbortSignal }) => void | Promise<void> };

export function useWebMCP(current: RefObject<Progress>, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const registry = (document as Document & { modelContext?: Registry }).modelContext;
    if (!registry?.registerTool) return;
    const lifecycle = new AbortController();
    const validate = (input: unknown) => {
      if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length) throw new Error("该只读工具不接受参数。");
    };
    for (const tool of [
      { name: "list_english_island_lessons", title: "查看探索岛课程", description: "只读返回主题、听说读写、故事和拼读目录，不改变练习或进度。", execute: (input: unknown) => { validate(input); return { level: "Pre-A1基础及部分A1衔接，非完整A1课程", description: course.description, topics: course.topics.map(({ id, title }) => ({ id, title })), lessons: lessons.map(({ id, topicId, title, isReview }) => ({ id, topicId, title, isReview })), learningUnits:learningUnits.map(({id,title,level,activities})=>({id,title,level,activities:activities.map(({id,title,skill})=>({id,title,skill}))})), stories:storyActivities.map(({id,title})=>({id,title})), phonics:phonicsActivities.map(({id,title})=>({id,title})) }; } },
      { name: "read_english_island_progress", title: "查看本机学习概览", description: "只读返回练习、间隔复习与游戏奖励，不读取录音或书写原文。", execute: (input: unknown) => { validate(input); const p=current.current; return { games:getStats(p),learning:{completedActivities:Object.keys(p.learning.completed),dueRecall:Object.values(p.learning.cards).filter(card=>card.dueAt<=Date.now()).length,diagnosticCount:p.learning.reports.length,speakingPractice:p.learning.speakingPractice} }; } },
    ]) {
      try { void Promise.resolve(registry.registerTool({ ...tool, inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } }, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional browser capability. */ }
    }
    return () => lifecycle.abort();
  }, [current, ready]);
}
