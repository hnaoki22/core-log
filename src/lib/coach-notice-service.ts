// 運営へのお知らせメールを送る流れ（サーバー側）。
//
// 読み取りと送信は、引数（deps）で受け取る。流れだけをここに置き、DB にも通信にも触れずに確かめられる
// ようにする（テスト: coach-notice-service.test.ts）。実際の読み取りと送信をつないだものは
// coach-notice-runtime.ts。決まりと文面は coach-notice.ts。
//
// 流れ
// 1. 環境の宛先の設定を読む。無い・形が正しくないときは、送らない（その旨を結果で返す）。
// 2. 設定された ID の人を 1 人ずつ引き、その環境の確認ページを読める人で、アドレスのある人だけを宛先にする。
//    同じアドレスの人が 2 人いるときは、1 通にまとめる。
// 3. 環境の名前と、確認を待っている件数を読み、メールを組み立てて送る。
//
// - ここからは例外を外に出さない（送れなかったことで、本人の記入の完了や、返信の保存を失敗にしない）。
// - 結果には、件数だけを入れる（アドレス・氏名・記入の文は入れない。呼び出し側は、結果をそのまま記録してよい）。

import {
  buildCoachNoticeEmail,
  buildCoachNoticeTestEmail,
  canActOnCoachBoard,
  canReceiveCoachNotice,
  type CoachNoticeConfig,
  type CoachNoticeCounts,
  type CoachNoticeKind,
  type CoachNoticeRecipientRow,
} from "./coach-notice";
import type { CoachNoticeState } from "./coach-reply";

type Read<T> = ({ ok: true } & T) | { ok: false };

export type CoachNoticeMailType = "coach_notice" | "coach_notice_test";

export type CoachNoticeDeps = {
  /** config: null = 設定が無い。invalid = 設定の行はあるが、形が正しくない（config は null）。 */
  getConfig: (tenantId: string) => Promise<Read<{ config: CoachNoticeConfig | null; invalid: boolean }>>;
  /** recipient: null = その ID の人がいない。 */
  getRecipient: (managerId: string) => Promise<Read<{ recipient: CoachNoticeRecipientRow | null }>>;
  /** null = 読めなかった。 */
  getTenantName: (tenantId: string) => Promise<string | null>;
  countPending: (tenantId: string) => Promise<Read<CoachNoticeCounts>>;
  /** 送れたら true。アドレスは、記録に残さない（残すのは、運営の人の ID と環境の ID）。 */
  send: (args: {
    to: string;
    subject: string;
    html: string;
    type: CoachNoticeMailType;
    managerId: string;
    tenantId: string;
  }) => Promise<boolean>;
};

type Recipient = { id: string; email: string; canAct: boolean };

type Resolved =
  | { state: "resolved"; recipients: Recipient[]; skipped: number }
  | { state: "not_configured" | "invalid_config" | "no_recipient" | "unknown" };

/** 設定を読み、宛先にしてよい人を決める。 */
async function resolveRecipients(deps: CoachNoticeDeps, tenantId: string): Promise<Resolved> {
  const configRead = await deps.getConfig(tenantId);
  if (!configRead.ok) return { state: "unknown" };
  if (configRead.config === null) return { state: configRead.invalid ? "invalid_config" : "not_configured" };

  const recipients: Recipient[] = [];
  const seenAddress = new Set<string>();
  let skipped = configRead.config.dropped;
  let readFailed = 0;

  for (const managerId of configRead.config.managerIds) {
    let read: Read<{ recipient: CoachNoticeRecipientRow | null }>;
    try {
      read = await deps.getRecipient(managerId);
    } catch {
      read = { ok: false };
    }
    if (!read.ok) {
      readFailed += 1;
      continue;
    }
    const row = read.recipient;
    const email = (row?.email ?? "").trim();
    if (!row || email === "" || !canReceiveCoachNotice(row, tenantId)) {
      skipped += 1;
      continue;
    }
    // 同じアドレスの行が 2 つ設定されているときは、1 通にまとめる（送れない人の数には入れない）。
    const key = email.toLowerCase();
    if (seenAddress.has(key)) continue;
    seenAddress.add(key);
    recipients.push({ id: row.id, email, canAct: canActOnCoachBoard(row) });
  }

  if (recipients.length === 0) {
    // 1 人も決まらなかった理由が、読み取りの失敗なら、「送れる人がいない」とは言わない。
    return { state: readFailed > 0 ? "unknown" : "no_recipient" };
  }
  return { state: "resolved", recipients, skipped: skipped + readFailed };
}

/** 確認ページに出す、その環境の宛先の設定の状態（件数だけ。アドレス・氏名は返さない）。 */
export type CoachNoticeStatus =
  | { state: "ready"; recipients: number; skipped: number }
  | { state: Exclude<CoachNoticeState, "ready"> };

export async function getCoachNoticeStatus(deps: CoachNoticeDeps, tenantId: string): Promise<CoachNoticeStatus> {
  try {
    const resolved = await resolveRecipients(deps, tenantId);
    if (resolved.state !== "resolved") return { state: resolved.state };
    return { state: "ready", recipients: resolved.recipients.length, skipped: resolved.skipped };
  } catch {
    return { state: "unknown" };
  }
}

