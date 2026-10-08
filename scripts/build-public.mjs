import { build } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "public-dist");
const ssrOutput = path.join(root, ".sites-runtime", "public-prerender");
const origin = "https://englishlearninggame.online";

// Build current offline assets first, including the shared audio and image pack.
execFileSync(process.execPath, [path.join(root, "scripts/build-mobile.mjs"), "--target", "offline"], { cwd: root, stdio: "inherit" });
execFileSync(process.execPath, [path.join(root, "scripts/offline-manifest.mjs")], { cwd: root, stdio: "inherit" });

for (const target of [output, ssrOutput]) {
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("构建目录越出当前项目。");
}
await mkdir(ssrOutput, { recursive: true });
const shared = {
  configFile: false,
  root: path.join(root, "web"),
  plugins: [react()],
  resolve: { alias: { "@": root } },
  css: { postcss: root },
};
await build({
  ...shared,
  publicDir: false,
  build: { ssr: path.join(root, "web/prerender.tsx"), outDir: ssrOutput, emptyOutDir: true, sourcemap: false, rollupOptions: { output: { entryFileNames: "prerender.mjs" } } },
});
const { renderGame } = await import(pathToFileURL(path.join(ssrOutput, "prerender.mjs")).href);
const initialMarkup = renderGame();
if (!initialMarkup.includes("今天，一起发现新朋友")) throw new Error("首页预渲染未生成可见的游戏地图。");

await build({
  ...shared,
  base: "/",
  publicDir: path.join(root, "public"),
  build: { outDir: output, emptyOutDir: true, target: "es2020", sourcemap: false, reportCompressedSize: false },
});
const htmlPath = path.join(output, "index.html");
const html = await readFile(htmlPath, "utf8");
if (!html.includes("<!-- GAME_PRERENDER -->")) throw new Error("首页缺少预渲染插入点。");
await writeFile(htmlPath, html.replace("<!-- GAME_PRERENDER -->", initialMarkup));
await copyFile(path.join(root, "THIRD_PARTY_NOTICES.txt"), path.join(output, "THIRD_PARTY_NOTICES.txt"));
await writeFile(path.join(output, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /*?*demo=\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(path.join(output, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>\n`);
await writeFile(path.join(output, "_headers"), `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n\n/offline/*\n  X-Robots-Tag: noindex, nofollow\n\n/sw.js\n  Cache-Control: no-cache\n\n/offline-pack.json\n  Cache-Control: no-cache\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`);
await writeFile(path.join(output, "404.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>找不到这个小岛 · 英语探索岛</title></head><body><h1>找不到这个小岛</h1><p><a href="/">回到探索地图</a></p></body></html>\n`);

async function filesIn(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(file));
    else if (entry.isFile()) files.push(file);
  }
  return files;
}
const files = await filesIn(output);
// Workers Builds deploys through Wrangler; the dashboard drag-and-drop limit does not apply.
if (files.length > 20000) throw new Error("资源数量超过 Cloudflare Workers 免费套餐的20000项限制。");
if (files.length > 1000) console.warn("资源超过1000项，请使用 npm run deploy:public 或 Git 自动部署上传。");
let bytes = 0;
for (const file of files) {
  const size = (await stat(file)).size;
  if (size > 25 * 1024 * 1024) throw new Error(`资源超过 Cloudflare 的25MiB限制：${path.relative(output, file)}`);
  bytes += size;
}
const pack = JSON.parse(await readFile(path.join(output, "offline-pack.json"), "utf8"));
for (const url of pack.urls) await stat(path.join(output, url.slice(1)));
console.log(JSON.stringify({ output, files: files.length, bytes, offlineResources: pack.urls.length, url: `${origin}/`, visitorLogin: false }));
