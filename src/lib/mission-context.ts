// 入力画面の「進行中のミッション」表示（feature.missionOnInput）と、
// ミッションの呼び名の切り替え（feature.missionLabelIssue）で使う純関数。
// 呼び名を切り替えたテナントの設定フォームにある「仮説」の、保存用のまとめ方と読み方もここに置く。
// 設計図のページの先頭に出す「いまの 1 件」の選び方（pickCurrentIssue）もここに置く。
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

// ── 仮説つきの「背景・目的」────────────────────────────────────────────
// イシューの呼び名のテナント（feature.missionLabelIssue）では、設定フォームに「仮説」の欄がある。
// 保存先は増やさず、既存の「背景・目的」（missions.purpose）に見出しをつけて 1 本にまとめる
// （朝・夕の問いの答えを 1 つの欄にまとめる daily-question-answers.ts と同じ考え方）。
// 読むときは見出しで分ける。見出しのない文（従来の登録、マネージャー画面で書いた文）は
// 分けずに、そのまま 1 つの文として扱う。

export const ISSUE_HYPOTHESIS_HEADING = "【仮説】";
export const ISSUE_PLAN_HEADING = "【目指す状態と、これからの行動】";
/** 画面に出すときの見出し（入力画面のカードと、ミッション画面）。 */
export const ISSUE_HYPOTHESIS_LABEL = "仮説";

/** 仮説と、目指す状態・行動を、保存用の 1 本の文字列にまとめる。どちらも空なら空文字。 */
export function composeIssuePurpose(
  hypothesis: string | null | undefined,
  plan: string | null | undefined
): string {
  const h = typeof hypothesis === "string" ? hypothesis.trim() : "";
  const p = typeof plan === "string" ? plan.trim() : "";
  const blocks: string[] = [];
  if (h !== "") blocks.push(`${ISSUE_HYPOTHESIS_HEADING}\n${h}`);
  if (p !== "") blocks.push(`${ISSUE_PLAN_HEADING}\n${p}`);
  return blocks.join("\n\n");
}

export type IssuePurposeParts = {
  /** 見出しつきで保存された文か。false のときは分けていない（plan に全文が入る）。 */
  structured: boolean;
  hypothesis: string | null;
  plan: string | null;
};

/**
 * 保存された「背景・目的」を、仮説と、目指す状態・行動に分ける。
 * 先頭が見出し（【仮説】か【目指す状態と、これからの行動】）で始まる文だけを分ける。
 */
export function parseIssuePurpose(purpose: string | null | undefined): IssuePurposeParts {
  if (typeof purpose !== "string") return { structured: false, hypothesis: null, plan: null };
  const text = purpose.replace(/\r\n?/g, "\n").trim();
  if (text === "") return { structured: false, hypothesis: null, plan: null };

  if (text.startsWith(ISSUE_PLAN_HEADING)) {
    const plan = text.slice(ISSUE_PLAN_HEADING.length).trim();
    return { structured: true, hypothesis: null, plan: plan === "" ? null : plan };
  }
  if (!text.startsWith(ISSUE_HYPOTHESIS_HEADING)) {
    return { structured: false, hypothesis: null, plan: text };
  }

  const rest = text.slice(ISSUE_HYPOTHESIS_HEADING.length);
  const planMarker = `\n${ISSUE_PLAN_HEADING}`;
  const at = rest.indexOf(planMarker);
  const hypothesis = (at === -1 ? rest : rest.slice(0, at)).trim();
  const plan = at === -1 ? "" : rest.slice(at + planMarker.length).trim();
  return {
    structured: true,
    hypothesis: hypothesis === "" ? null : hypothesis,
    plan: plan === "" ? null : plan,
  };
}

// ── いまの 1 件 ──────────────────────────────────────────────────────
// 朝のリマインドメール（api/cron/remind）と AIコーチの返信（api/coach-reply）は、
// 進行中のうち、いちばん新しい 1 件と、その仮説を使う（selectActiveMissions(…, 1) の先頭と、
// parseIssuePurpose の仮説）。設計図のページ（feature.coachingProfile）の先頭にも、同じ 1 件を出す。
// pickCurrentIssue は、その選び方に「ほかに進行中のものの件数」を足したもの（同じ 1 件になることを
// テストで固定している）。呼び出し側は、新しい順で渡す。

export type CurrentIssue = {
  /** 進行中の 1 件目。無ければ null。仮説は、見出しつきで保存された文のときだけ入る。 */
  current: { id: string; title: string; hypothesis: string | null } | null;
  /** ほかに進行中のものの件数。 */
  otherActiveCount: number;
};

/** 進行中の件数を数えるときの上限（1 人が持つ件数として、十分に大きい値）。 */
const ACTIVE_COUNT_LIMIT = 200;

export function pickCurrentIssue(missions: readonly MissionLike[] | null | undefined): CurrentIssue {
  const active = selectActiveMissions(missions, ACTIVE_COUNT_LIMIT);
  const first = active[0];
  if (!first) return { current: null, otherActiveCount: 0 };
  const parts = parseIssuePurpose(first.purpose);
  return {
    current: { id: first.id, title: first.title, hypothesis: parts.structured ? parts.hypothesis : null },
    otherActiveCount: active.length - 1,
  };
}

