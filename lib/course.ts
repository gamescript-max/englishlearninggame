import audioManifest from "./audio-manifest.json";

export type TopicId = "animals" | "food" | "toys";
export type ExerciseKind = "listen" | "match" | "place" | "memory" | "spell" | "scene" | "snake" | "bubble" | "serve" | "connect" | "catch";
export type PositionId = "in" | "on" | "under";

export interface Word {
  id: string;
  en: string;
  zh: string;
  topicId: TopicId;
  spriteIndex: number;
  audio: string;
}

export interface Phrase {
  en: string;
  zh: string;
  goal: string;
}

export interface Topic {
  id: TopicId;
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  wordIds: string[];
  phrases: Phrase[];
}

export interface SceneChoice {
  id: string;
  wordId: string;
  count?: 1 | 2 | 3;
  variant?: "base" | "review";
  position?: PositionId;
}

export interface Exercise {
  id: string;
  kind: ExerciseKind;
  wordId: string;
  promptEn: string;
  promptZh: string;
  /** Word ID for listen/match/memory/spell/snake; position ID for place; scene ID for scene. */
  answer: string;
  options: string[];
  scenes?: SceneChoice[];
  requiredCount?: 1 | 2 | 3;
}

export interface Lesson {
  id: string;
  topicId: TopicId;
  order: number;
  title: string;
  description: string;
  isReview: boolean;
  isBonus?: true;
  prerequisiteLessonId?: string;
  goal: string;
  exercises: Exercise[];
}

const vocabulary: [TopicId, string, string][] = [
  ["animals", "cat", "猫"], ["animals", "dog", "狗"],
  ["animals", "bird", "鸟"], ["animals", "fish", "鱼"],
  ["animals", "frog", "青蛙"], ["animals", "duck", "鸭子"],
  ["animals", "horse", "马"], ["animals", "rabbit", "兔子"],
  ["food", "apple", "苹果"], ["food", "banana", "香蕉"],
  ["food", "orange", "橙子"], ["food", "bread", "面包"],
  ["food", "milk", "牛奶"], ["food", "water", "水"],
  ["food", "juice", "果汁"], ["food", "cake", "蛋糕"],
  ["toys", "ball", "球"], ["toys", "doll", "娃娃"],
  ["toys", "kite", "风筝"], ["toys", "robot", "机器人"],
  ["toys", "bike", "自行车"], ["toys", "train", "火车"],
  ["toys", "teddy bear", "泰迪熊"], ["toys", "toy car", "玩具汽车"],
];

export const words: Word[] = vocabulary.map(([topicId, en, zh], spriteIndex) => ({
  id: en.replaceAll(" ", "-"), en, zh, topicId, spriteIndex,
  audio: (audioManifest.speech.en as Record<string, string>)[en],
}));

export const supportWords = [
  { en: "red", zh: "红色" }, { en: "blue", zh: "蓝色" },
  { en: "green", zh: "绿色" }, { en: "yellow", zh: "黄色" },
  { en: "one", zh: "一" }, { en: "two", zh: "二" }, { en: "three", zh: "三" },
  { en: "in", zh: "在里面" }, { en: "on", zh: "在上面" }, { en: "under", zh: "在下面" },
];

export const topics: Topic[] = [
  {
    id: "animals", title: "动物森林", subtitle: "和森林里的朋友打个招呼", icon: "🌳", color: "#52ad83",
    wordIds: words.filter((word) => word.topicId === "animals").map((word) => word.id),
    phrases: [
      { en: "It is a cat.", zh: "它是一只猫。", goal: "用简单句辨认动物" },
      { en: "I can see two dogs.", zh: "我能看见两只狗。", goal: "说出数量" },
      { en: "The bird is blue.", zh: "这只鸟是蓝色的。", goal: "说出颜色" },
    ],
  },
  {
    id: "food", title: "食物营地", subtitle: "一起准备美味的野餐", icon: "🍎", color: "#f19b55",
    wordIds: words.filter((word) => word.topicId === "food").map((word) => word.id),
    phrases: [
      { en: "I like apples.", zh: "我喜欢苹果。", goal: "表达喜好" },
      { en: "Can I have some water, please?", zh: "请给我一些水，好吗？", goal: "礼貌地提出请求" },
      { en: "Here you are.", zh: "给你。", goal: "回应请求" },
    ],
  },
  {
    id: "toys", title: "玩具小屋", subtitle: "找一找，收拾自己的小天地", icon: "🧸", color: "#9383d5",
    wordIds: words.filter((word) => word.topicId === "toys").map((word) => word.id),
    phrases: [
      { en: "This is my ball.", zh: "这是我的球。", goal: "介绍自己的物品" },
      { en: "Put the ball in the box.", zh: "把球放进盒子里。", goal: "听懂简单指令" },
      { en: "The teddy bear is under the table.", zh: "泰迪熊在桌子下面。", goal: "描述位置" },
    ],
  },
];

