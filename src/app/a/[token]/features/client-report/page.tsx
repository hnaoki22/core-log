"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useFeatures } from "@/lib/use-features";
import Link from "next/link";

type ReportContent = {
  title: string;
  executiveSummary: string;
  sections: { heading: string; content: string }[];
  recommendations: string[];
};

type ApiResponse = {
  report?: ReportContent;
  error?: string;
};

export default function ClientReportPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isOn, loaded } = useFeatures();

  const [report, setReport] = useState<ReportContent | null>(null);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Load feature flag
  useEffect(() => {
    if (!loaded) return;
    if (!isOn("tier-f.clientReport")) {
      router.push(`/a/${token}`);
    }
  }, [loaded, isOn, token, router]);

  // Generate report
  const handleGenerate = async () => {
    setGenerating(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/features/client-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) throw new Error("failed to generate");
      const data = (await res.json()) as ApiResponse;
      setReport(data.report || null);
      setMessage({ type: "ok", text: "レポート生成完了" });
    } catch {
      setMessage({ type: "err", text: "レポート生成に失敗しました" });
    } finally {
      setGenerating(false);
    }
  };

  // Copy to clipboard
  const handleCopy = async () => {
    if (!report) return;
    const text = `${report.title}\n\n${report.executiveSummary}\n\n${report.sections
      .map((s) => `${s.heading}\n${s.content}`)
      .join("\n\n")}\n\n推奨事項:\n${report.recommendations.join("\n")}`;

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
          <h1 className="text-xl font-semibold tracking-tight">クライアントレポート生成</h1>
          <p className="text-xs text-[#C9BDAE] mt-1">組織の成長を成果レポートとして生成</p>
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

        {/* Generate Button */}
        {!report && (
          <div className="card p-8 text-center space-y-4">
            <p className="text-sm text-[#5B5560]">
              クリックすると、組織の学習成果に基づいたレポートを生成します
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full btn-primary py-3 disabled:opacity-50"
            >
              {generating ? "生成中..." : "レポート生成"}
            </button>
          </div>
        )}

        {/* Report Display */}
        {report && (
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
              <h2 className="text-lg font-bold text-[#1A1A2E]">{report.title}</h2>
            </div>

            {/* Executive Summary */}
            <div className="card p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">エグゼクティブサマリー</h3>
              <p className="text-sm text-[#5B5560] whitespace-pre-wrap">{report.executiveSummary}</p>
            </div>

            {/* Sections */}
            {report.sections.map((section, idx) => (
              <div key={idx} className="card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-[#1A1A2E]">{section.heading}</h3>
                <p className="text-sm text-[#5B5560] whitespace-pre-wrap">{section.content}</p>
              </div>
            ))}

            {/* Recommendations */}
            {report.recommendations.length > 0 && (
              <div className="card p-5 space-y-3">
                <h3 className="text-sm font-semibold text-[#1A1A2E]">推奨事項</h3>
                <ul className="space-y-2">
                  {report.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-sm text-[#5B5560] flex gap-2">
                      <span className="text-[#1A1A2E] font-semibold">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Generate New Button */}
            <button
              onClick={() => {
                setReport(null);
                setMessage(null);
              }}
              className="w-full py-2 px-4 text-sm font-medium rounded-lg bg-[#EFE8DD] text-[#1A1A2E] hover:bg-[#E0D9CE] transition-colors"
            >
              新しいレポートを生成
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
