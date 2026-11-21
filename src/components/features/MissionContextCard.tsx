"use client";

// 入力画面（朝・夕）の問いの上に、本人の進行中のミッションを出すカード
// （feature.missionOnInput）。表示だけを担う。
//
// - データはサーバー（/p/[token]/input の page.tsx）が、本人のトークンから引いて渡す。
//   このカードは API を呼ばない。
// - 1 件も無いときは、設定先（ミッション画面）への案内を出す。
// - 呼び名（ミッション／イシュー）は親が MissionTerms で渡す（feature.missionLabelIssue）。

import Link from "next/link";
import { useState } from "react";
import {
  formatMissionDeadline,
  isLongPurpose,
  type MissionContextItem,
  type MissionTerms,
} from "@/lib/mission-context";

interface Props {
  missions: MissionContextItem[];
  terms: MissionTerms;
  /** ミッション画面（/p/<token>/mission）の URL。未設定のときの案内に使う。 */
  missionPageHref: string;
}

export function MissionContextCard({ missions, terms, missionPageHref }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (missions.length === 0) {
    return (
      <div className="bg-[#FBF8F4] border border-dashed border-[#E5DCD0] p-4 rounded-2xl">
        <p className="text-[10px] text-[#8B8489] font-medium tracking-wide mb-1">{terms.inputCardHeading}</p>
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
      <p className="text-[10px] text-[#8B8489] font-medium tracking-wide mb-2">{terms.inputCardHeading}</p>
      <div className="space-y-3">
        {missions.map((m) => {
          const deadline = formatMissionDeadline(m.deadline);
          const long = isLongPurpose(m.purpose);
          const open = expanded[m.id] === true;
          return (
            <div key={m.id} className="min-w-0">
              <p className="text-sm text-[#1A1A2E] font-medium leading-relaxed whitespace-pre-wrap break-words">
                {m.title}
              </p>
              {deadline && <p className="text-[11px] text-[#8B8489] mt-0.5">期限: {deadline}</p>}
              {m.purpose && (
                <p
                  className={`text-xs text-[#5B5560] leading-relaxed whitespace-pre-wrap break-words mt-1.5 ${
                    long && !open ? "line-clamp-3" : ""
                  }`}
                >
                  {m.purpose}
                </p>
              )}
              {m.purpose && long && (
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded((prev) => ({ ...prev, [m.id]: !open }))}
                  className="mt-1 text-[11px] font-medium text-[#1A1A2E] underline underline-offset-2"
                >
                  {open ? "閉じる" : "続きを見る"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
