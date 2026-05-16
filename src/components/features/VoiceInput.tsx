"use client";

// VoiceInput — Whisper-based voice transcription (server-side).
//
// History:
//   - v1 (Web Speech API): client-side only, free, low accuracy for 省察/business vocab.
//   - v2 (2026-05-16, this file): MediaRecorder → /api/features/voice-input (Whisper).
//
// Why Whisper:
//   reflection-lab dogfooding needs accurate Japanese transcription of
//   strategy/省察 terminology that browser-native APIs handle poorly.
//
// Behavior:
//   - Press to start recording. Press again to stop.
//   - On stop, the recorded webm/opus blob is POSTed to
//     /api/features/voice-input with the participant token.
//   - The returned text is appended to the calling input field.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

interface VoiceInputProps {
  onTextReceived: (text: string) => void;
}

// MIME types we try in order of Whisper-friendliness.
// audio/webm (Opus) — best support across Chrome/Edge.
// audio/mp4 — Safari iOS fallback.
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickSupportedMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

export function VoiceInputButton({ onTextReceived }: VoiceInputProps) {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState("");

  // Browser support probe runs on mount to render or hide the button.
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setIsSupported(false);
      return;
    }
    setIsSupported(typeof MediaRecorder !== "undefined" && !!pickSupportedMimeType());
  }, []);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const transcribe = useCallback(
    async (blob: Blob, mimeType: string) => {
      setIsTranscribing(true);
      setError("");
      try {
        const ext = mimeType.includes("webm")
          ? "webm"
          : mimeType.includes("mp4")
          ? "mp4"
          : mimeType.includes("ogg")
          ? "ogg"
          : "bin";
        const file = new File([blob], `voice.${ext}`, { type: mimeType });
        const form = new FormData();
        form.append("audio", file);
        form.append("token", token);

        const res = await fetch("/api/features/voice-input", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { text?: string };
        const text = (data.text || "").trim();
        if (text) {
          onTextReceived(text);
        } else {
          setError("音声を認識できませんでした");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "文字起こしに失敗しました");
      } finally {
        setIsTranscribing(false);
      }
    },
    [token, onTextReceived]
  );

  const handleStartRecording = useCallback(async () => {
    setError("");
    if (mediaRecorderRef.current) return; // already recording

    const mimeType = pickSupportedMimeType();
    if (!mimeType) {
      setError("このブラウザは音声録音に対応していません");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = (err as { name?: string })?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("マイクへのアクセスが許可されていません");
      } else if (name === "NotFoundError") {
        setError("マイクが見つかりません");
      } else {
        setError("マイクの取得に失敗しました");
      }
      return;
    }

    streamRef.current = stream;
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onerror = () => {
      setError("録音中にエラーが発生しました");
      cleanupStream();
      setIsRecording(false);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      cleanupStream();
      setIsRecording(false);
      if (blob.size > 0) {
        void transcribe(blob, mimeType);
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }, [cleanupStream, transcribe]);

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      // onstop handler cleans up and triggers transcription
    }
  }, []);

  // Stop and release the mic if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      cleanupStream();
    };
  }, [cleanupStream]);

  if (isSupported === false) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {isRecording && (
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          <span className="text-xs text-[#8B8489]">録音中…</span>
        </div>
      )}
      {isTranscribing && !isRecording && (
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
          <span className="text-xs text-[#8B8489]">文字起こし中…</span>
        </div>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}

      <button
        type="button"
        onClick={isRecording ? handleStopRecording : handleStartRecording}
        disabled={isTranscribing}
        aria-label={isRecording ? "録音を停止" : "音声入力を開始"}
        className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
          isRecording
            ? "bg-red-100 text-red-600 hover:bg-red-200"
            : "bg-[#F2F2F7] text-[#1A1A2E] hover:bg-[#E5DCD0]"
        }`}
        title={isRecording ? "録音を停止" : "音声入力（Whisper）"}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {isRecording ? (
            <rect x="4" y="4" width="16" height="16" rx="2" />
          ) : (
            <>
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
