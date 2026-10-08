"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createProgress, validateProgress, type Progress } from "./progress";
import { createDemoProgress } from "./demo-progress";

export const STORAGE_KEY = "little-fox-english-island-v1";

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(createProgress);
  const current = useRef(progress);
  const [ready, setReady] = useState(false);
  const [firstVisit, setFirstVisit] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [externalChange, setExternalChange] = useState(0);
  const damaged = useRef(false);
  const lastSaved = useRef<string | null>(null);
  const store = useRef<Storage | null>(null);
  const key = useRef(STORAGE_KEY);
  const [demoMode, setDemoMode] = useState(false);
  useEffect(() => {
    try {
      const demo = new URLSearchParams(window.location.search).get("demo") === "1";
      store.current = demo ? sessionStorage : localStorage;
      key.current = demo ? `${STORAGE_KEY}-demo` : STORAGE_KEY;
      // One-time client hydration reads the URL and browser storage after mounting.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDemoMode(demo);
      const raw = store.current.getItem(key.current);
      lastSaved.current = raw;
      if (raw || demo) {
        const saved = raw ? validateProgress(JSON.parse(raw)) : createDemoProgress();
        current.current = saved;
        setProgress(saved);
        if (demo && !raw) { const initial = JSON.stringify(saved); store.current.setItem(key.current, initial); lastSaved.current = initial; }
      } else setFirstVisit(true);
    } catch {
      damaged.current = true;
      setStorageError("已有记录读取失败，当前练习先保存在页面中。请让家长导出备份、恢复有效备份或清空损坏记录。");
    }
    setReady(true);
    function sync(event: StorageEvent) {
      if (event.storageArea !== store.current || (event.key !== key.current && event.key !== null)) return;
      try {
        const raw = event.key === null ? null : event.newValue;
        const saved = raw ? validateProgress(JSON.parse(raw)) : createProgress();
        lastSaved.current = raw;
        damaged.current = false;
        current.current = saved;
        setProgress(saved);
        setFirstVisit(false);
        setExternalChange(value => value + 1);
      } catch { setStorageError("另一个标签中的记录无法读取，请让家长检查备份后再继续。"); damaged.current = true; }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const commit = useCallback((update: Progress | ((previous: Progress) => Progress), replaceDamaged = false) => {
    if (!replaceDamaged && !damaged.current) {
      try {
        const disk = store.current!.getItem(key.current);
        if (disk !== lastSaved.current) {
          const saved = disk ? validateProgress(JSON.parse(disk)) : createProgress();
          lastSaved.current = disk;
          current.current = saved;
          setProgress(saved);
          setExternalChange(value => value + 1);
          return saved;
        }
      } catch { /* The save below reports unavailable storage; the page keeps its current state. */ }
    }
    const next = typeof update === "function" ? update(current.current) : update;
    current.current = next;
    setProgress(next);
    if (replaceDamaged) damaged.current = false;
    if (damaged.current) return next;
    try {
      const serialized = JSON.stringify(next);
      store.current!.setItem(key.current, serialized);
      lastSaved.current = serialized;
      setStorageError("");
    } catch {
      setStorageError("进度暂时没有保存成功。请先导出备份，或点击重试；当前页面中的练习仍然保留。");
    }
    return next;
  }, []);
  const retry = useCallback(() => commit(current.current), [commit]);
  return { progress, current, commit, ready, firstVisit, storageError, retry, externalChange, demoMode };
}
