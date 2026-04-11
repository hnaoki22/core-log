"use client";

import { useRef, useState } from "react";

interface VoiceInputProps {
  token: string;
  onTextReceived: (text: string) => void;
}

export function VoiceInputButton({ token, onTextReceived }: VoiceInputProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  const handleStartRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        await handleAudioProcessing();
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setError("マイクへのアクセスが許可されていません");
      console.error("Microphone access error:", err);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleAudioProcessing = async () => {
    setIsProcessing(true);
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const formData = new FormData();
      formData.append("audio", audioBlob);
      formData.append("token", token);

      const res = await fetch("/api/features/voice-input", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.text) {
          onTextReceived(data.text);
        }
      } else {
        setError("音声の処理に失敗しました");
      }
    } catch (err) {
      setError("通信エラーが発生しました");
      console.error("Voice input processing error:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {isRecording && (
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          <span className="text-xs text-[#8B8489]">録音中...</span>
        </div>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}

      <button
        onClick={isRecording ? handleStopRecording : handleStartRecording}
        disabled={isProcessing}
        className={`p-2 rounded-lg transition-colors ${
          isRecording
            ? "bg-red-100 text-red-600 hover:bg-red-200"
            : "bg-[#F2F2F7] text-[#1A1A2E] hover:bg-[#E5DCD0]"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={isRecording ? "録音を停止" : "音声入力"}
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
            <>
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </>
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
