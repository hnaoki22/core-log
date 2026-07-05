"use client";

import { BottomNav } from "@/components/BottomNav";
import { EnergyGlyph } from "@/components/EnergyGlyph";
import { MoodCandlestick } from "@/components/features/MoodCandlestick";
import { formatDateTimeJST, formatTimeJST } from "@/lib/date-utils";
import { useState, useEffect } from "react";

/** Format datetime string to "2026/6/10 08:30" in JST */
const formatDateTime = formatDateTimeJST;

type LogEntry = {
  id: string;
  date: string;
  datetime?: string;
  dayOfWeek: string;
  dayNum: number;
  morningIntent: string;
  eveningInsight: string | null;
  energy: "excellent" | "good" | "okay" | "low" | null;
  // standalone §4: 夕の気分（ローソク足の終値）。従来テナントでは undefined/null
  eveningEnergy?: "excellent" | "good" | "okay" | "low" | null;
  status: "complete" | "morning_only" | "empty" | "fb_done";
  hasFeedback: boolean;
  hmFeedback?: string | null;
  managerComment?: string | null;
  managerCommentTime?: string | null;
  managerReaction?: string | null;
  morningTime?: string | null;
  eveningTime?: string | null;
};

const energyLabel: Record<string, string> = {
  excellent: "絶好調",
  good: "良い",
  okay: "まあまあ",
  low: "低調",
};

// Plain-text status labels for the CSV export (the in-UI statusConfig also
// carries Tailwind classes, so we keep a separate label-only map here).
const statusLabel: Record<string, string> = {
  morning_only: "朝のみ",
  complete: "完了",
  fb_done: "完了",
  empty: "未記入",
};

/**
 * Escape one CSV cell.
 *  - Formula-injection guard (CWE-1236): a value starting with =,+,-,@,\t,\r
 *    is treated as a formula by Excel/Sheets; prefix with ' to neutralize.
 *  - RFC 4180 quoting: wrap in quotes, double embedded quotes.
 */
function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

/** Format time in JST */
const formatTime = formatTimeJST;

export type LogsInitialData = {
  logs: LogEntry[];
  badges: { feedback: number; feedbackTotal: number; mission: number };
  // standalone §6: 解禁後のみ true。ローソク足の長期表示をログ一覧の上に出す
  standaloneCandle?: boolean;
};

interface Props {
  token: string;
  initialData: LogsInitialData;
}

