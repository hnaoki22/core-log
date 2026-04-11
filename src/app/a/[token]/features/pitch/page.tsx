"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

type PitchContent = {
  title: string;
  sections: { heading: string; content: string }[];
};

type ApiResponse = {
  pitch?: PitchContent;
  error?: string;
};

export default function PitchGeneratorPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isOn, loaded } = useFeatures();

  const [pitch, setPitch] = useState<PitchContent | null>(null);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Form state
  const [clientName, setClientName] = useState("");
  const [industry, setIndustry] = useState("");
  const [challenge, setChallenge] = useState("");

  // Load feature flag
  useEffect(() => {
    if (!loaded) return;
    if (!isOn("tier-g.pitchGenerator")) {
      router.push(`/a/${token}`);
    }
  }, [loaded, isOn, token, router]);

  // Generate pitch
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !industry.trim() || !challenge.trim()) {
      setMessage({ type: "err", text: "すべての項目を入力してください" });
      return;
    }

    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/features/pitch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, clientName, industry, challenge }),
      });
      if (!res.ok) throw new Error("failed to generate");
      const data = (await res.json()) as ApiResponse;
      setPitch(data.pitch || null);
      setMessage({ type: "ok", text: "ピッチを生成しました" });
    } catch {
      setMessage({ type: "err", text: "生成に失敗しました" });
    } finally {
      setGenerating(false);
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    if (!pitch) return;
    const text = `${pitch.title}\n\n${pitch.sections
      .map((s) => `${s.heading}\n${s.content}`)
      .join("\n\n")}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ type: "err", text: "コピーに失敗しました" });
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F0EB]">
      {/* Header */}
      <header className="gradient-header-admin text-white px-5 pt-12 pb-6">
        <div className="max-w-2xl mx-auto relative z-10">
          <Link
            href={`/a/${token}`}
            className="inline-flex items-center gap-1 text-[#C9BDAE] hover:text-white text-sm mb-3 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            管理画面に戻る
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">ピッチ生成</h1>
          <p className="text-xs text-[#C9BDAE] mt-1">クライアント向けのピッチを自動生成</p>
        </div>
      </header>

      <main className="px-5 py-6 space-y-5 max-w-2xl mx-auto">
        {/* Message */}
        {message && (
          <div
            className={`px-4 py-3 rounded-lg text-sm ${
              message.type === "ok"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Form */}
        {!pitch && (
          <div className="card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[#1A1A2E]">ピッチ情報</h2>
            <form onSubmit={handleGenerate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                  クライアント名
                </label>
                <input
                  type="text"
                  placeholder="例: 〇〇株式会社"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                  業界
                </label>
                <input
                  type="text"
                  placeholder="例: 製薬、IT、金融"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#5B5560] uppercase tracking-wide mb-2">
                  課題
                </label>
                <textarea
                  placeholder="クライアントが直面している課題や目標..."
                  value={challenge}
                  onChange={(e) => setChallenge(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-[#E0D9CE] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1A1A2E] focus:ring-offset-1 resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={generating}
                className="w-full btn-primary py-2 disabled:opacity-50"
              >
                {generating ? "生成中..." : "ピッチを生成"}
              </button>
            </form>
          </div>
        )}

        {/* Pitch Display */}
        {pitch && (
          <div className="space-y-3">
            {/* Copy Button */}
            <button
              onClick={handleCopy}
              className={`w-full py-2 px-4 text-sm font-medium rounded-lg transition-colors ${
                copied
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-[#1A1A2E] text-white hover:bg-[#2A2A3E]"
              }`}
            >
              {copied ? "コピーしました" : "コピー"}
            </button>

            {/* Title */}
            <div className="card p-5">
              <h2 className="text-lg font-bold text-[#1A1A2E]">{pitch.title}</h2>
            </div>

            {/* Sections */}
            {pitch.sections.map((section, idx) => (
              <div key={idx} className="card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-[#1A1A2E]">{section.heading}</h3>
                <p className="text-sm text-[#5B5560] whitespace-pre-wrap">{section.content}</p>
              </div>
            ))}

            {/* Generate New Button */}
            <button
              onClick={() => {
                setPitch(null);
                setClientName("");
                setIndustry("");
                setChallenge("");
                setMessage(null);
              }}
              className="w-full py-2 px-4 text-sm font-medium rounded-lg bg-[#EFE8DD] text-[#1A1A2E] hover:bg-[#E0D9CE] transition-colors"
            >
              新しいピッチを生成
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
