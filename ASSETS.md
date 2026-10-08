# 素材来源与许可说明

记录日期：2026-10-04；当前海洋素材说明更新于 2026-10-05。图片使用内置 `image_gen` 按本项目的原创描述生成；未直接复制参考仓库的角色、场景、词图或音频。图像用于本项目，未使用剑桥官方考试图、原题、认证标识或其他品牌角色。

## 大海域背景（2026-10-04）

`public/images/archipelago-ocean-v1.png` 是本项目通过内置 `image_gen` 一次生成的原创整幅卡通海域背景。最终保存路径：`D:/project/englishlearning/english-island/public/images/archipelago-ocean-v1.png`。1536 × 1024、RGB 不透明 PNG，2,009,589 bytes；保留工具原始输出，没有裁切、重排或修改像素。

海域稍俯视、没有水平地平线，具有青蓝水纹、海流与空间层次，少量礁石、浅水和绿叶位于边角。中央是开放水面，不含主题学习岛、建筑、人物、文字或路线。网页以 `center / cover` 铺满整张地图，另叠加十二座主题小岛、学习路线、标签与乐乐。已检查宽屏及窄屏实际合成效果。

SHA256：`fdff08955f483c1679c7b286d8cbc654e572156346558cc5e1d575ff2e1a3ddd`。

内置工具完整生成提示词如下：

```text
Use case: illustration-story.
Asset type: ONE opaque PNG background illustration, landscape 1536 × 1024, for a children's island adventure map. This is the ocean BACKDROP layer; separate transparent destination islands and route labels will be placed over it in code.

Primary request: Paint a large, immersive, cheerful cartoon SEA viewed from a high slightly isometric bird's-eye camera. The water fills the entire image from edge to edge. No horizontal horizon line, no sky band. Make the scale feel like one continuous broad sea rather than a small puddle or tiled texture.

Style: polished original soft rounded 3D children's storybook game illustration matching bright miniature grass-and-sand island dioramas. Luminous turquoise and aqua water, gentle warm sunlight from the upper left, friendly and relaxing. The water has broad naturally flowing color variations, softly modeled depth, subtle underwater sand-bank tones near the perimeter, and smooth flowing current shapes. Include scattered restrained organic ripples and just a few delicate thin white foam arcs near the far edges. The surface must read clearly as water with spatial depth and hand-crafted cartoon detail, not as a flat gradient, blank solid color, noisy photograph or repeated grid.

Composition: Keep roughly the CENTRAL 85% of the image entirely open, low-contrast clean WATER, with only subtle ripples and broad gentle currents. This is usable negative space for overlaying twelve separate theme islands, a winding learning path and text. Any scenery is confined to the outermost edges and corners: perhaps a few tiny rounded reef rocks partly submerged at the far lower-left and far upper-right corner, tiny pale sandy shoreline slivers at the very corners, minimal green foliage barely peeking in from one edge. These perimeter decorations must be SMALL and sparse, occupying less than 10% of the whole image and never framing the map with a solid land border. The central area must have NO LAND, NO OBJECTS and NO prominent bright highlights. Water remains continuous behind every possible destination.

Constraints: Full opaque image, not transparent. Do not draw the twelve theme islands or any large islands/continents. No buildings, houses, huts, boats, docks, schools, landmarks, character/animal/fish, people, foxes, compass, course emblems, giant foreground leaves, visual map grid, route lines, buttons, user interface, labels, text, letters, numerals, logos or watermarks. Do not reproduce any reference island layout. The only subject is a beautiful BIG calm cartoon ocean with subtle depth and very sparse peripheral reefs.
```

## 原有图像资产

| 文件 | 输出格式与尺寸 | 用途 |
| --- | --- | --- |
| `public/images/fox.png` | 1254 × 1254，RGBA，透明背景 | 小狐狸伙伴“乐乐” |
| `public/images/island-six.png` | 1536 × 1024，RGB，3 列 × 2 行 | 六岛地图，依次动物、食物、玩具、泡泡、快递、连线 |
| `public/images/island.png` | 1586 × 992，RGB，不透明 | 探索地图场景 |
| `public/images/words.png` | 1536 × 1024，RGBA，6 列 × 4 行，每格 256 × 256 | 初次学习的 24 个词图 |
| `public/images/words-review.png` | 1536 × 1024，RGBA，相同 6 × 4 网格 | 隔日复习的全新实例词图 |
| `public/images/snake-heads.png` | 1254 × 1254，RGBA，2 列 × 2 行 | 新的小蛇头部方向图集；向上姿态使用右向图旋转以确保朝向明确 |
| `public/images/scene-furniture.png` | 1774 × 887，RGBA，2 列 × 1 行 | 听音选场景的桌子与开口盒子，组合原有球和熊词图 |

`fox.png` 提示词摘要：面向 6–9 岁英语冒险游戏的全身橙色狐狸，奶油白脸和肚子，青绿背包，大眼、友善微笑，一只爪子挥手；柔软 3D 玩具插画，正中留白，耳朵、尾巴和脚完整，透明背景，无文字、logo 或水印。

