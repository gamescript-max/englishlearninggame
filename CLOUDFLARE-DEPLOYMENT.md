# English Learning Game 独立部署

主域名：`https://englishlearninggame.online/`。核心关键词：`english learning game`。

本版本是独立的公开网页，访客无需 ChatGPT 账号或网站账号。Cloudflare 账号仅用于站长管理托管和已购买的域名。课程、图片、声音、游戏、本机录音回放、备份和离线功能均随部署包提供；学习记录不上传服务器。

## 本次交付状态

- 已生成独立网页及完整资源，入口为 `public-dist/index.html`。
- 首页预渲染的是空白学习档案的真实地图，包含搜索标题、简介、canonical、分享标签、WebSite 结构化数据、robots.txt 和 sitemap.xml。
- 离线副本带 `noindex`，不加入 sitemap；家长记录不会进入公开网页源码。
- 已修复完整离线清单中音效及许可证文件被白名单拒绝的问题。
- 最初的浏览器操作由用户按 Esc 停止。随后用户在 Cloudflare 连接 Git 仓库，截图确认创建的是 Workers Builds；线上部署仍待重新构建验证，原 Sites 网站的访问设置未修改。

## 当前 Git 部署：Cloudflare Workers Builds

页面同时有“构建命令”和“部署命令”时，是 Workers Builds。当前 Worker 名称已由站长确认是 `englishlearninggame`，无需重新创建 Pages 项目。

后台 **Settings → Builds → Build configuration** 使用以下设置：

| 设置 | 值 |
| --- | --- |
| 构建命令 | `npm run build:public` |
| 部署命令 | `npm run deploy:public` |
| 根目录 | `/`（Git 仓库根目录） |
| 生产分支 | `main` |

保存后重新运行最新提交的构建。若后台有旧构建缓存，可先清除缓存。`deploy:public` 直接调用项目内锁定的 Wrangler 4.92.0，并通过 `--config wrangler.cloudflare.jsonc` 明确读取 Workers 静态资源配置。它只部署 `public-dist`，不使用 Sites 服务端、账号验证或数据库。已有 `_headers` 保留缓存及离线页面的 `noindex`；不存在的地址返回 `404.html` 和404状态。

此次 `ERESOLVE` 的原因是原部署命令 `npx wrangler deploy` 未指定现有的非默认配置文件，触发自动项目配置，尝试安装 `wrangler@latest`（4.148.0）。该版本要求 `@cloudflare/workers-types ^5.20261006.1`，与仓库锁定的 4.20260515.1 冲突。仓库的 Wrangler 4.92.0 和 types 4.20260515.1 本来兼容；无需使用 `--force` 或 `--legacy-peer-deps`。

本地构建及无上传预检：

```sh
npm run build:public
npm run deploy:public -- --dry-run
```

部署成功后，先打开后台实际给出的 `workers.dev` 地址验证，再在该 Worker 的 **Settings → Domains & Routes → Add → Custom Domain** 添加 `englishlearninggame.online`。域名需在同一 Cloudflare 账户的有效 zone 中；按后台提示完成 DNS 和证书配置。配置文件未预设域名路由，不会直接修改域名解析。

官方说明：[Workers Builds 配置与自动配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)、[静态资源及404页面](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/)、[静态资源响应头](https://developers.cloudflare.com/workers/static-assets/headers/)、[Workers 自定义域名](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)。

## 另一种托管方式：上传到 Cloudflare Pages

当前资源已超过控制台拖拽上传的1000文件限制。推荐继续使用上面的Workers Git自动部署；若另建Pages，请使用项目已安装的Wrangler上传文件夹，ZIP仅作归档和交付。

1. 登录购买域名的 Cloudflare 管理后台，在 **Workers & Pages** 创建 **Pages** 应用，选择直接上传文件。
2. 项目名称可用 `englishlearninggame`，如果被占用则选择其他可用名称。
3. 在项目目录运行 `node node_modules/wrangler/bin/wrangler.js pages deploy public-dist --config wrangler.public.jsonc`，按提示选择实际Pages项目。上传整个文件夹，不把ZIP传给Wrangler。
4. 部署后先使用 Cloudflare 返回的实际 `pages.dev` 地址检查地图、课程、声音、鱼、贪吃蛇、备份恢复和离线下载。
5. 在该 Pages 项目中进入 **Custom domains → Set up a domain**，输入 `englishlearninggame.online`。域名所在 Cloudflare zone 需要正常启用，并且和 Pages 项目处于同一 Cloudflare 账户。按后台提示创建/确认 DNS 记录，等待域名和 HTTPS 证书状态正常。
6. 可再接入 `www.englishlearninggame.online`，在 Cloudflare 域名规则中将它301跳转到主域名。先接入 Pages 自定义域名，不要只手工填写一个猜测的 CNAME 或 IP。

公开网页不需要添加 Cloudflare Access 登录门禁。

官方说明：[直接上传](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[自定义域名](https://developers.cloudflare.com/pages/configuration/custom-domains/)、[Workers静态资源限制](https://developers.cloudflare.com/workers/platform/limits/)。Pages控制台拖拽最多1000文件，Wrangler Pages及Workers免费套餐支持20000文件，单文件最多25MiB。构建脚本检查20000文件及25MiB，并在超过1000文件时提示使用Git或Wrangler。

## 后续重新构建

在 `english-island` 源码目录执行：

```sh
npm run build:public
```

脚本先构建最新离线课程，再构建并预渲染公开网页，最后复制所有 `public` 资源。`public-dist` 不含源代码、Sites 托管配置、密钥或设备学习档案。保留第三方署名文件 `THIRD_PARTY_NOTICES.txt` 和 `licenses/three.txt`。

Workers Git 集成更新后会构建 `main` 的提交；手工 Pages 上传则重新上传 `public-dist` 的内容。不要用 `npm run build:mobile` 的产物替代公开网站；它是安卓包入口，缺少完整网页离线配置。`wrangler.public.jsonc` 专供 Pages，`wrangler.cloudflare.jsonc` 专供当前 Workers 部署，不能混用。

本地检查构建后的同一版本可运行 `npm run preview:public`，地址为 `http://127.0.0.1:5173/`，无需 Cloudflare 登录。

## 切换网址前保存孩子的进度

在旧网站进入 **家长 → 导出 JSON 备份**；在新域名进入 **家长 → 恢复备份**，确认后继续学习。新旧域名的本地存储互不共享，不会自动迁移。声音和麦克风授权、主屏幕安装及离线课程也需要在新域名重新设置。更换域名不要求重打已有的本地 APK。

## 搜索展示

首页标题是 `English Learning Game for Kids | 萌宠英语探索岛`，简介介绍听力、词汇、贪吃蛇和海洋冒险。界面和语音指导继续以中文服务孩子，课程仍属于启蒙 / Pre-A1 扩展体验，不宣称通关就是达到完整 A1。

新域名 HTTPS 可正常打开后，在 Google Search Console 添加域名属性，按它生成的 TXT 记录验证，然后提交 `https://englishlearninggame.online/sitemap.xml` 并检查首页 URL。验证值必须用 Search Console 实际提供的值。收录和排名由搜索引擎决定，关键词及域名不能保证排名。

依据：[Google SEO 入门说明](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)。
