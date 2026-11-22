// 朝・夕の記入の呼び名と、促しの文言（従来型の入力画面・ホーム・ログ・記入の API）。
//
// 「朝・夕の問い」（feature.dailyQuestions）を出している環境では、画面が問いと別のことを
// 聞かないように文言を切り替える。朝の記入の呼び名は「今日の行動」にし、問いを出している回の
// 小見出しは出さない（問いそのものが促しになるため）。
//
// 問いを出していない環境の文言は、元から画面にあった文言と一字一句同じにしてある
// （表示を変えないため。テストで固定）。商品モード（standalone_mode）の画面は別のコード
// （StandaloneInputClient）で、ここでは扱わない。
//
// DB にも React にも依存しない（テスト: entry-terms.test.ts）。
// サーバー側で「問いを出している環境か」を読む処理は entry-question-env.ts にある。

type FlagLike = Readonly<Record<string, boolean | undefined>> | null | undefined;

type DayQuestionsLike =
  | { morning?: readonly unknown[] | null; evening?: readonly unknown[] | null }
  | null
  | undefined;

type WeeklyQuestionsLike = Readonly<Record<string, DayQuestionsLike>> | null | undefined;

function nonEmptyStrings(list: readonly unknown[] | null | undefined): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const text = item.trim();
    if (text !== "") out.push(text);
  }
  return out;
}

/** 問いが 1 つでも登録されているか（どの曜日の、朝・夕のどちらでも）。 */
export function hasAnyQuestion(weekly: WeeklyQuestionsLike): boolean {
  if (!weekly || typeof weekly !== "object") return false;
  for (const day of Object.values(weekly)) {
    if (!day || typeof day !== "object") continue;
    if (nonEmptyStrings(day.morning).length > 0) return true;
    if (nonEmptyStrings(day.evening).length > 0) return true;
  }
  return false;
}

/**
 * 「朝・夕の問い」を出している従来型の環境か。
 * スイッチが ON で、問いが 1 つ以上登録されていて、商品モードでない環境だけ true。
 * 曜日ごとではなく環境ごとに決める（曜日によって呼び名が変わらないようにするため）。
 */
export function isEntryQuestionEnv(flags: FlagLike, weekly: WeeklyQuestionsLike): boolean {
  if (!flags) return false;
  if (flags["standalone_mode"] === true) return false;
  if (flags["feature.dailyQuestions"] !== true) return false;
  return hasAnyQuestion(weekly);
}

/** その日の問いから、朝または夕の問いを取り出す（空の行は外す）。 */
export function pickSlotQuestions(day: DayQuestionsLike, slot: "morning" | "evening"): string[] {
  if (!day || typeof day !== "object") return [];
  return nonEmptyStrings(slot === "morning" ? day.morning : day.evening);
}

/** 朝・夕の記入の呼び名（入力画面・ホーム・ログ）。 */
export type EntryTerms = {
  /** 入力画面の見出し。 */
  morningHeading: string;
  eveningHeading: string;
  /** 夕方の画面に再掲する、朝の記入の見出し。 */
  morningRecapLabel: string;
  /** 記入を完了したときの表示。 */
  morningDone: string;
  eveningDone: string;
  /** 「◯◯を 3 分 で書きました」の ◯◯。 */
  morningEntryName: string;
  eveningEntryName: string;
  /** 朝・夕とも記入済みの日に入力画面を開いたときの表示。 */
  alreadyCompleted: string;
  /** ホームの「今日の状態」の 2 行目（未記入のとき／朝だけ記入したとき）。 */
  homeStartSub: string;
  homeEveningPendingSub: string;
  /** ログの一覧と CSV での、朝の記入の見出し。 */
  logMorningLabel: string;
};

// 既定の文言。入力画面・ホーム・ログに元から書かれていた文言と一字一句同じ
// （問いを出していない環境の表示を変えないため。テストで固定）。
const DEFAULT_TERMS: EntryTerms = {
  morningHeading: "朝の意図設定",
  eveningHeading: "本日の振り返り",
  morningRecapLabel: "今朝の意図",
  morningDone: "今日の意図が設定されました",
  eveningDone: "今日の振り返りが記録されました",
  morningEntryName: "朝の意図",
  eveningEntryName: "本日の振り返り",
  alreadyCompleted: "朝の意図と本日の振り返りが記入されています",
  homeStartSub: "朝の意図設定からスタート",
  homeEveningPendingSub: "1日の気づきを記録しましょう",
  logMorningLabel: "朝の意図",
};

// 「朝・夕の問い」を出している環境の文言。
// 朝の問いは「何をするか」を聞くので、朝の記入を「今日の行動」と呼ぶ。
// 夕方の呼び名（本日の振り返り）は変えない。「気づき」を促す文は、問いに答える促しに置き換える。
const QUESTION_ENV_TERMS: EntryTerms = {
  morningHeading: "今日の行動",
  eveningHeading: "本日の振り返り",
  morningRecapLabel: "今日の行動（今朝の記入）",
  morningDone: "今日の行動を記入しました",
  eveningDone: "今日の振り返りが記録されました",
  morningEntryName: "今日の行動",
  eveningEntryName: "本日の振り返り",
  alreadyCompleted: "今日の行動と本日の振り返りが記入されています",
  homeStartSub: "今日の行動の記入からスタート",
  homeEveningPendingSub: "振り返りの問いに答えましょう",
  logMorningLabel: "今日の行動",
};

/** questionEnv = 「朝・夕の問い」を出している従来型の環境か（isEntryQuestionEnv）。 */
export function entryTerms(questionEnv: boolean): EntryTerms {
  return questionEnv === true ? QUESTION_ENV_TERMS : DEFAULT_TERMS;
}

/** 入力画面の小見出し（元からの文言）。 */
export const DEFAULT_MORNING_SUBHEADING = "今日、ひとつだけ意識するとしたら？";
export const DEFAULT_EVENING_SUBHEADING = "今日やってみてどうでしたか？";

/**
 * 入力画面の小見出し。その回（朝／夕）に問いを出しているときは出さない（null）。
 * 問いを出していない回は、小見出しがただ 1 つの促しなので、元の文言のまま出す。
 */
export function entrySubheading(isMorning: boolean, questionsShown: boolean): string | null {
  if (questionsShown === true) return null;
  return isMorning ? DEFAULT_MORNING_SUBHEADING : DEFAULT_EVENING_SUBHEADING;
}

/**
 * 朝の記入の締め切りを過ぎてから朝の記入を送ったときに、記入の API が返す文。
 * closeHour は締め切りの時刻（date-utils の MORNING_CLOSE_HOUR_JST）。
 */
export function morningClosedMessage(questionEnv: boolean, closeHour: number): string {
  const name = questionEnv === true ? "朝の記入" : "朝の意図設定";
  return `${name}は${closeHour}:00までです。本日の振り返りをご記入ください。`;
}
