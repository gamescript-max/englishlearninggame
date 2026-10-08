# English Learning Game 独立部署

主域名：`https://englishlearninggame.online/`。核心关键词：`english learning game`。

本版本是独立的公开网页，访客无需 ChatGPT 账号或网站账号。Cloudflare 账号仅用于站长管理托管和已购买的域名。课程、图片、声音、游戏、本机录音回放、备份和离线功能均随部署包提供；学习记录不上传服务器。

## 本次交付状态

- 已生成独立网页及完整资源，入口为 `public-dist/index.html`。
- 首页预渲染的是空白学习档案的真实地图，包含搜索标题、简介、canonical、分享标签、WebSite 结构化数据、robots.txt 和 sitemap.xml。
- 离线副本带 `noindex`，不加入 sitemap；家长记录不会进入公开网页源码。
- 已修复完整离线清单中音效及许可证文件被白名单拒绝的问题。
- 本次浏览器操作由用户按 Esc 停止，尚未上传到 Cloudflare 或接入域名；原 Sites 网站的访问设置未修改。

## 上传到 Cloudflare Pages

1. 登录购买域名的 Cloudflare 管理后台，在 **Workers & Pages** 创建 **Pages** 应用，选择直接上传文件。
2. 项目名称可用 `englishlearninggame`，如果被占用则选择其他可用名称。
3. 上传 `artifacts/englishlearninggame-cloudflare.zip`，或上传整个 `public-dist` 目录。ZIP 根目录应直接包含 `index.html`、`assets`、`audio`、`images`，不要再套一层项目文件夹。
4. 部署后先使用 Cloudflare 返回的实际 `pages.dev` 地址检查地图、课程、声音、鱼、贪吃蛇、备份恢复和离线下载。
5. 在该 Pages 项目中进入 **Custom domains → Set up a domain**，输入 `englishlearninggame.online`。域名所在 Cloudflare zone 需要正常启用，并且和 Pages 项目处于同一 Cloudflare 账户。按后台提示创建/确认 DNS 记录，等待域名和 HTTPS 证书状态正常。
6. 可再接入 `www.englishlearninggame.online`，在 Cloudflare 域名规则中将它301跳转到主域名。先接入 Pages 自定义域名，不要只手工填写一个猜测的 CNAME 或 IP。

公开网页不需要添加 Cloudflare Access 登录门禁。

官方说明：[直接上传](https://developers.cloudflare.com/pages/get-started/direct-upload/)、[自定义域名](https://developers.cloudflare.com/pages/configuration/custom-domains/)。Pages 控制台直接上传限制为1000文件、每文件25MiB；构建脚本会检查这些限制。

## 后续重新构建

在 `english-island` 源码目录执行：

```sh
npm run build:public
```

脚本先构建最新离线课程，再构建并预渲染公开网页，最后复制所有 `public` 资源。`public-dist` 不含源代码、Sites 托管配置、密钥或设备学习档案。保留第三方署名文件 `THIRD_PARTY_NOTICES.txt` 和 `licenses/three.txt`。

更新后重新上传 `public-dist` 的内容。不要用 `npm run build:mobile` 的产物替代公开网站；它是安卓包入口，缺少完整网页离线配置。

本地检查构建后的同一版本可运行 `npm run preview:public`，地址为 `http://127.0.0.1:5173/`，无需 Cloudflare 登录。

## 切换网址前保存孩子的进度

在旧网站进入 **家长 → 导出 JSON 备份**；在新域名进入 **家长 → 恢复备份**，确认后继续学习。新旧域名的本地存储互不共享，不会自动迁移。声音和麦克风授权、主屏幕安装及离线课程也需要在新域名重新设置。更换域名不要求重打已有的本地 APK。

## 搜索展示

首页标题是 `English Learning Game for Kids | 萌宠英语探索岛`，简介介绍听力、词汇、贪吃蛇和海洋冒险。界面和语音指导继续以中文服务孩子，课程仍属于启蒙 / Pre-A1 扩展体验，不宣称通关就是达到完整 A1。

新域名 HTTPS 可正常打开后，在 Google Search Console 添加域名属性，按它生成的 TXT 记录验证，然后提交 `https://englishlearninggame.online/sitemap.xml` 并检查首页 URL。验证值必须用 Search Console 实际提供的值。收录和排名由搜索引擎决定，关键词及域名不能保证排名。

依据：[Google SEO 入门说明](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)。
