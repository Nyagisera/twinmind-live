"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { TranscriptChunk } from "@/lib/types";
import { transcribeAudio } from "@/lib/api";
import styles from "./TranscriptPanel.module.css";

interface Props {
  chunks: TranscriptChunk[];
  apiKey: string;
  onChunk: (text: string) => void;
  onNeedApiKey: () => void;
}

// Detect best supported audio format for this browser
function getSupportedMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const type of types) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      continue;
    }
  }
  return ""; // let browser choose its default
}

// Measure audio energy from a blob to detect silence
async function measureAudioEnergy(blob: Blob): Promise<number> {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const data = audioBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
    await audioCtx.close();
    return Math.sqrt(sum / data.length); // RMS energy
  } catch {
    return 1; // if we can't measure, assume non-silent
  }
}

// Strip overlap between chunks — Whisper sometimes repeats the tail of the previous chunk
function deduplicateChunkTail(newText: string, prevText: string): string {
  if (!prevText) return newText;
  const prevWords = prevText.trim().split(/\s+/);
  const newWords = newText.trim().split(/\s+/);

  // Try matching the last 5 words of prevText at the start of newText
  const overlapWindow = Math.min(5, prevWords.length, newWords.length);
  for (let len = overlapWindow; len >= 2; len--) {
    const tail = prevWords.slice(-len).join(" ").toLowerCase();
    const head = newWords.slice(0, len).join(" ").toLowerCase();
    if (tail === head) {
      return newWords.slice(len).join(" ");
    }
  }
  return newText;
}

export default function TranscriptPanel({ chunks, apiKey, onChunk, onNeedApiKey }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastChunkTextRef = useRef<string>("");

  // Auto-scroll to bottom when new chunks arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chunks]);

  // Track last chunk text for deduplication
  useEffect(() => {
    if (chunks.length > 0) {
      lastChunkTextRef.current = chunks[chunks.length - 1].text;
    }
  }, [chunks]);

  const processAudioChunk = useCallback(
    async (blob: Blob) => {
      if (!apiKey) { onNeedApiKey(); return; }

      // Size gate — skip obviously empty blobs
      if (blob.size < 2000) return;

      // Silence detection — skip if RMS energy is below threshold
      const energy = await measureAudioEnergy(blob);
      if (energy < 0.005) return; // near-silence threshold

      setTranscribing(true);
      try {
        const rawText = await transcribeAudio(blob, apiKey);
        if (!rawText.trim()) return;

        // Deduplicate overlap with previous chunk
        const cleaned = deduplicateChunkTail(rawText, lastChunkTextRef.current);
        if (cleaned.trim()) onChunk(cleaned.trim());
      } catch (e: any) {
        setError(e.message);
      } finally {
        setTranscribing(false);
      }
    },
    [apiKey, onChunk, onNeedApiKey]
  );

  const startNewRecorder = useCallback(
    (stream: MediaStream) => {
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        processAudioChunk(blob);
      };

      recorder.start();
      return recorder;
    },
    [processAudioChunk]
  );

  const startRecording = useCallback(async () => {
    if (!apiKey) { onNeedApiKey(); return; }
    setError(null);
    setElapsedSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;
      mediaRecorderRef.current = startNewRecorder(stream);
      setRecording(true);

      // Recording clock
      clockRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);

      // Chunk every 30s
      intervalRef.current = setInterval(() => {
        const current = mediaRecorderRef.current;
        if (current?.state === "recording") {
          current.stop(); // triggers onstop → processAudioChunk → restarts
          // Small delay to let onstop fire before we start a new recorder
          setTimeout(() => {
            if (streamRef.current) {
              mediaRecorderRef.current = startNewRecorder(streamRef.current);
            }
          }, 100);
        }
      }, 30_000);
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        setError("Microphone permission denied — click the lock icon in your browser address bar and allow microphone access, then refresh.");
      } else if (e.name === "NotFoundError") {
        setError("No microphone found — make sure a mic is connected and not in use by another app.");
      } else if (e.name === "NotReadableError") {
        setError("Microphone is in use by another application — close other apps using the mic and try again.");
      } else {
        setError("Mic error: " + e.message);
      }
    }
  }, [apiKey, startNewRecorder, onNeedApiKey]);

  const stopRecording = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (clockRef.current) clearInterval(clockRef.current);

    const current = mediaRecorderRef.current;
    if (current?.state === "recording") {
      current.stop(); // final chunk processed via onstop
    }

    // Release mic
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  const totalWords = chunks.reduce((n, c) => n + c.text.split(/\s+/).length, 0);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.panelLabel}>1. MIC &amp; TRANSCRIPT</span>
        <span className={`${styles.badge} ${recording ? styles.badgeRecording : ""}`}>
          {recording ? `● ${formatElapsed(elapsedSeconds)}` : "IDLE"}
        </span>
      </div>

      <div className={styles.controls}>
        <button
          className={`${styles.micBtn} ${recording ? styles.micActive : ""}`}
          onClick={recording ? stopRecording : startRecording}
          title={recording ? "Stop recording" : "Start recording"}
        >
          {recording ? (
            <span className={styles.micStop} />
          ) : (
            <span className={styles.micDot} />
          )}
        </button>
        <div className={styles.micInfo}>
          <span className={styles.micStatus}>
            {recording
              ? transcribing
                ? "Transcribing chunk…"
                : "Recording — new chunk every 30s"
              : "Click mic to start recording"}
          </span>
          {chunks.length > 0 && (
            <span className={styles.wordCount}>
              {totalWords.toLocaleString()} words · {chunks.length} chunks
            </span>
          )}
          {error && <span className={styles.micError}>{error}</span>}
        </div>
      </div>

      <div className={styles.transcriptArea} ref={scrollRef}>
        {chunks.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.empty}>No transcript yet — start the mic.</p>
            <p className={styles.emptyHint}>
              Silence is skipped automatically. Transcript appends every ~30 seconds.
            </p>
          </div>
        ) : (
          chunks.map((chunk) => (
            <div key={chunk.id} className={styles.chunk}>
              <span className={styles.chunkTime}>
                {new Date(chunk.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <p className={styles.chunkText}>{chunk.text}</p>
            </div>
          ))
        )}
        {transcribing && (
          <div className={styles.transcribingIndicator}>
            <span /><span /><span />
          </div>
        )}
      </div>
    </div>
  );
}
