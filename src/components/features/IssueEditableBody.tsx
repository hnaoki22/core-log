"use client";

// 「イシュー」のページ（/p/[token]/mission）で、開いたカードの中身のうち、
// 「背景・目的」（仮説と、目指す状態・行動）の表示と、それを本人が直す操作を受け持つ部品。
//
// - 直す操作を出さない環境（MissionTerms.edit が null＝feature.missionLabelIssue が OFF）では、
//   これまでと同じ MissionPurposeView だけを出す（HTML は、この部品を入れる前と同じ。テストで固定）。
// - 直す操作を出す環境では、表示の下に「直す」（閉じていないものだけ）と「直した履歴」を出す。
//   「直す」を押すと、表示の代わりにフォームを出す。保存は PATCH /api/mission。
//   サーバーは、直す前の文を残してから直す（mission_edits 表。決まりは mission-edit.ts）。
// - 履歴は、カードを開いたときに読む（POST /api/mission/edits）。読めなかったことと、
//   無いことを分けて出す（読めなかったときに、履歴なしの見え方にしない）。
// - 保存していない変更があるあいだは、ページを離れる前に確かめる（useLeaveGuard）。
//   カードを閉じる・ほかのカードを開く操作は、親が onDirtyChange の値を見て確かめる。

import { useCallback, useEffect, useState } from "react";
import {
  composeIssuePurpose,
  parseIssuePurpose,
  type MissionEditTerms,
  type MissionTerms,
} from "@/lib/mission-context";
import {
  buildMissionEditViews,
  fillTemplate,
  isClosedMissionStatus,
  toMissionSnapshot,
  type MissionEditRecord,
  type MissionEditView,
} from "@/lib/mission-edit";
import { useLeaveGuard } from "@/lib/use-leave-guard";
import { MissionPurposeView } from "@/components/features/MissionPurposeView";
import { IssueEditForm, type IssueEditValues } from "@/components/features/IssueEditForm";
import { IssueEditHistory } from "@/components/features/IssueEditHistory";

export type EditableMission = {
  id: string;
  title: string;
  purpose: string | null;
  /** "YYYY-MM-DD"。未設定は空文字。 */
  deadline: string;
  status: string;
};

/** 保存したあとの値（サーバーが返した、表に入っている値）。 */
export type SavedMissionText = { title: string; purpose: string | null; deadline: string };

interface Props {
  token: string;
  mission: EditableMission;
  terms: MissionTerms;
  /** 保存できたときに、親の一覧の表示を合わせる。 */
  onSaved: (next: SavedMissionText) => void;
  /** フォームに、保存していない変更があるかを、親に知らせる。 */
  onDirtyChange?: (dirty: boolean) => void;
}

export function IssueEditableBody(props: Props) {
  const edit = props.terms.edit;
  if (!edit) {
    return <MissionPurposeView purpose={props.mission.purpose} purposeLabel={props.terms.purposeLabel} />;
  }
  return <EditableBody {...props} edit={edit} />;
}

/** いまの文を、フォームの 4 つの欄に分ける。見出しのない文は、全文を「目指す状態・行動」の欄に入れる。 */
export function issueEditValuesOf(mission: Pick<EditableMission, "title" | "purpose" | "deadline">): IssueEditValues {
  const parts = parseIssuePurpose(mission.purpose);
  return {
    title: mission.title,
    hypothesis: parts.hypothesis ?? "",
    plan: parts.plan ?? "",
    deadline: mission.deadline || "",
  };
}

function sameValues(a: IssueEditValues, b: IssueEditValues): boolean {
  return a.title === b.title && a.hypothesis === b.hypothesis && a.plan === b.plan && a.deadline === b.deadline;
}

type HistoryState =
  | { status: "loading" }
  | { status: "ready"; records: MissionEditRecord[] }
  | { status: "error" };

