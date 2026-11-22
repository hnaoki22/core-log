"use client";

// 設計図のページ（feature.coachingProfile）。本人が内容を確かめ、直して、確定する。
//
// - 初期値はサーバー（page.tsx）が読んだ本人の設計図。未作成のときは空の欄から書ける。
// - 保存は PUT /api/coaching-profile（confirm=true）。確定済みの設計図を直したときも、確定のまま保存する。
// - 運営が置いた傾向は、「使う／使わない」だけを選べる（文は書き換えられない）。
// - 先頭に、いまのイシュー（ミッション）と仮説を出す（BlueprintIssueCard。サーバーが読んで渡す）。
//   設計図とイシューは別々に保存しているので、ここではイシューを直せない（「イシュー」のページへのリンクを出す）。
// - 欄は 2 つのまとまりで見せる：イシューに向けた行動（これからの行動、期待する結果と確かめ方）と、
//   自分の行動の変え方（成長課題、毎朝の一文、止まりそうな場面、夕方に自分へ聞く問い）。
//   見せ方だけの区切りで、保存する欄は変えていない。
// - 保存していない変更があるあいだは、ページを離れる前に確かめる（useLeaveGuard）。
// - 下のタブは「ホーム」を選んだ表示にする（入口がホームにあるため。「イシュー」のページの中の扱いにしない）。
// - 文言は coaching-profile.ts の COACHING_TERMS と、mission-context.ts の MissionTerms。