export default function LogsClient({ token, initialData }: Props) {
  // Hydrate from server-fetched data — no client fetch waterfall on first paint.
  const [logs, setLogs] = useState<LogEntry[]>(initialData.logs);
  const [badges, setBadges] = useState<{ feedback: number; feedbackTotal: number; mission: number }>(initialData.badges);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Background revalidate so logs stay fresh in long-running tabs and the
  // mission badge (which needs a join into mission_comments) populates.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/logs?token=${token}`);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        setLogs(data.logs || []);
        if (data.badges) setBadges(data.badges);
      } catch {
        // ignore — keep server-rendered initial state
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const statusConfig = {
    morning_only: { label: "朝のみ", bg: "bg-[#F2F2F7]", text: "text-[#2C2C4A]" },
    complete: { label: "完了", bg: "bg-[#EFF5F1]", text: "text-[#2D6A4F]" },
    fb_done: { label: "FB済", bg: "bg-[#FAF4E9]", text: "text-[#A66214]" },
    empty: { label: "未記入", bg: "bg-[#F4F2F3]", text: "text-[#8B8489]" },
  };

  // Generate a CSV from the logs already loaded on the page (no server round
  // trip, no token in URL) and trigger a download. UTF-8 BOM is prepended so
  // Excel opens Japanese text without mojibake. HM feedback / manager comment
  // are intentionally excluded — this is the participant's own export.
  const handleDownloadCsv = () => {
    const headers = ["日付", "曜日", "朝の意図", "本日の振り返り", "エネルギー", "ステータス"];
    const rows = [...logs]
      // Oldest → newest reads naturally in a spreadsheet.
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((log) =>
        [
          csvCell(log.date),
          csvCell(log.dayOfWeek),
          csvCell(log.morningIntent || ""),
          csvCell(log.eveningInsight || ""),
          csvCell(log.energy ? energyLabel[log.energy] : ""),
          csvCell(statusLabel[log.status] ?? ""),
        ].join(","),
      );
    // ﻿ = UTF-8 BOM. Without it Excel interprets the file as Shift-JIS
    // and Japanese text becomes mojibake.
    const csv = "﻿" + [headers.map(csvCell).join(","), ...rows].join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }); // YYYY-MM-DD
    a.download = `core-log-${today}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-24">
      {/* Header */}
      <div className="gradient-header text-white px-6 pt-12 pb-6">
        <div className="max-w-md mx-auto relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">ログ一覧</h1>
            <p className="text-indigo-200 text-sm mt-1 font-light">{logs.length}件の記録</p>
          </div>
          {logs.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium bg-white/15 hover:bg-white/25 text-white px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
              aria-label="ログをCSVでダウンロード"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              CSV
            </button>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 animate-fade-up relative z-10">
        {/* standalone §6: 振り返り＝ログ一覧＋ローソク足の長期表示（解禁後のみ） */}
        {initialData.standaloneCandle && logs.length > 0 && (
          <div className="mb-4">
            <MoodCandlestick
              logs={logs.map((l) => ({
                date: l.date,
                energy: l.energy,
                eveningEnergy: l.eveningEnergy ?? null,
              }))}
              days={42}
              title="気分の推移（長期）"
            />
          </div>
        )}
        {logs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 bg-[#EFE8DD] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8B8489" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <p className="text-[#5B5560] text-sm">まだログがありません</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => {
              const config = statusConfig[log.status] || statusConfig.empty;
              return (
                <div key={log.id} className="card overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    className="w-full p-4 flex gap-3 hover:bg-[#FBF8F4] transition-colors text-left"
                  >
                    <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-semibold ${
                      log.hasFeedback ? "bg-[#C17817]" : "bg-[#1A1A2E]"
                    }`}>
                      <div className="text-center leading-tight">
                        <div className="font-bold text-sm">{log.dayNum}</div>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#1A1A2E] font-medium truncate leading-tight">
                        {log.morningIntent || "(未記入)"}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-[#8B8489]">{formatDateTime(log.datetime, log.date)} ({log.dayOfWeek})</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${config.bg} ${config.text}`}>
                          {config.label}
                        </span>
                      </div>
                    </div>

                    <div className="flex-shrink-0 flex items-center gap-2">
                      {log.energy && (
                        <EnergyGlyph level={log.energy} size={18} />
                      )}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9BDAE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className={`transition-transform duration-200 ${expandedId === log.id ? "rotate-90" : ""}`}>
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </div>
                  </button>

                  {/* Expanded View */}
                  {expandedId === log.id && (
                    <div className="border-t border-[#EFE8DD] p-4 bg-[#FBF8F4] space-y-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[10px] font-medium text-[#1A1A2E] tracking-wide uppercase">朝の意図</p>
                          {log.morningTime && (
                            <span className="text-[10px] text-[#C9BDAE]">{formatTime(log.morningTime)}</span>
                          )}
                        </div>
                        <p className="text-sm text-[#2C2C4A] leading-relaxed">{log.morningIntent || "(未記入)"}</p>
                      </div>

                      {log.eveningInsight && (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-[10px] font-medium text-amber-600 tracking-wide uppercase">本日の振り返り</p>
                            {log.eveningTime && (
                              <span className="text-[10px] text-[#C9BDAE]">{formatTime(log.eveningTime)}</span>
                            )}
                          </div>
                          <p className="text-sm text-[#2C2C4A] leading-relaxed">{log.eveningInsight}</p>
                        </div>
                      )}

                      {log.energy && (
                        <div className="flex items-center gap-2">
                          <EnergyGlyph level={log.energy} size={16} />
                          <span className="text-xs text-[#5B5560]">{energyLabel[log.energy]}</span>
                        </div>
                      )}

                      {log.managerReaction && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-[#8B8489] mr-0.5">上司リアクション</span>
                          {log.managerReaction.split(",").filter(Boolean).map((emoji, i) => (
                            <span
                              key={`${emoji}-${i}`}
                              className="inline-flex items-center px-1.5 py-0.5 bg-indigo-50 border border-indigo-200 rounded-full text-sm"
                            >
                              {emoji}
                            </span>
                          ))}
                        </div>
                      )}

                      {log.managerComment && (
                        <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-xl">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-[10px] font-medium text-[#1A1A2E] tracking-wide">上司コメント</p>
                            {log.managerCommentTime && (
                              <span className="text-[10px] text-[#C9BDAE]">{formatTime(log.managerCommentTime)}</span>
                            )}
                          </div>
                          <p className="text-sm text-[#2C2C4A] leading-relaxed">{log.managerComment}</p>
                        </div>
                      )}

                      {log.hmFeedback && (
                        <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl">
                          <p className="text-[10px] font-medium text-amber-600 tracking-wide mb-1">HMフィードバック</p>
                          <p className="text-sm text-[#2C2C4A] leading-relaxed">{log.hmFeedback}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav active="logs" baseUrl={`/p/${token}`} badges={badges} />
    </div>
  );
}
