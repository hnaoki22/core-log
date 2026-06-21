"use client";

// standalone §8: 21日AIレポート v0 の表示ページ（AI分析の入口から遷移）
// 相関レンズ＋テーマ反復レンズの2枚構成。スキップの一言は咎めないトーンで添える。

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFeatures } from "@/lib/use-features";

type ReportPayload = {
  id?: string;
  report: {
    correlationLens: string;
    themeLens: string;
    skipNote: string | null;
    // プロンプト v1 で追加。それ以前に生成・キャッシュされた行には無い（後方互換）
    nextQuestion?: string;
  };
  periodStart: string;
  periodEnd: string;
  entryDays: number;
  createdAt: string;
  cached?: boolean;
};

export default function StandaloneReportPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [data, setData] = useState<ReportPayload | null>(null);
  const [lockedInfo, setLockedInfo] = useState<{ daysElapsed: number; entryDays: number } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const { isOn } = useFeatures();
  const notesEnabled = isOn("tier-e.selfInsightNote");
  const [notes, setNotes] = useState<{ id: string; note: string; createdAt: string }[]>([]);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/standalone/report?token=${encodeURIComponent(token)}`);
        const body = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setData(body as ReportPayload);
        } else if (body?.locked) {
          setLockedInfo({ daysElapsed: body.daysElapsed ?? 0, entryDays: body.entryDays ?? 0 });
        } else {
          setError(body?.error || "レポートを取得できませんでした");
        }
      } catch {
        if (!cancelled) setError("通信エラーが発生しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // 自分の気づき（tier-e.selfInsightNote）— 解禁後にのみ読み込む
  useEffect(() => {
    if (!notesEnabled || !data) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/standalone/report/note?token=${encodeURIComponent(token)}`);
        const body = await res.json();
        if (!cancelled && res.ok && Array.isArray(body.notes)) setNotes(body.notes);
      } catch {
        /* 取得失敗は致命的ではないので黙って無視（本人体験優先） */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notesEnabled, data, token]);

  async function saveNote() {
    const text = noteText.trim();
    if (!text || savingNote) return;
    setSavingNote(true);
    setNoteError("");
    try {
      const res = await fetch(`/api/standalone/report/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, reportId: data?.id ?? null, note: text }),
      });
      const body = await res.json();
      if (res.ok && body.note) {
        setNotes((prev) => [body.note, ...prev]);
        setNoteText("");
      } else {
        setNoteError(body?.error || "保存できませんでした");
      }
    } catch {
      setNoteError("通信エラーが発生しました");
    } finally {
      setSavingNote(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F0EB] flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#1A1A2E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#5B5560] text-sm mb-1">3週間分のログを観ています…</p>
          <p className="text-[#8B8489] text-xs">初回は30秒ほどかかることがあります</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-24">
      <div className="gradient-header text-white px-6 pt-12 pb-6">
        <div className="max-w-md mx-auto relative z-10">
          <button
            onClick={() => router.push(`/p/${token}`)}
            className="text-indigo-200 hover:text-white text-sm mb-4 flex items-center gap-1 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            ホームに戻る
          </button>
          <h1 className="text-lg font-semibold tracking-tight">あなたの3週間 ── CORE Logが観た事</h1>
          {data && (
            <p className="text-indigo-200 text-sm mt-1.5 font-light">
              {data.periodStart.replace(/-/g, "/")} 〜 {data.periodEnd.replace(/-/g, "/")}（記入{data.entryDays}日）
            </p>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-6 space-y-4 animate-fade-up">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {lockedInfo && (
          <div className="card p-6 text-center">
            <p className="text-sm text-[#1A1A2E] font-medium mb-2">まだ観ている途中です</p>
            <p className="text-xs text-[#5B5560] leading-relaxed">
              初回の記入から21日が経ち、記入が10日に届くと、ここにあなたのパターンが現れます。
              <br />（現在: {lockedInfo.daysElapsed}日経過・記入{lockedInfo.entryDays}日）
            </p>
          </div>
        )}

        {data && (
          <>
            {/* 相関レンズ（内部名は画面に出さない） */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🕯️</span>
                <h2 className="font-semibold text-sm text-[#1A1A2E]">気分と意図の動き</h2>
              </div>
              <p className="text-sm text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">
                {data.report.correlationLens}
              </p>
            </div>

            {/* テーマ反復レンズ */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">🔁</span>
                <h2 className="font-semibold text-sm text-[#1A1A2E]">繰り返し現れるテーマ</h2>
              </div>
              <p className="text-sm text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">
                {data.report.themeLens}
              </p>
            </div>

            {/* スキップの一言（任意） */}
            {data.report.skipNote && (
              <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4">
                <p className="text-[10px] text-stone-500 font-medium tracking-wide uppercase mb-1.5">書かなかった日について</p>
                <p className="text-xs text-stone-600 leading-relaxed">{data.report.skipNote}</p>
              </div>
            )}

            {/* 次の問い（プロンプト v1。旧キャッシュには無いので条件表示） */}
            {data.report.nextQuestion && (
              <div className="card p-5 border-l-2 border-l-[#1A1A2E]">
                <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mb-2">次の問い</p>
                <p className="text-sm text-[#1A1A2E] leading-relaxed">{data.report.nextQuestion}</p>
              </div>
            )}

            {notesEnabled && (
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">✍️</span>
                  <h2 className="font-semibold text-sm text-[#1A1A2E]">この分析を読んで、自分の気づき</h2>
                </div>
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="読んで感じたこと、腑に落ちたこと、違和感などを自由に。"
                  rows={4}
                  maxLength={2000}
                  className="w-full text-sm text-[#1A1A2E] bg-[#FAF7F3] border border-stone-200 rounded-xl p-3 leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/20 resize-y"
                />
                {noteError && <p className="text-xs text-red-600 mt-2">{noteError}</p>}
                <div className="flex justify-end mt-3">
                  <button
                    onClick={saveNote}
                    disabled={savingNote || !noteText.trim()}
                    className="text-sm font-medium text-white bg-[#1A1A2E] rounded-full px-5 py-2 disabled:opacity-40 transition-opacity"
                  >
                    {savingNote ? "保存中…" : "気づきを残す"}
                  </button>
                </div>
                {notes.length > 0 && (
                  <div className="mt-5 space-y-3 border-t border-stone-100 pt-4">
                    <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase">これまでの気づき</p>
                    {notes.map((n) => (
                      <div key={n.id} className="bg-[#FAF7F3] rounded-xl p-3">
                        <p className="text-sm text-[#1A1A2E] leading-relaxed whitespace-pre-wrap">{n.note}</p>
                        <p className="text-[10px] text-[#8B8489] mt-1.5">{n.createdAt?.slice(0, 10).replace(/-/g, "/")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p className="text-[10px] text-[#8B8489] text-center leading-relaxed pt-2">
              これは装置が観た事の映し返しです。診断でも評価でもありません。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