import Link from "next/link";
import { useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { BlueprintIssueCard } from "@/components/features/BlueprintIssueCard";
import { CoachOptInCard } from "@/components/features/CoachOptInCard";
import { COACH_TERMS } from "@/lib/coach-reply";
import {
  COACHING_TERMS,
  EVENING_QUESTION_MAX,
  HEADLINE_MAX,
  LONG_TEXT_MAX,
  sameFields,
  type CoachingProfile,
  type CoachingProfileFields,
  type CoachingTendency,
} from "@/lib/coaching-profile";
import { missionTerms, type CurrentIssue } from "@/lib/mission-context";
import { useLeaveGuard } from "@/lib/use-leave-guard";

/**
 * AIコーチの欄（feature.coachReply）に渡す値。サーバー（page.tsx）が決める。
 * - null・未指定 = 欄を出さない（スイッチが OFF、商品モード、アプリ全体で止めている）。
 * - optIn: null  = 設計図の行が、まだ無い。
 * - loadFailed   = いまの設定を読めなかった（ボタンを出さない）。
 */
export type BlueprintCoachProps = { optIn: boolean | null; loadFailed: boolean } | null;

/**
 * 先頭に出す、いまのイシュー（ミッション）。サーバー（page.tsx）が決める。
 * - null・未指定 = ミッション機能を出していない環境（枠を出さず、欄の見出しもイシューを前提にしない）。
 * - view: null    = 読めなかった（枠を出さない。「まだ設定されていません」とは出さない）。
 * - useIssueLabel = 呼び名（feature.missionLabelIssue が ON なら「イシュー」）。
 */
export type BlueprintIssueProps = { useIssueLabel: boolean; view: CurrentIssue | null } | null;

interface Props {
  token: string;
  initialProfile: CoachingProfile | null;
  loadFailed: boolean;
  coach?: BlueprintCoachProps;
  issue?: BlueprintIssueProps;
}

type LongFieldKey = "growthTheme" | "actions" | "expected" | "stallPoints";
type LongField = { key: LongFieldKey; label: string; help?: string };

// 1 つ目のまとまり：いまのイシューに向けた行動。
const ACTION_FIELDS: LongField[] = [
  { key: "actions", label: COACHING_TERMS.actionsLabel, help: COACHING_TERMS.actionsHelp },
  { key: "expected", label: COACHING_TERMS.expectedLabel },
];
// 2 つ目のまとまり：自分の行動の変え方（このあいだに、毎朝の一文と、夕方に自分へ聞く問いをはさむ）。
const GROWTH_FIELD: LongField = { key: "growthTheme", label: COACHING_TERMS.growthThemeLabel };
const STALL_FIELD: LongField = { key: "stallPoints", label: COACHING_TERMS.stallPointsLabel };

/** 欄の中身を、保存済みの内容と比べられる形にそろえる（設計図がまだ無いときは、空の欄）。 */
function fieldsOf(p: CoachingProfile | null): CoachingProfileFields {
  return {
    headline: p?.headline ?? "",
    growthTheme: p?.growthTheme ?? "",
    actions: p?.actions ?? "",
    expected: p?.expected ?? "",
    stallPoints: p?.stallPoints ?? "",
    eveningQuestion: p?.eveningQuestion ?? "",
    tendencies: p?.tendencies ?? [],
  };
}

export default function BlueprintClient({ token, initialProfile, loadFailed, coach = null, issue = null }: Props) {
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

  // 保存済みの内容（最初はサーバーが読んだもの。保存に成功するたびに入れ替える）。
  // いまの欄と違うあいだは、保存していない変更がある。ページを離れる前に確かめる。
  const [saved, setSaved] = useState<CoachingProfileFields>(() => fieldsOf(initialProfile));
  const dirty =
    !loadFailed && !sameFields(saved, { headline, ...longValues, eveningQuestion, tendencies });
  useLeaveGuard(dirty, COACHING_TERMS.leaveConfirm);

  // 先頭の枠と、1 つ目のまとまりの見出し。いまのイシューを出している環境では、呼び名に合わせる。
  const issueTerms = issue ? missionTerms(issue.useIssueLabel) : null;
  const actionsGroupHeading = issueTerms ? issueTerms.blueprintActionsHeading : COACHING_TERMS.actionsGroupHeading;

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
      setSaved(fieldsOf(p));
      setMessage({ kind: "ok", text: COACHING_TERMS.savedMessage });
    } catch {
      setMessage({ kind: "error", text: COACHING_TERMS.saveFailed });
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-[#E5DCD0] bg-white px-3 py-2.5 text-sm text-[#1A1A2E] leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/20";

  // 長い文の欄（成長課題、これからの行動、期待する結果と確かめ方、止まりそうな場面）。
  const renderLongField = (f: LongField) => (
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
  );

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

            {/* いまのイシュー（ミッション）と仮説。ミッション機能を出していない環境と、読めなかったときは出さない。 */}
            {issue && issue.view && issueTerms && (
              <BlueprintIssueCard issue={issue.view} terms={issueTerms} missionPageHref={`/p/${token}/mission`} />
            )}

            {/* 1 つ目のまとまり：いまのイシューに向けた行動 */}
            <div className="bg-white border border-[#EFE8DD] p-4 rounded-2xl space-y-4">
              <h2 className="text-sm font-semibold text-[#1A1A2E]">{actionsGroupHeading}</h2>
              {ACTION_FIELDS.map(renderLongField)}
            </div>

            {/* 2 つ目のまとまり：自分の行動の変え方 */}
            <div className="bg-white border border-[#EFE8DD] p-4 rounded-2xl space-y-4">
              <h2 className="text-sm font-semibold text-[#1A1A2E]">{COACHING_TERMS.selfGroupHeading}</h2>

              {renderLongField(GROWTH_FIELD)}

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

              {renderLongField(STALL_FIELD)}

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
                <p className="text-[11px] text-[#8B8489] mb-3 leading-relaxed">
                  {COACHING_TERMS.tendenciesHelp}
                  {/* 「使う」にすると何が起きるか。AIコーチの返信を出している環境でだけ、傾向を材料に使う
                      （それ以外の環境では、選んだ内容を保存するだけなので、この一文は出さない）。 */}
                  {coach ? COACH_TERMS.tendenciesNote : null}
                </p>
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

            {/* AIコーチの説明と、受け取る・受け取らない（feature.coachReply）。上の「確定」「保存」とは別に、
                押したときに保存する。設計図の行ができる（確定する）と、選べるようになる。 */}
            {coach && (
              <CoachOptInCard
                token={token}
                hasProfile={status !== "none"}
                initialOptIn={coach.optIn}
                loadFailed={coach.loadFailed}
              />
            )}

            <div className="text-center">
              <Link href={`/p/${token}/input`} className="text-xs font-medium text-[#1A1A2E] underline underline-offset-2">
                記入画面へ
              </Link>
            </div>
          </>
        )}
      </div>

      <BottomNav active="home" baseUrl={`/p/${token}`} />
    </div>
  );
}
