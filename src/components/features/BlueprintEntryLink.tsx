// 設計図のページ（/p/<token>/blueprint）への入口（feature.coachingProfile）。表示だけを担う。
//
// - ホームと「イシュー」のページに置く。入口が入力画面の枠と朝のメールだけだと、
//   その日の記入を終えた人が、翌日まで設計図を開けない。
// - 出す・出さないは、置く側が決める（スイッチが ON で、商品モードでない環境だけ）。
// - 文言は coaching-profile.ts の COACHING_TERMS。

import Link from "next/link";
import { COACHING_TERMS } from "@/lib/coaching-profile";

interface Props {
  /** 設計図のページ（/p/<token>/blueprint）の URL。 */
  href: string;
}

export function BlueprintEntryLink({ href }: Props) {
  return (
    <Link href={href} className="block">
      <div className="bg-white border border-[#EFE8DD] px-4 py-3 rounded-2xl flex items-center justify-between gap-3 hover:border-[#1A1A2E] transition-colors">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#1A1A2E]">{COACHING_TERMS.entryTitle}</p>
          <p className="text-xs text-[#5B5560] mt-0.5">{COACHING_TERMS.entryLead}</p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8B8489"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0"
          aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </Link>
  );
}
