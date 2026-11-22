// 管理画面の、参加者 1 人のページ（/a/[token]/participant/[氏名]）で、記入を「1 日＝1 枚」で見せるための
// 組み立て（純関数。データベースを読まない）。
//
// - 朝・夕の記入は、「Q1: 問い / A1: 答え」の形で保存されていれば、問いと答えの組に分ける
//   （daily-question-answers.ts）。その形でない文（自由記入）は、保存した文のまま出す。
// - その日の記入の下に、その日の AIコーチの返信と、その日の記入に付いた上司コメントを並べる
//   （その人の 1 日分を、1 か所で読めるようにする）。
// - HM フィードバックは、ここでは扱わない。HM フィードバックは、日ではなく、人と期間に付けて
//   feedback 表に保存している（logs.hm_feedback は、アプリが書かない旧い列）。読む場所は、管理画面トップの「FB履歴」。
// - 月ごとにまとめる。並びは、渡された順（呼び出し側が新しい順で渡す）のまま。
//   最初から開いておくのは、いちばん新しい月（その月の記入が少ないときは、その前の月も）。

import { parseQuestionAnswers, type QuestionAnswer } from "@/lib/daily-question-answers";

export type AdminDayStatus = "complete" | "morning_only" | "evening_only" | "none";

/** ページが渡す、1 日分の記入（NotionLogEntry のうち、ここで使う欄だけ）。 */
export type AdminDayLogSource = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  dayOfWeek?: string | null;
  status: AdminDayStatus;
  energy?: string | null;
  morningIntent?: string | null;
  eveningInsight?: string | null;
  morningTime?: string | null;
  eveningTime?: string | null;
  managerComment?: string | null;
};

export type AdminEntryBlock =
  /** 問いと答えの組に分けられた記入。 */
  | { kind: "qa"; pairs: QuestionAnswer[] }
  /** 自由記入の文（保存した文のまま）。 */
  | { kind: "text"; text: string };

/** 記入の文を、表示の形にする。空なら null。 */
export function toEntryBlock(text: string | null | undefined): AdminEntryBlock | null {
  if (typeof text !== "string" || text.trim() === "") return null;
  const pairs = parseQuestionAnswers(text);
  return pairs ? { kind: "qa", pairs } : { kind: "text", text };
}

/** ページが渡す、AIコーチの返信（coach_replies のうち、ここで使う欄だけ）。 */
export type AdminCoachReplySource = {
  /** YYYY-MM-DD（どの日の記入への返信か） */
  replyDate: string;
  kind?: string | null;
  status: string;
  content: string;
};

/**
 * 運営の画面での、返信の状態（言葉は COACH_BOARD_TERMS.stateLabels の同じキーを使う）。
 * - delivered: 本人に届いた
 * - pending: 確認待ち（返信の文がある）
 * - needs_attention: 確認が必要（返信を作っていない）
 * - withdrawn: 取り下げ済み
 */
export type AdminCoachReplyState = "delivered" | "pending" | "needs_attention" | "withdrawn";

export type AdminCoachReplyView = { state: AdminCoachReplyState; content: string };

export function toAdminCoachReplyView(reply: AdminCoachReplySource | null | undefined): AdminCoachReplyView | null {
  if (!reply) return null;
  const content = typeof reply.content === "string" ? reply.content : "";
  if (reply.status === "delivered") return { state: "delivered", content };
  if (reply.status === "pending_review") {
    return content.trim() === "" ? { state: "needs_attention", content: "" } : { state: "pending", content };
  }
  if (reply.status === "withdrawn") return { state: "withdrawn", content };
  return null;
}

export type AdminDayLogView = {
  id: string;
  date: string;
  /** 「11月23日（月）」 */
  heading: string;
  /** 「2026-11」。日付の形でないときは "" */
  monthKey: string;
  status: AdminDayStatus;
  energy: string | null;
  morning: AdminEntryBlock | null;
  evening: AdminEntryBlock | null;
  morningTime: string | null;
  eveningTime: string | null;
  managerComment: string | null;
  coachReply: AdminCoachReplyView | null;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 「2026-11-23」→「11月23日（月）」。曜日は、渡されればそれを使い、無ければ日付から求める。日付の形でなければ、そのまま返す。 */
export function formatDayHeading(date: string, dayOfWeek?: string | null): string {
  const m = DATE_RE.exec(typeof date === "string" ? date : "");
  if (!m) return typeof date === "string" ? date : "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const given = typeof dayOfWeek === "string" ? dayOfWeek.trim() : "";
  // 日付だけから曜日を求める（時刻と時間帯を持ち込まない）。
  const wd = given !== "" ? given : WEEKDAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()];
  return `${mo}月${d}日（${wd}）`;
}

