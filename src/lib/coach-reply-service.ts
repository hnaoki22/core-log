// 「AIコーチの返信」を、要るときに 1 回だけ作る流れ（サーバー側）。
//
// 読み書きと AI の呼び出しは、引数（deps）で受け取る。流れだけをここに置き、
// DB にも通信にも触れずに確かめられるようにする（テスト: coach-reply-service.test.ts）。
// 実際の読み書きをつないだものは、API（/api/coach-reply）が渡す。
//
// 流れ
// 1. 止める設定・スイッチ・商品モード・環境の設定（届け方と開始日）を見る。設定が無い環境では作らない。
// 2. 本人の設計図、受け取りの入・切、今日と前日の記入を読む（読めなかったら、作らずに失敗を返す）。
// 3. 今日の記入（夕方の文がある）→ 無ければ前日の記入、の順に対象を決める。
// 4. その日の返信がすでにあれば、それを返す（AI を呼ばない）。
// 5. 無ければ作る。強い不調などの語があれば、AI を呼ばずに運営の確認待ちにする。
//    AI が「作らない」と返したとき・応答を断ったときも、運営の確認待ちにする。
// 6. 保存する。ほぼ同時の 2 回目で一意制約に当たったら、先に保存されたほうを返す。

import type { CoachingProfile } from "./coaching-profile";
import {
  decideCoachEligibility,
  previousDate,
  toParticipantView,
  type CoachConfig,
  type CoachDayLog,
  type CoachIneligibleReason,
  type CoachReply,
  type CoachReplyStatus,
  type CoachReplyView,
} from "./coach-reply";
import {
  buildCoachUserPrompt,
  coachInputsUsed,
  hasCrisisPhrase,
  interpretCoachOutput,
  statusForNewReply,
  type CoachIssue,
  type CoachOutcome,
} from "./coach-reply-prompt";

type Read<T> = ({ ok: true } & T) | { ok: false };

export type CoachDeps = {
  killSwitch: () => boolean;
  /** feature.coachReply と feature.coachingProfile の両方が ON か。 */
  flagsOn: (tenantId: string) => Promise<boolean>;
  isStandalone: (tenantId: string) => Promise<boolean>;
  getProfile: (participantId: string, tenantId: string) => Promise<Read<{ profile: CoachingProfile | null }>>;
  getOptIn: (participantId: string, tenantId: string) => Promise<Read<{ enabled: boolean | null }>>;
  getDayLogs: (
    participantId: string,
    tenantId: string,
    dates: readonly string[]
  ) => Promise<Read<{ logs: CoachDayLog[] }>>;
  getReply: (participantId: string, tenantId: string, replyDate: string) => Promise<Read<{ reply: CoachReply | null }>>;
  /** config: null = 環境の設定（届け方と開始日）が、まだ無い。 */
  getConfig: (tenantId: string) => Promise<Read<{ config: CoachConfig | null }>>;
  /** null = 読めなかった。 */
  getSystemPrompt: (tenantId: string) => Promise<string | null>;
  getIssue: (participantId: string, tenantId: string) => Promise<CoachIssue | null>;
  getPreviousQuestion: (participantId: string, tenantId: string, beforeDate: string) => Promise<string | null>;
  callModel: (args: {
    systemPrompt: string;
    userPrompt: string;
    participantId: string;
  }) => Promise<{ ok: true; text: string; model: string } | { ok: false; reason: string; model: string }>;
  insertReply: (args: {
    tenantId: string;
    participantId: string;
    logId: string;
    replyDate: string;
    kind: "daily";
    content: string;
    status: CoachReplyStatus;
    model: string | null;
    inputsUsed: readonly string[];
  }) => Promise<{ ok: true; reply: CoachReply } | { ok: false; reason: "conflict" | "error" }>;
};

export type EnsureCoachReplyResult =
  | {
      kind: "view";
      view: CoachReplyView;
      /** 今回の呼び出しで、新しく作ったか。 */
      generated: boolean;
      /** 返さなかった理由（view が none のとき）。 */
      reason?: CoachIneligibleReason;
      /**
       * 確かめるだけの呼び出し（checkOnly）で、このあと作ることになるか。
       * true のときだけ、画面は「AIコーチが読んでいます」と出して、作る呼び出しをする。
       */
      willGenerate?: boolean;
    }
  | { kind: "error"; error: "read_failed" | "ai_failed" | "save_failed"; detail?: string };

function none(reason: CoachIneligibleReason): EnsureCoachReplyResult {
  return { kind: "view", view: { state: "none" }, generated: false, reason };
}

/**
 * checkOnly: true = 確かめるだけ（作らない。AI を呼ばない。保存しない）。返してよい記入があり、返信がまだ無いときは
 * willGenerate: true を返す。画面が、返してよい人にだけ「AIコーチが読んでいます」と出すために使う
 * （受け取らない設定の人や、設計図が確認前の人の画面に、読んでいるかのような表示を出さない）。
 */
