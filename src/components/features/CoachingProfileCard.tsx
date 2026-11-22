"use client";

// 入力画面（朝・夕）の問いの上に、本人の設計図の「毎朝の一文」を出す枠
// （feature.coachingProfile）。表示だけを担う。
//
// - データはサーバー（/p/[token]/input の page.tsx）が、本人のトークンから引いて渡す。
//   この枠は API を呼ばない。
// - 確認済みのときだけ、本人の文を出す。確認前・未作成のときは、設計図のページへの案内だけを出す
//   （本人が確かめていない文を、本人の言葉として見せない）。
// - 文言は coaching-profile.ts の COACHING_TERMS。

import Link from "next/link";
import { useState } from "react";
import { COACHING_TERMS, type CoachingProfileCardData } from "@/lib/coaching-profile";

interface Props {
  data: CoachingProfileCardData;
  /** 設計図のページ（/p/<token>/blueprint）の URL。 */
  profilePageHref: string;
}

export function CoachingProfileCard({ data, profilePageHref }: Props) {
  const [open, setOpen] = useState(false);

  if (data.state !== "confirmed") {
    return (
      <div className="bg-[#FBF8F4] border border-dashed border-[#E5DCD0] p-4 rounded-2xl">
        <p className="text-[10px] text-[#8B8489] font-medium tracking-wide mb-1">{COACHING_TERMS.inputCardHeading}</p>
        <p className="text-xs text-[#5B5560] leading-relaxed">{COACHING_TERMS.inputCardDraft}</p>
        <Link
          href={profilePageHref}
          className="inline-block mt-2 text-xs font-medium text-[#1A1A2E] underline underline-offset-2"
        >
          {COACHING_TERMS.inputCardLinkDraft}
        </Link>
      </div>
    );
  }

  const hasDetail = data.growthTheme !== "" || data.actions !== "";
  return (
    <div className="bg-white border border-[#EFE8DD] p-4 rounded-2xl">
      <p className="text-[10px] text-[#8B8489] font-medium tracking-wide mb-2">{COACHING_TERMS.inputCardHeading}</p>
      <p className="text-[10px] text-[#8B8489] font-medium tracking-wide">{COACHING_TERMS.headlineLabel}</p>
      <p className="text-sm text-[#1A1A2E] font-medium leading-relaxed whitespace-pre-wrap break-words">
        {data.headline}
      </p>
      {hasDetail && open && (
        <div className="mt-2 space-y-2">
          {data.growthTheme !== "" && (
            <div>
              <p className="text-[10px] text-[#8B8489] font-medium tracking-wide">{COACHING_TERMS.growthThemeLabel}</p>
              <p className="text-xs text-[#5B5560] leading-relaxed whitespace-pre-wrap break-words">{data.growthTheme}</p>
            </div>
          )}
          {data.actions !== "" && (
            <div>
              <p className="text-[10px] text-[#8B8489] font-medium tracking-wide">{COACHING_TERMS.actionsLabel}</p>
              <p className="text-xs text-[#5B5560] leading-relaxed whitespace-pre-wrap break-words">{data.actions}</p>
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {hasDetail && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] font-medium text-[#1A1A2E] underline underline-offset-2"
          >
            {open ? "折りたたむ" : "続きを見る"}
          </button>
        )}
        <Link href={profilePageHref} className="text-[11px] font-medium text-[#1A1A2E] underline underline-offset-2">
          {COACHING_TERMS.inputCardLinkConfirmed}
        </Link>
      </div>
    </div>
  );
}
