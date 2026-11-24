// 「前回の AIコーチの問い」を、翌朝のメールと入力画面に出すための流れ
// （feature.coachPreviousQuestion。サーバー側だけが読み込む）。
//
// 読み取りは引数で受け取る（テストで、順番と条件を確かめるため）。実際の読み取りをつないだものは
// coach-previous-question-runtime.ts。問いの取り出し方（どの段落を、いつまで出すか）は
// coach-reply.ts の pickPreviousCoachQuestion。
//
// 出すのは、次のすべてに当てはまるときだけ：
//   - アプリ全体の停止（COACH_REPLY_DISABLED）が入っていない
//   - その環境で、スイッチ（feature.coachPreviousQuestion）が ON
//   - その環境で、AIコーチの返信が動いている（getCoachActivation。スイッチ・商品モード・環境の設定）
//   - 本人の設計図が確認済みで、AIコーチを「受け取らない」にしていない
//   - 前回の返信が、届いた毎日の返信で、出してよい形（pickPreviousCoachQuestion）
//
// 新しく AI に送るものは無い（すでに本人に届いた返信の、最後の段落を、もう一度見せるだけ）。
// 読めなかったときは、出さない（失敗は、読み取りの側が記録する）。記入の画面と朝のメールは止めない。
//
// 入力画面の 1 人分は、開くたびに通るので、読み取りを並べて待ち時間を足さない（loadPreviousCoachQuestion）。
// 朝のメールの環境の全員分は、定時処理の中なので、環境を確かめてから読む（loadPreviousCoachQuestionsForTenant）。

import {
  COACH_PREVIOUS_QUESTION_MAX_AGE_DAYS,
  pickPreviousCoachQuestion,
  type CoachReply,
  type PreviousCoachQuestion,
} from "./coach-reply";

/** その環境で AIコーチの返信が動いているか（coach-reply-store.ts の CoachActivation のうち、ここで見る部分）。 */
export type PreviousQuestionActivation = { ok: true; active: boolean } | { ok: false };

type CommonDeps = {
  /** アプリ全体の停止（COACH_REPLY_DISABLED）。 */
  killSwitch: () => boolean;
  /** feature.coachPreviousQuestion が、その環境で ON か。 */
  isFlagOn: (tenantId: string) => Promise<boolean>;
  getActivation: (tenantId: string) => Promise<PreviousQuestionActivation>;
};

export type PreviousQuestionParticipantDeps = CommonDeps & {
  /** 本人の受け取りの設定。enabled: null = 設計図の行が無い。 */
  getOptIn: (
    participantId: string,
    tenantId: string
  ) => Promise<{ ok: true; enabled: boolean | null } | { ok: false }>;
  /** その日より前の、届いた毎日の返信のうち、いちばん新しいもの。 */
  getPreviousReply: (participantId: string, tenantId: string, beforeDate: string) => Promise<CoachReply | null>;
};

export type PreviousQuestionTenantDeps = CommonDeps & {
  /** その環境で「受け取らない」にしている参加者の ID。読めなかったときは null。 */
  getOptedOutIds: (tenantId: string) => Promise<Set<string> | null>;
  /** 参加者ごとの、いちばん新しい、届いた毎日の返信（sinceDate 以上・beforeDate 未満）。読めなかったときは null。 */
  getLatestReplies: (
    tenantId: string,
    sinceDate: string,
    beforeDate: string
  ) => Promise<Map<string, CoachReply> | null>;
};

/** YYYY-MM-DD の n 日前。形が違うときは ""。 */
export function daysBefore(date: string, n: number): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(t.getTime())) return "";
  t.setUTCDate(t.getUTCDate() - n);
  return t.toISOString().slice(0, 10);
}

/**
 * アプリ全体の停止と、その環境のスイッチ。
 * スイッチの値は、短い時間、サーバーが覚えているので、たいていはデータベースを読まずに決まる。
 */
