import { Capacitor } from "@capacitor/core";

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** Native events are handled by GameApp so the same navigation works on the web. */
export async function initNativePlatform(): Promise<() => void> {
  if (!isNativePlatform()) return () => undefined;
  const { App } = await import("@capacitor/app");
  const listeners = await Promise.all([
    App.addListener("appStateChange", ({ isActive }) => {
      window.dispatchEvent(new CustomEvent(isActive ? "native-foreground" : "native-background", { detail: { isActive } }));
      // Reuse existing audio, recorder and moving-game cleanup on native app switches.
      window.dispatchEvent(new Event(isActive ? "pageshow" : "pagehide"));
    }),
    App.addListener("backButton", ({ canGoBack }) => {
      window.dispatchEvent(new CustomEvent("native-back", { detail: { canGoBack } }));
    }),
  ]);
  return () => { for (const listener of listeners) void listener.remove(); };
}

export async function exitNativeApp(): Promise<void> {
  if (!isNativePlatform()) return;
  const { App } = await import("@capacitor/app");
  await App.exitApp();
}

/** Export only the validated progress JSON; recordings never enter backups. */
export async function saveBackup(text: string, filename: string): Promise<void> {
  const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
  if (!safeFilename.endsWith(".json")) throw new Error("备份文件必须为 JSON 格式。");
  if (isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"), import("@capacitor/share"),
    ]);
    const result = await Filesystem.writeFile({
      path: `backups/${safeFilename}`,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    await Share.share({ title: "保存英语学习备份", files: [result.uri], dialogTitle: "保存或分享学习备份" });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
