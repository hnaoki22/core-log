// 設定したイシュー（ミッション）の文を直すときの決まり（純関数）。
//
// - 直せるのは 3 つの欄：問い（missions.title）、仮説と「目指す状態・行動」（missions.purpose に
//   見出しつきの 1 本で入っている）、期限（missions.deadline）。
// - イシューの呼び名の環境（feature.missionLabelIssue）では、直す前の文を mission_edits 表に残す
//   （1 回の修正につき 1 行。migration 20261122_mission_edits.sql）。本人が誤字を直せるようにする
//   一方で、仮説を書き換えたときに、前の仮説が消えないようにするため。「直す」は、誤字の修正と
//   仮説の書き換えを見分けられない。仮説が変わったときは、理由を書いて閉じ、新しく設定する運用
//   （変えた理由が残るのは、その方法だけ）。
// - 読み書きは mission-edit-store.ts（サーバー側だけ）。入口は /api/mission（PATCH）と
//   /api/mission/edits（GET）。画面の部品は IssueEditableBody ほか。
// - DB にも React にも依存しない（テスト: mission-edit.test.ts）。

import { parseIssuePurpose } from "@/lib/mission-context";

/** 直せる 3 つの欄の値。purpose と deadline は、空なら null。deadline は "YYYY-MM-DD"。 */
export type MissionTextSnapshot = {
  title: string;
  purpose: string | null;
  deadline: string | null;
};

/** だれが直したか。manager = 上司・運営の画面（/m/[token]）から。 */
export type MissionEditActor = "participant" | "manager";

/** 1 回の修正の記録（直す前の文）。 */
export type MissionEditRecord = {
  id: string;
  /** 直した日時（ISO）。 */
  editedAt: string;
  editedBy: MissionEditActor;
  before: MissionTextSnapshot;
};

/** 1 件のイシューについて、画面に返す履歴の件数の上限。 */
export const MISSION_EDIT_LIST_MAX = 30;

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
}

const DEADLINE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 期限を "YYYY-MM-DD" にそろえる。空（null・undefined・空文字）は null。
 * 日付として読めない値は undefined（呼び出し側が、受け付けない値として扱う）。
 * "2026-12-17T00:00:00" のように時刻が付いた値は、日付の部分だけを使う。
 */
export function normalizeDeadline(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text === "") return null;
  const datePart = /^\d{4}-\d{2}-\d{2}[T\s]/.test(text) ? text.slice(0, 10) : text;
  const m = datePart.match(DEADLINE_RE);
  if (!m) return undefined;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return datePart;
}

/** 表から読んだ値などを、比べられる形にそろえる（前後の空白、改行コード、空の扱い）。 */
export function toMissionSnapshot(raw: {
  title: unknown;
  purpose?: unknown;
  deadline?: unknown;
}): MissionTextSnapshot {
  const purpose = normalizeText(raw.purpose);
  const deadline = normalizeDeadline(raw.deadline);
  return {
    title: normalizeText(raw.title),
    purpose: purpose === "" ? null : purpose,
    deadline: deadline === undefined ? null : deadline,
  };
}

/** 3 つの欄が、どれも同じか。 */
export function sameMissionText(a: MissionTextSnapshot, b: MissionTextSnapshot): boolean {
  return a.title === b.title && a.purpose === b.purpose && a.deadline === b.deadline;
}

/** 閉じた（完了にした）イシューか。ミッション画面の絞り込みと同じ値を見る。 */
export function isClosedMissionStatus(status: string | null | undefined): boolean {
  if (typeof status !== "string") return false;
  const s = status.trim();
  return s === "完了" || s === "completed";
}

// ── 直してよいか（/api/mission の PATCH。直す前の文を残す環境で使う）──────────────

export type MissionEditSubmission = {
  /** 無害化（sanitizeInput）を通したあとの値。 */
  title: string;
  /** undefined = この欄は送られていない（変えない）。 */
  purpose?: string;
  /** undefined = この欄は送られていない（変えない）。空文字・null = 期限を外す。 */
  deadline?: unknown;
};

export type MissionEditDecision =
  | { action: "reject"; status: 400 | 403 | 409; error: string }
  /** 中身が変わっていない。何も書かずに、成功として返す（current = いま表に入っている値）。 */
  | { action: "noop"; current: MissionTextSnapshot }
  | {
      action: "write";
      /** 履歴に残す、直す前の文。 */
      before: MissionTextSnapshot;
      after: MissionTextSnapshot;
      /** missions に書く欄。送られていない欄は入れない（updateMissionFields にそのまま渡す）。 */
      update: { title: string; purpose?: string; deadline?: string };
    };

/**
 * 直してよいか、直すなら何を残して何を書くかを決める。
 * - 本人は、自分のイシューで、閉じていないものだけを直せる（閉じたイシューは、前の問い・仮説と
 *   閉じた理由の記録なので、本人の画面からは書き換えない）。
 * - 上司・運営の画面からの修正は、これまでどおり、閉じたものも直せる。
 * - 中身が変わっていないときは、履歴を増やさない。
 */
