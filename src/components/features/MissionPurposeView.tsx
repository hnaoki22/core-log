// ミッション画面（/p/[token]/mission）で、開いたミッションの「背景・目的」を出す部品。表示だけを担う。
//
// - 見出しのない文（従来の登録、マネージャー画面で書いた文）は、これまでと同じ 1 つの枠で出す。
//   この場合の HTML は、部品に切り出す前の画面と同じ（テストで固定）。
// - 仮説つきで保存された文（composeIssuePurpose）は、仮説と、残り（目指す状態・行動）を
//   別の枠で出す。保存用の見出し（【仮説】など）は画面に出さない。
// - 親は `space-y-3` の並びの先頭にこの部品を置く。先頭の枠だけに `mt-3` を付ける。

import { ISSUE_HYPOTHESIS_LABEL, parseIssuePurpose } from "@/lib/mission-context";

interface Props {
  purpose: string | null | undefined;
  /** 「背景・目的」の見出し（呼び名の切り替えに合わせて親が渡す）。 */
  purposeLabel: string;
}

const BOX = "bg-[#F5F0EB] p-3 rounded-xl border border-[#EFE8DD]";
const LABEL = "text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-1";
const TEXT = "text-sm text-[#2C2C4A] leading-relaxed whitespace-pre-wrap break-words";

export function MissionPurposeView({ purpose, purposeLabel }: Props) {
  if (!purpose) return null;
  const parts = parseIssuePurpose(purpose);

  if (!parts.structured) {
    return (
      <div className={`${BOX} mt-3`}>
        <p className={LABEL}>{purposeLabel}</p>
        <p className={TEXT}>{purpose}</p>
      </div>
    );
  }

  return (
    <>
      {parts.hypothesis && (
        <div className={`${BOX} mt-3`}>
          <p className={LABEL}>{ISSUE_HYPOTHESIS_LABEL}</p>
          <p className={TEXT}>{parts.hypothesis}</p>
        </div>
      )}
      {parts.plan && (
        <div className={parts.hypothesis ? BOX : `${BOX} mt-3`}>
          <p className={LABEL}>{purposeLabel}</p>
          <p className={TEXT}>{parts.plan}</p>
        </div>
      )}
    </>
  );
}
