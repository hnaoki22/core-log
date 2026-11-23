import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 本人の API（POST /api/coach-reply）が、運営へのお知らせを、いつ・何を渡して送るかを確かめる。
// 返信を作る流れ・データベース・メール・スイッチは、すべて差し替える（合成データ）。

const mocks = vi.hoisted(() => ({
  ensureCoachReply: vi.fn(),
  sendCoachNotice: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  noticeDeps: { marker: "notice-deps" },
}));

vi.mock("@/lib/participant-db", () => ({
  getParticipantByToken: vi.fn(async (token: string) =>
    token === "tok-me" ? { id: "p-me", tenantId: "tenant-a", name: "参加 一郎" } : null
  ),
}));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/standalone", () => ({ isStandaloneTenant: vi.fn(async () => false) }));
vi.mock("@/lib/supabase", () => ({ getMissionsByParticipantId: vi.fn(async () => []) }));
vi.mock("@/lib/coaching-profile-store", () => ({ getCoachingProfile: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(() => ({ success: true, remaining: 5 })) }));
vi.mock("@/lib/coach-reply-llm", () => ({ callCoachModel: vi.fn(), isCoachKillSwitchOn: vi.fn(() => false) }));
vi.mock("@/lib/coach-reply-store", () => ({
  getCoachActivation: vi.fn(),
  getCoachConfig: vi.fn(),
  getCoachOptIn: vi.fn(),
  getCoachReply: vi.fn(),
  getCoachSystemPrompt: vi.fn(),
  getDayLogsForCoach: vi.fn(),
  getPreviousDeliveredReply: vi.fn(),
  insertCoachReply: vi.fn(),
  listCoachRepliesForParticipant: vi.fn(),
  setCoachOptIn: vi.fn(),
}));
vi.mock("@/lib/coach-reply-service", () => ({ ensureCoachReply: mocks.ensureCoachReply }));
// 時間の区切り（withTimeout）と、記録の重さ（noticeLogLevel）は本物を使う。送る処理だけを差し替える。
vi.mock("@/lib/coach-notice-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/coach-notice-service")>();
  return { ...actual, sendCoachNotice: mocks.sendCoachNotice };
});
// 待つ時間の上限は、テストでは短くする。
vi.mock("@/lib/coach-notice-runtime", () => ({ coachNoticeDeps: mocks.noticeDeps, COACH_NOTICE_TIMEOUT_MS: 40 }));

import { POST } from "./route";

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/coach-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

const DATE = "2026-01-06";
const HOLD = {
  kind: "view" as const,
  view: { state: "pending" as const, replyDate: DATE },
  generated: true,
  notice: { kind: "needs_attention" as const, replyDate: DATE },
};

function noticeLogs() {
  return (["info", "warn", "error"] as const).flatMap((level) =>
    mocks.logger[level].mock.calls
      .filter((c) => typeof c[0] === "string" && c[0].startsWith("coach notice"))
      .map((c) => ({ level, message: c[0] as string, meta: c[1] as Record<string, unknown> }))
  );
}

beforeEach(() => {
  mocks.ensureCoachReply.mockReset();
  mocks.sendCoachNotice.mockReset();
  mocks.sendCoachNotice.mockResolvedValue({ status: "sent", sent: 1, failed: 0, skipped: 0 });
  for (const fn of Object.values(mocks.logger)) fn.mockReset();
});

