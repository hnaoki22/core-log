// 設定したイシューの「直した履歴」（直す前の文）を出す部品。表示だけを担う。
//
// - 1 回の修正につき 1 つの枠。その修正で変わった欄だけを、直す前の値で出す
//   （どの欄が変わったかは buildMissionEditViews が決める）。
// - 仮説と「目指す状態・行動」は、保存では 1 本だが、欄ごとに分けて出す。保存用の見出し
//   （【仮説】など）は画面に出さない。
// - 日時は日本時間で出す（端末の時間帯に左右されない）。

import { ISSUE_HYPOTHESIS_LABEL, type MissionEditTerms, type MissionTerms } from "@/lib/mission-context";
import {
  fillTemplate,
  formatDeadlineDate,
  formatJstDateTime,
  stripRequiredMark,
  type MissionEditChange,
  type MissionEditView,
} from "@/lib/mission-edit";

interface Props {
  terms: MissionTerms;
  edit: MissionEditTerms;
  views: readonly MissionEditView[];
}

const LABEL = "text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-0.5";
const TEXT = "text-sm text-[#2C2C4A] leading-relaxed whitespace-pre-wrap break-words";

function fieldLabel(change: MissionEditChange, terms: MissionTerms, edit: MissionEditTerms): string {
  switch (change.field) {
    case "title":
      return stripRequiredMark(terms.titleLabel);
    case "hypothesis":
      return ISSUE_HYPOTHESIS_LABEL;
    case "plan":
      return terms.purposeLabel;
    case "deadline":
      return edit.deadlineLabel;
  }
}

function fieldValue(change: MissionEditChange, edit: MissionEditTerms): string {
  if (change.before === null || change.before === "") return edit.historyEmptyValue;
  if (change.field === "deadline") return formatDeadlineDate(change.before) ?? change.before;
  return change.before;
}

export function IssueEditHistory({ terms, edit, views }: Props) {
  if (views.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="issue-edit-history">
      {views.map((view) => {
        const template = view.editedBy === "manager" ? edit.historyEntryByManager : edit.historyEntryByParticipant;
        const when = formatJstDateTime(view.editedAt) ?? "—";
        return (
          <div key={view.id} className="bg-white p-3 rounded-xl border border-[#EFE8DD] space-y-2">
            <p className="text-[11px] font-medium text-[#5B5560]">{fillTemplate(template, "t", when)}</p>
            {view.changes.map((change) => (
              <div key={change.field}>
                <p className={LABEL}>{fieldLabel(change, terms, edit)}</p>
                <p className={TEXT}>{fieldValue(change, edit)}</p>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
