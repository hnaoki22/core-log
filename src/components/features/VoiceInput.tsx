"use client";

import { useRef, useState, useCallback } from "react";

// Extend Window for SpeechRecognition (vendor-prefixed in some browsers)
interface SpeechRecognitionEvent extends Event {
  results: { [index: number]: { [index: number]: { transcript: string } }; length: number };
  resultIndex: number;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

interface VoiceInputProps {
  onTextReceived: (text: string) => void;
}

export function VoiceInputButton({ onTextReceived }: VoiceInputProps) {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState("");

  const isSupported = typeof window !== "undefined" &&
    (!!window.SpeechRecognition || !!window.webkitSpeechRecognition);

  const handleStartRecording = useCallback(() => {
    setError("");

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("このブラウザは音声入力に対応していません");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript) {
        onTextReceived(transcript);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        setError("マイクへのアクセスが許可されていません");
      } else if (event.error === "no-speech") {
        setError("音声が検出されませんでした");
      } else {
        setError("音声認識エラーが発生しました");
      }
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }, [onTextReceived]);

  const handleStopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  if (!isSupported) {
    return null; // Don't show button if browser doesn't support it
  }

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
        className={`p-2 rounded-lg transition-colors ${
          isRecording
            ? "bg-red-100 text-red-600 hover:bg-red-200"
            : "bg-[#F2F2F7] text-[#1A1A2E] hover:bg-[#E5DCD0]"
        }`}
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
