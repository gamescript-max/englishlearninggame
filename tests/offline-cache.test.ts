import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
function harness(customResources?:string[]){
  const events:Record<string,(event:any)=>void>={};
  const storage=new Map<string,Map<string,Response>>();
  let version="1234567890abcdef", fail="", disconnected=false,redirect="";
  const resources=customResources??["/offline/index.html","/offline/assets/app.js","/audio/word.wav"];
  const requests:string[]=[];
  const caches={keys:async()=>[...storage.keys()],delete:async(name:string)=>storage.delete(name),open:async(name:string)=>{if(!storage.has(name))storage.set(name,new Map());const bucket=storage.get(name)!;return {put:async(url:string,r:Response)=>bucket.set(url,r.clone()),match:async(url:string)=>bucket.get(url)?.clone()};}};
  const fetch=async(input:string|{url:string})=>{const url=typeof input==="string"?input:new URL(input.url).pathname;requests.push(url);if(disconnected)throw new Error("offline");if(url==="/offline-pack.json")return Response.json({version,bytes:100,urls:resources});if(url===fail)return new Response("Login needed",{headers:{"content-type":"text/html"}});const response=new Response(url.endsWith(".html")?'<html><div id="root"></div></html>':"course",{headers:{"content-type":url.endsWith(".html")?"text/html":url.endsWith(".js")?"text/javascript":"audio/wav"}});if(redirect&&url==="/offline/index.html")Object.defineProperties(response,{redirected:{value:true},url:{value:redirect}});return response;};
  const context=vm.createContext({URL,Response,fetch,caches,setTimeout,clearTimeout,self:{location:{origin:"https://fox.example"},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name:string,fn:(event:any)=>void)=>events[name]=fn}});
  vm.runInContext(fs.readFileSync("public/sw.js","utf8"),context);
  async function send(type:string){const messages:any[]=[];let wait:Promise<unknown>|undefined;events.message({data:{type},ports:[{postMessage:(m:any)=>messages.push(m),close:()=>{}}],waitUntil:(p:Promise<unknown>)=>wait=p});await wait;return messages;}
  async function request(path:string,navigate=false){let result:Promise<Response>|undefined;events.fetch({request:{url:`https://fox.example${path}`,method:"GET",mode:navigate?"navigate":"cors"},respondWith:(p:Promise<Response>)=>result=p});return result;}
  return {send,request,requests,storage,offline:()=>disconnected=true,redirectTo:(url:string)=>redirect=url,failAt:(bad:string)=>fail=bad,update:(bad:string)=>{version="fedcba0987654321";fail=bad;}};
}
test("explicit download creates an atomic complete pack, serves offline assets with revision queries and navigation",async()=>{
  const h=harness();assert.equal((await h.send("STATUS"))[0].ready,false);
  const messages=await h.send("DOWNLOAD");assert.equal(messages.at(-1).type,"complete");assert.equal((await h.send("STATUS"))[0].ready,true);
  h.offline();assert.match(await (await h.request("/",true))!.text(),/id="root"/);assert.equal(await (await h.request("/audio/word.wav?v=new"))!.text(),"course");
  assert.equal(await h.request("/account/private"),undefined);assert.equal(await h.request("/login"),undefined);
});
test("failed or auth-HTML course update preserves the previous complete pack and cannot report success",async()=>{
  const h=harness();await h.send("DOWNLOAD");h.update("/audio/word.wav");const result=await h.send("DOWNLOAD");assert.equal(result.at(-1).type,"error");assert.equal((await h.send("STATUS"))[0].version,"1234567890abcdef");
  h.offline();assert.equal(await (await h.request("/audio/word.wav"))!.text(),"course");
});
test("a login page at the offline entry cannot become a completed course cache",async()=>{
  const h=harness();h.update("/offline/index.html");assert.equal((await h.send("DOWNLOAD")).at(-1).type,"error");assert.equal((await h.send("STATUS"))[0].ready,false);h.offline();assert.equal((await h.request("/",true))!.status,503);
});

test("retrying the same failed pack reuses validated assets but becomes usable only after completion",async()=>{
  const h=harness();h.failAt("/audio/word.wav");
  assert.equal((await h.send("DOWNLOAD")).at(-1).type,"error");assert.equal((await h.send("STATUS"))[0].ready,false);
  const prior=h.requests.length;h.failAt("");
  assert.equal((await h.send("DOWNLOAD")).at(-1).type,"complete");
  assert.deepEqual(h.requests.slice(prior),["/offline-pack.json","/audio/word.wav"]);
  assert.equal((await h.send("STATUS"))[0].ready,true);
});

test("only the exact same-origin canonical offline shell redirect is accepted",async()=>{
  const canonical=harness();canonical.redirectTo("https://fox.example/offline/");
  assert.equal((await canonical.send("DOWNLOAD")).at(-1).type,"complete");
  for(const url of ["https://fox.example/login","https://other.example/offline/"]){
    const login=harness();login.redirectTo(url);assert.equal((await login.send("DOWNLOAD")).at(-1).type,"error");assert.equal((await login.send("STATUS"))[0].ready,false);
  }
});

test("the full authored pack accepts nested eating sound and bundled license without caching arbitrary paths",async()=>{
  const pack=JSON.parse(fs.readFileSync("public/offline-pack.json","utf8")) as {urls:string[]};
  assert.ok(pack.urls.includes("/audio/effects/eat.wav"));
  assert.ok(pack.urls.includes("/licenses/three.txt"));
  const h=harness(pack.urls);
  assert.equal((await h.send("DOWNLOAD")).at(-1).type,"complete");
  h.offline();
  assert.equal(await (await h.request("/audio/effects/eat.wav"))!.text(),"course");
  assert.equal(await (await h.request("/licenses/three.txt"))!.text(),"course");
  for(const url of ["/audio/private/secret.wav","/licenses/private.txt","/api/progress","/account/private"])assert.equal(await h.request(url),undefined);
});
