/* Only explicit course assets are cached. Login pages and private account requests are never cached. */
const PREFIX="fox-course-";
let download;
const validPath=url=>/^\/(offline\/(index\.html|assets-manifest\.json|assets\/[\w.-]+)|audio\/(?:effects\/)?[\w.-]+\.wav|images\/[\w.-]+\.(png|webp|svg)|icons\/[\w.-]+\.png|licenses\/three\.txt|manifest\.webmanifest|favicon\.svg)$/.test(url);
self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
async function completedCaches(){
  const names=(await caches.keys()).filter(name=>name.startsWith(PREFIX)).reverse();
  const result=[];
  for(const name of names){const cache=await caches.open(name);if(await cache.match("/__fox_pack_complete__"))result.push(cache);}
  return result;
}
async function status(){
  const packs=await completedCaches();
  if(!packs.length)return {ready:false};
  return {ready:true,...await (await packs[0].match("/__fox_pack_complete__")).json()};
}
async function checkResource(response,url){
  // Static hosting canonicalizes /offline/index.html to /offline/.
  // Accept exactly that same-origin shell redirect; auth and other redirects stay blocked.
  const canonicalShell=url==="/offline/index.html"&&response.url===`${self.location.origin}/offline/`;
  if(!response.ok || (response.redirected&&!canonicalShell)){const error=Error("课程资源需要重新登录或网络暂时不可用，请重试。");error.resource=url;error.status=response.status;throw error;}
  const mime=(response.headers.get("content-type")||"").toLowerCase();
  if(!url.endsWith(".html") && mime.includes("text/html"))throw Error("课程下载遇到了登录页面，请先重新打开网站。");
  if(url.endsWith(".html") && !mime.includes("text/html"))throw Error("离线页面下载失败。");
  if(url.endsWith(".html") && !(await response.clone().text()).includes('id="root"'))throw Error("下载到了登录或错误页面，请重新打开网站后重试。");
}
async function installPack(send){
  const response=await fetch("/offline-pack.json",{cache:"no-store",credentials:"same-origin"});
  await checkResource(response,"/offline-pack.json");
  const pack=await response.json();
  if(!/^[a-f0-9]{16}$/.test(pack.version)||!Array.isArray(pack.urls)||!pack.urls.length||pack.urls.length>2000||pack.urls.some(url=>typeof url!=="string"||!validPath(url)))throw Error("离线课程清单无效，请稍后重试。");
  const name=PREFIX+pack.version,cache=await caches.open(name);
  // An incomplete update never replaces the last complete pack.
  if(await cache.match("/__fox_pack_complete__")){send({type:"complete",...pack});return;}
  let done=0,position=0;
  async function worker(){while(position<pack.urls.length){const url=pack.urls[position++];
    // A retry keeps already validated resources from this exact course version.
    // No incomplete pack is ever used for offline navigation or playback.
    if(!await cache.match(url)){
      try{const resource=await fetch(url,{cache:"no-store",credentials:"same-origin"});await checkResource(resource,url);await cache.put(url,resource);}
      catch(error){error.resource??=url;throw error;}
    }
    send({type:"progress",done:++done,total:pack.urls.length});
  }}
  const results=await Promise.allSettled(Array.from({length:4},worker));
  const failed=results.find(result=>result.status==="rejected");
  if(failed)throw failed.reason;
  await cache.put("/__fox_pack_complete__",new Response(JSON.stringify({version:pack.version,bytes:pack.bytes,total:pack.urls.length,at:Date.now()}),{headers:{"content-type":"application/json"}}));
  // Delete older complete assets only once this full version is available.
  for(const old of await caches.keys())if(old.startsWith(PREFIX)&&old!==name)await caches.delete(old);
  send({type:"complete",...pack});
}
self.addEventListener("message",event=>{
  const port=event.ports[0];if(!port)return;
  const send=data=>port.postMessage(data);
  if(event.data?.type==="STATUS")event.waitUntil(status().then(data=>send({type:"status",...data})).catch(()=>send({type:"status",ready:false})));
  if(event.data?.type==="DOWNLOAD"){
    if(download){send({type:"error",message:"课程正在另一个页面下载，请稍后查看。"});return;}
    download=installPack(send).catch(error=>send({type:"error",message:(error.message||"下载没有完成，已有离线包仍然保留。")+(event.source?.url?.includes("demo=1")&&error.resource?` [测试资源 ${error.resource} · ${error.status??"network/cache"}]`:"")})).finally(()=>{download=undefined;port.close();});
    event.waitUntil(download);
  }
});
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=="GET"||url.origin!==self.location.origin)return;
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(event.request).catch(async()=>{
      for(const cache of await completedCaches()){const page=await cache.match("/offline/index.html");if(page)return page;}
      return new Response("尚未下载离线课程。请联网打开探索岛，在家长页下载后再离线使用。",{status:503,headers:{"content-type":"text/plain;charset=utf-8"}});
    }));return;
  }
  if(!validPath(url.pathname))return;
  event.respondWith((async()=>{
    for(const cache of await completedCaches()){const asset=await cache.match(url.pathname);if(asset)return asset;}
    return fetch(event.request);
  })());
});
