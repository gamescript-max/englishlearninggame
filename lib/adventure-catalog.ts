import learningData from "./learning-content.json";
import learningRegions from "./learning-art-regions.json";

export type OceanTier = 1 | 2 | 3 | 4 | 5;
export interface OceanSpecies {
  id: string; en: string; zh: string; tier: OceanTier; artIndex: number;
  fictional: boolean; extinct: boolean;
}

// The tiers and transformations are game rules, not biological size rankings or evolution.
// Broad Chinese names use broad English names; developmental forms remain separate game entries.
const speciesNames: readonly [string, string, string][] = [
  ["plankton", "Plankton", "浮游生物"], ["fish-eggs", "Fish eggs", "鱼卵"],
  ["fish-fry", "Fish fry", "小鱼苗"], ["tadpole", "Tadpole", "蝌蚪"],
  ["brine-shrimp", "Brine shrimp", "丰年虾"], ["water-flea", "Water flea", "水蚤"],
  ["mosquito-larva", "Mosquito larva", "孑孓"], ["tiny-shrimp", "Tiny shrimp", "小虾米"],
  ["river-minnow", "River minnow", "溪流小银鱼"], ["guppy", "Guppy", "孔雀鱼"],
  ["zebrafish", "Zebrafish", "斑马鱼"], ["red-and-blue-tetra", "Red-and-blue tetra", "红绿灯鱼"],
  ["neon-tetra", "Neon tetra", "霓虹灯鱼"], ["mosquitofish", "Mosquitofish", "食蚊鱼"],
  ["medaka", "Japanese rice fish", "青鳉鱼"],
  ["goldfish", "Goldfish", "金鱼"], ["betta", "Betta", "斗鱼"],
  ["molly", "Molly", "玛丽鱼"], ["pearl-gourami", "Pearl gourami", "珍珠马甲鱼"],
  ["cory-catfish", "Cory catfish", "鼠鱼"], ["tetra", "Tetra", "灯科鱼"],
  ["bitterling", "Bitterling", "鳑鲏"], ["topmouth-gudgeon", "Topmouth gudgeon", "麦穗鱼"],
  ["young-crucian-carp", "Young crucian carp", "小鲫鱼"], ["tilapia-fry", "Tilapia fry", "罗非鱼苗"],
  ["loach", "Loach", "泥鳅"], ["small-yellow-croaker", "Small yellow croaker", "小黄鱼"],
  ["sardine", "Sardine", "沙丁鱼"], ["anchovy", "Anchovy", "凤尾鱼"],
  ["icefish", "Icefish", "银鱼"], ["small-octopus", "Small octopus", "小章鱼"],
  ["small-cuttlefish", "Small cuttlefish", "小乌贼"], ["small-jellyfish", "Small jellyfish", "小水母"],
  ["small-seahorse", "Small seahorse", "小海马"], ["small-starfish", "Small starfish", "小海星"],
  ["crucian-carp", "Crucian carp", "鲫鱼"], ["carp", "Carp", "鲤鱼"],
  ["grass-carp", "Grass carp", "草鱼"], ["silver-carp", "Silver carp", "鲢鱼"],
  ["bighead-carp", "Bighead carp", "鳙鱼（胖头鱼）"], ["catfish", "Catfish", "鲶鱼"],
  ["snakehead", "Snakehead", "黑鱼"], ["bass", "Bass", "鲈鱼"],
  ["mandarin-fish", "Mandarin fish", "鳜鱼"], ["tilapia", "Tilapia", "罗非鱼"],
  ["pomfret", "Pomfret", "鲳鱼"], ["hairtail", "Hairtail", "带鱼"],
  ["spanish-mackerel", "Spanish mackerel", "鲅鱼"], ["pacific-saury", "Pacific saury", "秋刀鱼"],
  ["herring", "Herring", "鲱鱼"], ["sea-bream", "Sea bream", "鲷鱼"],
  ["small-grouper", "Small grouper", "石斑鱼（小型）"], ["flounder", "Flounder", "比目鱼"],
  ["pufferfish", "Pufferfish", "河豚"], ["eel", "Eel", "鳗鱼"],
  ["swamp-eel", "Swamp eel", "黄鳝"], ["softshell-turtle", "Softshell turtle", "鳖（甲鱼）"],
  ["turtle", "Turtle", "乌龟"], ["frog", "Frog", "青蛙"],
  ["bullfrog", "Bullfrog", "牛蛙"], ["crayfish", "Crayfish", "小龙虾"],
  ["small-crab", "Small crab", "螃蟹（小）"], ["octopus", "Octopus", "章鱼"],
  ["cuttlefish", "Cuttlefish", "乌贼"], ["squid", "Squid", "鱿鱼"],
  ["sturgeon", "Sturgeon", "鲟鱼"], ["chum-salmon", "Chum salmon", "大马哈鱼"],
  ["tuna", "Tuna", "金枪鱼"], ["sailfish", "Sailfish", "旗鱼"],
  ["swordfish", "Swordfish", "剑鱼"], ["shark", "Shark", "鲨鱼（中型）"],
  ["dolphin", "Dolphin", "海豚"], ["seal", "Seal", "海豹"],
  ["sea-lion", "Sea lion", "海狮"], ["giant-grouper", "Giant grouper", "大型石斑鱼"],
  ["giant-catfish", "Giant catfish", "巨型鲶鱼"], ["alligator-gar", "Alligator gar", "鳄雀鳝"],
  ["arapaima", "Arapaima", "巨骨舌鱼"], ["mekong-giant-catfish", "Mekong giant catfish", "湄公河巨鲶"],
  ["ocean-sunfish", "Ocean sunfish", "翻车鱼"], ["manta-ray", "Manta ray", "蝠鲼"],
  ["great-white-shark", "Great white shark", "大白鲨"], ["orca", "Orca", "虎鲸"],
  ["blue-whale", "Blue whale", "蓝鲸"],
  ["megalodon", "Megalodon", "巨齿鲨"], ["basilosaurus", "Basilosaurus", "龙王鲸"],
  ["kraken", "Kraken", "海怪克拉肯"], ["leviathan", "Leviathan", "利维坦"],
  ["kun", "Kun", "鲲"], ["jiaolong", "Jiaolong", "蛟龙"],
  ["sea-dragon", "Sea dragon", "海龙"], ["poseidon", "Poseidon", "波塞冬"],
  ["sea-guardian", "Sea guardian", "海神兽"], ["abyssal-maw", "Abyssal maw", "深渊巨口"],
  ["devourer", "Devourer", "吞噬者"],
  ["mosasaurus", "Mosasaurus", "沧龙"], ["giant-pliosaur", "Giant pliosaur", "巨型上龙"],
  ["abyssal-giant-turtle", "Abyssal giant turtle", "深海玄龟"], ["azure-sea-dragon", "Azure sea dragon", "苍海巨龙"],
];
export const oceanSpecies: OceanSpecies[] = speciesNames.map(([id, en, zh], artIndex) => ({
  id, en, zh, artIndex, tier: artIndex < 15 ? 1 : artIndex < 35 ? 2 : artIndex < 65 ? 3 : artIndex < 84 ? 4 : 5,
  fictional: artIndex >= 86 && artIndex < 95 || artIndex >= 97,
  extinct: [84, 85, 95, 96].includes(artIndex),
}));
const speciesById = new Map(oceanSpecies.map(species => [species.id, species]));
export function getOceanSpecies(id: string): OceanSpecies | undefined { return speciesById.get(id); }