`island.png` 提示词摘要：宽幅儿童冒险群岛，左侧动物森林、食物营地和玩具小屋，青蓝海洋与蓝绿天空，蜿蜒路径、桥、圆树、小帐篷；稍俯视的柔软 3D 场景，海面留出空间叠加网页关卡节点，无文字、按钮或界面元素。

`words.png` 提示词摘要：24 个柔软 3D 儿童教材图标，在 6 × 4 等格内居中留空、不跨格，透明背景，无文字、数字和格线。牛奶为白色，水为清水，果汁为橙汁，保持语义区分。固定顺序从左到右、从上到下：

```text
cat       dog       bird       fish       frog        duck
horse     rabbit    apple      banana     orange      bread
milk      water     juice      cake       ball        doll
kite      robot     bike       train      teddy bear  toy car
```

`words-review.png` 提示词摘要：使用同一词序和网格生成全新实例，用于观察迁移识别。动物改为灰纹猫、黑白狗、绿黄鸟、蓝绿鱼、侧跳蛙、绿头鸭、灰马和棕兔；食物改为绿苹果、剥皮香蕉、半橙、切片面包、白奶瓶、清水矮杯、橙汁壶和缺角粉红蛋糕；玩具改为篮球、蓝裙娃娃、新风筝、黄色机器人、蓝色辅助轮车、蓝火车、奶油熊和绿色玩具汽车。保持柔软 3D 风格、准确词义、透明留空，无文字、数字和格线。

初版三张图一次并行生成，复习词图单独生成一次；没有通过裁切或重排改变 atlas 顺序。生成后完成视觉顺序检查及透明边角抽样。每个词的 spriteIndex 对应同一格；复习只切换整张词图。

`island-six.png` 提示词摘要：青蓝海洋中的六个原创柔软 3D 小岛，3×2 均匀布局，依次为动物森林、食物营地、玩具小屋、泡泡海湾、快递码头和连接词图的桥梁乐园；留白给页面标签，不含文字、logo 或界面。通过内置 image_gen 一次生成，保留原三岛图供源码参考。

`scene-furniture.png` 使用内置 image_gen 单次生成，保留原始透明通道及尺寸，未后期修改插图。组合位置依生成后的桌面、桌腿和盒口实际位置设置；盒子前沿使用同图前侧遮挡层。生成提示词如下：

```text
Use case: scientific-educational
Asset type: transparent PNG sprite atlas for a children's English in/on/under learning game.
Primary request: Create a 2:1 landscape sprite atlas, ideally 1536x768 pixels, consisting of TWO equal SQUARE cells side by side, with absolutely no visible cell border or grid. Genuine alpha transparency throughout the empty canvas. Each cell contains only one piece of furniture, front view, both at identical scale and with feet or base aligned to floor y=90% of its square cell.
Left square cell: a cute simple wooden TABLE. Broad thin horizontal tabletop spans x=15% to x=85%, tabletop top at y=45% and tabletop bottom at y=52%. Two straight sturdy legs centered at x=18% and x=82%, descending to y=90%. Entire space above the tabletop is perfectly clear and transparent, and the large area BETWEEN the two legs is perfectly clear and transparent. The tabletop must be suitable for compositing a separate toy at y=8% to y=45%, and the space under the table must accept a separate toy at y=56% to y=88%. No crossbar or third/fourth visible leg blocking this open central space.
Right square cell: an EMPTY OPEN-TOP cardboard BOX, front view with slight overhead perspective. Visible empty hollow interior and clean simple rim, no lids or outward flaps. Opening centered at x=25% to x=75%, y=38% to y=57%, with back rim at y=39%. Plain front panel spans x=15% to x=85%, y=58% to y=90%. The box is totally empty.
Style/medium: rounded soft children's picture book and clay-like illustration, friendly readable thick dark brown outlines, warm orange brown wood and cardboard, gentle warm shading, simple clean forms.
Constraints: Clear consistent geometry matching the coordinates. Exactly one table in the left cell and one box in the right cell. No objects, toys, animals, people, decorations, text, letters, numbers, logos, watermarks, grid, borders, background scenery, ground plane, or cast shadow outside the objects. All blank regions including above and between table legs are genuine alpha transparency, not a painted checkerboard. Retain actual alpha in PNG. Objects entirely within their own square cells.
```

## 教学语音、音乐与音效

当前自然女声与音乐的再生成脚本位于 `scripts/teacher-audio/`，入口是 `reproduce.ps1 -InstallDependencies -Python <python路径>`。`sources/manifest-original.json` 保留原版所有文本和文件 ID，三个原有音效也保留在 `sources/effects/`；索引以 `public/audio/manifest.json` 和相同的 `lib/audio-manifest.json` 为准。生成输出与依赖目录已忽略，重新生成后需明确把输出复制到 `public/audio/` 并同步两个索引。原 Windows 桌面声音脚本只作为历史来源保留，运行它们会覆盖自然女声。

