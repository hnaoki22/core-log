"use client";

// 設計図のページ（feature.coachingProfile）。本人が内容を確かめ、直して、確定する。
//
// - 初期値はサーバー（page.tsx）が読んだ本人の設計図。未作成のときは空の欄から書ける。
// - 保存は PUT /api/coaching-profile（confirm=true）。確定済みの設計図を直したときも、確定のまま保存する。
// - 運営が置いた傾向は、「使う／使わない」だけを選べる（文は書き換えられない）。
// - 文言は coaching-profile.ts の COACHING_TERMS。

import Link from "next/link";
import { useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import {
  COACHING_TERMS,
  EVENING_QUESTION_MAX,
  HEADLINE_MAX,
  LONG_TEXT_MAX,
  type CoachingProfile,
  type CoachingTendency,
} from "@/lib/coaching-profile";

interface Props {
  token: string;
  initialProfile: CoachingProfile | null;
  loadFailed: boolean;
}

type LongFieldKey = "growthTheme" | "actions" | "expected" | "stallPoints";

const LONG_FIELDS: Array<{ key: LongFieldKey; label: string; help?: string }> = [
  { key: "growthTheme", label: COACHING_TERMS.growthThemeLabel },
  { key: "actions", label: COACHING_TERMS.actionsLabel, help: COACHING_TERMS.actionsHelp },
  { key: "expected", label: COACHING_TERMS.expectedLabel },
  { key: "stallPoints", label: COACHING_TERMS.stallPointsLabel },
];

export default function BlueprintClient({ token, initialProfile, loadFailed }: Props) {
  const [status, setStatus] = useState<"none" | "draft" | "confirmed">(
    initialProfile ? initialProfile.status : "none"
  );
  const [headline, setHeadline] = useState(initialProfile?.headline ?? "");
  const [longValues, setLongValues] = useState<Record<LongFieldKey, string>>({
    growthTheme: initialProfile?.growthTheme ?? "",
    actions: initialProfile?.actions ?? "",
    expected: initialProfile?.expected ?? "",
    stallPoints: initialProfile?.stallPoints ?? "",
  });
  const [eveningQuestion, setEveningQuestion] = useState(initialProfile?.eveningQuestion ?? "");
  const [tendencies, setTendencies] = useState<CoachingTendency[]>(initialProfile?.tendencies ?? []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const save = async () => {
    if (saving) return;
    if (headline.trim() === "") {
      setMessage({ kind: "error", text: COACHING_TERMS.headlineRequired });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/coaching-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          headline,
          ...longValues,
          eveningQuestion,
          tendencies,
          confirm: true,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; profile?: CoachingProfile; error?: string }
        | null;
      if (!res.ok || !data?.ok || !data.profile) {
        setMessage({
          kind: "error",
          text: res.status === 400 && data?.error ? data.error : COACHING_TERMS.saveFailed,
        });
        return;
      }
      const p = data.profile;
      setStatus(p.status);
      setHeadline(p.headline);
      setLongValues({
        growthTheme: p.growthTheme,
        actions: p.actions,
        expected: p.expected,
        stallPoints: p.stallPoints,
      });
      setEveningQuestion(p.eveningQuestion);
      setTendencies(p.tendencies);
      setMessage({ kind: "ok", text: COACHING_TERMS.savedMessage });
    } catch {
      setMessage({ kind: "error", text: COACHING_TERMS.saveFailed });
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-[#E5DCD0] bg-white px-3 py-2.5 text-sm text-[#1A1A2E] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/20";

  return (
    <div className="min-h-screen bg-[#F5F0EB] pb-24">
      <div className="gradient-header text-white px-6 pt-12 pb-6">
        <div className="max-w-md mx-auto relative z-10">
          <h1 className="text-xl font-semibold tracking-tight">{COACHING_TERMS.pageTitle}</h1>
          <p className="text-indigo-200 text-sm mt-1 font-light">{COACHING_TERMS.pageLead}</p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pt-5 relative z-10 space-y-4">
        {loadFailed ? (
          <div className="bg-white border border-[#EFE8DD] p-4 rounded-2xl">
            <p className="text-sm text-[#1A1A2E] leading-relaxed">
              設計図を読み込めませんでした。時間をおいて、このページを開き直してください。
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  status === "confirmed" ? "bg-[#1A1A2E] text-white" : "bg-[#E5DCD0] text-[#5B5560]"
                }`}
              >
                {status === "confirmed" ? COACHING_TERMS.statusConfirmed : COACHING_TERMS.statusDraft}
              </span>
            </div>

            {status !== "confirmed" && (
              <div className="bg-[#FBF8F4] border border-dashed border-[#E5DCD0] p-4 rounded-2xl">
                <p className="text-xs text-[#5B5560] leading-relaxed">
                  {status === "none" ? COACHING_TERMS.emptyBanner : COACHING_TERMS.draftBanner}
                </p>
              </div>
            )}

            <div className="bg-white border border-[#EFE8DD] p-4 rounded-2xl space-y-4">
              <div>
                <label htmlFor="bp-headline" className="block text-xs font-medium text-[#1A1A2E] mb-1">
                  {COACHING_TERMS.headlineLabel} *
                </label>
                <p className="text-[11px] text-[#8B8489] mb-1.5 leading-relaxed">{COACHING_TERMS.headlineHelp}</p>
                <textarea
                  id="bp-headline"
                  value={headline}
                  onChange={(e) => setHeadline(e.target.value)}
                  maxLength={HEADLINE_MAX}
                  rows={2}
                  className={inputClass}
                />
              </div>

              {LONG_FIELDS.map((f) => (
                <div key={f.key}>
                  <label htmlFor={`bp-${f.key}`} className="block text-xs font-medium text-[#1A1A2E] mb-1">
                    {f.label}
                  </label>
                  {f.help && <p className="text-[11px] text-[#8B8489] mb-1.5 leading-relaxed">{f.help}</p>}
                  <textarea
                    id={`bp-${f.key}`}
                    value={longValues[f.key]}
                    onChange={(e) => setLongValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    maxLength={LONG_TEXT_MAX}
                    rows={4}
                    className={inputClass}
                  />
                </div>
              ))}

              <div>
                <label htmlFor="bp-evening-question" className="block text-xs font-medium text-[#1A1A2E] mb-1">
                  {COACHING_TERMS.eveningQuestionLabel}
                </label>
                <p className="text-[11px] text-[#8B8489] mb-1.5 leading-relaxed">{COACHING_TERMS.eveningQuestionHelp}</p>
                <textarea
                  id="bp-evening-question"
                  value={eveningQuestion}
                  onChange={(e) => setEveningQuestion(e.target.value)}
                  maxLength={EVENING_QUESTION_MAX}
                  rows={2}
                  className={inputClass}
                />
              </div>
            </div>

            {tendencies.length > 0 && (
              <div className="bg-white border border-[#EFE8DD] p-4 rounded-2xl">
                <p className="text-xs font-medium text-[#1A1A2E] mb-1">{COACHING_TERMS.tendenciesLabel}</p>
                <p className="text-[11px] text-[#8B8489] mb-3 leading-relaxed">{COACHING_TERMS.tendenciesHelp}</p>
                <div className="space-y-3">
                  {tendencies.map((t, i) => (
                    <div key={i} className="min-w-0">
                      <p className="text-sm text-[#1A1A2E] leading-relaxed whitespace-pre-wrap break-words">{t.text}</p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {([true, false] as const).map((choice) => {
                          const selected = t.use === choice;
                          return (
                            <button
                              key={String(choice)}
                              type="button"
                              aria-pressed={selected}
                              onClick={() =>
                                setTendencies((prev) => prev.map((x, j) => (j === i ? { ...x, use: choice } : x)))
                              }
                              className={`rounded-full border px-3 py-1 text-xs whitespace-nowrap ${
                                selected
                                  ? "border-[#1A1A2E] bg-[#1A1A2E] text-white"
                                  : "border-[#E5DCD0] bg-white text-[#5B5560]"
                              }`}
                            >
                              {choice ? COACHING_TERMS.tendencyUse : COACHING_TERMS.tendencyNotUse}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-[#8B8489] leading-relaxed">{COACHING_TERMS.notice}</p>

            {message && (
              <p
                role="status"
                className={`text-sm leading-relaxed ${message.kind === "ok" ? "text-[#1A1A2E]" : "text-red-700"}`}
              >
                {message.text}
              </p>
            )}

            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="w-full rounded-xl bg-[#1A1A2E] text-white py-3 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "保存中..." : status === "confirmed" ? COACHING_TERMS.saveButton : COACHING_TERMS.confirmButton}
            </button>

            <div className="text-center">
              <Link href={`/p/${token}/input`} className="text-xs font-medium text-[#1A1A2E] underline underline-offset-2">
                記入画面へ
              </Link>
            </div>
          </>
        )}
      </div>

      <BottomNav active="mission" baseUrl={`/p/${token}`} />
    </div>
  );
}
