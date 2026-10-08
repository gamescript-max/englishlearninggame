import fs from "node:fs/promises";
import path from "node:path";
import {createHash} from "node:crypto";
const root=path.resolve(import.meta.dirname,"..");
const client=JSON.parse(await fs.readFile(path.join(root,"public/offline/assets-manifest.json"),"utf8"));
const urls=[...client.urls,"/offline/assets-manifest.json","/manifest.webmanifest","/favicon.svg","/licenses/three.txt"];
// Include nested effects/sprite directories as well as the original flat media.
async function collectMedia(folder) {
  const entries=await fs.readdir(path.join(root,"public",folder),{withFileTypes:true});
  for(const entry of entries) {
    const relative=`${folder}/${entry.name}`;
    if(entry.isDirectory()) await collectMedia(relative);
    else if(entry.isFile()&&/\.(wav|png|svg|webp)$/.test(entry.name)) urls.push(`/${relative}`);
  }
}
for(const folder of ["audio","images","icons"]) await collectMedia(folder);
let bytes=0;const hash=createHash("sha256");
for(const url of urls){const contents=await fs.readFile(path.join(root,"public",url.slice(1)));bytes+=contents.length;hash.update(url).update(contents);}
const pack={version:hash.digest("hex").slice(0,16),bytes,urls:[...new Set(urls)]};
await fs.writeFile(path.join(root,"public/offline-pack.json"),JSON.stringify(pack,null,2)+"\n");
console.log(`Offline course pack: ${pack.urls.length} files / ${(bytes/1048576).toFixed(1)} MB / ${pack.version}`);
