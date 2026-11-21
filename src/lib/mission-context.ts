// 入力画面の「進行中のミッション」表示（feature.missionOnInput）と、
// ミッションの呼び名の切り替え（feature.missionLabelIssue）で使う純関数。
// DB にも React にも依存しない（テスト: mission-context.test.ts）。

export type MissionContextItem = {
  id: string;
  title: string;
  purpose: string | null;
  deadline: string | null;
};

type MissionLike = {
  id: string;
  title: string;
  purpose?: string | null;
  deadline?: string | null;
  status?: string | null;
};

/** 入力画面に出す件数の上限。 */
export const MAX_MISSIONS_ON_INPUT = 3;

/**
 * 「進行中」かどうか。ミッション画面（/p/[token]/mission）の絞り込みと同じ値を見る。
 * status が未設定（null・空）の行は、読み取り側（rowToMission）と同じく進行中として扱う。
 */
export function isActiveMissionStatus(status: string | null | undefined): boolean {
  if (status === null || status === undefined) return true;
  const s = status.trim();
  return s === "" || s === "進行中" || s === "in_progress";
}

/**
 * 進行中のミッションだけを、渡された順（呼び出し側は新しい順で渡す）に最大 max 件。
 * タイトルが空の行は表示できないので外す。空文字の purpose / deadline は null にそろえる。
 */
export function selectActiveMissions(
  missions: readonly MissionLike[] | null | undefined,
  max: number = MAX_MISSIONS_ON_INPUT
): MissionContextItem[] {
  if (!missions) return [];
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 0;
  const out: MissionContextItem[] = [];
  for (const m of missions) {
    if (out.length >= limit) break;
    if (!m || typeof m.title !== "string" || m.title.trim() === "") continue;
    if (!isActiveMissionStatus(m.status)) continue;
    const purpose = typeof m.purpose === "string" && m.purpose.trim() !== "" ? m.purpose : null;
    const deadline = typeof m.deadline === "string" && m.deadline.trim() !== "" ? m.deadline : null;
    out.push({ id: m.id, title: m.title, purpose, deadline });
  }
  return out;
}

/**
 * "2026-12-17"（または "2026-12-17T..."）→ "12/17"。日付として読めない値は null。
 * Date を通さず文字列のまま読む（タイムゾーンで日付がずれないようにするため）。
 */
export function formatMissionDeadline(deadline: string | null | undefined): string | null {
  if (typeof deadline !== "string") return null;
  const m = deadline.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${month}/${day}`;
}

/** 入力画面では背景・目的を 3 行まで見せる。その目安の文字数（スマートフォンの 1 行は約 20 文字）。 */
export const PURPOSE_PREVIEW_CHARS = 60;
export const PURPOSE_PREVIEW_LINES = 3;

/**
 * 背景・目的が 3 行の表示に収まらない長さか（「続きを見る」を出すかの判定）。
 * 画面の幅は分からないので、行数と文字数の目安で決める。
 */
export function isLongPurpose(purpose: string | null | undefined): boolean {
  if (typeof purpose !== "string") return false;
  const text = purpose.trim();
  if (text === "") return false;
  if (text.split("\n").length > PURPOSE_PREVIEW_LINES) return true;
  return text.length > PURPOSE_PREVIEW_CHARS;
}

/** 参加者画面でミッション機能を何と呼ぶか。 */
export type MissionTerms = {
  /** 下のタブ。幅が狭いので 5 文字以内。 */
  tab: string;
  pageTitle: string;
  pageSubtitle: string;
  createButton: string;
  titleLabel: string;
  titlePlaceholder: string;
  purposeLabel: string;
  purposePlaceholder: string;
  submit: string;
  emptyTitle: string;
  emptyHint: string;
  inputCardHeading: string;
  inputCardEmpty: string;
  inputCardEmptyLink: string;
};

// 既定の呼び名。ミッション画面とタブに元から書かれていた文言と一字一句同じにしてある
// （feature.missionLabelIssue が OFF のテナントの表示を変えないため。テストで固定）。
const MISSION_TERMS: MissionTerms = {
  tab: "ミッション",
  pageTitle: "ミッション",
  pageSubtitle: "上司と共有するミッションと進捗",
  createButton: "新しいミッションを設定",
  titleLabel: "ミッション名 *",
  titlePlaceholder: "例: Q3営業戦略の提案書を自力で完成させる",
  purposeLabel: "背景・目的",
  purposePlaceholder: "このミッションを設定する背景や、達成に向けた期待を記入",
  submit: "ミッションを設定",
  emptyTitle: "ミッションはまだありません",
  emptyHint: "上のボタンから自分でミッションを設定できます",
  inputCardHeading: "進行中のミッション",
  inputCardEmpty: "進行中のミッションを設定すると、ここに表示されます。",
  inputCardEmptyLink: "ミッションを設定する",
};

// feature.missionLabelIssue が ON のテナントの呼び名。
// 1 つ目の欄（ミッション名）に「解くべき問題」を一文で、2 つ目の欄（背景・目的）に
// 目指す状態と行動を書いてもらう。入力画面には 1 つ目の欄が常に見える形で出る。
// 入力欄の案内は書き方だけを示し、答えの見本は置かない。
const ISSUE_TERMS: MissionTerms = {
  tab: "イシュー",
  pageTitle: "イシュー（解くべき問題）",
  pageSubtitle: "設定したイシューと、目指す状態・これからの行動",
  createButton: "新しいイシューを設定",
  titleLabel: "イシュー（解くべき問題） *",
  titlePlaceholder: "誰の、どんな問題を解くのかを、一文で",
  purposeLabel: "目指す状態と、これからの行動",
  purposePlaceholder: "いつまでに、どうなっていたいか。そのために、いつ、何をするか",
  submit: "イシューを設定",
  emptyTitle: "イシューはまだ設定されていません",
  emptyHint: "上のボタンから設定できます",
  inputCardHeading: "設定したイシュー（解くべき問題）",
  inputCardEmpty: "イシュー（解くべき問題）を設定すると、ここに表示されます。",
  inputCardEmptyLink: "イシューを設定する",
};

/** useIssueLabel = feature.missionLabelIssue が ON か。 */
export function missionTerms(useIssueLabel: boolean): MissionTerms {
  return useIssueLabel === true ? ISSUE_TERMS : MISSION_TERMS;
}
