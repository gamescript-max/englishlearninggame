import { preview } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await preview({
  configFile: false,
  root,
  appType: "mpa",
  build: { outDir: path.join(root, "public-dist") },
  preview: { host: "127.0.0.1", port: 5173, strictPort: true },
});
server.printUrls();
