// 「AIコーチの返信」の決まり（feature.coachReply）。
//
// AIコーチの返信 = 夕方の記入のあと、その日のうちに本人へ返す短い問いかけ。
// 保存先は coach_replies 表（migration 20261122）。読み書きは coach-reply-store.ts、
// AI に渡す文と出力の読み方は coach-reply-prompt.ts、AI の呼び出しは coach-reply-llm.ts。
// このファイルは DB にも通信にも依存しない（テスト: coach-reply.test.ts）。
// 画面の部品（参加者の画面、運営の確認ページ）は、このファイルだけを読み込む。
//
// 決まり（CLAUDE.md §5・§8 項目 13）
// - 返すのは、設計図を確定していて（isUsableProfile）、本人が受け取りを切っていない人だけ。
//   商品モードの環境と、観の期の記入には返さない（どちらも「本人と装置だけ」の記入）。
// - AI に渡すのは、本人が設計図の画面で見られるものと、その日の記入だけ。
//   氏名・メールアドレス・ほかの日の記入・運営だけが持つ資料は渡さない。
// - 動くのは、スイッチが ON で、環境の設定（届け方と開始日。ai_settings の coach_reply_config）が
//   ある環境だけ。設定が無い環境では、返信を作らない（スイッチを入れただけでは、記入を AI に送らない）。
// - 強い不調などが書かれた記入には、返信を作らず、運営の確認待ちにする。

import { isUsableProfile, type CoachingProfile } from "./coaching-profile";

export const COACH_REPLY_FLAG = "feature.coachReply";

export type CoachReplyKind = "daily" | "weekly";
export type CoachReplyStatus = "pending_review" | "delivered" | "withdrawn";

/** auto = 作ったらすぐ本人に届ける。review = 運営が確認してから届ける。 */
export type CoachDeliveryMode = "auto" | "review";

export type CoachConfig = {
  deliveryMode: CoachDeliveryMode;
  /** この日より前の記入には返さない（YYYY-MM-DD）。null = 制限なし。 */
  startDate: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ai_settings（key='coach_reply_config'）の値を読む。JSON の文字列でも、オブジェクトでもよい。
 * 例：{"deliveryMode":"review","startDate":"2026-01-05"}
 *
 * null = 設定が無い、または、形が正しくない。**null の環境では、返信を作らない**
 * （スイッチを ON にしただけでは、記入を AI に送らない。届け方と開始日を決めて、設定を置いてから動く）。
 * 形が少しでも違うとき（届け方の綴りの誤り、日付の形の誤り）も null にする。誤った設定を、
 * 近い設定に読み替えて動かさない（開始日の誤りを「制限なし」と読むと、意図より前の記入に返してしまう）。
 */
export function parseCoachConfig(raw: unknown): CoachConfig | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (text === "") return null;
    try {
      value = JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (rec.deliveryMode !== "auto" && rec.deliveryMode !== "review") return null;
  let startDate: string | null = null;
  if (rec.startDate !== undefined && rec.startDate !== null) {
    if (typeof rec.startDate !== "string" || !DATE_RE.test(rec.startDate)) return null;
    startDate = rec.startDate;
  }
  return { deliveryMode: rec.deliveryMode, startDate };
}

// ---------------------------------------------------------------------------
// 返してよいか
// ---------------------------------------------------------------------------

/** 返信の対象になる、その日の記入（logs の 1 行から、要る欄だけ）。 */
export type CoachDayLog = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  morningIntent: string;
  eveningInsight: string;
  phaseMode: string;
};

export type CoachIneligibleReason =
  | "kill_switch"
  | "flag_off"
  | "standalone"
  /** 環境の設定（届け方と開始日）が、まだ無い。 */
  | "not_configured"
  | "no_profile"
  | "opted_out"
  | "no_evening_entry"
  | "kan_no_ki"
  | "before_start"
  | "too_old";

export type CoachEligibility = { ok: true } | { ok: false; reason: CoachIneligibleReason };

/**
 * この記入に、AIコーチが返してよいか。
 * 夕方の記入の有無は、夕方の文（evening_insight）で見る（気分の値や status では見ない。
 * 気分は朝の記入でも入り、status が complete でも文が空のことがある）。
 */
