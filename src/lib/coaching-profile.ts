// 「設計図」の決まり（feature.coachingProfile）。
//
// 設計図 = 本人が自分で確認した、成長課題・これからの行動・止まりそうな場面・
// 夕方に自分へ聞く問い。入力画面と朝夕のリマインドメールに出す。
//
// - 状態は draft（確認前）/ confirmed（確認済み）。運営が下書きを置き、本人が確かめて確定する。
// - **確認前の内容は、メールにも、夕方の「あなたの問い」にも使わない。**
//   本人が確かめていない文を、本人の言葉として毎日見せないため。
// - 直したときは、直す前の内容を履歴に残す（前の内容と日付が後から分かるように）。
// - このファイルは DB にも送信にも依存しない（テスト: coaching-profile.test.ts）。
//   読み書きは coaching-profile-store.ts。

export const HEADLINE_MAX = 120;
export const LONG_TEXT_MAX = 2000;
export const EVENING_QUESTION_MAX = 200;
export const TENDENCY_MAX_ITEMS = 10;
export const TENDENCY_TEXT_MAX = 200;
export const HISTORY_MAX = 20;

/** これまでの記録から見えた傾向（運営の見立て）。use は本人の選択（null = まだ選んでいない）。 */
export type CoachingTendency = { text: string; use: boolean | null };

export type CoachingProfileStatus = "draft" | "confirmed";

export type CoachingProfileFields = {
  /** 毎朝の一文 */
  headline: string;
  /** 成長課題 */
  growthTheme: string;
  /** これからの行動 */
  actions: string;
  /** 期待する結果と、確かめ方 */
  expected: string;
  /** 止まりそうな場面と、ほしい問いかけ */
  stallPoints: string;
  /** 夕方に自分へ聞く問い（空のときは、毎朝の一文を使った問いになる） */
  eveningQuestion: string;
  tendencies: CoachingTendency[];
};

export type CoachingProfile = CoachingProfileFields & {
  status: CoachingProfileStatus;
  confirmedAt: string | null;
  updatedAt: string | null;
};

/** 前後の空白を落とし、制御文字（改行・タブ以外）を除き、上限で切る。文字列でなければ "" */
export function normalizeProfileText(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

/** 1 行の文（改行を空白にまとめる）。毎朝の一文・夕方の問いに使う。 */
export function normalizeOneLine(raw: unknown, max: number): string {
  return normalizeProfileText(raw, max * 2)
    .replace(/\s*\n+\s*/g, " ")
    .slice(0, max)
    .trim();
}

export function normalizeTendencies(raw: unknown): CoachingTendency[] {
  if (!Array.isArray(raw)) return [];
  const out: CoachingTendency[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const text = normalizeProfileText(rec.text, TENDENCY_TEXT_MAX);
    if (!text) continue;
    const use = rec.use === true ? true : rec.use === false ? false : null;
    out.push({ text, use });
    if (out.length >= TENDENCY_MAX_ITEMS) break;
  }
  return out;
}

/** リクエストや DB の値から、欄をそろえて取り出す（知らない欄は捨てる）。 */
export function normalizeProfileFields(raw: unknown): CoachingProfileFields {
  const rec = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    headline: normalizeOneLine(rec.headline, HEADLINE_MAX),
    growthTheme: normalizeProfileText(rec.growthTheme, LONG_TEXT_MAX),
    actions: normalizeProfileText(rec.actions, LONG_TEXT_MAX),
    expected: normalizeProfileText(rec.expected, LONG_TEXT_MAX),
    stallPoints: normalizeProfileText(rec.stallPoints, LONG_TEXT_MAX),
    eveningQuestion: normalizeOneLine(rec.eveningQuestion, EVENING_QUESTION_MAX),
    tendencies: normalizeTendencies(rec.tendencies),
  };
}

/**
 * 本人が「使う／使わない」を選べるのは、運営が置いた傾向だけ。
 * 本人の送信からは選択（use）だけを取り、文は保存済みのものを使う
 * （送信で文を書き換えたり、項目を足したりできないようにする）。
 */