const evolutionArt = [2, 9, 15, 16, 27, 36, 42, 51, 67, 69, 70, 80, 81, 82, 83, 84, 85, 86, 87, 88, 95, 96, 97, 98, 90, 91, 92, 94];
const evolutionXP = [0, 20, 50, 95, 160, 250, 380, 550, 750, 1000, 1300, 1650, 2100, 2600, 3300, 4200, 5400, 7000, 9000, 11500, 15000, 19000, 24000, 30000, 38000, 48000, 60000, 75000];
export const oceanEvolution = evolutionArt.map((artIndex, index) => ({ index, xp: evolutionXP[index], speciesId: oceanSpecies[artIndex].id }));
/** Nearby growth bands are game sizes, separate from the five catalogue groups. */
export function oceanSizeLevel(speciesId: string): number {
  const index = getOceanSpecies(speciesId)?.artIndex ?? 2;
  let nearest = 0;
  for (let stage = 1; stage < evolutionArt.length; stage++) {
    if (Math.abs(index - evolutionArt[stage]) < Math.abs(index - evolutionArt[nearest])) nearest = stage;
  }
  return nearest;
}
export function oceanStageForXP(xp: number): number {
  let stage = 0;
  for (let index = 1; index < oceanEvolution.length; index++) if (xp >= oceanEvolution[index].xp) stage = index;
  return stage;
}