async function switchAllows(deps: CommonDeps, tenantId: string): Promise<boolean> {
  if (tenantId === "") return false;
  if (deps.killSwitch()) return false;
  return deps.isFlagOn(tenantId);
}

/** その環境で、AIコーチの返信が動いているか（読めなかったときは、動いていない扱い）。 */
function isActive(activation: PreviousQuestionActivation): boolean {
  return activation.ok && activation.active;
}

/** その環境で、出してよいか（アプリ全体の停止・スイッチ・AIコーチの返信が動いているか）。 */
async function environmentAllows(deps: CommonDeps, tenantId: string): Promise<boolean> {
  if (!(await switchAllows(deps, tenantId))) return false;
  return isActive(await deps.getActivation(tenantId));
}

/**
 * 1 人分（入力画面）。出さないときは null。
 * profileUsable は、その人の設計図が確認済みで使える状態か（coaching-profile.ts の isUsableProfile）。
 * 例外は外に出さない（入力画面を止めない）。onError に、例外の文を渡す（呼び出し側が記録する）。
 *
 * スイッチまでを確かめたあとの 3 つ（AIコーチの返信が動いているか・受け取りの設定・前回の返信）は、
 * 並べて読む。順に読むと、入力画面を開くたびに、読み取り 3 回分の待ち時間が足される
 * （1 回に 0.3〜1 秒ほどかかる。2026-11-23 に、本番の実行の記録で確かめた値）。
 * 条件に 1 つでも合わなければ、読んだ返信は使わない（本人の、すでに届いた返信。サーバーの外には出ない）。
 */
export async function loadPreviousCoachQuestion(
  deps: PreviousQuestionParticipantDeps,
  args: { participantId: string; tenantId: string; today: string; profileUsable: boolean },
  onError: (detail: string) => void = () => {}
): Promise<PreviousCoachQuestion | null> {
  try {
    if (!args.profileUsable || args.participantId === "") return null;
    if (!(await switchAllows(deps, args.tenantId))) return null;
    const [activation, optIn, reply] = await Promise.all([
      deps.getActivation(args.tenantId),
      deps.getOptIn(args.participantId, args.tenantId),
      deps.getPreviousReply(args.participantId, args.tenantId, args.today),
    ]);
    if (!isActive(activation)) return null;
    if (!optIn.ok || optIn.enabled !== true) return null;
    return pickPreviousCoachQuestion({ reply, today: args.today });
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * 環境の全員分（朝のリマインドメール）。参加者の ID → 前回の問い。出す人がいないときは、空の Map。
 * 「受け取らない」にしている人の分は入れない。設計図が確認済みかどうかは、呼び出し側が見る
 * （朝のメールは、確認済みの人にだけ、その人の分を載せる）。
 * 例外は外に出さない（朝のメールを止めない）。
 */
export async function loadPreviousCoachQuestionsForTenant(
  deps: PreviousQuestionTenantDeps,
  args: { tenantId: string; today: string },
  onError: (detail: string) => void = () => {}
): Promise<Map<string, PreviousCoachQuestion>> {
  const result = new Map<string, PreviousCoachQuestion>();
  try {
    if (!(await environmentAllows(deps, args.tenantId))) return result;
    const since = daysBefore(args.today, COACH_PREVIOUS_QUESTION_MAX_AGE_DAYS);
    if (since === "") return result;
    const [optedOut, replies] = await Promise.all([
      deps.getOptedOutIds(args.tenantId),
      deps.getLatestReplies(args.tenantId, since, args.today),
    ]);
    // どちらかを読めなかったときは、だれの分も載せない（受け取らない人に、誤って載せないため）。
    if (optedOut === null || replies === null) return result;
    replies.forEach((reply, participantId) => {
      if (optedOut.has(participantId)) return;
      const question = pickPreviousCoachQuestion({ reply, today: args.today });
      if (question) result.set(participantId, question);
    });
    return result;
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err));
    return new Map<string, PreviousCoachQuestion>();
  }
}