describe("POST /api/coach-reply：運営へのお知らせ", () => {
  it("確認が必要の返信を新しく保存したときに、1 回だけ知らせる。渡すのは、環境・記入の日・種類だけ", async () => {
    mocks.ensureCoachReply.mockResolvedValue(HOLD);
    const res = await post({ token: "tok-me" });
    expect(res.status).toBe(200);
    expect(mocks.sendCoachNotice).toHaveBeenCalledTimes(1);
    const [deps, args] = mocks.sendCoachNotice.mock.calls[0];
    expect(deps).toBe(mocks.noticeDeps);
    // 環境は、トークンから引いた値。参加者の ID・氏名・記入の文は渡さない。
    expect(args).toEqual({ tenantId: "tenant-a", replyDate: DATE, kind: "needs_attention" });
  });

  it("確認待ち（運営が確認してから届ける環境）の返信でも、知らせる", async () => {
    mocks.ensureCoachReply.mockResolvedValue({ ...HOLD, notice: { kind: "pending", replyDate: DATE } });
    await post({ token: "tok-me" });
    expect(mocks.sendCoachNotice.mock.calls[0][1]).toEqual({ tenantId: "tenant-a", replyDate: DATE, kind: "pending" });
  });

  it("本文に別の環境の ID を入れても、知らせる先の環境には使わない", async () => {
    mocks.ensureCoachReply.mockResolvedValue(HOLD);
    await post({ token: "tok-me", tenantId: "tenant-b", notice: { kind: "pending", replyDate: "2020-01-01" } });
    expect(mocks.sendCoachNotice.mock.calls[0][1]).toEqual({ tenantId: "tenant-a", replyDate: DATE, kind: "needs_attention" });
  });

  it("届いた返信・すでにあった返信・確かめるだけの呼び出し・失敗では、知らせない", async () => {
    for (const result of [
      { kind: "view", view: { state: "delivered", replyDate: DATE, content: "見本の問いです。" }, generated: true },
      { kind: "view", view: { state: "pending", replyDate: DATE }, generated: false },
      { kind: "view", view: { state: "none" }, generated: false, willGenerate: true },
      { kind: "view", view: { state: "none" }, generated: false, reason: "opted_out" },
      { kind: "error", error: "ai_failed", detail: "timeout" },
      { kind: "error", error: "save_failed" },
    ]) {
      mocks.ensureCoachReply.mockResolvedValue(result);
      await post({ token: "tok-me" });
    }
    expect(mocks.sendCoachNotice).not.toHaveBeenCalled();
  });

  it("知らせた結果は、件数だけを記録する（参加者の ID・アドレスは残さない）", async () => {
    mocks.ensureCoachReply.mockResolvedValue(HOLD);
    await post({ token: "tok-me" });
    const logs = noticeLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("info");
    expect(logs[0].meta).toEqual({
      tenantId: "tenant-a",
      kind: "needs_attention",
      replyDate: DATE,
      status: "sent",
      sent: 1,
      failed: 0,
      skipped: 0,
    });
    expect(JSON.stringify(logs[0].meta)).not.toContain("p-me");
    expect(JSON.stringify(logs[0].meta)).not.toContain("@");
  });
});

describe("POST /api/coach-reply：知らせられなかったときも、本人への応答は変えない", () => {
  async function bodyOf(res: Response) {
    return { status: res.status, body: await res.json() };
  }

  it("宛先の設定が無いときは、警告として記録する。応答は、送れたときと同じ", async () => {
    mocks.ensureCoachReply.mockResolvedValue(HOLD);
    const sent = await bodyOf(await post({ token: "tok-me" }));

    for (const fn of Object.values(mocks.logger)) fn.mockReset();
    mocks.sendCoachNotice.mockResolvedValue({ status: "not_configured" });
    const notConfigured = await bodyOf(await post({ token: "tok-me" }));

    expect(notConfigured).toEqual(sent);
    expect(notConfigured.status).toBe(200);
    expect(notConfigured.body.view).toEqual({ state: "pending", replyDate: DATE });
    expect(noticeLogs()).toEqual([
      { level: "warn", message: "coach notice", meta: { tenantId: "tenant-a", kind: "needs_attention", replyDate: DATE, status: "not_configured" } },
    ]);
  });

  it("送れなかったときは、エラーとして記録する。応答は変えない", async () => {
    mocks.ensureCoachReply.mockResolvedValue(HOLD);
    mocks.sendCoachNotice.mockResolvedValue({ status: "send_failed", failed: 1, skipped: 0 });
    const res = await post({ token: "tok-me" });
    expect(res.status).toBe(200);
    expect(noticeLogs()[0]).toMatchObject({ level: "error", meta: { status: "send_failed", failed: 1 } });
  });

  it("知らせる処理が例外を出しても、応答は変えない", async () => {
    mocks.ensureCoachReply.mockResolvedValue(HOLD);
    mocks.sendCoachNotice.mockRejectedValue(new Error("boom"));
    const res = await post({ token: "tok-me" });
    expect(res.status).toBe(200);
    expect((await res.json()).view).toEqual({ state: "pending", replyDate: DATE });
    expect(noticeLogs()).toEqual([
      { level: "error", message: "coach notice error", meta: { tenantId: "tenant-a", error: "boom" } },
    ]);
  });

  it("知らせる処理が時間内に終わらないときは、待つのをやめて、応答を返す", async () => {
    mocks.ensureCoachReply.mockResolvedValue(HOLD);
    mocks.sendCoachNotice.mockReturnValue(new Promise(() => {}));
    const res = await post({ token: "tok-me" });
    expect(res.status).toBe(200);
    expect(noticeLogs()[0]).toMatchObject({ level: "error", message: "coach notice", meta: { status: "timeout" } });
  });
});