export async function ensureCoachReply(
  deps: CoachDeps,
  args: { participantId: string; tenantId: string; today: string; checkOnly?: boolean }
): Promise<EnsureCoachReplyResult> {
  const { participantId, tenantId, today } = args;
  const yesterday = previousDate(today);

  if (deps.killSwitch()) return none("kill_switch");
  if (!(await deps.flagsOn(tenantId))) return none("flag_off");
  if (await deps.isStandalone(tenantId)) return none("standalone");

  // 環境の設定（届け方と開始日）が無い環境では、作らない。本人の記入を読む前に確かめる
  // （スイッチを入れただけの環境で、記入を読みにいかない・AI に送らない）。
  const configRead = await deps.getConfig(tenantId);
  if (!configRead.ok) return { kind: "error", error: "read_failed" };
  if (configRead.config === null) return none("not_configured");
  const config = configRead.config;

  const [profileRead, optInRead, logsRead] = await Promise.all([
    deps.getProfile(participantId, tenantId),
    deps.getOptIn(participantId, tenantId),
    deps.getDayLogs(participantId, tenantId, [today, yesterday]),
  ]);
  if (!profileRead.ok || !optInRead.ok || !logsRead.ok) return { kind: "error", error: "read_failed" };

  const profile = profileRead.profile;
  const coachEnabled = optInRead.enabled !== false;

  // 今日の記入を先に見る。今日の夕方の文がまだ無いときだけ、前日の記入を見る。
  const candidates = [today, yesterday]
    .map((date) => logsRead.logs.find((l) => l.date === date) ?? null)
    .filter((l, i) => l !== null || i === 0);

  let firstReason: CoachIneligibleReason | null = null;
  for (const log of candidates) {
    const eligibility = decideCoachEligibility({
      killSwitch: false,
      flagsOn: true,
      standalone: false,
      profile,
      coachEnabled,
      log,
      today,
      yesterday,
      startDate: config.startDate,
    });
    if (!eligibility.ok) {
      if (firstReason === null) firstReason = eligibility.reason;
      // 夕方の文が無い日だけ、次の候補（前日）を見る。それ以外の理由（設計図が確認前、受け取らない設定、
      // 観の期の記入、開始日より前）のときは、前日にさかのぼらずに、そこで返す。
      if (eligibility.reason === "no_evening_entry") continue;
      return none(firstReason);
    }
    if (!log || !profile) continue; // 型のため（eligibility.ok なら、どちらも有る）

    const replyRead = await deps.getReply(participantId, tenantId, log.date);
    if (!replyRead.ok) return { kind: "error", error: "read_failed" };
    if (replyRead.reply) {
      return { kind: "view", view: toParticipantView(replyRead.reply), generated: false };
    }
    if (args.checkOnly) {
      return { kind: "view", view: { state: "none" }, generated: false, willGenerate: true };
    }
    return generate(deps, { participantId, tenantId, log, profile, config });
  }
  return none(firstReason ?? "no_evening_entry");
}

async function generate(
  deps: CoachDeps,
  args: { participantId: string; tenantId: string; log: CoachDayLog; profile: CoachingProfile; config: CoachConfig }
): Promise<EnsureCoachReplyResult> {
  const { participantId, tenantId, log, profile, config } = args;

  let outcome: CoachOutcome;
  let model: string | null = null;
  let inputsUsed: string[] = [];

  if (hasCrisisPhrase(`${log.morningIntent}\n${log.eveningInsight}`)) {
    // AI には送らない。運営の確認待ちにする。
    outcome = { kind: "hold" };
  } else {
    const systemPrompt = await deps.getSystemPrompt(tenantId);
    if (systemPrompt === null) return { kind: "error", error: "read_failed" };
    const [issue, previousQuestion] = await Promise.all([
      deps.getIssue(participantId, tenantId),
      deps.getPreviousQuestion(participantId, tenantId, log.date),
    ]);
    const input = { log, profile, issue, previousQuestion };
    const llm = await deps.callModel({ systemPrompt, userPrompt: buildCoachUserPrompt(input), participantId });
    if (llm.ok) {
      outcome = interpretCoachOutput(llm.text);
      if (outcome.kind === "invalid") return { kind: "error", error: "ai_failed", detail: outcome.reason };
    } else if (llm.reason === "refusal") {
      // AI が応答を断った記入。返信を作らず、運営の確認待ちにする
      // （失敗として返すと、本人が開き直すたびに、同じ記入で AI を呼び直すことになる）。
      outcome = { kind: "hold" };
    } else {
      return { kind: "error", error: "ai_failed", detail: llm.reason };
    }
    model = llm.model;
    inputsUsed = coachInputsUsed(input);
  }

  const status = statusForNewReply(outcome, config);
  if (status === null) return { kind: "error", error: "ai_failed" };

  const saved = await deps.insertReply({
    tenantId,
    participantId,
    logId: log.id,
    replyDate: log.date,
    kind: "daily",
    content: outcome.kind === "reply" ? outcome.text : "",
    status,
    model,
    inputsUsed,
  });
  if (saved.ok) return { kind: "view", view: toParticipantView(saved.reply), generated: true };
  if (saved.reason === "conflict") {
    // ほぼ同時の 2 回目。先に保存されたほうを返す。
    const again = await deps.getReply(participantId, tenantId, log.date);
    if (again.ok && again.reply) return { kind: "view", view: toParticipantView(again.reply), generated: false };
  }
  return { kind: "error", error: "save_failed" };
}