export function decideCoachEligibility(args: {
  killSwitch: boolean;
  /** feature.coachReply と feature.coachingProfile の両方が ON。 */
  flagsOn: boolean;
  standalone: boolean;
  profile: CoachingProfile | null;
  /** 本人が受け取りを切っていない（coaching_profiles.coach_enabled）。 */
  coachEnabled: boolean;
  log: CoachDayLog | null;
  /** 今日と前日（JST。YYYY-MM-DD）。 */
  today: string;
  yesterday: string;
  startDate: string | null;
}): CoachEligibility {
  if (args.killSwitch) return { ok: false, reason: "kill_switch" };
  if (!args.flagsOn) return { ok: false, reason: "flag_off" };
  if (args.standalone) return { ok: false, reason: "standalone" };
  if (!isUsableProfile(args.profile)) return { ok: false, reason: "no_profile" };
  if (!args.coachEnabled) return { ok: false, reason: "opted_out" };
  const log = args.log;
  if (!log || log.eveningInsight.trim() === "") return { ok: false, reason: "no_evening_entry" };
  if (log.phaseMode === "kan-no-ki") return { ok: false, reason: "kan_no_ki" };
  if (log.date !== args.today && log.date !== args.yesterday) return { ok: false, reason: "too_old" };
  if (args.startDate && log.date < args.startDate) return { ok: false, reason: "before_start" };
  return { ok: true };
}