export function monthKeyOf(date: string): string {
  const m = DATE_RE.exec(typeof date === "string" ? date : "");
  return m ? `${m[1]}-${m[2]}` : "";
}

/** 「2026-11」→「2026年11月」。その形でなければ「日付なし」。 */
export function monthLabel(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  return m ? `${Number(m[1])}年${Number(m[2])}月` : "日付なし";
}

function textOrNull(v: string | null | undefined): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * 記入と返信を、1 日ごとの表示の形にまとめる。並びは、渡された記入の順のまま。
 * 返信は、その日の「毎日の返信」（kind が daily、または未指定）だけを、日付で結ぶ。
 */
export function buildAdminDayLogViews(
  logs: readonly AdminDayLogSource[],
  replies: readonly AdminCoachReplySource[] | null | undefined
): AdminDayLogView[] {
  const replyByDate = new Map<string, AdminCoachReplySource>();
  for (const r of replies ?? []) {
    if (r.kind != null && r.kind !== "daily") continue;
    if (!replyByDate.has(r.replyDate)) replyByDate.set(r.replyDate, r);
  }
  return logs.map((log) => ({
    id: log.id,
    date: log.date,
    heading: formatDayHeading(log.date, log.dayOfWeek),
    monthKey: monthKeyOf(log.date),
    status: log.status,
    energy: textOrNull(log.energy),
    morning: toEntryBlock(log.morningIntent),
    evening: toEntryBlock(log.eveningInsight),
    morningTime: textOrNull(log.morningTime),
    eveningTime: textOrNull(log.eveningTime),
    managerComment: textOrNull(log.managerComment),
    coachReply: toAdminCoachReplyView(replyByDate.get(log.date)),
  }));
}

export type AdminDayLogMonth = { monthKey: string; label: string; days: AdminDayLogView[] };

/** 月ごとにまとめる。月の並びも、月の中の日の並びも、渡された順のまま（続いている月だけを 1 つにまとめる）。 */
export function groupDayLogsByMonth(views: readonly AdminDayLogView[]): AdminDayLogMonth[] {
  const out: AdminDayLogMonth[] = [];
  for (const v of views) {
    const last = out[out.length - 1];
    if (last && last.monthKey === v.monthKey) last.days.push(v);
    else out.push({ monthKey: v.monthKey, label: monthLabel(v.monthKey), days: [v] });
  }
  return out;
}

/** いちばん新しい月の記入が、この日数に満たないときは、その前の月も最初から開いておく。 */
export const ADMIN_DAY_LOG_OPEN_MIN_DAYS = 7;

/**
 * 最初から開いておく月の数（先頭から数える。0〜2）。
 * いちばん新しい月は、必ず開く。その月の記入が ADMIN_DAY_LOG_OPEN_MIN_DAYS 日分に満たないときは、
 * その前の月も開く（月の初めに、直前の記入が閉じた月の中に隠れないようにする）。それより前の月は閉じておく。
 */
export function countMonthsOpenByDefault(months: readonly AdminDayLogMonth[]): number {
  if (months.length === 0) return 0;
  if (months.length === 1) return 1;
  return months[0].days.length < ADMIN_DAY_LOG_OPEN_MIN_DAYS ? 2 : 1;
}

/** 管理画面の、参加者 1 人のページの「日ごとの記入」の欄の文言（運営の側の言葉。案）。 */
export const ADMIN_DAY_LOG_TERMS = {
  heading: "日ごとの記入",
  /** HM フィードバックを読む場所（このページには出していないので、見出しの下に 1 行で案内する）。 */
  feedbackNote: "HMフィードバックは、このページには出していません。管理画面の参加者一覧の「FB履歴」で読みます。",
  empty: "まだ記入がありません",
  /** 問いに答えが無いとき。 */
  noAnswer: "（記入なし）",
  managerCommentLabel: "上司コメント",
  coachLabel: "AIコーチの返信",
  /** 「AIコーチの確認」のページ（その日）へのリンク。 */
  coachBoardLink: "「AIコーチの確認」で開く",
  /** AIコーチの返信（または、その環境で動いているかどうか）を読めなかったとき。「返信が無い」と見せないために出す。 */
  coachLoadFailed: "AIコーチの返信を読めませんでした。時間をおいて、開き直してください。",
  /** ページの読み取りの途中で失敗したとき（ページの先頭に出す）。 */
  pageLoadFailed: "一部を読み込めませんでした。表示が欠けていることがあります。時間をおいて、開き直してください。",
  /** 月の見出しに添える日数。 */
  monthCount: (n: number) => `${n}日分`,
} as const;
