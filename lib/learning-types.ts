export type LearningSkill = "listening" | "reading" | "writing" | "speaking";
export type LearningScene = { objects?: { wordId: string; count?: number; color?: string; position?: string }[]; actionWordId?: string; descriptionZh?: string };
export type LearningOption = { id: string; textEn?: string; wordIds?: string[]; scene?: LearningScene };
export type LearningTask = {
  id: string; skill: LearningSkill; kind: "choose" | "type" | "speak" | "blend";
  level?: string; promptEn: string; promptZh: string; audioText?: string;
  captionMode?: "always" | "after-answer"; options?: LearningOption[]; answer?: string;
  acceptedAnswers?: string[]; hintZh?: string; goal: string; wordIds?: string[];
  adultRubric?: string[]; exampleAnswers?: string[]; letters?: string[];
  stimulusEn?: string; scenes?: LearningScene[]; wordCues?: string[]; adultReviewRecommended?: boolean;
};
export type LearningActivity = { id: string; title: string; description?: string; skill?: LearningSkill; unitId?: string; tasks: LearningTask[]; pages?: { en: string; zh: string; wordIds: string[]; scene?: LearningScene }[]; diagnostic?: boolean; review?: boolean; phonics?: { words: string[]; note: string } };
export type LearningWord = { id: string; en: string; zh: string; spriteIndex: number; unitId: string };
export type LearningUnit = { id: string; title: string; subtitle: string; level: string; words: LearningWord[]; phrases: { en: string; zh: string; goal: string }[]; activities: LearningActivity[] };
export const skillNames: Record<LearningSkill, string> = { listening: "听懂", reading: "读懂", writing: "写出来", speaking: "自己说" };
