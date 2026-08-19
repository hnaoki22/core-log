"use client";

// 過去のAI分析（21日レポート）を新しい順に並べて開閉するリスト。
// standalone-report ページ（表示中を除く過去分）と、ログ画面の「AI分析（これまで）」
// （2026-08-18 太田さん FB: 生成せずに過去の分析と自分のコメントを見返せるように）で共用。

import { useState } from "react";

export type ReportHistoryItem = {
  id: string;
  report: {
    correlationLens: string;
    themeLens: string;
    skipNote: string | null;
    nextQuestion?: string;
  };
  periodStart: string;
  periodEnd: string;
  entryDays: number;
  createdAt: string;
};

export type ReportNote = { id: string; note: string; createdAt: string; reportId?: string | null };

function fmtDate(d: string): string {
  return (d || "").slice(0, 10).replace(/-/g, "/");
}

interface Props {
  items: ReportHistoryItem[];
  /** レポートidごとの「自分の気づき」（tier-e.selfInsightNote 有効時のみ渡す） */
  notesByReport?: Record<string, ReportNote[]>;
  /** 最初から開いておく id（ログ画面では最新を開いた状態にする） */
  initiallyOpenId?: string | null;
}

export function ReportHistoryList({ items, notesByReport, initiallyOpenId = null }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>(initiallyOpenId ? { [initiallyOpenId]: true } : {});
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2">
      {items.map((h) => {
        const isOpen = !!open[h.id];
        const notes = notesByReport?.[h.id] ?? [];
        return (
          <li key={h.id} className="bg-[#FAF7F3] rounded-xl">
            <button
              type="button"
              onClick={() => setOpen((prev) => ({ ...prev, [h.id]: !prev[h.id] }))}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between text-left px-3 py-2.5"
            >
              <span className="text-xs text-[#1A1A2E]">
                {fmtDate(h.periodStart)} 〜 {fmtDate(h.periodEnd)}
                <span className="text-[#8B8489]">（記入{h.entryDays}日）</span>
              </span>
              <span className="text-[10px] text-[#8B8489] ml-2 whitespace-nowrap">
                {fmtDate(h.createdAt)} {isOpen ? "▲" : "▼"}
              </span>
            </button>
            {isOpen && (
              <div className="px-3 pb-3 space-y-3">
                <div>
                  <p className="text-[10px] text-[#8B8489] font-medium mb-1">気分と意図の動き</p>
                  <p className="text-xs text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">{h.report.correlationLens}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#8B8489] font-medium mb-1">繰り返し現れるテーマ</p>
                  <p className="text-xs text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">{h.report.themeLens}</p>
                </div>
                {h.report.skipNote && (
                  <div>
                    <p className="text-[10px] text-[#8B8489] font-medium mb-1">書かなかった日について</p>
                    <p className="text-xs text-[#5B5560] leading-relaxed">{h.report.skipNote}</p>
                  </div>
                )}
                {h.report.nextQuestion && (
                  <div className="border-l-2 border-l-[#1A1A2E] pl-2">
                    <p className="text-[10px] text-[#8B8489] font-medium mb-1">次の問い</p>
                    <p className="text-xs text-[#1A1A2E] leading-relaxed">{h.report.nextQuestion}</p>
                  </div>
                )}
                {notes.length > 0 && (
                  <div className="border-t border-stone-200 pt-2">
                    <p className="text-[10px] text-[#8B8489] font-medium mb-1">この分析への自分の気づき</p>
                    <div className="space-y-2">
                      {notes.map((n) => (
                        <div key={n.id}>
                          <p className="text-xs text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">{n.note}</p>
                          <p className="text-[10px] text-[#8B8489] mt-0.5">{fmtDate(n.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
