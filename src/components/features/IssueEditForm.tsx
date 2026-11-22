// 設定したイシューを直すフォーム（「イシュー」のページ。feature.missionLabelIssue の環境）。
// 表示と、入力の受け渡しだけを担う。保存は親（IssueEditableBody）が行う。
//
// - 欄は、設定フォーム（/p/[token]/mission）と同じ 4 つ：問い、仮説、目指す状態と行動、期限。
//   欄の見出しと案内は、設定フォームと同じ文言（MissionTerms）を使う。
// - 説明・ボタン・失敗の表示は MissionEditTerms から受け取る（文言を部品に直接書かない）。
// - 保存用の見出し（【仮説】など）は、画面に出さない。仮説と「目指す状態・行動」は、欄を分けて直す。

import type { MissionEditTerms, MissionTerms } from "@/lib/mission-context";

export type IssueEditValues = {
  title: string;
  hypothesis: string;
  plan: string;
  /** "YYYY-MM-DD"。未設定は空文字。 */
  deadline: string;
};

interface Props {
  terms: MissionTerms;
  edit: MissionEditTerms;
  values: IssueEditValues;
  onChange: (next: IssueEditValues) => void;
  /** 保存できる状態か（必須の欄が埋まっていて、変更がある）。 */
  canSave: boolean;
  saving: boolean;
  /** 保存に失敗したときの表示。無ければ null。 */
  error: string | null;
  onSave: () => void;
  onCancel: () => void;
}

const LABEL = "text-[10px] font-medium text-[#8B8489] tracking-wide uppercase block mb-1.5";
const FIELD =
  "w-full text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all";

export function IssueEditForm({ terms, edit, values, onChange, canSave, saving, error, onSave, onCancel }: Props) {
  return (
    <div className="bg-[#FBF8F4] p-3 rounded-xl border border-[#E5DCD0] mt-3 space-y-3" data-testid="issue-edit-form">
      <div>
        <h4 className="font-semibold text-sm text-[#1A1A2E]">{edit.formHeading}</h4>
        <p className="text-xs text-[#5B5560] leading-relaxed mt-1">{edit.note}</p>
      </div>
      <div>
        <label className={LABEL}>{terms.titleLabel}</label>
        <input
          type="text"
          value={values.title}
          onChange={(e) => onChange({ ...values, title: e.target.value })}
          placeholder={terms.titlePlaceholder}
          className={FIELD}
        />
      </div>
      {terms.hypothesisLabel !== null && (
        <div>
          <label className={LABEL}>{terms.hypothesisLabel}</label>
          <textarea
            value={values.hypothesis}
            onChange={(e) => onChange({ ...values, hypothesis: e.target.value })}
            placeholder={terms.hypothesisPlaceholder ?? ""}
            className={`${FIELD} resize-none`}
            rows={3}
          />
        </div>
      )}
      <div>
        <label className={LABEL}>{terms.purposeLabel}</label>
        <textarea
          value={values.plan}
          onChange={(e) => onChange({ ...values, plan: e.target.value })}
          placeholder={terms.purposePlaceholder}
          className={`${FIELD} resize-none`}
          rows={5}
        />
      </div>
      <div>
        <label className={LABEL}>{edit.deadlineLabel}</label>
        <input
          type="date"
          value={values.deadline}
          onChange={(e) => onChange({ ...values, deadline: e.target.value })}
          className="text-sm border border-[#E5DCD0] rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A1A2E]/10 focus:border-[#1A1A2E] bg-white transition-all"
        />
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-600 leading-relaxed">
          {error}
        </p>
      )}
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="text-xs text-[#8B8489] hover:text-[#5B5560] px-3 py-2 transition-colors disabled:opacity-50"
        >
          {edit.cancel}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !canSave}
          className="text-xs bg-[#1A1A2E] text-white rounded-xl px-4 py-2 hover:bg-[#141423] disabled:bg-[#C9BDAE] disabled:text-[#8B8489] transition-colors"
        >
          {saving ? edit.saving : edit.save}
        </button>
      </div>
    </div>
  );
}
