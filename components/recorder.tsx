"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Play, RotateCcw, Square, Volume2, X } from "lucide-react";
import { playSpeech, stopAllAudio } from "@/lib/audio";

type RecorderProps = { text: string; onRecorded: () => void; independent?: boolean };
type RecorderStatus = "idle" | "requesting" | "recording" | "stopping" | "ready" | "playing" | "listening";

const MAX_SECONDS = 15;
const recordingFormats = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];

export function Recorder({ text, onRecorded, independent = false }: RecorderProps) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  const mounted = useRef(false);
  const generation = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const playback = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordedCallback = useRef(onRecorded);
  const previousText = useRef(text);

  useEffect(() => { recordedCallback.current = onRecorded; }, [onRecorded]);

  const clearTimers = useCallback(() => {
    if (interval.current) clearInterval(interval.current);
    if (deadline.current) clearTimeout(deadline.current);
    interval.current = null;
    deadline.current = null;
  }, []);

  const stopPlayback = useCallback(() => {
    if (!playback.current) return;
    playback.current.onended = null;
    playback.current.onerror = null;
    playback.current.pause();
    playback.current.removeAttribute("src");
    playback.current.load();
    playback.current = null;
  }, []);

  const releaseResources = useCallback(() => {
    ++generation.current;
    clearTimers();
    stopPlayback();
    stopAllAudio();
    const currentRecorder = recorder.current;
    recorder.current = null;
    if (currentRecorder) {
      currentRecorder.ondataavailable = null;
      currentRecorder.onstop = null;
      currentRecorder.onerror = null;
      if (currentRecorder.state !== "inactive") {
        try { currentRecorder.stop(); } catch { /* Already stopped by the device. */ }
      }
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  }, [clearTimers, stopPlayback]);

  useEffect(() => {
    mounted.current = true;
    const onHidden = () => {
      if (!document.hidden) return;
      releaseResources();
      setRecordingUrl(null);
      setStatus("idle");
      setSeconds(0);
    };
    const onPageHide = () => {
      releaseResources();
      setRecordingUrl(null);
      setStatus("idle");
      setSeconds(0);
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("native-background", onPageHide);
    window.addEventListener("learning-pause", onPageHide);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("native-background", onPageHide);
      window.removeEventListener("learning-pause", onPageHide);
      releaseResources();
    };
  }, [releaseResources]);

  useEffect(() => {
    if (previousText.current === text) return;
    previousText.current = text;
    releaseResources();
    setRecordingUrl(null);
    setStatus("idle");
    setSeconds(0);
    setError(null);
    setSkipped(false);
  }, [text, releaseResources]);

  function isCurrent(token: number) {
    return mounted.current && generation.current === token && !document.hidden;
  }

  function cancelPractice() {
    releaseResources();
    setRecordingUrl(null);
    setStatus("idle");
    setSeconds(0);
    setError(null);
    setSkipped(true);
  }

  function finishRecording() {
    const currentRecorder = recorder.current;
    if (!currentRecorder || currentRecorder.state === "inactive") return;
    clearTimers();
    setStatus("stopping");
    try {
      // onstop runs after the final dataavailable event, so no last syllable is lost.
      currentRecorder.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    } catch {
      releaseResources();
      setRecordingUrl(null);
      setStatus("idle");
      setError("录音没有保存成功，请再录一次。");
    }
  }

  async function startRecording() {
    if (["requesting", "recording", "stopping"].includes(status)) return;
    releaseResources();
    setRecordingUrl(null);
    setError(null);
    setSeconds(0);
    setSkipped(false);
    const token = generation.current;
    if (!window.isSecureContext) {
      setStatus("idle");
      setError("录音需要安全连接。请用 HTTPS 地址打开，或先跳过跟读。");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus("idle");
      setError("这个浏览器暂时不支持录音。可以换用新版 Safari 或 Chrome，也可以先跳过。");
      return;
    }
    setStatus("requesting");
    let requestedStream: MediaStream;
    try {
      requestedStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false,
      });
    } catch (cause) {
      if (!isCurrent(token)) return;
      setStatus("idle");
      const name = cause instanceof DOMException ? cause.name : "";
      setError(name === "NotAllowedError" || name === "SecurityError"
        ? "麦克风还没有获得允许。请家长在浏览器中允许麦克风后重试，也可以跳过。"
        : name === "NotFoundError"
          ? "没有找到麦克风。请连接麦克风后重试，也可以先跳过。"
          : "麦克风暂时无法使用。请检查是否被其他应用占用，再试一次。");
      return;
    }
    // A permission dialog can outlive navigation or the Skip button.
    if (!isCurrent(token)) {
      requestedStream.getTracks().forEach((track) => track.stop());
      return;
    }
    stream.current = requestedStream;
    const mimeType = typeof MediaRecorder.isTypeSupported === "function"
      ? recordingFormats.find((format) => MediaRecorder.isTypeSupported(format))
      : undefined;
    let mediaRecorder: MediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(requestedStream, mimeType ? { mimeType } : undefined);
    } catch {
      releaseResources();
      setStatus("idle");
      setError("这个浏览器没有可用的录音格式。请换个浏览器，或先跳过跟读。");
      return;
    }
    recorder.current = mediaRecorder;
    const chunks: Blob[] = [];
    let counted = false;
    mediaRecorder.ondataavailable = (event) => {
      if (isCurrent(token) && event.data.size > 0) chunks.push(event.data);
    };
    mediaRecorder.onstop = () => {
      requestedStream.getTracks().forEach((track) => track.stop());
      if (!isCurrent(token)) { chunks.length = 0; return; }
      clearTimers();
      recorder.current = null;
      stream.current = null;
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || chunks[0]?.type || mimeType || "audio/webm" });
      chunks.length = 0;
      if (!blob.size) {
        setStatus("idle");
        setError("刚才没有录到声音，请再试一次。");
        return;
      }
      url.current = URL.createObjectURL(blob);
      setRecordingUrl(url.current);
      setStatus("ready");
      if (!counted) {
        counted = true;
        recordedCallback.current();
      }
    };
    mediaRecorder.onerror = () => {
      if (!isCurrent(token)) return;
      releaseResources();
      setRecordingUrl(null);
      setStatus("idle");
      setError("录音中断了，请再试一次。也可以直接继续下一步。");
    };
    try {
      mediaRecorder.start(250);
      const startedAt = Date.now();
      setStatus("recording");
      interval.current = setInterval(() => {
        if (isCurrent(token)) setSeconds(Math.min(MAX_SECONDS, Math.floor((Date.now() - startedAt) / 1000)));
      }, 200);
      deadline.current = setTimeout(() => {
        if (isCurrent(token)) {
          setSeconds(MAX_SECONDS);
          finishRecording();
        }
      }, MAX_SECONDS * 1000);
    } catch {
      releaseResources();
      setStatus("idle");
      setError("录音没有开始成功，请再试一次。");
    }
  }

  async function listen() {
    stopPlayback();
    setSkipped(false);
    setError(null);
    const token = ++generation.current;
    setStatus("listening");
    try {
      await playSpeech(text, "en");
    } catch (cause) {
      if (isCurrent(token)) setError(cause instanceof Error ? cause.message : "示范声音没有播放成功，请重试。");
    } finally {
      if (isCurrent(token)) setStatus(url.current ? "ready" : "idle");
    }
  }

  async function playRecording() {
    if (!url.current) return;
    stopAllAudio();
    stopPlayback();
    setError(null);
    const token = ++generation.current;
    const audio = new Audio(url.current);
    playback.current = audio;
    audio.onended = () => {
      if (isCurrent(token)) {
        stopPlayback();
        setStatus("ready");
      }
    };
    audio.onerror = () => {
      if (isCurrent(token)) {
        stopPlayback();
        setStatus("ready");
        setError("刚才的录音没有播放成功，请重试或重新录音。");
      }
    };
    setStatus("playing");
    try {
      await audio.play();
    } catch {
      if (isCurrent(token)) {
        stopPlayback();
        setStatus("ready");
        setError("录音没有播放成功，请点击回放重试。");
      }
    }
  }

  const busy = status === "requesting" || status === "recording" || status === "stopping";
  return (
    <div className="recorder-panel">
      <p className="recorder-instruction">{independent ? "自己说一句英语，再回放听一听。也可以直接说给家长听。" : "先听示范，再读给小狐狸听。"}每次最多 15 秒。</p>
      {!independent && <p className="recorder-phrase" lang="en">{text}</p>}
      <div className="recorder-controls">
        {!independent && <button type="button" className="secondary-button" style={{ minHeight: 56 }} onClick={() => void listen()} disabled={busy || status === "listening"}>
          <Volume2 size={20} aria-hidden="true" /> {status === "listening" ? "示范播放中…" : "听示范"}
        </button>}
        {status === "recording" ? (
          <button type="button" className="secondary-button record-button" style={{ minHeight: 56 }} onClick={finishRecording}>
            <Square size={20} aria-hidden="true" /> 停止录音 · {MAX_SECONDS - seconds} 秒
          </button>
        ) : status === "requesting" || status === "stopping" ? (
          <button type="button" className="secondary-button" style={{ minHeight: 56 }} disabled>
            <LoaderCircle size={20} className="spin" aria-hidden="true" /> {status === "requesting" ? "等待麦克风许可…" : "正在保存录音…"}
          </button>
        ) : (
          <button type="button" className="secondary-button record-button" style={{ minHeight: 56 }} onClick={() => void startRecording()}>
            {recordingUrl ? <RotateCcw size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />} {recordingUrl ? "重新录音" : "点击录音"}
          </button>
        )}
        {status === "playing" ? (
          <button type="button" className="secondary-button" style={{ minHeight: 56 }} onClick={() => { ++generation.current; stopPlayback(); setStatus("ready"); }}>
            <Square size={20} aria-hidden="true" /> 停止回放
          </button>
        ) : (
          <button type="button" className="secondary-button" style={{ minHeight: 56 }} disabled={!recordingUrl || busy} onClick={() => void playRecording()}>
            <Play size={20} aria-hidden="true" /> 听自己的声音
          </button>
        )}
        <button type="button" className="secondary-button" style={{ minHeight: 56 }} onClick={cancelPractice}>
          <X size={20} aria-hidden="true" /> {independent ? "不录音，直接说" : "跳过跟读"}
        </button>
      </div>
      <div aria-live="polite">
        {status === "recording" && <p>正在录音，请说英语。说完就点停止。</p>}
        {status === "requesting" && <p>请在浏览器的提示中允许麦克风。也可以点击跳过，继续学习。</p>}
        {status === "ready" && <p>录好了！听一听自己的声音，也可以继续下一步。</p>}
        {skipped && <p>已跳过跟读，可以继续下一步。</p>}
        {error && <p className="error-note" role="alert">{error}</p>}
      </div>
      <p className="recorder-note">录音只在这次练习中回放，离开后清除。{independent ? "录音不自动评分，由家长观察表达。" : "跟读只记录练习次数。"}</p>
    </div>
  );
}