export const positions: { id: PositionId; en: string; zh: string; promptSuffix: string }[] = [
  { id: "in", en: "in the box", zh: "盒子里面", promptSuffix: "in the box" },
  { id: "on", en: "on the table", zh: "桌子上面", promptSuffix: "on the table" },
  { id: "under", en: "under the table", zh: "桌子下面", promptSuffix: "under the table" },
];

export function getWord(id: string): Word {
  const value = words.find((word) => word.id === id);
  if (!value) throw new Error(`Unknown word: ${id}`);
  return value;
}

export function getTopic(id: string): Topic {
  const value = topics.find((topic) => topic.id === id);
  if (!value) throw new Error(`Unknown topic: ${id}`);
  return value;
}

export const bonusInstructions = {
  memory: "先看看图片，记住位置。卡片盖上后，听声音，翻开正确的那张。",
  spell: "听一听，把字母按顺序排好。点字母就能放进去，排好后点检查。",
  scene: "听一句英语，看看图片，选出意思一样的那一张。",
  snake: "听英语，看看完整句子。用方向按钮控制小蛇，吃到正确的图片。撞到边缘可以重新出发。",
  bubble: "听英语，找到两颗一样的目标泡泡。点破泡泡，就能收集宝藏。",
  serve: "听英语，把要送的图卡装进托盘。装满规定的份数，再送给乐乐。点托盘里的图卡可以拿回来。",
  connect: "听英语，先点正在学习的英文词，再点它的图片。连好三条线，就能去下一组。",
  catch: "听一听，移动小篮子，接住英语目标对应的图片。箭头按钮、键盘或拖动篮子都能玩。",
} as const;

interface SceneTemplate {
  promptEn: string;
  wordId: string;
  answer: string;
  scenes: SceneChoice[];
}

/** The pictured meanings are fixed so an imported backup cannot redefine a correct scene. */
const sceneTemplates: Record<TopicId, SceneTemplate[]> = {
  animals: [
    { promptEn: "It is a cat.", wordId: "cat", answer: "animal-cat", scenes: [
      { id: "animal-cat", wordId: "cat" }, { id: "animal-dog", wordId: "dog" }, { id: "animal-rabbit", wordId: "rabbit" },
    ] },
    { promptEn: "I can see two dogs.", wordId: "dog", answer: "dogs-two", scenes: [
      { id: "dogs-two", wordId: "dog", count: 2 }, { id: "dogs-one", wordId: "dog", count: 1 }, { id: "dogs-three", wordId: "dog", count: 3 },
    ] },
    { promptEn: "The bird is blue.", wordId: "bird", answer: "bird-blue", scenes: [
      { id: "bird-blue", wordId: "bird", variant: "base" }, { id: "bird-other", wordId: "bird", variant: "review" }, { id: "duck-yellow", wordId: "duck", variant: "base" },
    ] },
  ],
  food: [
    { promptEn: "I like apples.", wordId: "apple", answer: "food-apple", scenes: [
      { id: "food-apple", wordId: "apple" }, { id: "food-banana", wordId: "banana" }, { id: "food-orange", wordId: "orange" },
    ] },
    { promptEn: "Can I have some water, please?", wordId: "water", answer: "drink-water", scenes: [
      { id: "drink-water", wordId: "water" }, { id: "drink-milk", wordId: "milk" }, { id: "drink-juice", wordId: "juice" },
    ] },
    { promptEn: "Find the cake.", wordId: "cake", answer: "food-cake", scenes: [
      { id: "food-cake", wordId: "cake" }, { id: "food-bread", wordId: "bread" }, { id: "food-apple", wordId: "apple" },
    ] },
  ],
  toys: [
    { promptEn: "This is my ball.", wordId: "ball", answer: "toy-ball", scenes: [
      { id: "toy-ball", wordId: "ball" }, { id: "toy-doll", wordId: "doll" }, { id: "toy-kite", wordId: "kite" },
    ] },
    { promptEn: "Put the ball in the box.", wordId: "ball", answer: "ball-in", scenes: [
      { id: "ball-in", wordId: "ball", position: "in" }, { id: "ball-on", wordId: "ball", position: "on" }, { id: "ball-under", wordId: "ball", position: "under" },
    ] },
    { promptEn: "The teddy bear is under the table.", wordId: "teddy-bear", answer: "bear-under", scenes: [
      { id: "bear-under", wordId: "teddy-bear", position: "under" }, { id: "bear-on", wordId: "teddy-bear", position: "on" }, { id: "bear-in", wordId: "teddy-bear", position: "in" },
    ] },
  ],
};