function EditableBody({
  token,
  mission,
  terms,
  edit,
  onSaved,
  onDirtyChange,
}: Props & { edit: MissionEditTerms }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<IssueEditValues>(() => issueEditValuesOf(mission));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryState>({ status: "loading" });
  const [historyOpen, setHistoryOpen] = useState(false);

  const missionId = mission.id;
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/mission/edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, missionId }),
      });
      if (!res.ok) {
        setHistory({ status: "error" });
        return;
      }
      const data = (await res.json()) as { edits?: unknown };
      setHistory({ status: "ready", records: Array.isArray(data.edits) ? (data.edits as MissionEditRecord[]) : [] });
    } catch {
      setHistory({ status: "error" });
    }
  }, [token, missionId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const needsHypothesis = terms.hypothesisLabel !== null;
  const dirty = editing && !sameValues(values, issueEditValuesOf(mission));
  const canSave =
    dirty && values.title.trim() !== "" && (!needsHypothesis || values.hypothesis.trim() !== "");

  useLeaveGuard(dirty, edit.leaveConfirm);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  // カードが閉じられて、この部品が外れるときは、「変更なし」に戻す。
  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);

  const startEditing = () => {
    setValues(issueEditValuesOf(mission));
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    if (dirty && !window.confirm(edit.leaveConfirm)) return;
    setEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    const title = values.title.trim();
    // 仮説の欄がある環境では、仮説と「目指す状態・行動」を、設定のときと同じ形（見出しつきの 1 本）にまとめる。
    const purpose = needsHypothesis ? composeIssuePurpose(values.hypothesis, values.plan) : values.plan.trim();
    try {
      const res = await fetch("/api/mission", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, missionId, title, purpose, deadline: values.deadline }),
      });
      if (!res.ok) {
        setError(edit.saveError);
        return;
      }
      const data = (await res.json()) as {
        mission?: { title?: unknown; purpose?: unknown; deadline?: unknown };
      };
      // サーバーが返した値（表に入った値）に、表示を合わせる。返らなかったときは、送った値を使う。
      const saved = data.mission;
      onSaved({
        title: typeof saved?.title === "string" ? saved.title : title,
        purpose: saved ? (typeof saved.purpose === "string" ? saved.purpose : null) : purpose === "" ? null : purpose,
        deadline: saved ? (typeof saved.deadline === "string" ? saved.deadline : "") : values.deadline,
      });
      setEditing(false);
      void loadHistory();
    } catch {
      setError(edit.saveError);
    } finally {
      setSaving(false);
    }
  };

  const views =
    history.status === "ready"
      ? buildMissionEditViews(
          toMissionSnapshot({ title: mission.title, purpose: mission.purpose, deadline: mission.deadline }),
          history.records
        )
      : [];
  const canEdit = !isClosedMissionStatus(mission.status);

  if (editing) {
    return (
      <IssueEditForm
        terms={terms}
        edit={edit}
        values={values}
        onChange={setValues}
        canSave={canSave}
        saving={saving}
        error={error}
        onSave={handleSave}
        onCancel={cancelEditing}
      />
    );
  }

  return (
    <IssueBodyView
      mission={mission}
      terms={terms}
      edit={edit}
      canEdit={canEdit}
      views={views}
      historyOpen={historyOpen}
      historyFailed={history.status === "error"}
      onStartEdit={startEditing}
      onToggleHistory={() => setHistoryOpen((open) => !open)}
    />
  );
}

interface BodyViewProps {
  mission: Pick<EditableMission, "purpose">;
  terms: MissionTerms;
  edit: MissionEditTerms;
  /** 「直す」を出すか（閉じていないイシューだけ）。 */
  canEdit: boolean;
  /** 直した履歴（新しい順）。まだ読めていないあいだは、空で渡す。 */
  views: readonly MissionEditView[];
  historyOpen: boolean;
  /** 履歴を読めなかったか。 */
  historyFailed: boolean;
  onStartEdit: () => void;
  onToggleHistory: () => void;
}

/**
 * フォームを開いていないときの表示（背景・目的 → 「直す」と「直した履歴」の行 → 開いた履歴）。
 * 状態を持たない（描画テストと、見本の作成で、どの状態も出せるようにするため）。
 */
export function IssueBodyView({
  mission,
  terms,
  edit,
  canEdit,
  views,
  historyOpen,
  historyFailed,
  onStartEdit,
  onToggleHistory,
}: BodyViewProps) {
  // 表示の枠（MissionPurposeView）が 1 つも出ないときは、下の行が、並びの先頭になる。
  const parts = parseIssuePurpose(mission.purpose);
  const showsBox = mission.purpose
    ? parts.structured
      ? Boolean(parts.hypothesis || parts.plan)
      : true
    : false;
  const showActions = canEdit || views.length > 0 || historyFailed;

  return (
    <>
      <MissionPurposeView purpose={mission.purpose} purposeLabel={terms.purposeLabel} />
      {showActions && (
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${showsBox ? "" : "mt-3"}`}>
          {canEdit && (
            <button
              type="button"
              onClick={onStartEdit}
              className="text-xs border border-[#E5DCD0] text-[#5B5560] bg-white px-3 py-1.5 rounded-xl hover:border-[#1A1A2E] hover:text-[#1A1A2E] transition-colors"
            >
              {edit.button}
            </button>
          )}
          {views.length > 0 && (
            <button
              type="button"
              onClick={onToggleHistory}
              aria-expanded={historyOpen}
              className="text-xs text-[#8B8489] underline underline-offset-2 hover:text-[#5B5560] transition-colors"
            >
              {fillTemplate(edit.historyToggle, "n", views.length)}
            </button>
          )}
          {historyFailed && <span className="text-xs text-[#8B8489]">{edit.historyLoadError}</span>}
        </div>
      )}
      {historyOpen && <IssueEditHistory terms={terms} edit={edit} views={views} />}
    </>
  );
}
