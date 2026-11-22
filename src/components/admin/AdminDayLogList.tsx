// 管理画面の、参加者 1 人のページ（/a/[token]/participant/[氏名]）に出す、「日ごとの記入」の欄。
// 表示だけを担う（データベースを読まない・通信しない）。
//
// - 1 日＝1 枚。日付と、その日の状態（朝・夕がそろったか）と気分を見出しに出す。
// - 朝・夕の記入は、問いと答えの組で保存されていれば、問いごとに、問いと答えを分けて出す。
//   自由記入の文は、保存した文のまま、改行を保って出す。
// - その日の記入の下に、その日の AIコーチの返信と、その日の記入に付いた上司コメントを並べる
//   （その人の 1 日分を、1 か所で読めるようにする）。
// - HM フィードバックは、このページには出さない（日ではなく、人と期間に付けて保存している。
//   読む場所は、管理画面トップの「FB履歴」）。
// - 月ごとにまとめる。いちばん新しい月（その月の記入が少ないときは、その前の月も）を開いておき、
//   ほかの月は閉じておく（<details>。開閉に通信は無い。countMonthsOpenByDefault）。
// - 朝・夕の呼び名は、その環境の呼び名（entryTerms）を、親が渡す。

import Link from "next/link";
import { EnergyGlyph } from "@/components/EnergyGlyph";
import {
  ADMIN_DAY_LOG_TERMS,
  countMonthsOpenByDefault,
  groupDayLogsByMonth,
  type AdminCoachReplyState,
  type AdminCoachReplyView,
  type AdminDayLogView,
  type AdminEntryBlock,
} from "@/lib/admin-day-log";
import { COACH_BOARD_TERMS } from "@/lib/coach-reply";

interface Props {
  days: readonly AdminDayLogView[];
  /** 朝の記入の呼び名（entryTerms().morningEntryName）。 */
  morningLabel: string;
  /** 夕方の記入の呼び名（entryTerms().eveningEntryName）。 */
  eveningLabel: string;
  /** 時刻の出し方（日本時間の HH:MM）。親が渡す。 */
  formatTime: (iso: string | null | undefined) => string;
  /**
   * 「AIコーチの確認」のページ（その日）へのパスを作る。作れないとき（環境が分からない など）は渡さない。
   * 渡さないときは、リンクを出さない。
   */
  coachBoardHref?: ((date: string) => string) | null;
  /** AIコーチの返信を読めなかったとき true。「返信が無い」と見せないために、その旨を 1 行出す。 */
  coachLoadFailed?: boolean;
}

const ENERGY_LABEL: Record<string, string> = {
  excellent: "絶好調",
  good: "良い",
  okay: "まあまあ",
  low: "低調",
};

const STATUS_MARK: Record<AdminDayLogView["status"], { icon: string; color: string }> = {
  complete: { icon: "◎", color: "text-emerald-500" },
  morning_only: { icon: "△", color: "text-amber-500" },
  evening_only: { icon: "△", color: "text-amber-500" },
  none: { icon: "ー", color: "text-gray-300" },
};

