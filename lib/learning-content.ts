import data from "./learning-content.json";
import { words as originalWords } from "./course";
import type { LearningActivity, LearningTask, LearningUnit, LearningWord } from "./learning-types";

type RawTask = Omit<LearningTask, "adultRubric"> & { adultRubric?: { criteria: string[] }; letterTiles?: string[] };
function task(raw: unknown): LearningTask {
  const t = raw as RawTask;
  return { ...t, ...(t.adultRubric ? { adultRubric: t.adultRubric.criteria } : { adultRubric: undefined }), ...(t.letterTiles ? { kind: "blend", letters: t.letterTiles } : {}) };
}
export const learningUnits: LearningUnit[] = data.units.map(unit => ({ ...unit,
  words: unit.words.map(word => ({ ...word, unitId: unit.id })),
  activities: unit.activities.map(activity => ({ ...activity, skill: activity.skill as LearningTask["skill"], unitId: unit.id, tasks: activity.tasks.map(task) }))
}));
export const expandedWords = learningUnits.flatMap(unit => unit.words);
export const allLearningWords: LearningWord[] = [...originalWords.map(word => ({ ...word, unitId: word.topicId })), ...expandedWords];
export function getLearningWord(id: string): LearningWord | undefined { return allLearningWords.find(word => word.id === id); }
export const storyActivities: LearningActivity[] = data.stories.map(story => ({ ...story, id: `story-${story.id}`, description: story.titleEn, tasks: story.tasks.map(task) }));
export const phonicsActivities: LearningActivity[] = data.phonics.map(group => ({ id: `phonics-${group.id}`, title: group.title, description: "听整词，找相同词尾，再点字母拼一拼。", phonics: { words: group.words, note: group.teacherNoteZh }, tasks: group.tasks.map(task) }));
export const diagnosticActivity: LearningActivity = { id: "a1-readiness", title: "听说读写观察站", diagnostic: true, description: "24个原创任务 · 请家长陪同 · 可暂停续做", tasks: data.diagnostic.tasks.map(task) };
export const recallActivity: LearningActivity = { id: "spaced-recall", title: "记忆宝藏小路", review: true, description: "换张图片再认一认，让记忆更牢靠。", tasks: allLearningWords.map(word => ({ id: `recall-${word.id}`, skill: "listening", kind: "choose", promptEn: word.en, promptZh: "听一听，找到对应的图片。", audioText: word.en, captionMode: "after-answer", goal: "隔日独立提取单词", wordIds: [word.id], hintZh: `目标是${word.zh}。`, answer: word.id, options: [word, ...allLearningWords.filter(other => other.unitId === word.unitId && other.id !== word.id).slice(0,2)].map(other => ({ id: other.id, wordIds: [other.id] })) })) };
export const dailySpeaking: LearningActivity = { id: "daily-speaking", title: "今天我会自己说", skill: "speaking", tasks: learningUnits.map(unit => unit.activities.find(activity => activity.skill === "speaking")!.tasks[0]) };
export const learningActivities: LearningActivity[] = [...learningUnits.flatMap(unit => unit.activities), ...storyActivities, ...phonicsActivities, diagnosticActivity, recallActivity, dailySpeaking];
export const learningTasks = new Map(learningActivities.flatMap(activity => activity.tasks).map(item => [item.id, item]));
export const learningSources = data.sources;
export function getLearningActivity(id: string): LearningActivity | undefined { return learningActivities.find(activity => activity.id === id); }
export function getNextLearningActivity(completed: Record<string, unknown>, after?: string): LearningActivity {
  const sequence = [...learningUnits.flatMap(unit => unit.activities), ...phonicsActivities, ...storyActivities];
  const index = after ? sequence.findIndex(activity => activity.id === after) : -1;
  return sequence.slice(index + 1).find(activity => !completed[activity.id]) ?? sequence.find(activity => !completed[activity.id]) ?? sequence[(index + 1) % sequence.length];
}