/**
 * 送った結果。
 * - sent        = 1 通以上、送れた（failed は、送れなかった数。skipped は、宛先にしなかった人の数）
 * - send_failed = 宛先はあったが、1 通も送れなかった
 * - not_configured / invalid_config / no_recipient = 宛先が決まらず、送っていない
 * - unknown     = 設定を読めず、送っていない
 * - error       = 途中で例外が出た（detail に、例外の名前と文の先頭を入れる。読み取りと送信の失敗は、
 *                 それぞれの処理が記録して値で返すので、ここに来るのは、想定していない誤り）
 * - timeout     = 時間内に終わらなかった（送れたかどうかは分からない。呼び出し側が withTimeout で付ける）
 */
export type CoachNoticeSendResult =
  | { status: "sent"; sent: number; failed: number; skipped: number }
  | { status: "send_failed"; failed: number; skipped: number }
  | { status: "not_configured" | "invalid_config" | "no_recipient" | "unknown" | "timeout" }
  | { status: "error"; detail: string };

/** 例外の名前と文（先頭だけ）。記録に残して、原因をたどれるようにする。 */
function errorDetail(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.replace(/\s+/g, " ").slice(0, 200);
}

type BuildMail = (recipient: Recipient) => { subject: string; html: string };

/**
 * 宛先を決め、1 人ずつ送る。prepare は、宛先が 1 人以上決まったあとに 1 回だけ呼ぶ
 * （送る相手がいないときに、件数などを読みにいかない）。
 */
async function deliver(
  deps: CoachNoticeDeps,
  tenantId: string,
  type: CoachNoticeMailType,
  prepare: (ctx: { tenantName: string }) => Promise<BuildMail>
): Promise<CoachNoticeSendResult> {
  const resolved = await resolveRecipients(deps, tenantId);
  if (resolved.state !== "resolved") return { status: resolved.state };

  // 環境の名前を読めなかったときも、送る（メールには「読めませんでした」と出す。知らせを止めない）。
  let tenantName = "";
  try {
    tenantName = (await deps.getTenantName(tenantId)) ?? "";
  } catch {
    tenantName = "";
  }
  const build = await prepare({ tenantName });

  let sent = 0;
  let failed = 0;
  for (const recipient of resolved.recipients) {
    let ok = false;
    try {
      ok = await deps.send({ to: recipient.email, ...build(recipient), type, managerId: recipient.id, tenantId });
    } catch {
      ok = false;
    }
    if (ok) sent += 1;
    else failed += 1;
  }
  if (sent === 0) return { status: "send_failed", failed, skipped: resolved.skipped };
  return { status: "sent", sent, failed, skipped: resolved.skipped };
}

/** 確認を待っている件数。読めなかったとき、いま保存した 1 件と合わない値のときは null（メールに、その行を出さない）。 */
async function readCounts(deps: CoachNoticeDeps, tenantId: string, kind: CoachNoticeKind): Promise<CoachNoticeCounts | null> {
  try {
    const read = await deps.countPending(tenantId);
    if (!read.ok) return null;
    const { pending, needsAttention } = read;
    if (!Number.isInteger(pending) || !Number.isInteger(needsAttention)) return null;
    if (pending < 1 || needsAttention < 0 || needsAttention > pending) return null;
    if (kind === "needs_attention" && needsAttention < 1) return null;
    return { pending, needsAttention };
  } catch {
    return null;
  }
}

/**
 * 確認待ち・確認が必要の返信を新しく保存したときに、運営へ知らせる。例外は外に出さない。
 * 参加者の ID・氏名・記入の文は、引数に取らない。
 */
export async function sendCoachNotice(
  deps: CoachNoticeDeps,
  args: { tenantId: string; replyDate: string; kind: CoachNoticeKind }
): Promise<CoachNoticeSendResult> {
  try {
    return await deliver(deps, args.tenantId, "coach_notice", async ({ tenantName }) => {
      const counts = await readCounts(deps, args.tenantId, args.kind);
      return (recipient) =>
        buildCoachNoticeEmail({
          kind: args.kind,
          tenantName,
          replyDate: args.replyDate,
          counts,
          canAct: recipient.canAct,
        });
    });
  } catch (err) {
    return { status: "error", detail: errorDetail(err) };
  }
}

/** 試し送り（確認ページの「試しに送る」）。設定された宛先に、届くことを確かめるメールを送る。 */
export async function sendCoachNoticeTest(
  deps: CoachNoticeDeps,
  args: { tenantId: string }
): Promise<CoachNoticeSendResult> {
  try {
    return await deliver(deps, args.tenantId, "coach_notice_test", async ({ tenantName }) => {
      const mail = buildCoachNoticeTestEmail({ tenantName });
      return () => mail;
    });
  } catch (err) {
    return { status: "error", detail: errorDetail(err) };
  }
}

/**
 * 結果を、どの重さで記録するか。
 * 全員に送れた＝info。送れたが、設定に送れない人が混ざっている＝warn。宛先が決まらない＝warn。
 * 読めない・送れない・一部に送れない＝error。
 */
export function noticeLogLevel(result: CoachNoticeSendResult): "info" | "warn" | "error" {
  if (result.status === "sent") {
    if (result.failed > 0) return "error";
    return result.skipped > 0 ? "warn" : "info";
  }
  if (result.status === "not_configured" || result.status === "invalid_config" || result.status === "no_recipient") {
    return "warn";
  }
  return "error";
}

/**
 * 時間を区切って待つ。時間内に終わらなかったら { timedOut: true }（元の処理は止めない。結果は使わない）。
 * お知らせの送信で、本人への応答を長く待たせないために使う。
 */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number
): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), ms);
  });
  try {
    return await Promise.race([work.then((value) => ({ timedOut: false as const, value })), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
