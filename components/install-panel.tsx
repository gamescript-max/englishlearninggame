"use client";
import { useEffect, useRef, useState } from "react";
import { Download, WifiOff, Tablet, RefreshCw } from "lucide-react";
import { isNativePlatform } from "@/lib/native-platform";
type InstallPrompt = Event & { prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}> };
type PackMessage = {type:string;ready?:boolean;version?:string;bytes?:number;done?:number;total?:number;message?:string};

export function InstallPanel() {
  const [native,setNative]=useState(false),[supported,setSupported]=useState(true),[installed,setInstalled]=useState(false),[working,setWorking]=useState(false),[message,setMessage]=useState(""),[done,setDone]=useState(0),[total,setTotal]=useState(0),[pack,setPack]=useState<PackMessage|null>(null),[current,setCurrent]=useState("");
  const [canInstall,setCanInstall]=useState(false);
  const prompt=useRef<InstallPrompt|null>(null),worker=useRef<ServiceWorker|null>(null),mounted=useRef(false),channel=useRef<MessageChannel|null>(null);
  const workingRef=useRef(false),probe=useRef<MessageChannel|null>(null),generation=useRef(0),bind=useRef<((active:ServiceWorker|null)=>void)|null>(null);
  useEffect(()=>{
    mounted.current=true;
    // Native and standalone state are available only after client hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNative(isNativePlatform());setInstalled(matchMedia("(display-mode: standalone)").matches);
    const capture=(event:Event)=>{event.preventDefault();prompt.current=event as InstallPrompt;setCanInstall(true);};
    const installedNow=()=>{setInstalled(true);setCanInstall(false);prompt.current=null;};
    function close(connection:MessageChannel|null){if(!connection)return;connection.port1.onmessage=null;connection.port1.close();connection.port2.close();}
    function bindWorker(active:ServiceWorker|null){
      if(!mounted.current)return;
      const changed=Boolean(worker.current&&worker.current!==active);
      worker.current=active;
      if(changed){
        ++generation.current;close(channel.current);channel.current=null;
        if(workingRef.current){workingRef.current=false;setWorking(false);setMessage("离线功能已更新，请点下载继续。已保存资源会复用。");}
      }
      close(probe.current);probe.current=null;
      if(!active)return;
      const status=new MessageChannel(),token=generation.current;probe.current=status;
      status.port1.onmessage=event=>{
        if(mounted.current&&probe.current===status&&worker.current===active&&generation.current===token)setPack(event.data as PackMessage);
        close(status);if(probe.current===status)probe.current=null;
      };
      try{active.postMessage({type:"STATUS"},[status.port2]);}
      catch{close(status);if(probe.current===status)probe.current=null;}
    }
    bind.current=bindWorker;
    const controllerChanged=()=>bindWorker(navigator.serviceWorker.controller);
    const supportsWorker=!isNativePlatform()&&"serviceWorker" in navigator&&window.isSecureContext;
    if(supportsWorker)navigator.serviceWorker.addEventListener("controllerchange",controllerChanged);
    window.addEventListener("beforeinstallprompt",capture);window.addEventListener("appinstalled",installedNow);
    if(!isNativePlatform()){
      if(!("serviceWorker" in navigator)||!window.isSecureContext)setSupported(false);
      else void (async()=>{
        try{
          const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/",updateViaCache:"none"});
          const ready=navigator.serviceWorker.controller||registration.active?registration:await navigator.serviceWorker.ready;
          if(!mounted.current)return;
          bindWorker(navigator.serviceWorker.controller??ready.active);
          const response=await fetch("/offline-pack.json",{cache:"no-store"});if(response.ok){const info=await response.json() as {version:string;urls:string[]};if(mounted.current){setCurrent(info.version);setTotal(info.urls.length);}}
        }catch{if(mounted.current)setMessage("离线功能暂时没有准备好。联网重新打开此页后可重试。");}
      })();
    }
    return()=>{mounted.current=false;workingRef.current=false;close(channel.current);channel.current=null;close(probe.current);probe.current=null;worker.current=null;bind.current=null;if(supportsWorker)navigator.serviceWorker.removeEventListener("controllerchange",controllerChanged);window.removeEventListener("beforeinstallprompt",capture);window.removeEventListener("appinstalled",installedNow);};
  },[]);
  function download(){
    if(workingRef.current)return;
    const active=navigator.serviceWorker?.controller??worker.current;
    if(!active){setMessage("请联网重新打开家长页，等待离线功能就绪后再试。");return;}
    if(active!==worker.current)bind.current?.(active);
    const token=++generation.current;
    workingRef.current=true;setWorking(true);setDone(0);setMessage("正在保存课程图片和声音，请保持此页打开。");
    const connection=new MessageChannel();if(channel.current){channel.current.port1.onmessage=null;channel.current.port1.close();channel.current.port2.close();}channel.current=connection;
    const close=()=>{connection.port1.onmessage=null;connection.port1.close();connection.port2.close();if(channel.current===connection)channel.current=null;};
    connection.port1.onmessage=event=>{
      if(!mounted.current||channel.current!==connection||worker.current!==active||generation.current!==token)return;const data=event.data as PackMessage;
      if(data.type==="progress"){setDone(data.done??0);setTotal(data.total??0);}
      if(data.type==="complete"){++generation.current;workingRef.current=false;setWorking(false);setPack({...data,ready:true});setMessage("全部课程已保存。可先断网，重新打开探索岛验证。");close();}
      if(data.type==="error"){++generation.current;workingRef.current=false;setWorking(false);setMessage(data.message??"下载未完成，请重试。");close();}
    };
    try{active.postMessage({type:"DOWNLOAD"},[connection.port2]);}
    catch{workingRef.current=false;setWorking(false);setMessage("离线功能暂时无法连接，请点下载重试。");close();}
  }
  return <section className="install-panel report-panel"><h2><Tablet size={25}/>平板安装与离线学习</h2>{native?<><p>已在安卓应用中运行。课程、图片和声音随安装包保存，不需要联网下载。</p><p>更换或卸载应用前，请先导出 JSON 备份。麦克风仅用于本机回放。</p></>:<><p>{installed?"已通过桌面图标打开。":"安卓 Chrome 可通过菜单“添加到主屏幕 / 安装应用”创建桌面入口；首次访问先由家长完成声音和麦克风设置。"}</p>{canInstall&&<button className="secondary-button" onClick={async()=>{const request=prompt.current;if(!request)return;await request.prompt();await request.userChoice;prompt.current=null;setCanInstall(false);}}><Tablet size={20}/>安装到桌面</button>}<div className="offline-status"><WifiOff size={22}/><span>{pack?.ready?`已有离线课程 · 约 ${Math.round((pack.bytes??0)/1048576)} MB${pack.version!==current&&current?" · 有更新可下载":""}`:"下载一次后，课程、图片和声音可离线使用。"}</span></div><button className="secondary-button" disabled={!supported||working} onClick={download}>{working?<RefreshCw size={20}/>:<Download size={20}/>} {working?`正在下载 ${done}/${total}`:pack?.ready?"更新 / 检查离线课程":"下载完整离线课程"}</button>{working&&<progress max={total||1} value={done} aria-label="离线课程下载进度"/>}<p role="status">{supported?message:"当前浏览器不支持离线安装，请使用新版安卓 Chrome。"}</p><p className="settings-note">离线包只保存在此设备。浏览器清理存储可能删除它；更换设备前先备份学习记录。iPad 可用 Safari 分享菜单添加到主屏幕。</p></>}</section>;
}