export type AdventureWordCategory = "animals" | "plants" | "food" | "toys" | "transport" | "family" | "school" | "body" | "actions" | "nature" | "home";
export interface AdventureImageRect { x: number; y: number; width: number; height: number; imageWidth: number; imageHeight: number }
export interface AdventureWord {
  id: string; en: string; zh: string; image: string; category: AdventureWordCategory; spriteIndex: number;
  imageRect?: AdventureImageRect;
}
const coreWords: [string, string, AdventureWordCategory][] = [
  ["cat", "猫", "animals"], ["dog", "狗", "animals"], ["bird", "鸟", "animals"], ["fish", "鱼", "animals"],
  ["frog", "青蛙", "animals"], ["duck", "鸭子", "animals"], ["horse", "马", "animals"], ["rabbit", "兔子", "animals"],
  ["apple", "苹果", "food"], ["banana", "香蕉", "food"], ["orange", "橙子", "food"], ["bread", "面包", "food"],
  ["milk", "牛奶", "food"], ["water", "水", "food"], ["juice", "果汁", "food"], ["cake", "蛋糕", "food"],
  ["ball", "球", "toys"], ["doll", "娃娃", "toys"], ["kite", "风筝", "toys"], ["robot", "机器人", "toys"],
  ["bike", "自行车", "transport"], ["train", "火车", "transport"], ["teddy bear", "泰迪熊", "toys"], ["toy car", "玩具汽车", "toys"],
];
const extraWords: [string, string, AdventureWordCategory][] = [
  ["tree", "树", "plants"], ["flower", "花", "plants"], ["leaf", "叶子", "plants"], ["grass", "草", "plants"],
  ["seed", "种子", "plants"], ["rose", "玫瑰", "plants"], ["cactus", "仙人掌", "plants"], ["bush", "灌木", "plants"],
  ["bus", "公交车", "transport"], ["car", "汽车", "transport"], ["boat", "船", "transport"], ["plane", "飞机", "transport"],
  ["cup", "杯子", "home"], ["bed", "床", "home"], ["clock", "时钟", "home"], ["shoe", "鞋子", "home"],
];
const categories: Record<string, AdventureWordCategory> = { family: "family", school: "school", body: "body", daily: "actions", weather: "nature" };
export const adventureVocabulary: AdventureWord[] = [
  ...coreWords.map(([en, zh, category], spriteIndex) => ({ id: en.replaceAll(" ", "-"), en, zh, category, spriteIndex, image: "/images/words.png" })),
  ...learningData.units.flatMap(unit => unit.words.map(word => {
    const region = learningRegions.base.find(value => value.index === word.spriteIndex)!;
    return { id: word.id, en: word.en, zh: word.zh, category: categories[unit.id], spriteIndex: word.spriteIndex,
      image: "/images/expanded-words-base.png", imageRect: { x: region.x, y: region.y, width: region.width, height: region.height, imageWidth: region.imageWidth, imageHeight: region.imageHeight } };
  })),
  ...extraWords.map(([en, zh, category], spriteIndex) => ({ id: en, en, zh, category, spriteIndex,
    image: "/images/adventure-cards-v2.png", imageRect: { x: spriteIndex % 4 * 384, y: Math.floor(spriteIndex / 4) * 256, width: 384, height: 256, imageWidth: 1536, imageHeight: 1024 } })),
];
const wordById = new Map(adventureVocabulary.map(word => [word.id, word]));
export function getAdventureWord(id: string): AdventureWord | undefined { return wordById.get(id); }
// Interleave categories so a camera region is never stocked entirely with one topic.
const categoryBuckets = [...new Set(adventureVocabulary.map(word => word.category))].map(category => adventureVocabulary.filter(word => word.category === category));
export const adventureCardWordIds: string[] = Array.from({ length: Math.max(...categoryBuckets.map(bucket => bucket.length)) }, (_, index) =>
  categoryBuckets.flatMap(bucket => bucket[index] ? [bucket[index].id] : [])).flat();

export const snakeBreeds = [
  { id: "corn-snake", en: "Corn snake", zh: "玉米蛇", color: "#f0984f", artIndex: 0 },
  { id: "green-tree-python", en: "Green tree python", zh: "绿树蟒", color: "#6ebd83", artIndex: 1 },
  { id: "ball-python", en: "Ball python", zh: "球蟒", color: "#d8bc85", artIndex: 2 },
  { id: "milk-snake", en: "Milk snake", zh: "奶蛇", color: "#ef7376", artIndex: 3 },
  { id: "kingsnake", en: "Kingsnake", zh: "王蛇", color: "#718399", artIndex: 4 },
  { id: "garter-snake", en: "Garter snake", zh: "袜带蛇", color: "#9ccfca", artIndex: 5 },
  { id: "rainbow-boa", en: "Rainbow boa", zh: "彩虹蚺", color: "#ab8cdc", artIndex: 6 },
  { id: "sea-snake", en: "Sea snake", zh: "海蛇", color: "#6ab7ec", artIndex: 7 },
] as const;

export const adventureCatalogNotes = {
  zh: "这是想象中的水世界。成长路线和大小是游戏规则，并不是动物真正的进化或食物链。鲸、海豚、海豹等是哺乳动物，蝌蚪和青蛙是两栖动物；神话伙伴单独标注。",
  en: "Game sizes and transformations are imaginary, not real animal evolution.",
  sources: [
    "https://www.fao.org/fishery/docs/CDrom/aquaculture/I1129m/file/zh/zh_mandarinfish.htm",
    "https://www.fao.org/docrep/pdf/010/a1290e/a1290e03.pdf",
    "https://www.fishbase.se/summary/Oryzias-latipes.html",
    "https://www.fishbase.se/summary/Pseudorasbora-parva.html",
    "https://ocean.si.edu/ocean-life/marine-mammals/whales",
    "https://www.nhm.ac.uk/discover/megalodon--the-truth-about-the-largest-shark-that-ever-lived.html/",
  ],
};
