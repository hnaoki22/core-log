// 新しいイシュー（ミッション）を設定した直後に、「イシュー」のページに出す、設計図の見直しの案内
// （feature.coachingProfile）。表示だけを担う。
//
// - 設計図とイシューは、別々に保存している。イシューを新しく設定しても、設計図の中身（これからの行動 ほか）は
//   変わらないので、設定した直後に、設計図を見直すように案内する。
// - 出す・出さないと、消したあとの扱いは、置く側（mission/page.tsx）が決める
//   （スイッチが ON で、商品モードでない環境だけ。設定に成功した直後だけ）。
// - 文は、呼び名（ミッション／イシュー）に合わせて、置く側が MissionTerms の createdNotice を渡す。

import Link from "next/link";
import { COACHING_TERMS } from "@/lib/coaching-profile";

interface Props {
  /** 案内の文（MissionTerms.createdNotice）。 */
  text: string;
  /** 設計図のページ（/p/<token>/blueprint）の URL。 */
  href: string;
  /** 「あとで」を押したとき。 */
  onDismiss: () => void;
}

export function BlueprintReviewNotice({ text, href, onDismiss }: Props) {
  return (
    <div role="status" className="mb-5 bg-white border border-[#1A1A2E] p-4 rounded-2xl">
      <p className="text-sm text-[#1A1A2E] leading-relaxed break-words">{text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link
          href={href}
          className="rounded-xl bg-[#1A1A2E] text-white px-4 py-2 text-xs font-medium whitespace-nowrap"
        >
          {COACHING_TERMS.reviewNoticeLink}
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-[#8B8489] hover:text-[#5B5560] px-2 py-2 whitespace-nowrap"
        >
          {COACHING_TERMS.reviewNoticeDismiss}
        </button>
      </div>
    </div>
  );
}