export function decideMissionEdit(input: {
  actor: MissionEditActor;
  /** 本人のとき：イシューの持ち主（participant_id）が、トークンから引いた本人と同じか。 */
  ownerMatches: boolean;
  status: string | null | undefined;
  /** いま表に入っている値。 */
  current: { title: unknown; purpose?: unknown; deadline?: unknown };
  submitted: MissionEditSubmission;
}): MissionEditDecision {
  if (input.actor === "participant") {
    if (!input.ownerMatches) return { action: "reject", status: 403, error: "Forbidden" };
    if (isClosedMissionStatus(input.status)) {
      return { action: "reject", status: 409, error: "Closed mission cannot be edited" };
    }
  }

  const title = normalizeText(input.submitted.title);
  if (title === "") return { action: "reject", status: 400, error: "title required" };

  const before = toMissionSnapshot(input.current);

  let deadline = before.deadline;
  if (input.submitted.deadline !== undefined) {
    const d = normalizeDeadline(input.submitted.deadline);
    if (d === undefined) return { action: "reject", status: 400, error: "Invalid deadline" };
    deadline = d;
  }

  let purpose = before.purpose;
  if (input.submitted.purpose !== undefined) {
    const p = normalizeText(input.submitted.purpose);
    purpose = p === "" ? null : p;
  }

  const after: MissionTextSnapshot = { title, purpose, deadline };
  if (sameMissionText(before, after)) return { action: "noop", current: before };

  const update: { title: string; purpose?: string; deadline?: string } = { title };
  if (input.submitted.purpose !== undefined) update.purpose = purpose ?? "";
  if (input.submitted.deadline !== undefined) update.deadline = deadline ?? "";
  return { action: "write", before, after, update };
}

// ── 履歴の見せ方（本人の画面）─────────────────────────────────────────

/** 履歴に出す欄。仮説と「目指す状態・行動」は、保存では 1 本だが、分けて比べる。 */
export type MissionEditField = "title" | "hypothesis" | "plan" | "deadline";

export type MissionEditChange = {
  field: MissionEditField;
  /** 直す前の値。無かったときは null。 */
  before: string | null;
};

export type MissionEditView = {
  id: string;
  editedAt: string;
  editedBy: MissionEditActor;
  /** この修正で変わった欄と、直す前の値。 */
  changes: MissionEditChange[];
};

const FIELD_ORDER: readonly MissionEditField[] = ["title", "hypothesis", "plan", "deadline"];

function fieldsOf(s: MissionTextSnapshot): Record<MissionEditField, string | null> {
  // 見出しのない文（従来の登録、上司の画面で書いた文）は、仮説なし・全文が「目指す状態・行動」。
  const parts = parseIssuePurpose(s.purpose);
  return {
    title: s.title === "" ? null : s.title,
    hypothesis: parts.hypothesis,
    plan: parts.plan,
    deadline: s.deadline,
  };
}

/**
 * 記録（直す前の文）を、「この修正で、どの欄が変わったか」の形に直す。新しい順で返す。
 * 1 件の記録の「直したあと」は、1 つ新しい記録の「直す前」（いちばん新しい記録では、いまの文）。
 * 見える違いが無い記録（空行の数だけが違う、など）は出さない。
 */
export function buildMissionEditViews(
  current: MissionTextSnapshot,
  records: readonly MissionEditRecord[] | null | undefined
): MissionEditView[] {
  if (!records || records.length === 0) return [];
  const sorted = [...records].sort((a, b) => {
    const ta = Date.parse(a.editedAt);
    const tb = Date.parse(b.editedAt);
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  const views: MissionEditView[] = [];
  let after = fieldsOf(current);
  for (const record of sorted) {
    const before = fieldsOf(record.before);
    const changes: MissionEditChange[] = [];
    for (const field of FIELD_ORDER) {
      if (before[field] !== after[field]) changes.push({ field, before: before[field] });
    }
    if (changes.length > 0) {
      views.push({ id: record.id, editedAt: record.editedAt, editedBy: record.editedBy, changes });
    }
    after = before;
  }
  return views;
}

/** ISO の日時 → 日本時間の "11/22 17:50"。読めない値は null。端末の時間帯に左右されない。 */
export function formatJstDateTime(iso: string | null | undefined): string | null {
  if (typeof iso !== "string") return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const jst = new Date(t + 9 * 60 * 60 * 1000);
  const minutes = String(jst.getUTCMinutes()).padStart(2, "0");
  return `${jst.getUTCMonth() + 1}/${jst.getUTCDate()} ${jst.getUTCHours()}:${minutes}`;
}

/** "2026-12-17" → "2026/12/17"。日付として読めない値は null。Date を通さず文字列のまま読む。 */
export function formatDeadlineDate(deadline: string | null | undefined): string | null {
  const d = normalizeDeadline(deadline);
  if (d === null || d === undefined) return null;
  const m = d.match(DEADLINE_RE);
  if (!m) return null;
  return `${Number(m[1])}/${Number(m[2])}/${Number(m[3])}`;
}

/** 「直した履歴（{n}件）」「{t} に直す前の文」の {n}・{t} を置き換える。 */
export function fillTemplate(template: string, key: "n" | "t", value: string | number): string {
  return template.replace(`{${key}}`, String(value));
}

/** 欄の見出しの末尾の「 *」（必須の印）を外す（履歴の見出しに使う）。 */
export function stripRequiredMark(label: string): string {
  return label.replace(/\s*\*\s*$/, "");
}