/** Zero-based question index in the six-question bonus scene lesson. */
export function getSceneExercise(topicId: TopicId, index: number): Exercise {
  if (!Number.isInteger(index) || index < 0 || index > 5) throw new Error("Invalid scene question index");
  const template = sceneTemplates[topicId][index % 3];
  return {
    id: `${topicId}-9-q${index + 1}`, kind: "scene", wordId: template.wordId,
    promptEn: template.promptEn, promptZh: bonusInstructions.scene, answer: template.answer,
    options: template.scenes.map((scene) => scene.id), scenes: template.scenes.map((scene) => ({ ...scene })),
  };
}

const lessonNames = ["认识新朋友", "听一听，找一找", "词语配对派对", "放到正确的位置", "小小探险家", "明天再见面"];
const lessonDescriptions = [
  "听小狐狸示范，认识第一组词语。", "再认识几位朋友，听声音找图片。",
  "把熟悉的词语和图片连在一起。", "听懂 in、on、under，按指令摆一摆。",
  "把听音、配对和放置都试一试！", "换一个顺序，看看还记不记得。",
];
const questionWordIndices = [
  [0, 1, 2, 0, 1, 2], [3, 4, 5, 3, 4, 5],
  [6, 7, 0, 3, 6, 7], [1, 2, 4, 5, 6, 7],
  [0, 2, 3, 5, 6, 7], [1, 2, 3, 4, 6, 7],
];

function makeExercise(topic: Topic, order: number, index: number, wordId: string): Exercise {
  const word = getWord(wordId);
  const kind: ExerciseKind = order <= 2 ? "listen" : order === 3 ? "match" : order === 4 ? "place" : (["listen", "match", "place"] as const)[index % 3];
  const position = positions[index % positions.length];
  const distractors = topic.wordIds.filter((id) => id !== wordId);
  const start = (index + order) % distractors.length;
  const options = kind === "place" ? positions.map((item) => item.id) : [wordId, ...Array.from({ length: 3 }, (_, offset) => distractors[(start + offset) % distractors.length])];
  return {
    id: `${topic.id}-${order}-q${index + 1}`, kind, wordId,
    promptEn: kind === "listen" ? `Listen and find the ${word.en}.` : kind === "match" ? `Find the ${word.en}.` : `Put the ${word.en} ${position.promptSuffix}.`,
    promptZh: kind === "listen" ? "听一听，找到图片，点一下。" : kind === "match" ? "看单词，找到对应的图片。" : `把物品放到${position.zh}。`,
    answer: kind === "place" ? position.id : wordId, options,
  };
}

const coreLessons: Lesson[] = topics.flatMap((topic) => lessonNames.map((title, index) => ({
  id: `${topic.id}-${index + 1}`, topicId: topic.id, order: index + 1,
  title, description: lessonDescriptions[index], isReview: index === 5,
  goal: index < 2 ? "听辨常见词" : index === 2 ? "辨认词形并与图片关联" : index === 3 ? "理解位置和简单指令" : "在新顺序中独立回忆常见词",
  exercises: questionWordIndices[index].map((wordIndex, questionIndex) => makeExercise(topic, index + 1, questionIndex, topic.wordIds[wordIndex])),
})));

