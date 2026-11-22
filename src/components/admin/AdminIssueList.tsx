// 管理画面の、参加者 1 人のページ（/a/[token]/participant/[氏名]）に出す、イシュー（ミッション）の欄。
// 表示だけを担う（データベースを読まない・通信しない）。
//
// - 題（問い）と状態に加えて、「背景・目的」を出す。仮説つきで保存された文（composeIssuePurpose）は、
//   仮説と「目指す状態と、これからの行動」を分けて出す（MissionPurposeView。参加者の画面と同じ見せ方）。
// - コメントは、ここには出さない。コメントを読む・書くページ（上司の側の、参加者 1 人のページ）への
//   リンクを、見出しの右に出す。
// - 見出しと「背景・目的」の呼び名は、その環境の呼び名（ミッション／イシュー）を、親が渡す。
// - 1 件も無いときは、何も出さない（これまでと同じ）。

import Link from "next/link";
import { MissionPurposeView } from "@/components/features/MissionPurposeView";
import { ADMIN_ISSUE_VIEW_TERMS } from "@/lib/mission-context";

export type AdminIssueItem = {
  id: string;
  title?: string | null;
  status?: string | null;
  purpose?: string | null;
};

interface Props {
  missions: readonly AdminIssueItem[];
  /** 欄の見出し（missionTerms().pageTitle）。 */
  heading: string;
  /** 「背景・目的」の見出し（missionTerms().purposeLabel）。 */
  purposeLabel: string;
  /** コメントを読む・書くページへのパス（managerParticipantPagePath()）。 */
  commentsHref: string;
}

export function AdminIssueList({ missions, heading, purposeLabel, commentsHref }: Props) {
  if (missions.length === 0) return null;

  return (
    <section className="card overflow-hidden" data-testid="admin-issue-list">
      <div className="px-5 py-4 border-b border-[#EFE8DD] flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase">{heading}</h2>
        <Link
          href={commentsHref}
          className="text-xs font-medium text-[#1A1A2E] underline underline-offset-2 whitespace-nowrap"
        >
          {ADMIN_ISSUE_VIEW_TERMS.commentsLink}
        </Link>
      </div>
      <div className="divide-y divide-[#EFE8DD]">
        {missions.map((m) => (
          <div key={m.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-[#1A1A2E] min-w-0 break-words">
                {m.title || ADMIN_ISSUE_VIEW_TERMS.untitled}
              </span>
              {m.status && (
                <span className="text-[10px] font-medium bg-indigo-50 text-[#1A1A2E] px-1.5 py-0.5 rounded-md whitespace-nowrap">
                  {m.status}
                </span>
              )}
            </div>
            <div className="space-y-3">
              <MissionPurposeView purpose={m.purpose} purposeLabel={purposeLabel} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
