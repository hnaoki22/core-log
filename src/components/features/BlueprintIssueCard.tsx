// 設計図のページ（feature.coachingProfile）の先頭に出す、いまのイシュー（ミッション）と仮説。表示だけを担う。
//
// - データは、サーバー（/p/[token]/blueprint の page.tsx）が、本人のトークンから引いて渡す。API は呼ばない。
// - 出すのは、進行中のうち、いちばん新しい 1 件（朝のメールと AIコーチが使う 1 件と同じ。pickCurrentIssue）。
//   新しく設定すると、次に開いたときに切り替わる。ほかにも進行中のものがあるときは、件数を 1 行で出す。
// - 進行中のものが無いときは、設定先への案内を出す（文は、入力画面の枠と同じ）。
// - 呼び名（ミッション／イシュー）は、親が MissionTerms で渡す（feature.missionLabelIssue）。

import Link from "next/link";
import {
  formatOtherActiveCount,
  ISSUE_HYPOTHESIS_LABEL,
  type CurrentIssue,
  type MissionTerms,
} from "@/lib/mission-context";

interface Props {
  issue: CurrentIssue;
  terms: MissionTerms;
  /** 「イシュー」のページ（/p/<token>/mission）の URL。 */
  missionPageHref: string;
}

export function BlueprintIssueCard({ issue, terms, missionPageHref }: Props) {
  if (!issue.current) {
    return (
      <div className="bg-[#FBF8F4] border border-dashed border-[#E5DCD0] p-4 rounded-2xl">
        <p className="text-[10px] text-[#8B8489] font-medium tracking-wide mb-1">{terms.blueprintHeading}</p>
        <p className="text-xs text-[#5B5560] leading-relaxed">{terms.inputCardEmpty}</p>
        <Link
          href={missionPageHref}
          className="inline-block mt-2 text-xs font-medium text-[#1A1A2E] underline underline-offset-2"
        >
          {terms.inputCardEmptyLink}
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#EFE8DD] p-4 rounded-2xl">
      <p className="text-[10px] text-[#8B8489] font-medium tracking-wide mb-1.5">{terms.blueprintHeading}</p>
      <div className="min-w-0">
        <p className="text-sm text-[#1A1A2E] font-medium leading-relaxed whitespace-pre-wrap break-words">
          {issue.current.title}
        </p>
        {issue.current.hypothesis && (
          <div className="mt-1.5">
            <p className="text-[10px] text-[#8B8489] font-medium tracking-wide">{ISSUE_HYPOTHESIS_LABEL}</p>
            <p className="text-sm text-[#1A1A2E] leading-relaxed whitespace-pre-wrap break-words">
              {issue.current.hypothesis}
            </p>
          </div>
        )}
      </div>
      {issue.otherActiveCount > 0 && (
        <p className="text-[11px] text-[#8B8489] mt-2 leading-relaxed">
          {formatOtherActiveCount(terms.blueprintOthers, issue.otherActiveCount)}
        </p>
      )}
      <Link
        href={missionPageHref}
        className="inline-block mt-2 text-xs font-medium text-[#1A1A2E] underline underline-offset-2"
      >
        {terms.blueprintLink}
      </Link>
    </div>
  );
}