- 英语：`en-US-JennyNeural`，语速 -12%，pitch +0Hz；162 条固定英语。
- 普通话：`zh-CN-XiaoxiaoNeural`，语速 -7%，pitch +0Hz；37 条固定指导。
- 通过 [edge-tts](https://github.com/rany2/edge-tts) 7.2.8 一次性生成语音，并转换为单声道 PCM WAV、22,050 Hz、16 bit。声音名称参考 [Microsoft 文档](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts)。这是合成女声，并非幼师真人录音；没有发送孩子录音。
- 八首音乐是 `compose-music.py` 以数学振荡器、泛音、包络和原创旋律合成的 16 小节循环；世界、动物、食物、玩具、泡泡、快递、连线和接星星的旋律/节拍/音色不同，无下载歌曲或外部采样。
- 三个原有反馈音效原样保留。

共 210 个 WAV。全套格式、时长、非静音、峰值、零削波、不同文件哈希和音乐循环边界已验证；报告为 `scripts/teacher-audio/verification-report.json`。原有 198 个文本键和文件路径全部保留；新增接星星说明为 `zh-037.wav`。未逐条完成人工听辨校对。

`snake-heads.png` 由内置 imagegen 按原创提示一次生成：同一友善绿色小蛇头的上/右/下/左四姿态，大眼睛、薄荷脸颊，柔软玩具风，透明 2×2 等格，无文字或背景。输出保留原始 alpha；上向图不够明确，实际网页使用右向图旋转 -90 度。其余姿态直接使用对应格，无图像后处理。

## 开源依赖与参考

[Howler.js](https://github.com/goldfire/howler.js) 用于播放控制、音乐与音效，采用 MIT 许可，版权归 James Simpson 与 GoldFire Studios, Inc.（2013–2020）。完整许可随依赖保存在 `node_modules/howler/LICENSE.md`，发布和再分发时保留该版权及许可声明。

[Lucide](https://github.com/lucide-icons/lucide) 用于网页功能图标，采用 ISC 许可；完整声明见 `node_modules/lucide-react/LICENSE`。其他 npm 依赖按各包所附许可分发。
`THIRD_PARTY_NOTICES.txt` 在源码中保留 Howler 和 Lucide 的完整许可及署名。

[Voice Games](https://github.com/scaredofthesix/voice-games) 和 [Antura](https://github.com/vgwb/Antura) 只用于研究语音练习反馈与儿童游戏体验，本项目没有复制其代码或素材。后续如果复用，应记录具体资源、来源、许可和所需署名，不能将整个参考仓库的许可直接套用于单个未知来源资源。

课程定位与词汇参考 [剑桥少儿英语说明](https://www.cambridgeenglish.org/qualifications-young-learners/) 和 [官方词表](https://www.cambridgeenglish.org/Images/506166-starters-movers-flyers-word-list-2025.pdf)。课程任务为本项目编写，不使用考试原题，也不宣称得到剑桥认证。

## 新增学习资源（2026-10-04）

expanded-words-base.png 和 expanded-words-review.png 各1586×992透明PNG，均通过内置imagegen一次生成。40词按家庭/学校/身体/日常/天气顺序；两套实例不同。原图各行高度并非严格等分，所以按lib/learning-art-regions.json的实际透明边界用CSS显示，保留6px余量，不改图像像素。review的classroom原图右边缘有轻微原生裁边，已记录。完整提示词在scripts/teacher-audio/learning-art-prompts.json。

新增教学音频采用en-US-JennyNeural与zh-CN-XiaoxiaoNeural，温和减速，固定PCM WAV22050Hz单声道16bit。非静音、零削波、引用与文本覆盖已自动检查，逐条人工试听尚未完成。报告在scripts/teacher-audio/learning-*。桌面192/512PNG图标由现有原创favicon.svg正常矢量导出。

## 十二目的地群岛图集（2026-10-04）

`public/images/destination-islands-v1.png` 是本项目通过内置 `image_gen` 生成的原创素材。工作区保存路径为 `D:/project/englishlearning/english-island/public/images/destination-islands-v1.png`；原始输出为 1536 × 1024、RGBA 透明 PNG，2,513,418 bytes。生成一次十二岛图集后，再用内置工具做一次只调整尺寸、排布和留白的修正；采用修正后的原始 PNG，没有使用 Pillow 或其他图像工具裁切、缩放、重排或修改像素。

图集按 4 列 × 3 行，从左到右、从上到下依次为：动物森林、食物营地、玩具小屋、泡泡海湾、快递码头、连线乐园、星星草地、家庭花园、学校书屋、身体运动场、日常生活、天气风车。各岛具有独立岸线和可放置角色的前左草坪，图像不包含目的地标签、文字、数字、狐狸或人物；标签、学习路线及乐乐位置由网页绘制。

实际生成的纵向间距略不等分，使用 SVG 原图视窗显示，不修改 PNG。每个目的地的源视窗为 `384 × 325`，零基索引 `index` 对应 `x = (index % 4) * 384`、`y = [35, 350, 670][Math.floor(index / 4)]`，即 `viewBox="x y 384 325"`；原图 `<image>` 保持 `width="1536" height="1024"`。这些视窗包含完整主题主体，不引入相邻小岛。

视觉检查确认十二个主题、岸线和角色站位留白。只读 alpha 检查得到范围 0–254，其中 838,884 像素完全透明；所有 alpha > 20 的像素均位于上述源视窗范围内，水平间隔行 y=340、350、355、660、665 为完全透明。未将透明检查作为图像编辑步骤。

SHA256：`5f7b48393055e94a4642b439d33d8f7153dc7a381caa493531fb5899e6d34b25`。

最终修正调用使用上一张原创十二岛输出作为编辑参考，`transparent_background: true`，完整提示词如下：

```text
Use case: precise-object-edit.
Edit this transparent 12-island sprite atlas. Preserve all twelve island themes, their exact row-major order, cartoon 3D storybook art, colors, landmark details, clear front-left grassy terrace and isometric camera angle. Change ONLY the atlas packing, scale and spacing.

CRITICAL: Make a strict equal-cell 4 COLUMN × 3 ROW atlas. Reduce every complete island diorama's rendered size, uniformly to about 75% of its current size, so the entire island INCLUDING its highest treetop, highest flag/clock/rainbow, lowest rocks, boat, dock and bubbles fits inside its own equal cell. Center every island inside its own cell. Leave at least 12% of the cell width and at least 10% of the cell height completely transparent on EVERY SIDE. There must be a wide, clearly empty horizontal gutter between each of the three rows; no tall flag, treetop or roof from one row can enter the next row. Likewise generous empty transparent vertical gutters between all four columns. Do not let any ornament touch any image boundary. All twelve islands must remain similarly sized. Exact order: forest, food camp, toy cabin, bubble pool; delivery dock, rope bridge playground, star meadow, family garden; school and books, sports field, daily house and clock, weather windmill and rainbow.
The backdrop must be actual alpha transparency, not colored, blurred, white, checkerboard or textured. Any existing colored background must be completely removed. No ocean, words, letters, numerals, people, foxes, grid lines, labels, borders, logos or watermark. This must be ONE usable original sprite sheet PNG with 12 clearly separated complete island sprites.
```

## 初版历史角色素材（2026-10-05）

本次两张角色图集通过内置 `image_gen` 按本项目原创提示生成，采用 `transparent_background: true`。鱼图尝试了两张候选后，选用第三次新生成的结果；候选未进入项目。蛇图单次生成。两张最终 PNG 均保留工具原始尺寸和 alpha，没有使用 Pillow、SVG 或 shell 绘制、裁切、缩放、重排或编辑图片像素；下述边界检查只读取原图。

| 文件 | 格式与尺寸 | 文件大小（bytes） | SHA256 |
| --- | --- | ---: | --- |
| `public/images/adventure-fish-v1.png` | 1536 × 1024，RGBA，4 列 × 3 行 | 1,736,704 | `7ded2a53e0618647e87971f34dbf9d405d027bda11b3ebadc0e8d4cde1e441a1` |
| `public/images/adventure-snakes-v1.png` | 1536 × 1024，RGBA，3 列 × 2 行 | 1,646,866 | `f84c405cef15425d0b5177501239894c2de315015a49dd3479fe00cceb3206f9` |

文件分别保存于 `D:/project/englishlearning/english-island/public/images/adventure-fish-v1.png` 与 `D:/project/englishlearning/english-island/public/images/adventure-snakes-v1.png`。该版素材的源矩形保存在 `lib/adventure-art.json` 中的 `fish`（12 项）和 `snake`（6 项），格式为 `{x,y,w,h}`；初版网页按 SVG 视窗读取完整原图，保留形体比例。矩形依据各格实际 alpha > 20 主体边界加 8px 余量，并限制在原格内；实际生成留白未完全达到提示中的每边 15%，所以不假定所有主体占用范围均匀，也不裁切原 PNG。该鱼图作为历史出处保留，当前海洋渲染使用下述写实图集。

鱼图索引从左到右、从上到下：0 小橙鱼、1 中青鱼、2 大紫鱼、3 小友好淡蓝鲨鱼；4 大蓝鲨鱼、5 超级金色鲨鱼、6 红色任务小鱼、7 蓝色任务小鱼；8 黄色任务小鱼、9 绿色任务小鱼、10 圆润橙色河豚障碍鱼、11 深蓝巡游鲨鱼。全部为完整右向角色，无鲸鱼。成长阶段是游戏中的幻想变身，不作为生物演化知识教学。

蛇图索引从左到右、从上到下：0 红色蛇头、1 黄色蛇头、2 绿色蛇头；3 红色身体节、4 黄色身体节、5 绿色身体节。三只蛇头全部向右，带短颈连接位置；身体节为无脸、无尾的单个立体圆润形体，可通过位置与旋转组合为连续蛇。两图均没有海背景、文字、数字、品牌角色或水印。

视觉检查确认所有角色完整、朝向及颜色顺序正确、眼睛和表情柔和。两图 alpha 范围均为 0–254；鱼图 1,090,016 像素完全透明，蛇图 1,078,397 像素完全透明。鱼图 12 格和蛇图 6 格边界的 alpha > 20 像素计数均为零；JSON 的项数、字段、整数坐标、图片范围与主体覆盖检查通过，每格源矩形外的显著主体像素计数为零。

### 鱼图最终完整生成提示词

```text
Create ONE original TRANSPARENT PNG sprite sheet, landscape 1536×1024. Exactly 12 friendly soft 3D cartoon ocean creatures in a FOUR COLUMN × THREE ROW invisible grid.
Each cell contains only ONE creature. Every creature is centered and uses at most 65% of its cell width and at most 60% of its cell height. All tails, noses, fins, belly and puffer nubs remain fully inside this small centered footprint. Each cell has wide genuinely transparent margins. NONE may touch or cross any cell edge. Do not vary the sprite-sheet footprint even for the “large” creatures; large/small refer to their design stage, and will be resized in the game.
All creatures face RIGHT in a clear full-body horizontal side profile, tail left, nose right. Polished children's storybook 3D, smooth tactile shading, warm upper-left light, rounded shapes, large cheerful eyes, clean silhouettes. No outline noise, no colored halo. Kind friendly mouths without exposed teeth.
Exact row-major order:
Top row: orange baby fish; cyan fish; purple chunky fish; small pale-blue shark.
Middle row: bright-blue shark; golden-yellow super shark; red mission fish; blue mission fish.
Bottom row: yellow mission fish; green mission fish; round orange spotted puffer fish with soft small nubs; dark navy-blue patrol shark.
Do not draw whales. Sharks have a recognizable dorsal fin and complete shark tail. Mission fish have clearly distinct pure red/blue/yellow/green body colors and simple round fins. Every whole creature is present exactly once.
Backdrop is genuine alpha transparency, completely empty everywhere outside the silhouettes. No ocean or water, bubbles, seabed, shadows on a ground, scene or large background objects. No labels, letters, numbers, text, grid, outlines around cells, people, accessories, logos or watermark. Exactly twelve isolated complete right-facing sprites.
```

### 蛇图最终完整生成提示词

```text
Use case: illustration-story.
Asset type: ONE original transparent PNG sprite atlas for a children's continuous snake learning game. Landscape 1536 × 1024 recommended, EXACTLY THREE COLUMNS by TWO ROWS of equal SQUARE cells. Six individually isolated sprites; no scene or UI.

Style: polished soft rounded 3D children's storybook creatures. Friendly tactile toy-like surfaces, clear volume, subtle upper-left warm highlights, saturated colors, gentle shadows INSIDE the forms only. Readable smooth silhouettes, cheerful big eyes. Match a bright playful grass-island/ocean educational game, never frightening or realistic.

TOP ROW: three friendly SNAKE HEAD sprites, HEAD ONLY with a short rounded neck stub at the left, all facing RIGHT in full side profile. The nose points to the right and the back of the head to the left. Full head and eyes clearly visible, kind small smile, no exposed teeth, no long protruding tongue, no body coil or tail. Same silhouette, proportions, camera angle and size for all three. First head RED with cream underside; second head YELLOW with cream underside; third head GREEN with cream underside.

BOTTOM ROW: three matching SNAKE BODY SEGMENT sprites, one red, one yellow, one green, in the same column order as their heads. Each body segment is ONE single rounded plump slightly horizontal capsule or rounded cube-like pill, with smoothly shaded dimensional color and a soft lighter cream underside. These are generic repeatable middle segments that will be joined to the heads to form a continuous snake. No head, face, eyes, tongue, limbs or tail on body segments. Single connected clean form only, no floating decorative spots or detached pieces. Three body segments use identical geometry and size, and matching head color and lighting.

Packing: center each COMPLETE sprite inside its own cell, with at least 15% of the cell width and 15% of the cell height COMPLETELY TRANSPARENT on EACH side. No part, highlight or shadow may touch the cell boundary. All six sprites stay separate with generous empty gutters. Exactly one sprite per cell. Shapes must stay entirely complete.

Backdrop: genuine clean alpha transparency, not colored, white, blurred or painted checkerboard. No colored halos, no cast shadows on a surface, no ground, water, plants, background, scene, grid outlines, cell borders, labels, letters, numbers, words, logos or watermarks. No additional snake parts. Six complete usable sprites in the exact specified order.
```




## 初版历史固定语音（2026-10-05）

新增18条完整英语指令（颜色、数量1–3、small/big）与5条中文操作说明，文件为 `public/audio/adventure-en-001.wav` 至 `adventure-en-018.wav`、`adventure-zh-001.wav` 至 `adventure-zh-005.wav`。另复用24条原有完整词图指令。英语使用 en-US-JennyNeural，中文使用 zh-CN-XiaoxiaoNeural；均为预生成固定PCM WAV，22050Hz单声道16bit，不使用孩子录音，也不在运行时调用云TTS。

可复现的文本在 `scripts/teacher-audio/adventure-texts.json`，生成脚本为同目录 `adventure-audio.py`，检查报告为 `adventure-verification-report.json`。两份音频manifest已同步新增文本、时长与revision。全部新增文件通过RIFF格式、时长、非静音和零削波校验；逐条人工听辨尚未完成。游戏吃食物的轻音效使用独立播放通道，不取消英语示范。

## 连续冒险生态素材扩展（2026-10-05）

本节 `ocean-species-a.png`、`ocean-species-b.png` 是旧版海洋渲染图集，保留原文件、提示词和出处记录，当前海洋画面与图鉴已改用下述 `natural-ocean-*` 写实图集。

新增四张原创软立体卡通 PNG 图集，均由内置 image_gen 按原创描述各生成一次，未引用其他作品图片，未后期编辑或重新保存原 PNG：

| 文件 | 内容 |
| --- | --- |
| [ocean-species-a.png](./public/images/ocean-species-a.png) | 95 个海洋条目的第 0–47 项 |
| [ocean-species-b.png](./public/images/ocean-species-b.png) | 第 48–94 项，最后一格空白 |
| [snake-breeds-v2.png](./public/images/snake-breeds-v2.png) | 8 个蛇头及 8 个对应身体节 |
| [adventure-cards-v2.png](./public/images/adventure-cards-v2.png) | 16 个新增植物、交通和家居图卡 |

四图均为 1536×1024 RGBA。完整生成提示词保存在 [ecology-art-prompts.json](./scripts/ecology-art-prompts.json)；原图哈希、透明度测量及主体坐标来源在 [ecology-art-source.json](./lib/ecology-art-source.json)，运行时源矩形在 [ecology-art.json](./lib/ecology-art.json)。读取实际主体边界，不假设插图严格停留在等分格内；海洋索引 55、64 通过运行时水平翻转显示，不修改原图。80 种英语图卡还复用原课程和学习扩展的原创图集。

95 个生物／形态的英文名称及现实、已灭绝、神话标记在 [adventure-catalog.ts](./lib/adventure-catalog.ts)，其中保留 FAO、FishBase、Smithsonian 和 Natural History Museum 等资料链接。大小梯队与跨物种变身属于游戏幻想，不作为生物学进化或真实食物链教学。

本轮固定语音新增 174 条，复用 112 条映射。沿用 en-US-JennyNeural 与 zh-CN-XiaoxiaoNeural；输入文本、生成脚本和机器检查见 [ecology-texts.json](./scripts/teacher-audio/ecology-texts.json)、[ecology-audio.py](./scripts/teacher-audio/ecology-audio.py) 和 [ecology-verification-report.json](./scripts/teacher-audio/ecology-verification-report.json)。网站播放固定 WAV，不使用孩子录音生成素材。机器校验覆盖格式、引用、非静音与削波；逐条人工试听未完成。

## 平直蛇头编辑（2026-10-05）

通过内置image_gen对原 `snake-breeds-v2.png` 进行一次编辑，八个蛇头改为水平朝右，无竖起或S形颈部；第二行保留对应身体花纹。最终原始输出为 [snake-breeds-flat-v3.png](./public/images/snake-breeds-flat-v3.png)，1536×1024 RGBA，原图字节未后处理。完整提示词在 [snake-flat-art-prompt.txt](./scripts/snake-flat-art-prompt.txt)，alpha与真实主体边界在 [snake-flat-art-source.json](./scripts/snake-flat-art-source.json)，运行时裁剪和SHA-256在 [snake-flat-art.json](./lib/snake-flat-art.json)。不按等分格裁剪，避免跨列主体被截断。

该轮旧版鱼类使用95张原始原创精灵，通过Canvas条带变形产生动作，没有重绘或修改PNG像素；当时的形变数学位于 [adventure-motion.ts](./lib/adventure-motion.ts)，可见主体使用6/10/14条带，主角18条带，减少动态时关闭形变。此处保留历史实现说明，当前鱼类图片与动作以下述写实素材说明为准。鱼卵、海星等保持主体辨认度，不统一当作有鱼尾的动物。固定语音复用已有80个英文词音频，没有请求在线合成。

## 历史海洋3D模型（2026-10-05，已退出运行路径）

旧版海域鱼群曾使用原创程序生成的体积网格：`lib/volume-fish-mesh.mjs` 构造13类带真实xyz、法线与顶点颜色的鱼身、鳍尾、眼睛；`lib/three-volume-fish.ts` 负责材质、高光、尾波和侧倾；`components/ocean-volume-layer.ts` 将透明GPU图层合成到海域，碰撞与英语操作沿用原引擎。造型是适合儿童的风格化模型，不承诺生物学尺度或物种鉴定准确度。该实现当时将原95张图用于图鉴与WebGL2不可用时的轻量回退，上节Canvas条带描述记录的是那一版回退。当前 Three.js 体积模型已退出运行路径，不再覆盖鱼类图片；这些说明仅作历史出处。

Three.js 0.180.0 为MIT许可，许可证随站点保留在 `public/licenses/three.txt`。[官方WebGLRenderer说明](https://threejs.org/docs/pages/WebGLRenderer.html)。网格与动画为本项目原创，未从开源鱼游戏复用模型。

## 历史鱼类自然皮肤（2026-10-05，当前渲染不用）

`public/images/fish-skin-atlas-v1.png` 是内置 imagegen 一次生成的原始1254×1254 PNG，未进行像素后处理。16格包括金鱼鳞、银蓝鳞、斑马条纹、孔雀虹彩、霓虹蓝红、斗鱼、鲤鱼、鳜鱼斑纹、鲨皮、金枪鱼、鳗鱼、虎鲸、蓝鲸、章鱼、龟甲与蝠鲼皮肤。完整提示词和原图哈希见 `scripts/fish-skin-atlas-prompt.txt`、`scripts/fish-skin-atlas-source.json`。

旧版皮肤包覆程序生成的立体身体，眼睛、鱼嘴、鳃缝和薄鳍分别着色；按造型家族复用皮肤，不宣称95种都有独立生物学精确模型。当时使用共享sRGB纹理，UV格内内缩2.5原图像素、关闭跨格mipmap；顶点颜色转linear一次，皮肤在顶点颜色之后混合，避免过白或重复乘色变黑。平缓水下光照保留纹理，斗鱼另用扇形尾、普通鱼鳃盖与鲨鱼多鳃缝。任务鱼保留清楚的红蓝黄绿。原纹理文件及出处作为历史记录保留，当前海洋图片渲染不使用这张皮肤图集。

## 当前海洋写实透明插画（2026-10-05）

当前海洋素材由内置 ImageGen（`image_gen`）按本项目原创提示词生成，为 AI 写实透明鱼类及水生生物插画，不是真实摄影，也不作为权威物种鉴定图。四张主图集覆盖 95 个海洋生物／形态条目，另有一张红、蓝、黄、绿任务鱼图集。现实生物采用自然外形与颜色；已灭绝生物与神话条目为想象性描绘，跨物种成长仍属于游戏幻想。

| 当前文件 | 格式与尺寸 | 内容 | 文件大小（bytes） | SHA256 |
| --- | --- | --- | ---: | --- |
| `public/images/natural-ocean-a-v1.png` | 1536 × 1024，RGBA，6 列 × 4 行 | 条目 0–23 | 2,102,862 | `6a9fd889fe8fde9a51052dda489af23c0c98d780fcc87c2cb9465949dfc8f7c2` |
| `public/images/natural-ocean-b-v1.png` | 1536 × 1024，RGBA，6 列 × 4 行 | 条目 24–47 | 2,065,276 | `683fb4d6d7c484df484d0f54c39d83d9c213675bd575606a253a874fa6aa08e4` |
| `public/images/natural-ocean-c-v1.png` | 1536 × 1024，RGBA，6 列 × 4 行 | 条目 48–71 | 2,030,234 | `b74255f59c0d2b0614544fcff308d9cd138fc752c8a09921a3144de546b6dc9f` |
| `public/images/natural-ocean-d-v1.png` | 1536 × 1024，RGBA，6 列 × 4 行 | 条目 72–94，最后一格空白 | 2,165,119 | `e663b7deecdb3183dba1e77690448958aa0d3515b42734833715a8033fc972e7` |
| `public/images/natural-ocean-colors-v1.png` | 1254 × 1254，RGBA，2 列 × 2 行 | 红剑尾鱼、蓝雀鲷、黄倒吊、绿光鳃鱼 | 1,103,160 | `f2a25818bf59cc28f5f76395865f877bc0480222662d44c3f90468bb44be9da8` |

五张 PNG 均从工具原始输出原样复制，保留原始尺寸、透明通道及字节，没有程序裁切、缩放、重排、背景去除、重新着色、合成或重新保存。完整原始输出路径、SHA256、透明度测量、条目顺序与主体边界记录在 `scripts/natural-ocean-origin.json`；来源清单中的字母 `e`／`natural-ocean-e-v1.png` 对应最终发布名 `natural-ocean-colors-v1.png`，二者为相同原图字节。完整生成提示词分别保存在 `scripts/natural-ocean-a-prompt.txt`、`scripts/natural-ocean-b-prompt.txt`、`scripts/natural-ocean-c-prompt.txt`、`scripts/natural-ocean-d-prompt.txt` 和 `scripts/natural-ocean-e-prompt.txt`。

运行时使用 `lib/natural-ocean-art.json` 的实际透明形状边界与各图原始尺寸，按源矩形读取完整原图并保持主体宽高比。边界来自只读的 alpha > 12 连通主体检查，加 2px 余量，并包含邻近的分离鱼鳍、触须等细节；少数主体越过名义等分格，矩形随完整形状扩展，避免截断鱼尾或鳍。A–D 的 alpha 范围为 0–254，颜色图为 0–255，全部具有实际零 alpha 背景；零 alpha 像素可能保留不可见 RGB 颜色，正常 RGBA 合成会忽略它们。边界测量与显示视窗不修改 PNG 像素。

海洋游戏、鱼类图鉴、入口展示与宝箱贴纸复用同一鱼种图片及源矩形；红蓝黄绿任务鱼使用各自独立的自然鱼种图片。游动时保持头部稳定，后半身到尾尖使用连续波形；近处最多3条较大邻鱼和玩家通过共享边界的纹理网格让原图鳍部像素伸展、收拢，不叠画通用鳍形，不改PNG文件。每条鱼相位和节奏独立，暂停冻结，减少动态单图显示。当前图片直接进入海洋渲染，旧 Three.js 体积模型及皮肤图集不再参与该运行路径。

## 海洋进食反馈与图鉴显示遮罩（2026-10-05）

进食嘴部动画通过原始鱼图的嘴部纹理网格短暂张合实现，沿用各鱼种外形，不新增通用嘴形，不修改PNG字节。每次成功进食播放 [eat.wav](./public/audio/effects/eat.wav)，由 [generate-eat-sound.py](./scripts/generate-eat-sound.py) 确定性数学合成柔和噪声与两次下颌接触声，不含真人或孩子录音，也未引用外部录音。文件为160ms、22050Hz单声道16-bit PCM WAV；两份音频manifest的 `effects.eat` 指向此文件。独立播放通道不会打断英语朗读。运行 `py -3 scripts/generate-eat-sound.py` 可重现，自动检查已确认首尾样本为0、非静音、无削波。

`natural-ocean-d-v1.png` 第三排的相邻主体边界有横向交叠：龙王鲸的源矩形含克拉肯鳍部，克拉肯含龙王鲸嘴尖，利维坦含鲲尾尖，鲲含利维坦嘴部及蛟龙尾部。运行时通过同一组显示遮罩排除这些邻图碎片，SVG图鉴与Canvas海域保持一致。以下区域使用各自源矩形的局部坐标 `[x, y, width, height]`；只读alpha > 12检查确认，与本体有效像素均无交集。

| 成长形态 | 海洋素材索引 | 排除的局部区域 |
| --- | ---: | --- |
| 17 龙王鲸 | 85 | `[242,0,24,49]` |
| 18 克拉肯 | 86 | `[0,104,24,42]` |
| 19 利维坦 | 87 | `[0,0,2,179]`、`[221,0,46,52]` |
| 20 鲲 | 88 | `[0,58,46,51]`、`[275,0,12,51]` |

遮罩与纹理形变只作用于显示映射，保持原图尺寸、字节、透明通道及上述SHA256不变。

## 四个新增海洋巨兽（2026-10-05）

`public/images/ocean-giants-v1.png`：1536×1024 RGBA，原图1633841 bytes，SHA256 `a25f622f597647a64b2ec0d838db43bedbf5aff6d9354d943e41882b9ba8c91f`。使用内置 `image_gen.imagegen` 生成并做一次布局修正，PNG原样复制；提示词在 `scripts/ocean-giants-prompt.txt`，源尺寸、裁切与alpha检查在 `scripts/ocean-giants-source.json`。四个完整独立主体横向朝右：沧龙、巨型上龙、原创深海玄龟、原创苍海巨龙。84.80%像素alpha为0，格间分隔均透明，主体不跨格，无独立大尾鳍；三个单像素边缘点如实记入检查。显示使用实际PNG纹理，没有用程序重画鱼或修改像素。

英文名4条 `/audio/giant-en-*.wav` 沿用 JennyNeural、语速-12%、22,050Hz单声道16bit PCM，2.16–2.55秒；非静音、零削波，两个manifest一致。复现脚本 `scripts/teacher-audio/giant-audio.py`，采样/时长/哈希报告 `scripts/teacher-audio/giant-verification-report.json`。本轮仅做波形、文本映射和格式检查，未进行人工主观试听；游戏回放已检查调用。

## 成长路线第25–28形态（2026-10-05）

海龙、波塞冬、海神兽、吞噬者复用 `natural-ocean-d-v1.png` 已有90、91、92、94号图像和各自固定英语音频，PNG尺寸、字节及SHA256保持不变。90号排除局部矩形 `[250,95,6,18]`，91号另排除 `[0,50,6,16]`；91、92号沿原图坐标折线 `(582,780)→(550,850)→(520,882)→(505,890)→(500,900)→(490,973)` 分别排除右侧、左侧邻图。只读连通域检查确认保留双方全部alpha>12本体像素。SVG图鉴与预隔离Canvas共用此遮罩；94号本体完整，无需排除。进食下颌参数按各自嘴缝设置，波塞冬采用较小人脸张合幅度，吞噬者只移动下颌及下排牙。