export function mergeTendencyChoices(
  stored: readonly CoachingTendency[],
  submitted: readonly CoachingTendency[]
): CoachingTendency[] {
  return stored.map((t, i) => {
    const s = submitted[i];
    if (!s || s.text !== t.text) return { ...t };
    return { text: t.text, use: s.use };
  });
}

/** 確定できない理由（確定できるときは null）。毎朝の一文だけを必須にする。 */
export function confirmBlocker(fields: CoachingProfileFields): string | null {
  if (!fields.headline) return COACHING_TERMS.headlineRequired;
  return null;
}

/** メールと「あなたの問い」に使ってよい設計図か（確認済みで、毎朝の一文がある）。 */
export function isUsableProfile(p: CoachingProfile | null | undefined): p is CoachingProfile {
  return !!p && p.status === "confirmed" && p.headline !== "";
}

/** 夕方の「あなたの問い」。使えない設計図のときは null。 */
export function personalEveningQuestion(p: CoachingProfile | null | undefined): string | null {
  if (!isUsableProfile(p)) return null;
  if (p.eveningQuestion) return p.eveningQuestion;
  return `今日、「${p.headline}」が出た場面、出せなかった場面はどこでしたか。いつ、誰に、何をしましたか。`;
}

/**
 * 全員共通の夕方の問いの後ろに、「あなたの問い」を 1 つ足す。
 * 共通の問いが 1 つも無い日（問いを出していない日）には足さない
 * （その日は問いの欄そのものが出ず、従来の入力欄になるため）。
 */
export function withPersonalEveningQuestion(
  evening: readonly string[],
  p: CoachingProfile | null | undefined
): { questions: string[]; personalCount: number } {
  const personal = personalEveningQuestion(p);
  if (!personal || evening.length === 0) return { questions: [...evening], personalCount: 0 };
  return { questions: [...evening, personal], personalCount: 1 };
}

/** 入力画面の枠に渡す値。none = まだ無い／draft = 確認前／confirmed = 確認済み。 */
export type CoachingProfileCardData = {
  state: "none" | "draft" | "confirmed";
  headline: string;
  growthTheme: string;
  actions: string;
};

export function toCardData(p: CoachingProfile | null): CoachingProfileCardData {
  if (!p) return { state: "none", headline: "", growthTheme: "", actions: "" };
  if (!isUsableProfile(p)) return { state: "draft", headline: "", growthTheme: "", actions: "" };
  return { state: "confirmed", headline: p.headline, growthTheme: p.growthTheme, actions: p.actions };
}

/** リマインドメールに載せる、その人の分。 */
export type ReminderPersonal = {
  /** 「あなたの設計図から」の行（朝。確認済みの人だけ）。 */
  lines: Array<{ label: string; value: string }>;
  /** 「あなたの問い」（夕方。確認済みの人だけ）。 */
  personalQuestion: string | null;
  /** 設計図の確認のお願いを載せるか（朝。確認前・未作成の人）。 */
  confirmPrompt: boolean;
  /** 設計図のページの URL。 */
  profileUrl: string;
};

export function buildReminderPersonal(args: {
  type: "morning" | "evening" | "evening_no_morning";
  profile: CoachingProfile | null;
  /** 進行中のイシュー（ミッション）の 1 件目。無ければ null。 */
  issue: { label: string; title: string; hypothesisLabel: string; hypothesis: string | null } | null;
  profileUrl: string;
}): ReminderPersonal {
  const usable = isUsableProfile(args.profile);
  if (args.type === "morning") {
    if (!usable) {
      return { lines: [], personalQuestion: null, confirmPrompt: true, profileUrl: args.profileUrl };
    }
    const lines: Array<{ label: string; value: string }> = [];
    if (args.issue && args.issue.title) {
      lines.push({ label: args.issue.label, value: args.issue.title });
      if (args.issue.hypothesis) {
        lines.push({ label: args.issue.hypothesisLabel, value: args.issue.hypothesis });
      }
    }
    lines.push({ label: COACHING_TERMS.headlineLabel, value: (args.profile as CoachingProfile).headline });
    return { lines, personalQuestion: null, confirmPrompt: false, profileUrl: args.profileUrl };
  }
  return {
    lines: [],
    personalQuestion: usable ? personalEveningQuestion(args.profile) : null,
    confirmPrompt: false,
    profileUrl: args.profileUrl,
  };
}

