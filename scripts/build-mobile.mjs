import { build } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const targetIndex = args.indexOf("--target");
const target = targetIndex === -1 ? "both" : args[targetIndex + 1];
if (!["mobile", "offline", "both"].includes(target)) throw new Error("--target 必须是 mobile、offline 或 both。");

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(path.join(directory, entry.name), relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

async function copyOptional(relative, output) {
  try {
    await cp(path.join(projectRoot, "public", relative), path.join(output, relative), { recursive: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function buildTarget(name) {
  const offline = name === "offline";
  const output = path.resolve(projectRoot, offline ? "public/offline" : "mobile-dist");
  const expected = offline ? path.resolve(projectRoot, "public", "offline") : path.resolve(projectRoot, "mobile-dist");
  if (output !== expected || !output.startsWith(`${projectRoot}${path.sep}`)) throw new Error("构建输出目录越出当前项目。");
  console.log(`[mobile] 构建 ${name} 静态入口 → ${path.relative(projectRoot, output)}`);
  await build({
    configFile: false,
    root: path.join(projectRoot, "mobile"),
    base: offline ? "/offline/" : "/",
    publicDir: false,
    plugins: [react()],
    resolve: { alias: { "@": projectRoot } },
    css: { postcss: projectRoot },
    build: { outDir: output, emptyOutDir: true, target: "es2020", sourcemap: false, reportCompressedSize: false },
  });
  if (offline) {
    const files = await listFiles(output);
    const hash = createHash("sha256");
    for (const file of files) hash.update(file).update(await readFile(path.join(output, file)));
    const manifest = { version: hash.digest("hex").slice(0, 16), urls: files.map(file => `/offline/${file}`) };
    await writeFile(path.join(output, "assets-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`[mobile] 离线入口 ${files.length} 文件，版本 ${manifest.version}；图片与音频由站点资源缓存共用。`);
  } else {
    await mkdir(output, { recursive: true });
    await cp(path.join(projectRoot, "mobile", "compatibility.html"), path.join(output, "compatibility.html"));
    await cp(path.join(projectRoot, "THIRD_PARTY_NOTICES.txt"), path.join(output, "THIRD_PARTY_NOTICES.txt"));
    for (const relative of ["images", "audio", "icons", "favicon.svg", "manifest.webmanifest"]) await copyOptional(relative, output);
    const files = await listFiles(output);
    console.log(`[mobile] APK 静态资源准备完成：${files.length} 文件，不含 Site 服务端或 offline 目录。`);
  }
}

if (target === "mobile" || target === "both") await buildTarget("mobile");
if (target === "offline" || target === "both") await buildTarget("offline");
