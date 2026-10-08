export const playgroundModes = ["garden", "pets", "racing"] as const;
export type PlaygroundMode = typeof playgroundModes[number];
export type PlantId = "carrot" | "tomato" | "sunflower" | "strawberry" | "corn" | "rose";
export type PetId = "puppy" | "kitten" | "bunny";
export type TownDestination = "farm" | "school" | "park" | "shop" | "beach" | "home";
export type PlaygroundOption = { id: string; en: string; zh: string };
interface TaskBase { id: string; target: string; promptEn: string; promptZh: string; options: PlaygroundOption[] }
export interface GardenTask extends TaskBase { mode: "garden"; action: "plant" | "water" | "harvest"; plot: number; plant: PlantId }
export interface PetTask extends TaskBase { mode: "pets"; action: "feed" | "drink" | "wash" | "sleep" | "play"; pet: PetId }
export interface RacingTask extends TaskBase { mode: "racing"; action: "deliver"; destination: TownDestination; cargo: "apple" | "milk" | "ball" | "book" | "flower" | "water" }
export type PlaygroundTask = GardenTask | PetTask | RacingTask;
export type PlaygroundTaskByMode = { garden: GardenTask; pets: PetTask; racing: RacingTask };
export const playgroundInfo = {
  garden: { title: "小狐狸花园", subtitle: "听英语，让小花园长起来", label: "花园", theme: "animals", guide: "欢迎来到小狐狸花园。先听英语，选好种子或工具，再点亮着光的土地。也可以拖过去。" },
  pets: { title: "萌宠照顾小镇", subtitle: "听懂小伙伴的心愿", label: "萌宠", theme: "toys", guide: "小狗、小猫和小兔在等你。先听英语，选好用品，再点需要照顾的小伙伴。也可以拖过去。" },
  racing: { title: "英语欢乐赛车", subtitle: "开着小车，把礼物送到家", label: "赛车", theme: "delivery", guide: "小车带着礼物出发啦。先听英语，再点目的地，小车会沿着道路开过去。方向按钮和键盘也能开车。" },
} as const;
export const gardenPlants: PlaygroundOption[] = [
  { id: "carrot", en: "carrots", zh: "胡萝卜" }, { id: "tomato", en: "tomatoes", zh: "番茄" },
  { id: "sunflower", en: "a yellow sunflower", zh: "黄色向日葵" }, { id: "strawberry", en: "strawberries", zh: "草莓" },
  { id: "corn", en: "corn", zh: "玉米" }, { id: "rose", en: "a red rose", zh: "红色玫瑰" },
];
const gardenTools: PlaygroundOption[] = [{ id: "water", en: "water", zh: "浇水壶" }, { id: "basket", en: "basket", zh: "收获篮" }, { id: "shovel", en: "shovel", zh: "小铲子" }];
const gardenTasks: GardenTask[] = (["plant", "water", "harvest"] as const).flatMap(action => gardenPlants.map((plant, plot) => {
  const verb = action === "plant" ? "Plant" : action === "water" ? "Water" : "Pick";
  const object = action === "plant" ? plant.en : `the ${plant.en.replace(/^a /, "")}`;
  return { id: `garden-${action}-${plant.id}`, mode: "garden", action, plot, plant: plant.id as PlantId,
    target: action === "plant" ? plant.id : action === "water" ? "water" : "basket",
    promptEn: `${verb} ${object}.`, promptZh: `${action === "plant" ? "种下" : action === "water" ? "给" : "收获"}${plant.zh}${action === "water" ? "浇水" : ""}。`,
    options: action === "plant" ? gardenPlants : gardenTools };
}));
export const petItems: PlaygroundOption[] = [
  { id: "bone", en: "bone", zh: "骨头" }, { id: "fish", en: "fish", zh: "小鱼" }, { id: "carrot", en: "carrot", zh: "胡萝卜" },
  { id: "water", en: "water", zh: "水" }, { id: "soap", en: "soap", zh: "肥皂" }, { id: "bed", en: "bed", zh: "小床" }, { id: "ball", en: "ball", zh: "皮球" },
];
const pets = [{ id: "puppy", en: "puppy", zh: "小狗", food: "bone" }, { id: "kitten", en: "kitten", zh: "小猫", food: "fish" }, { id: "bunny", en: "bunny", zh: "小兔", food: "carrot" }] as const;
const petTasks: PetTask[] = (["feed", "drink", "wash", "sleep", "play"] as const).flatMap(action => pets.map(pet => {
  const target = action === "feed" ? pet.food : action === "drink" ? "water" : action === "wash" ? "soap" : action === "sleep" ? "bed" : "ball";
  const promptEn = action === "feed" ? `Give the ${pet.en} a ${target}.` : action === "drink" ? `Give the ${pet.en} some water.` : action === "wash" ? `Wash the ${pet.en}.` : action === "sleep" ? `Put the ${pet.en} to bed.` : `Play with the ${pet.en}.`;
  const promptZh = action === "feed" ? `给${pet.zh}${petItems.find(item => item.id === target)!.zh}。` : action === "drink" ? `给${pet.zh}喝水。` : action === "wash" ? `帮${pet.zh}洗澡。` : action === "sleep" ? `带${pet.zh}去睡觉。` : `陪${pet.zh}玩皮球。`;
  const options = action === "feed" ? petItems.filter(item => ["bone", "fish", "carrot", "water"].includes(item.id)) : petItems.filter(item => [target, "bone", "soap", "ball", "bed"].includes(item.id)).slice(0, 4);
  if (!options.some(item => item.id === target)) options[options.length - 1] = petItems.find(item => item.id === target)!;
  return { id: `pets-${action}-${pet.id}`, mode: "pets", action, pet: pet.id, target, promptEn, promptZh, options };
}));
export const townDestinations: PlaygroundOption[] = [
  { id: "farm", en: "farm", zh: "农场" }, { id: "school", en: "school", zh: "学校" }, { id: "park", en: "park", zh: "公园" },
  { id: "shop", en: "shop", zh: "商店" }, { id: "beach", en: "beach", zh: "海滩" }, { id: "home", en: "home", zh: "家" },
];
const cargos = [{ id: "apple", en: "apple", zh: "苹果" }, { id: "book", en: "book", zh: "书" }, { id: "ball", en: "ball", zh: "皮球" }, { id: "milk", en: "milk", zh: "牛奶" }, { id: "water", en: "water", zh: "水" }, { id: "flower", en: "flower", zh: "花" }] as const;
const racingTasks: RacingTask[] = [0, 1].flatMap(lap => townDestinations.map((destination, index) => {
  const cargo = cargos[(index + lap * 3) % cargos.length];
  return { id: `racing-${lap}-${destination.id}`, mode: "racing", action: "deliver", destination: destination.id as TownDestination, cargo: cargo.id, target: destination.id,
    promptEn: destination.id === "home" ? `Take the ${cargo.en} home.` : `Take the ${cargo.en} to the ${destination.id}.`, promptZh: `把${cargo.zh}送到${destination.zh}。`, options: townDestinations };
}));
export const playgroundTasks = { garden: gardenTasks, pets: petTasks, racing: racingTasks };
export const playgroundSpeech = { en: [...new Set(Object.values(playgroundTasks).flat().map(task => task.promptEn))], zh: Object.values(playgroundInfo).map(info => info.guide) };
export function getPlaygroundTask<M extends PlaygroundMode>(mode: M, round: number, index: number): PlaygroundTaskByMode[M] {
  const task = playgroundTasks[mode][index];
  if (!task) throw new Error("找不到这个游戏任务。");
  const options = [...task.options];
  // A new round changes the toolbox arrangement; scene locations remain familiar.
  const offset = (round + index * 5) % options.length;
  return { ...task, options: [...options.slice(offset), ...options.slice(0, offset)] } as PlaygroundTaskByMode[M];
}
