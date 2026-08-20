"use client";

// 途中メモのシート（ホーム右上「＋」から開く。standalone のみ）
//
// 2026-08-18 定例・太田さん FB「＋を押しても記入すると同じ動きで意味が薄い。途中で何か
// 入れられるボタンだと思った」→ 業務の合間・気づいた時に忘れないうちに一言を書き足す入力。
// 朝夕の記入とは別枠。夕の記入画面とログ画面で見返せて、AI分析の素材にもなる。
//
// 設計:
// - 1画面1問・所要は数秒。保存後もシートは開いたまま（続けて書ける）。
// - 今日の分だけを扱う（属する日付はサーバーが決める）。削除は本人のメモのみ。
// - 開いたときに今日の分をサーバーから読み直す（別端末で書いた分・SSR取得失敗の穴埋め）。
// - BottomNav（fixed・z-50）より手前に出す（z-[60]）。同じ z だと下部のメモがナビの下に隠れる。

import { useEffect, useRef, useState } from "react";
import { formatTimeJST } from "@/lib/date-utils";

export type QuickNoteItem = {
  id: string;
  noteDate: string;
  text: string;
  createdAt: string;
};

export const QUICK_NOTE_MAX_CHARS = 1000;

/**
 * ホームの Today カード右上に置く「＋ メモ」ボタン（absolute 配置。親に relative と右余白が必要）。
 * 今日のメモがあれば件数バッジを出す。dark=記入前の濃色カード / light=記入完了の淡色カード。
 */
export function QuickNoteButton({
  count,
  onClick,
  variant,
}: {
  count: number;
  onClick: () => void;
  variant: "dark" | "light";
}) {
  const tone =
    variant === "dark"
      ? "bg-white/10 hover:bg-white/20 text-white"
      : "bg-[#F2F2F7] hover:bg-[#E9E9F1] text-[#1A1A2E]";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `途中メモを書く（今日 ${count}件）` : "途中メモを書く"}
      className={`absolute top-5 right-5 rounded-xl px-2.5 py-2 flex flex-col items-center gap-0.5 transition-colors ${tone}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      <span className="text-[9px] font-medium leading-none tracking-wide">メモ</span>
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C17817] text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

type Props = {
  token: string;
  open: boolean;
  onClose: () => void;
  notes: QuickNoteItem[];
  onNotesChange: (notes: QuickNoteItem[]) => void;
};

export function QuickNoteSheet({ token, open, onClose, notes, onNotesChange }: Props) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedHint, setSavedHint] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 開いたら入力欄にフォーカスし、今日の分を読み直す
  useEffect(() => {
    if (!open) return;
    setError("");
    setSavedHint(false);
    const t = window.setTimeout(() => textareaRef.current?.focus(), 50);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/standalone/quick-note?token=${encodeURIComponent(token)}`);
        const body = await res.json();
        if (!cancelled && res.ok && Array.isArray(body.notes)) onNotesChange(body.notes as QuickNoteItem[]);
      } catch {
        /* 読み直しの失敗は致命的ではない（手元の一覧を保つ） */
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // onNotesChange は親の setState 系で安定している前提。open/token の変化でのみ読み直す。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, token]);

  // Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const save = async () => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError("");
    setSavedHint(false);
    try {
      const res = await fetch("/api/standalone/quick-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, text: trimmed }),
      });
      const body = await res.json();
      if (res.ok && body.note) {
        onNotesChange([...notes, body.note as QuickNoteItem]);
        setText("");
        setSavedHint(true);
        textareaRef.current?.focus();
      } else {
        setError(body?.error || "保存できませんでした");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    setError("");
    try {
      const res = await fetch("/api/standalone/quick-note", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, id }),
      });
      const body = await res.json();
      if (res.ok && body.success) {
        onNotesChange(notes.filter((n) => n.id !== id));
      } else {
        setError(body?.error || "削除できませんでした");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="quick-note-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute bottom-0 left-0 right-0">
        <div className="max-w-md mx-auto bg-[#F5F0EB] rounded-t-3xl px-5 pt-5 pb-10 shadow-2xl animate-fade-up max-h-[85vh] overflow-y-auto">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div className="min-w-0">
              <h2 id="quick-note-title" className="text-base font-semibold text-[#1A1A2E] tracking-tight">途中メモ</h2>
              <p className="text-xs text-[#5B5560] mt-1 leading-relaxed">
                気づいたことを、忘れないうちに一言。夕の記入のときに見返せます。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="flex-shrink-0 w-8 h-8 rounded-full bg-white/70 hover:bg-white text-[#5B5560] flex items-center justify-center transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例：会議で言えなかった一言が残っている／午後、急に楽になった"
            rows={3}
            maxLength={QUICK_NOTE_MAX_CHARS}
            className="input-field mt-3 min-h-[84px] resize-none text-sm leading-relaxed"
          />
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          <div className="flex items-center justify-between mt-3 gap-3">
            <p className="text-[11px] text-[#8B8489] min-w-0">{savedHint ? "残しました。" : ""}</p>
            <button
              type="button"
              onClick={save}
              disabled={saving || !text.trim()}
              className="text-sm font-medium text-white bg-[#1A1A2E] rounded-full px-5 py-2 disabled:opacity-40 transition-opacity flex-shrink-0"
            >
              {saving ? "保存中…" : "残す"}
            </button>
          </div>

          {notes.length > 0 && (
            <div className="mt-5 border-t border-[#E5DCD0] pt-4">
              <p className="text-[10px] text-[#8B8489] font-medium tracking-wide uppercase mb-2">今日のメモ（{notes.length}件）</p>
              <ul className="space-y-2">
                {notes.map((n) => (
                  <li key={n.id} className="bg-white/70 rounded-xl p-3 flex items-start gap-3">
                    <span className="text-[10px] text-[#8B8489] mt-0.5 flex-shrink-0 tabular-nums">{formatTimeJST(n.createdAt)}</span>
                    <p className="text-sm text-[#1A1A2E] leading-relaxed whitespace-pre-wrap flex-1 min-w-0 break-words">{n.text}</p>
                    <button
                      type="button"
                      onClick={() => remove(n.id)}
                      disabled={deletingId === n.id}
                      aria-label="このメモを削除"
                      className="text-[10px] text-[#8B8489] hover:text-[#8B1A2B] flex-shrink-0 disabled:opacity-40 transition-colors"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