/** 履歴に残す 1 件（直す前の内容）。 */
export type CoachingProfileSnapshot = CoachingProfileFields & {
  status: CoachingProfileStatus;
  at: string;
};

export function snapshotForHistory(p: CoachingProfile, at: string): CoachingProfileSnapshot {
  return {
    headline: p.headline,
    growthTheme: p.growthTheme,
    actions: p.actions,
    expected: p.expected,
    stallPoints: p.stallPoints,
    eveningQuestion: p.eveningQuestion,
    tendencies: p.tendencies.map((t) => ({ ...t })),
    status: p.status,
    at,
  };
}

/** 直す前と後で、欄の中身が同じか（同じなら履歴を増やさない）。 */
export function sameFields(a: CoachingProfileFields, b: CoachingProfileFields): boolean {
  return (
    a.headline === b.headline &&
    a.growthTheme === b.growthTheme &&
    a.actions === b.actions &&
    a.expected === b.expected &&
    a.stallPoints === b.stallPoints &&
    a.eveningQuestion === b.eveningQuestion &&
    JSON.stringify(a.tendencies) === JSON.stringify(b.tendencies)
  );
}

/** 画面とメールの言葉。文言を足す・変えるときは、部品に直接書かずにここに足す。 */
export const COACHING_TERMS = {
  pageTitle: "設計図",
  pageLead: "これからの行動を、毎日思い出すための設計図です。確定すると、朝夕のメールと記入画面に表示されます。",
  statusDraft: "確認前",
  statusConfirmed: "確認済み",
  draftBanner:
    "内容を確かめ、直したいところを直してから「この内容で確定する」を押してください。確定するまで、メールと記入画面には表示されません。",
  emptyBanner: "まだ設計図がありません。下の欄に書いて、確定してください。",
  headlineLabel: "毎朝の一文",
  headlineHelp: "毎朝、自分に見せたい一文。いつ・誰に・何をするかが分かる形で。",
  headlineRequired: "「毎朝の一文」を書いてから確定してください。",
  growthThemeLabel: "成長課題",
  actionsLabel: "これからの行動",
  actionsHelp: "いつ、誰に、何をするか。",
  expectedLabel: "期待する結果と、確かめ方",
  stallPointsLabel: "止まりそうな場面と、ほしい問いかけ",
  eveningQuestionLabel: "夕方に自分へ聞く問い",
  eveningQuestionHelp:
    "夕方の記入に、あなたの問いとして1つ加わります。空のままにすると、毎朝の一文を使った問いになります。",
  tendenciesLabel: "これまでの記録から見えた傾向",
  tendenciesHelp: "運営の見立てです。自分でもそう思うものだけ「使う」を選んでください。",
  tendencyUse: "使う",
  tendencyNotUse: "使わない",
  confirmButton: "この内容で確定する",
  saveButton: "変更を保存する",
  savedMessage: "保存しました。",
  saveFailed: "保存できませんでした。時間をおいて、もう一度お試しください。",
  notice:
    "この設計図は、朝夕のリマインドメールと記入画面に表示されます。あなたと、このプログラムの運営の担当者が読めます。ほかの参加者の画面には表示されません。",
  // 入力画面の枠
  inputCardHeading: "成長課題",
  inputCardDraft: "設計図を確認すると、ここに「毎朝の一文」が表示されます。",
  inputCardLinkDraft: "設計図を確認する",
  inputCardLinkConfirmed: "設計図を開く",
  // ホームと「イシュー」のページに置く入口
  entryTitle: "設計図",
  entryLead: "毎朝の一文、成長課題、これからの行動を開く",
  // 夕方の問いの欄
  personalQuestionCaption: "あなたの問い",
  // メール
  mailLinesHeading: "あなたの設計図から",
  mailConfirmPrompt: "設計図を確認すると、ここにあなたの「毎朝の一文」が載ります。",
  mailConfirmLink: "設計図を確認する",
} as const;