// AIコーチの返信の、状態の札の色。「AIコーチの確認」のページ（CoachBoard の STATE_TONE）と同じ色にそろえる。
// あちらは "use client" の部品なので、定数を読み込まずに、同じ値をここに置く（色の指定は、Tailwind が
// 読み取る場所＝部品のファイルに書く。src/lib には置けない）。
const COACH_STATE_TONE: Record<AdminCoachReplyState, string> = {
  needs_attention: "bg-red-50 text-red-700 border-red-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  delivered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  withdrawn: "bg-[#F2F2F7] text-[#8B8489] border-[#E5DCD0]",
};

const QUESTION = "text-[11px] text-[#8B8489] leading-relaxed break-words";
const ANSWER = "text-sm text-[#2C2C4A] leading-relaxed whitespace-pre-wrap break-words";

function EntryBlock({
  label,
  labelClass,
  time,
  block,
}: {
  label: string;
  labelClass: string;
  time: string;
  block: AdminEntryBlock;
}) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
        <span className={`text-[11px] font-semibold tracking-wide ${labelClass}`}>{label}</span>
        {time !== "" && <span className="text-[10px] text-[#C9BDAE]">{time}</span>}
      </div>
      {block.kind === "text" ? (
        <p className={ANSWER}>{block.text}</p>
      ) : (
        <div className="space-y-2">
          {block.pairs.map((pair, i) => (
            <div key={i}>
              <p className={QUESTION}>
                Q{i + 1}　{pair.question}
              </p>
              <p className={ANSWER}>{pair.answer !== "" ? pair.answer : ADMIN_DAY_LOG_TERMS.noAnswer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CoachReplyBlock({ reply, href }: { reply: AdminCoachReplyView; href: string | null }) {
  return (
    <div className="bg-[#EFF5F1] border border-[#DCE9E0] rounded-xl p-3 mt-3" data-testid="admin-day-coach-reply">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] font-semibold text-[#2D6A4F] tracking-wide">{ADMIN_DAY_LOG_TERMS.coachLabel}</span>
        <span className={`text-[10px] font-medium border px-1.5 py-0.5 rounded-md ${COACH_STATE_TONE[reply.state]}`}>
          {COACH_BOARD_TERMS.stateLabels[reply.state]}
        </span>
        {href && (
          <Link href={href} className="text-[11px] text-[#1A1A2E] underline underline-offset-2 ml-auto whitespace-nowrap">
            {ADMIN_DAY_LOG_TERMS.coachBoardLink}
          </Link>
        )}
      </div>
      {reply.content !== "" && <p className={`${ANSWER} mt-1.5`}>{reply.content}</p>}
    </div>
  );
}

function DayCard({
  day,
  morningLabel,
  eveningLabel,
  formatTime,
  coachBoardHref,
}: {
  day: AdminDayLogView;
} & Omit<Props, "days" | "coachLoadFailed">) {
  const mark = STATUS_MARK[day.status];
  return (
    <article className="rounded-2xl border border-[#EFE8DD] bg-white p-4" data-testid="admin-day-log">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-semibold text-[#1A1A2E] flex items-center gap-1.5">
          <span className={`text-base font-bold ${mark.color}`} aria-hidden="true">
            {mark.icon}
          </span>
          {day.heading}
        </h4>
        {day.energy && (
          <div className="flex items-center gap-1.5">
            <EnergyGlyph level={day.energy} size={16} />
            <span className="text-[11px] text-[#8B8489]">{ENERGY_LABEL[day.energy] || ""}</span>
          </div>
        )}
      </div>

      {day.morning && (
        <EntryBlock label={morningLabel} labelClass="text-[#1A1A2E]" time={formatTime(day.morningTime)} block={day.morning} />
      )}
      {day.evening && (
        <EntryBlock label={eveningLabel} labelClass="text-amber-600" time={formatTime(day.eveningTime)} block={day.evening} />
      )}

      {day.coachReply && (
        <CoachReplyBlock reply={day.coachReply} href={coachBoardHref ? coachBoardHref(day.date) : null} />
      )}

      {day.managerComment && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mt-3">
          <span className="text-[11px] font-semibold text-indigo-600 tracking-wide">{ADMIN_DAY_LOG_TERMS.managerCommentLabel}</span>
          <p className={`${ANSWER} mt-1`}>{day.managerComment}</p>
        </div>
      )}
    </article>
  );
}

export function AdminDayLogList({
  days,
  morningLabel,
  eveningLabel,
  formatTime,
  coachBoardHref,
  coachLoadFailed = false,
}: Props) {
  const months = groupDayLogsByMonth(days);
  const openCount = countMonthsOpenByDefault(months);
  return (
    <section className="card overflow-hidden" data-testid="admin-day-log-list">
      <div className="px-5 py-4 border-b border-[#EFE8DD]">
        <h2 className="text-xs font-semibold text-[#5B5560] tracking-wide uppercase">{ADMIN_DAY_LOG_TERMS.heading}</h2>
        <p className="text-[11px] text-[#8B8489] leading-relaxed mt-1">{ADMIN_DAY_LOG_TERMS.feedbackNote}</p>
      </div>
      {coachLoadFailed && (
        <p className="px-5 py-2.5 text-[11px] text-amber-700 bg-amber-50 border-b border-amber-100 leading-relaxed">
          {ADMIN_DAY_LOG_TERMS.coachLoadFailed}
        </p>
      )}
      {months.length === 0 ? (
        <div className="p-8 text-center text-[#8B8489] text-sm">{ADMIN_DAY_LOG_TERMS.empty}</div>
      ) : (
        <div className="divide-y divide-[#EFE8DD]">
          {months.map((month, index) => (
            <details key={`${month.monthKey}-${index}`} open={index < openCount} className="group">
              <summary className="px-5 py-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-3 bg-[#FBF8F4] hover:bg-[#F5F0EB] transition-colors">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1A1A2E]">
                  <span aria-hidden="true" className="text-[9px] text-[#8B8489] transition-transform group-open:rotate-90">
                    ▶
                  </span>
                  {month.label}
                </span>
                <span className="text-[11px] text-[#8B8489] whitespace-nowrap">
                  {ADMIN_DAY_LOG_TERMS.monthCount(month.days.length)}
                </span>
              </summary>
              <div className="p-4 space-y-3 bg-[#FBF8F4]">
                {month.days.map((day) => (
                  <DayCard
                    key={day.id}
                    day={day}
                    morningLabel={morningLabel}
                    eveningLabel={eveningLabel}
                    formatTime={formatTime}
                    coachBoardHref={coachBoardHref}
                  />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