const bonusNames = ["记忆翻牌挑战", "听音拼单词", "英语场景侦探", "英语贪吃蛇", "听音泡泡宝藏", "乐乐的快递订单", "图词连线乐园", "听音接星星"];
const bonusDescriptions = ["看看图片，记住朋友的位置，再听声音翻一翻。", "听一听，动动手，把字母排成一个单词。", "听懂一句英语，找出意思一样的画面。", "听懂目标，用小蛇收集正确的图片，让身体长起来。", "找到两颗目标泡泡，收齐才进入下一题。", "听订单，装满托盘，再把图卡送给乐乐。", "两组三条连线，让英语词和图片成为朋友。", "移动小篮子，接住从星空落下的英语图卡。"];
const bonusKinds = ["memory", "spell", "scene", "snake", "bubble", "serve", "connect", "catch"] as const;
const bonusGoals = ["把听到的词与记忆中的图片位置关联", "联系单词声音与字母顺序", "听懂数量、颜色、喜好与位置等简单句意", "结合完整英语指令辨认图卡并重复回忆", "在不同图片实例中反复辨认同一个听到的词", "听辨常见词并按图示数量完成送货任务", "把单词声音、词形与图片建立关联", "听辨常见词并用移动操作寻找对应图卡"];
const bonusWordIndices = [[0, 1, 2, 3, 4, 5], [6, 7, 0, 3, 6, 7], [], [0, 1, 2, 0, 1, 2], [0, 2, 3, 4, 6, 7], [0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5], [0, 2, 4, 1, 3, 5]];
const bonusLessons: Lesson[] = topics.flatMap((topic) => bonusNames.map((title, index) => {
  const order = index + 7;
  const kind = bonusKinds[index];
  return {
    id: `${topic.id}-${order}`, topicId: topic.id, order, title,
    description: bonusDescriptions[index], goal: bonusGoals[index], isReview: false, isBonus: true,
    prerequisiteLessonId: `${topic.id}-${[1, 3, 5, 1, 1, 2, 3, 1][index]}`,
    exercises: Array.from({ length: 6 }, (_, questionIndex) => {
      if (kind === "scene") return getSceneExercise(topic.id, questionIndex);
      const wordId = topic.wordIds[bonusWordIndices[index][questionIndex]];
      const word = getWord(wordId);
      const distractors = topic.wordIds.filter((id) => id !== wordId);
      return {
        id: `${topic.id}-${order}-q${questionIndex + 1}`, kind, wordId,
        promptEn: ["snake", "bubble", "serve", "catch"].includes(kind) ? `Listen and find the ${word.en}.` : kind === "connect" ? `Find the ${word.en}.` : word.en, promptZh: bonusInstructions[kind], answer: wordId,
        options: kind === "connect" ? topic.wordIds.slice(Math.floor(questionIndex / 3) * 3, Math.floor(questionIndex / 3) * 3 + 3) : [wordId, ...Array.from({ length: 3 }, (_, offset) => distractors[(questionIndex + offset) % distractors.length])],
        ...(kind === "serve" ? { requiredCount: (questionIndex % 3 + 1) as 1 | 2 | 3 } : {}),
      };
    }),
  };
}));

/** Preserve core ordering for recommendations and old progress; bonus IDs are additive. */
export const lessons: Lesson[] = [...coreLessons, ...bonusLessons];

export function getLesson(id: string): Lesson {
  const value = lessons.find((lesson) => lesson.id === id);
  if (!value) throw new Error(`Unknown lesson: ${id}`);
  return value;
}

export function shuffle<T>(values: readonly T[], random: () => number = Math.random): T[] {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [output[index], output[other]] = [output[other], output[index]];
  }
  return output;
}

/** The entire generated set is saved in activeRun, so refresh never changes the question. */
export function createRun(lessonId: string, dueWordIds: string[] = [], random: () => number = Math.random): Exercise[] {
  const lesson = getLesson(lessonId);
  const topic = getTopic(lesson.topicId);
  const candidates = lesson.isReview ? dueWordIds.filter((id) => topic.wordIds.includes(id)) : [];
  let exercises = lesson.exercises;
  if (!lesson.isBonus && lesson.order >= 5) {
    const pool = shuffle([...new Set([...candidates, ...topic.wordIds])], random);
    // Due items lead the pool, then familiar words fill a complete six-question round.
    const picked = candidates.length ? [...shuffle([...new Set(candidates)], random), ...pool.filter((id) => !candidates.includes(id))].slice(0, 6) : pool.slice(0, 6);
    exercises = picked.map((id, index) => makeExercise(topic, lesson.order, index, id));
  }
  const prepared = exercises.map((exercise) => {
    const options = shuffle(exercise.options, random);
    return {
      ...exercise, options,
      ...(exercise.scenes ? { scenes: options.map((id) => ({ ...exercise.scenes!.find((scene) => scene.id === id)! })) } : {}),
    };
  });
  // A connection board stays for three prompts; never interleave its two groups.
  if (lesson.exercises[0].kind === "connect") return shuffle([prepared.slice(0, 3), prepared.slice(3, 6)], random).flatMap(group => {
    const options = [...group[0].options];
    return shuffle(group, random).map(exercise => ({ ...exercise, options: [...options] }));
  });
  return shuffle(prepared, random);
}

export const course = {
  id: "english-island-v1", title: "萌宠英语探索岛", version: 1,
  level: "Pre-A1" as const, pathway: ["启蒙", "Pre-A1", "A1"],
  description: "三个主题的 Pre-A1 入门练习；完成游戏不代表达到完整 A1 能力。",
  topics,
};

