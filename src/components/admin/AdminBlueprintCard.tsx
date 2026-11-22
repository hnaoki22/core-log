// 管理画面の、参加者 1 人のページ（/a/[token]/participant/[氏名]）に出す、その人の設計図の欄。
// 表示だけを担う（データベースを読まない・通信しない・直せない）。
//
// - 読めるのは、記入を読める人と同じ範囲（管理者と、その環境の閲覧者）。だれが開けるかは、ページの側が決める。
// - 状態（確認済み／確認前／まだ無い）を見出しに出す。確認前のときは、その旨の説明を出す
//   （確認前の内容は、本人の言葉として、メール・夕方の問い・AIコーチに使われない）。
// - 「読めなかった」と「まだ無い」は、分けて出す（読めなかったことを「まだ無い」と見せない）。
// - 毎朝の一文は、開かずに読める。ほかの欄は、開いて読む（<details>。開閉に通信は無い）。

import type { ReactNode } from "react";
import { formatJstMonthDay } from "@/lib/admin-directory";
import { ADMIN_BLUEPRINT_TERMS, COACHING_TERMS, type CoachingProfile } from "@/lib/coaching-profile";

interface Props {
  /** その人の設計図。まだ無いときは null。 */
  profile: CoachingProfile | null;
  /** 読めなかったとき true（profile は見ない）。 */
  loadFailed?: boolean;
}

const LABEL = "text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-1";
const TEXT = "text-sm text-[#2C2C4A] leading-relaxed whitespace-pre-wrap break-words";
const BOX = "bg-[#F5F0EB] p-3 rounded-xl border border-[#EFE8DD]";

function Field({ label, value }: { label: string; value: string }) {
  const empty = value.trim() === "";
  return (
    <div className={BOX}>
      <p className={LABEL}>{label}</p>
      <p className={empty ? "text-sm text-[#8B8489]" : TEXT}>{empty ? ADMIN_BLUEPRINT_TERMS.emptyField : value}</p>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: "ok" | "wait" | "none" }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "wait"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : "bg-[#F2F2F7] text-[#5B5560] border-[#EFE8DD]";
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border whitespace-nowrap ${cls}`}>{label}</span>;
}

export function AdminBlueprintCard({ profile, loadFailed = false }: Props) {
  const header = (badge: ReactNode, note?: string | null) => (
    <div className="px-5 py-4 border-b border-[#EFE8DD] flex flex-wrap items-center gap-x-2 gap-y-1">
      <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase">{COACHING_TERMS.pageTitle}</h2>
      {badge}
      {note ? <span className="text-[11px] text-[#8B8489] ml-auto whitespace-nowrap">{note}</span> : null}
    </div>
  );

  if (loadFailed) {
    return (
      <section className="card overflow-hidden" data-testid="admin-blueprint">
        {header(null)}
        <p className="p-4 text-xs text-amber-700">{ADMIN_BLUEPRINT_TERMS.loadFailed}</p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="card overflow-hidden" data-testid="admin-blueprint">
        {header(<StatusBadge label={ADMIN_BLUEPRINT_TERMS.noneStatus} tone="none" />)}
        <p className="p-4 text-xs text-[#8B8489]">{ADMIN_BLUEPRINT_TERMS.none}</p>
      </section>
    );
  }

  const confirmed = profile.status === "confirmed";
  const confirmedDay = confirmed ? formatJstMonthDay(profile.confirmedAt) : null;
  const updatedDay = formatJstMonthDay(profile.updatedAt);
  const dateNote = confirmedDay
    ? ADMIN_BLUEPRINT_TERMS.confirmedOn(confirmedDay)
    : updatedDay
      ? ADMIN_BLUEPRINT_TERMS.updatedOn(updatedDay)
      : null;

  return (
    <section className="card overflow-hidden" data-testid="admin-blueprint">
      {header(
        <StatusBadge
          label={confirmed ? COACHING_TERMS.statusConfirmed : COACHING_TERMS.statusDraft}
          tone={confirmed ? "ok" : "wait"}
        />,
        dateNote
      )}
      <div className="p-4 space-y-3">
        {!confirmed && <p className="text-[11px] text-amber-700 leading-relaxed">{ADMIN_BLUEPRINT_TERMS.draftNote}</p>}
        <Field label={COACHING_TERMS.headlineLabel} value={profile.headline} />
        <details>
          <summary className="cursor-pointer select-none text-xs font-medium text-[#1A1A2E] underline underline-offset-2">
            {ADMIN_BLUEPRINT_TERMS.detailsSummary}
          </summary>
          <div className="space-y-3 mt-3">
            <Field label={COACHING_TERMS.growthThemeLabel} value={profile.growthTheme} />
            <Field label={COACHING_TERMS.actionsLabel} value={profile.actions} />
            <Field label={COACHING_TERMS.expectedLabel} value={profile.expected} />
            <Field label={COACHING_TERMS.stallPointsLabel} value={profile.stallPoints} />
            <Field label={COACHING_TERMS.eveningQuestionLabel} value={profile.eveningQuestion} />
            {profile.tendencies.length > 0 && (
              <div className={BOX}>
                <p className={LABEL}>{COACHING_TERMS.tendenciesLabel}</p>
                <ul className="space-y-1.5">
                  {profile.tendencies.map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[10px] font-medium bg-white text-[#5B5560] border border-[#EFE8DD] px-1.5 py-0.5 rounded-md whitespace-nowrap mt-0.5">
                        {t.use === true
                          ? COACHING_TERMS.tendencyUse
                          : t.use === false
                            ? COACHING_TERMS.tendencyNotUse
                            : ADMIN_BLUEPRINT_TERMS.tendencyUnset}
                      </span>
                      <span className={TEXT}>{t.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </div>
    </section>
  );
}