/** 「ほかに進行中の…が{n}件あります。」の {n} を、件数に置き換える。 */
export function formatOtherActiveCount(template: string, count: number): string {
  return template.replace("{n}", String(count));
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
  /** 設定フォームの「仮説」の欄。null のときは欄を出さない（従来のフォームのまま）。 */
  hypothesisLabel: string | null;
  hypothesisPlaceholder: string | null;
  purposeLabel: string;
  purposePlaceholder: string;
  submit: string;
  emptyTitle: string;
  emptyHint: string;
  inputCardHeading: string;
  inputCardEmpty: string;
  inputCardEmptyLink: string;
  /** 進行中のものを閉じる操作（ボタン → 理由の欄 → 確定のボタン）。 */
  closeButton: string;
  closeNotePlaceholder: string;
  closeConfirm: string;
  /** 閉じるときに、理由の記入を必須にするか。 */
  closeNoteRequired: boolean;
  /** 閉じたあとの表示（書いた理由の見出し／状態のバッジ／一覧の見出し）。 */
  closedNoteLabel: string;
  closedStatusLabel: string;
  closedSectionTitle: string;
  /**
   * 設計図のページ（feature.coachingProfile）の先頭に出す、いまの 1 件の枠（見出し／ほかにも進行中の
   * ものがあるときの 1 行。{n} は件数／この画面へのリンク）。
   */
  blueprintHeading: string;
  blueprintOthers: string;
  blueprintLink: string;
  /** 設計図の「これからの行動」「期待する結果と、確かめ方」をまとめる見出し。 */
  blueprintActionsHeading: string;
  /** 新しく設定した直後に出す、設計図の見直しの案内（設計図を出している環境だけ）。 */
  createdNotice: string;
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
  hypothesisLabel: null,
  hypothesisPlaceholder: null,
  purposeLabel: "背景・目的",
  purposePlaceholder: "このミッションを設定する背景や、達成に向けた期待を記入",
  submit: "ミッションを設定",
  emptyTitle: "ミッションはまだありません",
  emptyHint: "上のボタンから自分でミッションを設定できます",
  inputCardHeading: "進行中のミッション",
  inputCardEmpty: "進行中のミッションを設定すると、ここに表示されます。",
  inputCardEmptyLink: "ミッションを設定する",
  closeButton: "完了にする",
  closeNotePlaceholder: "振り返りコメント（任意）",
  closeConfirm: "完了にする",
  closeNoteRequired: false,
  closedNoteLabel: "最終振り返り",
  closedStatusLabel: "完了",
  closedSectionTitle: "完了",
  blueprintHeading: "進行中のミッション",
  blueprintOthers: "ほかに進行中のミッションが{n}件あります。",
  blueprintLink: "ミッションを見直す",
  blueprintActionsHeading: "このミッションに向けた行動",
  createdNotice: "新しいミッションを設定しました。設計図（このミッションに向けた行動）も見直してください。",
};

// feature.missionLabelIssue が ON のテナントの呼び名。
// 1 つ目の欄（ミッション名）に「解くべき問い」を一文で、新しい欄にその仮説（いまの時点の答え）を、
// 3 つ目の欄（背景・目的）に目指す状態と行動を書いてもらう。入力画面には、問いと仮説が
// 常に見える形で出る。入力欄の案内は書き方だけを示し、答えの見本は置かない。
// 仮説は確かめると変わるので、書き直すのではなく、理由を書いて閉じ、新しく設定してもらう
// （前の問い・仮説と、変えた理由が残る）。
const ISSUE_TERMS: MissionTerms = {
  tab: "イシュー",
  pageTitle: "イシュー（解くべき問い）",
  pageSubtitle: "設定したイシューと仮説、目指す状態・これからの行動",
  createButton: "新しいイシューを設定",
  titleLabel: "イシュー（解くべき問い） *",
  titlePlaceholder: "誰の、どんな問題を解くのか。問いの形で、一文で",
  hypothesisLabel: "仮説（いまの時点の答え） *",
  hypothesisPlaceholder: "その問いに、今の自分はどう答えるか。こうなっているはず、という答えを一文で",
  purposeLabel: "目指す状態と、これからの行動",
  purposePlaceholder: "いつまでに、どうなっていたいか。そのために、いつ、何をするか",
  submit: "イシューを設定",
  emptyTitle: "イシューはまだ設定されていません",
  emptyHint: "上のボタンから設定できます",
  inputCardHeading: "設定したイシュー（解くべき問い）",
  inputCardEmpty: "イシュー（解くべき問い）と仮説を設定すると、ここに表示されます。",
  inputCardEmptyLink: "イシューを設定する",
  closeButton: "このイシューを閉じる",
  closeNotePlaceholder: "閉じる理由（解決した、見直した など）",
  closeConfirm: "閉じる",
  closeNoteRequired: true,
  closedNoteLabel: "閉じた理由",
  closedStatusLabel: "終了",
  closedSectionTitle: "閉じたイシュー",
  blueprintHeading: "いまのイシュー（解くべき問い）",
  blueprintOthers: "ほかに進行中のイシューが{n}件あります。",
  blueprintLink: "イシューを見直す",
  blueprintActionsHeading: "このイシューに向けた行動",
  createdNotice: "新しいイシューを設定しました。設計図（このイシューに向けた行動）も見直してください。",
};

/** useIssueLabel = feature.missionLabelIssue が ON か。 */
export function missionTerms(useIssueLabel: boolean): MissionTerms {
  return useIssueLabel === true ? ISSUE_TERMS : MISSION_TERMS;
}