/** YYYY-MM-DD の前日（暦の上で 1 日前）。形が違うときは ""。 */
export function previousDate(date: string): string {
  if (!DATE_RE.test(date)) return "";
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

/** inputs_used の値の、画面での呼び名（運営の確認ページ）。知らない値は、そのまま出す。 */
export const COACH_INPUT_LABELS: Readonly<Record<string, string>> = {
  morning_entry: "朝の記入",
  evening_entry: "夕方の記入",
  blueprint: "設計図",
  tendencies_in_use: "「使う」と選んだ傾向",
  issue: "イシュー",
  hypothesis: "仮説",
  previous_question: "前回の問い",
};

// ---------------------------------------------------------------------------
// 本人の画面に返す形
// ---------------------------------------------------------------------------

/** 保存された返信（本人の画面と、運営の確認ページで使う）。 */
export type CoachReply = {
  id: string;
  /** YYYY-MM-DD（どの日の記入への返信か） */
  replyDate: string;
  kind: CoachReplyKind;
  content: string;
  status: CoachReplyStatus;
  createdAt: string | null;
};

/**
 * 本人の画面に出す状態。
 * - delivered: 返信の文を出す
 * - pending: 「運営の担当者が読んでからお届けします」と出す（文は出さない）
 * - none: 何も出さない（対象外、取り下げ済み）
 */
export type CoachReplyView =
  | { state: "delivered"; replyDate: string; content: string }
  | { state: "pending"; replyDate: string }
  | { state: "none" };

/** 保存された返信を、本人の画面に出す形にする。確認待ち・取り下げ済みの文は、本人に返さない。 */
export function toParticipantView(reply: CoachReply | null): CoachReplyView {
  if (!reply) return { state: "none" };
  if (reply.status === "delivered" && reply.content.trim() !== "") {
    return { state: "delivered", replyDate: reply.replyDate, content: reply.content };
  }
  if (reply.status === "pending_review") return { state: "pending", replyDate: reply.replyDate };
  return { state: "none" };
}

// ---------------------------------------------------------------------------
// 運営の確認ページ（/a/[token]/coach）
// ---------------------------------------------------------------------------

/**
 * 確認ページを読める人。記入を読める人と同じ範囲にする（GET /api/admin と同じ判定）。
 * - admin  = 管理者（is_admin）。環境を 1 つ指定して読む。返信を届ける・取り下げる操作ができる。
 * - viewer = 閲覧者（observer。role が admin で is_admin でない行も、こちらに入れる）。自分の環境だけを読む。操作はできない。
 * - null   = 読めない（上司の画面のトークン、知らないトークン）。
 * 「管理者」の判定は is_admin で行う（role の文字列だけで決めない。CLAUDE.md §8 項目 12）。
 */
export type CoachBoardRole = "admin" | "viewer";

export function coachBoardRole(
  manager: { isAdmin?: boolean | null; role?: string | null } | null | undefined
): CoachBoardRole | null {
  if (!manager) return null;
  if (manager.isAdmin === true) return "admin";
  if (manager.role === "observer" || manager.role === "admin") return "viewer";
  return null;
}

export type CoachBoardAction = "deliver" | "withdraw";

export type CoachActionDecision =
  | { ok: true; next: Extract<CoachReplyStatus, "delivered" | "withdrawn"> }
  | { ok: false; reason: "not_pending" | "no_content" | "already_withdrawn" };

/**
 * 運営の操作を、いまの状態で行ってよいか。
 * - 届ける：確認待ちで、返信の文があるものだけ（文の無い確認待ち＝返信を作らなかった記入は、届けるものが無い）。
 * - 取り下げる：確認待ち・届いたもの。取り下げたものは、もう一度届けられない（その日の返信は作り直さない）。
 */
export function decideCoachAction(
  action: CoachBoardAction,
  current: { status: CoachReplyStatus; hasContent: boolean }
): CoachActionDecision {
  if (action === "deliver") {
    if (current.status !== "pending_review") return { ok: false, reason: "not_pending" };
    if (!current.hasContent) return { ok: false, reason: "no_content" };
    return { ok: true, next: "delivered" };
  }
  if (current.status === "withdrawn") return { ok: false, reason: "already_withdrawn" };
  return { ok: true, next: "withdrawn" };
}

/** 確認ページの 1 行（1 人・1 日）の状態。上にあるものほど、先に見てほしいもの。 */
export type CoachBoardState =
  /** 確認待ちで、返信の文が無い（強い不調などの語があった、または AI が返信を作らなかった）。 */
  | "needs_attention"
  /** 確認待ち（返信の文がある。届けるか、取り下げるかを決める）。 */
  | "pending"
  /** 夕方の記入があり、返してよい人だが、返信がまだ無い（本人が画面を開いたときに作る）。 */
  | "not_generated"
  | "delivered"
  | "withdrawn"
  | "opted_out"
  /** 設計図が確認前、または、まだ無い。 */
  | "no_profile"
  | "no_evening";

const BOARD_STATE_ORDER: readonly CoachBoardState[] = [
  "needs_attention",
  "pending",
  "not_generated",
  "delivered",
  "withdrawn",
  "opted_out",
  "no_profile",
  "no_evening",
];

export function coachBoardState(row: {
  evening: string;
  profileStatus: "none" | "draft" | "confirmed";
  coachEnabled: boolean;
  reply: { status: CoachReplyStatus; content: string } | null;
}): CoachBoardState {
  if (row.reply) {
    if (row.reply.status === "delivered") return "delivered";
    if (row.reply.status === "withdrawn") return "withdrawn";
    return row.reply.content.trim() === "" ? "needs_attention" : "pending";
  }
  if (row.evening.trim() === "") return "no_evening";
  if (row.profileStatus !== "confirmed") return "no_profile";
  if (!row.coachEnabled) return "opted_out";
  return "not_generated";
}

/** 確認ページの並び。状態の順（先に見てほしいものが上）。同じ状態の中は、渡された順のまま。 */
export function sortCoachBoard<T>(rows: readonly T[], stateOf: (row: T) => CoachBoardState): T[] {
  return rows
    .map((row, index) => ({ row, index, rank: BOARD_STATE_ORDER.indexOf(stateOf(row)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((x) => x.row);
}

/**
 * 確認ページで見る日付。形が違う値と、今日より先の日付は、今日にする。
 * （今日より先の日付の記入は無い。URL を手で書き換えたときに、空の一覧を「記入なし」と読み違えないように。）
 */
export function normalizeBoardDate(raw: string | null | undefined, today: string): string {
  if (typeof raw !== "string" || !DATE_RE.test(raw)) return today;
  // 暦に無い日付（2026-02-31 など）は、Date が別の日に読み替える。読み替えが起きた値は使わない。
  const [y, m, d] = raw.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return today;
  return raw > today ? today : raw;
}

/** YYYY-MM-DD の翌日。形が違うときは ""。 */
export function nextDate(date: string): string {
  if (!DATE_RE.test(date)) return "";
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

/** "2026-01-06" → "1/6"。日付として読めない値は、そのまま返す（Date を通さず、文字列のまま読む）。 */
export function formatReplyDate(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])}/${Number(m[3])}` : date;
}

/** ISO 形式の日時 → 日本時間の "11/22 18:05"。読めない値は ""。 */
export function formatJstDateTime(iso: string | null | undefined): string {
  if (typeof iso !== "string" || iso.trim() === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${Number(get("month"))}/${Number(get("day"))} ${get("hour")}:${get("minute")}`;
}

// ---------------------------------------------------------------------------
// 前回の問い（翌朝のメールと入力画面に出す。feature.coachPreviousQuestion）
// ---------------------------------------------------------------------------

/** 返信の段落（空行で区切る。前後の空白を除き、空の段落は数えない）。 */
export function replyParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

/**
 * 返信の最後の段落（「あした確かめること」の問い）。
 * 次の返信を作るときに、前回の問いとして AI に渡す（coach-reply-prompt.ts）。画面とメールに出すときは、
 * 下の pickPreviousCoachQuestion を通す。
 */
export function lastParagraph(content: string): string | null {
  const paragraphs = replyParagraphs(content);
  if (paragraphs.length === 0) return null;
  return paragraphs[paragraphs.length - 1];
}

/** 「前回の問い」を出すのは、その返信の記入の日から、この日数まで（古い問いを、毎朝出し続けない）。 */
export const COACH_PREVIOUS_QUESTION_MAX_AGE_DAYS = 7;
/** 「前回の問い」として出す段落の、長さの上限。これより長いときは出さない（途中で切った問いを見せない）。 */
export const COACH_PREVIOUS_QUESTION_MAX_CHARS = 200;

/** 画面とメールに出す「前回の問い」。replyDate は、その返信が返した記入の日（YYYY-MM-DD）。 */
export type PreviousCoachQuestion = { text: string; replyDate: string };

/** YYYY-MM-DD の 2 つの日付の差（to − from。暦の日数）。形が違うときは null。 */
function daysBetween(from: string, to: string): number | null {
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return null;
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * 翌朝のメールと入力画面に出す「前回の AIコーチの問い」を、前回の返信から取り出す。出さないときは null。
 *
 * - 届いた（delivered）毎日の返信からだけ。確認待ち・取り下げ済みの返信の文は、本人に見せない（toParticipantView と同じ）。
 * - 今日より前の記入への返信で、COACH_PREVIOUS_QUESTION_MAX_AGE_DAYS 日以内のものだけ。
 * - 段落が 2 つ以上ある返信の、最後の段落。段落が 1 つだけの返信（問いの段落を分けていない）と、
 *   最後の段落が COACH_PREVIOUS_QUESTION_MAX_CHARS 字を超える返信からは、出さない（全文は「FB」のタブで読める）。
 *
 * どの返信を「前回」とするかは、AI に渡す前回の問いと同じ（その日より前の、届いた毎日の返信のうち、
 * いちばん新しいもの。coach-reply-store.ts の getPreviousDeliveredReply）。出すかどうかの条件だけ、ここで足す。
 */
export function pickPreviousCoachQuestion(args: {
  reply: { status: CoachReplyStatus; kind?: string | null; replyDate: string; content: string } | null | undefined;
  /** 今日（JST。YYYY-MM-DD）。 */
  today: string;
}): PreviousCoachQuestion | null {
  const reply = args.reply;
  if (!reply) return null;
  if (reply.status !== "delivered") return null;
  if (reply.kind != null && reply.kind !== "daily") return null;
  const age = daysBetween(reply.replyDate, args.today);
  if (age === null || age < 1 || age > COACH_PREVIOUS_QUESTION_MAX_AGE_DAYS) return null;
  const paragraphs = replyParagraphs(reply.content);
  if (paragraphs.length < 2) return null;
  const text = paragraphs[paragraphs.length - 1];
  if (text.length > COACH_PREVIOUS_QUESTION_MAX_CHARS) return null;
  return { text, replyDate: reply.replyDate };
}

/** 画面の文言（参加者の画面と、運営の確認ページ）。文言を足す・変えるときは、ここに足す。 */
export const COACH_TERMS = {
  name: "AIコーチ",
  reading: "AIコーチが、今日の記入を読んでいます。",
  pending: "この返信は、運営の担当者が読んでからお届けします。",
  failed: "AIコーチの返信を、いまは作れませんでした。あとで「FB」のタブから開けます。",
  retry: "もう一度読んでもらう",
  listHeading: "AIコーチからの問いかけ",
  listEmpty: "まだありません。夕方の記入のあとに届きます。",
  listEmptyNoProfile: "設計図を確定すると、夕方の記入のあとに、AIコーチからの問いかけが届きます。",
  listEmptyOptedOut: "AIコーチの返信を「受け取らない」に設定しています。設計図のページで切り替えられます。",
  replyDateSuffix: "の記入への返信",
  // 前回の問い（翌朝のメールと入力画面に出す。feature.coachPreviousQuestion）
  previousQuestionLabel: "前回のAIコーチの問い",
  /** date は "11/24" の形（formatReplyDate）。 */
  previousQuestionFrom: (date: string) => `${date} の記入への返信から`,
  previousQuestionLink: "返信の全文を読む",
  // 設計図のページ
  optInLabel: "AIコーチの返信を受け取る",
  optInOn: "受け取る",
  optInOff: "受け取らない",
  optInHelp: "「受け取らない」にすると、AIコーチは、そのあとのあなたの記入を読みません。いつでも切り替えられます。",
  optInNeedsProfile: "設計図を確定すると、ここで「受け取る・受け取らない」を選べます。確定するまで、AIコーチはあなたの記入を読みません。",
  optInLoadFailed: "いまの設定を読み込めませんでした。時間をおいて、このページを開き直してください。",
  optInSaved: "切り替えました。",
  optInFailed: "切り替えられませんでした。時間をおいて、もう一度お試しください。",
  /** 設計図のページの「傾向」の欄に足す一文（AIコーチの返信を出している環境だけ）。 */
  tendenciesNote: "「使う」にしたものだけ、AIコーチがあなたへの問いを考える材料にします。",
  aboutHeading: "AIコーチについて",
  /**
   * 説明文。書くのは、コードで行っていることだけ（評価への利用、消し方、保存の期間など、
   * 決まっていないことは書かない）。文を変えるときは、buildCoachUserPrompt（AI に渡すもの）、
   * coachBoardRole（読める人）、decideCoachEligibility（受け取らない設定）と合っているかを確かめる。
   */
  aboutLines: [
    "夕方の記入を保存すると、AIコーチがその日の記入を読み、短い問いかけを返します。AIには、評価や助言を書かず、問いを返すように指示しています。",
    "AIに送るのは、その日の朝と夕方の記入、あなたが確定した設計図（「使う」と選んだ傾向を含みます）、進行中のイシュー（ミッション）の名前と仮説、前回のAIコーチの問いです。",
    "あなたの氏名とメールアドレスは、付けて送りません。記入の中に書いた人の名前や社名は、そのまま送られます。",
    "送り先は、外部のAIサービス（Anthropic 社の Claude）です。",
    "返信と、その日の記入は、運営の担当者（管理者と、閲覧の権限を持つ人）が読めます。ほかの参加者の画面には出ません。",
    "設定によっては、運営の担当者が読んでから、返信が届きます。",
    "「受け取らない」にしても、それまでに届いた返信は残ります。",
  ],
  /**
   * 説明文に足す 1 行（前回の問いを翌朝に出している環境＝feature.coachPreviousQuestion が ON の環境だけ）。
   * 届いた返信の文が、メールにも載ることを書く。スイッチが OFF の環境では出さない（行っていないことを書かない）。
   * 「何行で」「いつまで」は書かない（問いは 200 字までで、1 行とは限らない。次の返信が届くか、7 日たつまで出る）。
   */
  aboutLinePreviousQuestion:
    "届いた返信の最後の問いは、朝のリマインドメールと記入画面にも出ます。「受け取らない」にしているあいだは、出ません。",
} as const;

/** 朝のリマインドメールに載せる、前回の問いの見出し：「前回のAIコーチの問い（11/24 の記入への返信から）」。 */
export function previousQuestionMailLabel(replyDate: string): string {
  return `${COACH_TERMS.previousQuestionLabel}（${COACH_TERMS.previousQuestionFrom(formatReplyDate(replyDate))}）`;
}

/**
 * 運営へのお知らせメール（返信が、確認待ち・確認が必要になったときに送る。coach-notice.ts）の、
 * その環境の宛先の設定の状態。確認ページに、管理者にだけ出す。
 * - ready          = 宛先があり、送れる
 * - not_configured = 宛先の設定（ai_settings の coach_notify_config）が無い
 * - invalid_config = 設定の行はあるが、形が正しくない
 * - no_recipient   = 設定はあるが、送れる人がいない（このページを読めない人か、アドレスの登録が無い人）
 * - unknown        = 設定を読めなかった
 * ready 以外では、確認待ち・確認が必要になっても、メールは送られない。
 */
export type CoachNoticeState = "ready" | "not_configured" | "invalid_config" | "no_recipient" | "unknown";

/** 運営の確認ページ（/a/[token]/coach）の文言。 */
export const COACH_BOARD_TERMS = {
  title: "AIコーチの確認",
  lead: "日付ごとに、その日の記入と、AIコーチの返信を並べています。",
  entryCardTitle: "AIコーチの確認",
  entryCardLead: "その日の記入と、AIコーチの返信（確認待ち・届いたもの）",
  stateLabels: {
    needs_attention: "確認が必要（返信は作っていません）",
    pending: "確認待ち",
    not_generated: "返信はまだありません",
    delivered: "届いた",
    withdrawn: "取り下げ済み",
    opted_out: "本人が「受け取らない」に設定",
    no_profile: "設計図が確認前",
    no_evening: "夕方の記入なし",
  } satisfies Record<CoachBoardState, string>,
  needsAttentionHelp:
    "記入に、強い不調などを書いた言い方があったか、AIが返信を作らないと判断しました。返信は作っていません。本人の画面には「運営の担当者が読んでからお届けします」と出ています。記入を読み、必要な連絡をしたあとで「確認済みにする」を押すと、本人の画面のその表示が消えます。",
  notGeneratedHelp: "返信は、本人が記入の完了の画面か「FB」のタブを開いたときに作られます（その日と翌日のあいだ）。",
  deliver: "この返信を届ける",
  withdraw: "取り下げる",
  acknowledge: "確認済みにする",
  withdrawConfirm: "取り下げると、本人の画面から消えます。記録は残ります。その日の返信は作り直しません。",
  viewerNote: "閲覧専用です。届ける・取り下げるは、管理者が行います。",
  modeAuto: "届け方：作ったらすぐ本人に届ける",
  modeReview: "届け方：運営が確認してから届ける",
  startDatePrefix: "対象：",
  startDateSuffix: " 以降の記入",
  killSwitchNote: "アプリ全体の設定で、AIコーチの返信を止めています（新しい返信は作られず、本人の画面にも出ません）。",
  disabledNote: "この環境では、AIコーチの返信のスイッチがOFFです。",
  notConfiguredNote:
    "この環境には、届け方と開始日の設定がまだありません。設定を置くまで、AIコーチの返信は作られません（記入はAIに送られません）。",
  needTenantNote: "管理画面で環境を1つ選んでから、このページを開いてください。",
  morningLabel: "朝",
  eveningLabel: "夕方",
  replyLabel: "AIコーチの返信",
  noEntry: "（記入なし）",
  conflict: "ほかの操作で状態が変わっています。読み込み直しました。",
  actionFailed: "操作できませんでした。時間をおいて、もう一度お試しください。",
  loadFailed: "読み込めませんでした。時間をおいて、ページを開き直してください。",
  // 運営へのお知らせメールの欄（管理者にだけ出す）。
  noticeHeading: "お知らせメール",
  noticeStates: {
    ready: "「確認待ち」「確認が必要」の返信が出たときに、運営の担当者へメールで知らせます。",
    not_configured: "宛先の設定がありません。「確認待ち」「確認が必要」の返信が出ても、メールは送られません。",
    invalid_config:
      "宛先の設定の形が正しくありません。「確認待ち」「確認が必要」の返信が出ても、メールは送られません。",
    no_recipient:
      "設定された宛先に、送れる人がいません（このページを読めない人か、メールアドレスの登録が無い人です）。メールは送られません。",
    unknown: "宛先の設定を読めませんでした。時間をおいて、ページを開き直してください。",
  } satisfies Record<CoachNoticeState, string>,
  noticeRecipients: (count: number) => `宛先：${count}名`,
  noticeSkipped: (count: number) =>
    `設定された宛先のうち、${count}名には送れません（このページを読めない人か、メールアドレスの登録が無い人です）。`,
  noticeTest: "試しに送る",
  noticeTestSending: "送っています…",
  noticeTestSent: (count: number) =>
    `試し送りのメールを、${count}名に送りました。届かないときは、迷惑メールのフォルダを確かめてください。`,
  noticeTestFailed: "送れませんでした。時間をおいて、もう一度お試しください。",
  noticeTestTooMany: "続けて送れる回数を超えました。10分ほどおいてから、お試しください。",
} as const;
