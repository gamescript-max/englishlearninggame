"use client";

import { ArrowRight, BookOpen, Ear, MessageCircle, PencilLine } from "lucide-react";
import type { Progress } from "@/lib/progress";
import { dueRecallWords } from "@/lib/learning-state";
import { getLearningWord, learningUnits } from "@/lib/learning-content";
import { skillNames, type LearningSkill } from "@/lib/learning-types";

const skills: LearningSkill[] = ["listening", "reading", "writing", "speaking"];
const icons = { listening: Ear, reading: BookOpen, writing: PencilLine, speaking: MessageCircle };

export function LearningReport({ progress, onOpenDiagnostic, onOpenLearning }: { progress: Progress; onOpenDiagnostic: () => void; onOpenLearning: () => void }) {
  const learning = progress.learning;
  const report = learning.reports.at(-1);
  const due = dueRecallWords(learning);
  return <section className="learning-report" aria-labelledby="learning-report-title">
    <div className="learning-report-heading"><div><p className="learning-eyebrow">观察能力，也看见成长</p><h2 id="learning-report-title">听说读写学习观察</h2></div><button className="learning-button learning-button-secondary" onClick={onOpenDiagnostic}><PencilLine size={20} />{report ? "再做一次观察" : "开始四技能观察"}</button></div>
    <p>新课程增加家庭、学校、身体、日常活动与天气，仍是 Pre-A1 基础与部分 A1 衔接。下面的原创观察帮助选择练习，不能认定已完成 A1。</p>
    <div className="learning-skill-report-grid">{skills.map(skill => {
      const answers = report?.answers.filter(answer => answer.skill === skill) ?? [];
      const independent = answers.filter(answer => answer.firstCorrect).length;
      const helped = answers.filter(answer => answer.hintUsed).length;
      const Icon = icons[skill];
      return <div key={skill} className="learning-skill-report"><Icon size={26} /><strong>{skillNames[skill]}</strong><span className="learning-report-score">{report ? `${independent} / ${answers.length}` : "还没有观察"}</span><small>首次独立完成{skill === "speaking" || skill === "writing" ? " · 含家长观察" : ""}</small>{report && <><div className="learning-report-meter" aria-hidden="true"><span style={{ width: `${answers.length ? independent / answers.length * 100 : 0}%` }} /></div><small>使用帮助 {helped} 题 · 再练习 {answers.length - independent} 题</small></>}</div>;
    })}</div>
    <div className="learning-report-details"><span>到期回忆 <strong>{dueRecallWords(learning).length}</strong> 个词</span><span>本地语音练习 <strong>{learning.speakingPractice}</strong> 次</span><span>学习足迹 <strong>{Object.keys(learning.completed).filter(id => id !== "a1-readiness" && id !== "spaced-recall" && id !== "daily-speaking").length}</strong> 站</span></div>
    <h3>新主题的日常练习</h3><p>每次任务的首次独立回答和使用帮助分别记录；重玩计入练习次数。</p>
    <div className="learning-practice-grid">{learningUnits.map(unit=>{
      const ids=new Set(unit.activities.flatMap(activity=>activity.tasks.map(task=>task.id)));
      const answers=learning.records.filter(answer=>ids.has(answer.taskId));
      return <article key={unit.id}><strong>{unit.title}</strong><small>{unit.activities.filter(activity=>learning.completed[activity.id]).length} / 4 站完成</small><span>首次独立 {answers.filter(answer=>answer.firstCorrect).length} / {answers.length} 次</span><span>使用帮助 {answers.filter(answer=>answer.hintUsed).length} 次</span></article>;
    })}</div>
    {due.length>0&&<div className="learning-recall-list"><h3>到期温习的词</h3><div>{due.map(id=>{const word=getLearningWord(id);return word?<span key={id}><b lang="en">{word.en}</b> {word.zh}</span>:null;})}</div></div>}
    {report && <p className="learning-report-suggestion">{skills.filter(skill => report.answers.filter(answer => answer.skill === skill && answer.firstCorrect).length < 5).length ? `下一步优先练：${skills.filter(skill => report.answers.filter(answer => answer.skill === skill && answer.firstCorrect).length < 5).map(skill => skillNames[skill]).join("、")}。这只是本组任务的表现，建议隔日换场景再观察。` : "本组任务表现稳定，可以尝试新的场景和官方 A1 Movers 样题，观察陌生内容中的表现。"}</p>}
    <p className="learning-report-limit">每技能只有 6 个任务；跟读次数、游戏星星和本组正确率不代表 CEFR 等级。口语和开放写作由成人观察，不自动给发音分。</p>
    <div className="learning-report-links"><button className="learning-button" onClick={onOpenLearning}>去练习下一站 <ArrowRight size={20} /></button><a href="https://www.cambridgeenglish.org/exams-and-tests/qualifications/young-learners/paper/movers/preparation/" target="_blank" rel="noreferrer">官方 Movers 样题</a><a href="https://www.cambridgeenglish.org/exams-and-tests/qualifications/results/young-learners/" target="_blank" rel="noreferrer">官方盾牌成绩说明</a></div>
    <p className="learning-report-limit">剑桥建议正式结果的各考试部分达到 4 或 5 个盾牌后，开始准备下一等级。官方少儿考试通常有听力、读写、口语三个部分；本站四技能诊断不等同盾牌或 A1 达标认证。A1 Movers → A2 Flyers。</p>
  </section>;
}
