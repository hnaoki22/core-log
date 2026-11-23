import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// 運営の API（/api/admin/coach-replies）の、お知らせメールまわりを確かめる：
// - GET は、管理者にだけ、宛先の設定の状態（件数だけ）を返す。
// - 試し送り（POST action: "test_notice"）は、管理者だけ。環境を 1 つ指定する。
// データベース・メール・スイッチは、すべて差し替える（合成データ）。

const mocks = vi.hoisted(() => ({
  getCoachNoticeStatus: vi.fn(),
  sendCoachNoticeTest: vi.fn(),
  standaloneGuard: vi.fn(),
  rateLimit: vi.fn(),
  isFeatureEnabled: vi.fn(),
  getCoachConfig: vi.fn(),
  loadCoachBoard: vi.fn(),
  getCoachReplyTenant: vi.fn(),
  setCoachReplyStatus: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  noticeDeps: { marker: "notice-deps" },
}));

const MANAGERS: Record<string, { id: string; isAdmin: boolean; role: string; tenantId: string }> = {
  "tok-admin": { id: "m-admin", isAdmin: true, role: "admin", tenantId: "tenant-home" },
  "tok-viewer": { id: "m-viewer", isAdmin: false, role: "observer", tenantId: "tenant-a" },
  "tok-boss": { id: "m-boss", isAdmin: false, role: "manager", tenantId: "tenant-a" },
};
const TENANTS: Record<string, { id: string; name: string; slug: string }> = {
  "env-a": { id: "tenant-a", name: "見本の環境", slug: "env-a" },
};

vi.mock("@/lib/participant-db", () => ({
  getManagerByToken: vi.fn(async (token: string) => MANAGERS[token] ?? null),
}));
vi.mock("@/lib/supabase", () => ({
  getTenantBySlug: vi.fn(async (slug: string) => TENANTS[slug] ?? null),
  getTenantById: vi.fn(async (id: string) => Object.values(TENANTS).find((t) => t.id === id) ?? null),
}));
vi.mock("@/lib/tenant-context", () => ({
  resolveManagerTenantStrict: (m: { tenantId?: string }) => ({ ok: true, tenantId: m.tenantId, source: "manager.tenantId" }),
}));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock("@/lib/standalone", () => ({ standaloneGuard: mocks.standaloneGuard }));
vi.mock("@/lib/logger", () => ({ logger: mocks.logger }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/coach-reply-llm", () => ({ isCoachKillSwitchOn: vi.fn(() => false) }));
vi.mock("@/lib/coach-reply-store", () => ({
  getCoachConfig: mocks.getCoachConfig,
  loadCoachBoard: mocks.loadCoachBoard,
  getCoachReplyTenant: mocks.getCoachReplyTenant,
  setCoachReplyStatus: mocks.setCoachReplyStatus,
}));
vi.mock("@/lib/coach-notice-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/coach-notice-service")>();
  return { ...actual, getCoachNoticeStatus: mocks.getCoachNoticeStatus, sendCoachNoticeTest: mocks.sendCoachNoticeTest };
});
vi.mock("@/lib/coach-notice-runtime", () => ({ coachNoticeDeps: mocks.noticeDeps, COACH_NOTICE_TEST_TIMEOUT_MS: 40 }));

import { GET, POST } from "./route";

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/admin/coach-replies?${query}`));
}
function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/admin/coach-replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  for (const fn of [
    mocks.getCoachNoticeStatus,
    mocks.sendCoachNoticeTest,
    mocks.standaloneGuard,
    mocks.rateLimit,
    mocks.isFeatureEnabled,
    mocks.getCoachConfig,
    mocks.loadCoachBoard,
    mocks.getCoachReplyTenant,
    mocks.setCoachReplyStatus,
    ...Object.values(mocks.logger),
  ]) {
    fn.mockReset();
  }
  mocks.standaloneGuard.mockResolvedValue(null);
  mocks.rateLimit.mockReturnValue({ success: true, remaining: 2 });
  mocks.isFeatureEnabled.mockResolvedValue(true);
  mocks.getCoachConfig.mockResolvedValue({ ok: true, config: { deliveryMode: "auto", startDate: null } });
  mocks.loadCoachBoard.mockResolvedValue([]);
  mocks.getCoachNoticeStatus.mockResolvedValue({ state: "ready", recipients: 1, skipped: 0 });
  mocks.sendCoachNoticeTest.mockResolvedValue({ status: "sent", sent: 1, failed: 0, skipped: 0 });
});

describe("GET /api/admin/coach-replies：お知らせメールの宛先の設定の状態", () => {
  it("管理者には、その環境の状態（件数だけ）を返す", async () => {
    const res = await get("token=tok-admin&tenant=env-a");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notice).toEqual({ state: "ready", recipients: 1, skipped: 0 });
    expect(mocks.getCoachNoticeStatus).toHaveBeenCalledWith(mocks.noticeDeps, "tenant-a");
  });

  it("閲覧者には返さない（読みにもいかない）", async () => {
    const res = await get("token=tok-viewer");
    expect(res.status).toBe(200);
    expect((await res.json()).notice).toBeNull();
    expect(mocks.getCoachNoticeStatus).not.toHaveBeenCalled();
  });

  it("スイッチが OFF の環境・環境の設定がまだ無い環境でも、管理者には返す（動かす前に確かめられるように）", async () => {
    mocks.getCoachNoticeStatus.mockResolvedValue({ state: "not_configured" });
    mocks.isFeatureEnabled.mockResolvedValue(false);
    const off = await (await get("token=tok-admin&tenant=env-a")).json();
    expect(off).toMatchObject({ enabled: false, rows: [], notice: { state: "not_configured" } });

    mocks.isFeatureEnabled.mockResolvedValue(true);
    mocks.getCoachConfig.mockResolvedValue({ ok: true, config: null });
    const unset = await (await get("token=tok-admin&tenant=env-a")).json();
    expect(unset).toMatchObject({ enabled: true, configured: false, rows: [], notice: { state: "not_configured" } });
  });

  it("商品モードの環境では、状態も読まない", async () => {
    mocks.standaloneGuard.mockResolvedValue(NextResponse.json({ standaloneBlocked: true }, { status: 403 }));
    const res = await get("token=tok-admin&tenant=env-a");
    expect(res.status).toBe(403);
    expect(mocks.getCoachNoticeStatus).not.toHaveBeenCalled();
  });

  it("上司の画面のトークン・知らないトークンでは、何も読まない", async () => {
    expect((await get("token=tok-boss")).status).toBe(403);
    expect((await get("token=tok-unknown")).status).toBe(403);
    expect(mocks.getCoachNoticeStatus).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/coach-replies（action: test_notice）：試し送り", () => {
  const TEST = { token: "tok-admin", action: "test_notice", tenant: "env-a" };

  it("管理者が、環境を 1 つ指定して送る。送る先は、その環境の設定で決まる", async () => {
    const res = await post(TEST);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, sent: 1, failed: 0 });
    expect(mocks.sendCoachNoticeTest).toHaveBeenCalledTimes(1);
    expect(mocks.sendCoachNoticeTest).toHaveBeenCalledWith(mocks.noticeDeps, { tenantId: "tenant-a" });
  });

  it("本文で宛先を指定しても、使わない", async () => {
    await post({ ...TEST, to: "someone@example.test", managerIds: ["x"], email: "someone@example.test" });
    expect(mocks.sendCoachNoticeTest).toHaveBeenCalledWith(mocks.noticeDeps, { tenantId: "tenant-a" });
  });

  it("閲覧者・上司の画面のトークン・知らないトークンでは、送らない", async () => {
    for (const token of ["tok-viewer", "tok-boss", "tok-unknown", ""]) {
      expect((await post({ ...TEST, token })).status).toBe(403);
    }
    expect(mocks.sendCoachNoticeTest).not.toHaveBeenCalled();
  });

  it("環境の指定が無い・知らない環境では、送らない", async () => {
    expect((await post({ token: "tok-admin", action: "test_notice" })).status).toBe(400);
    expect((await post({ ...TEST, tenant: "env-unknown" })).status).toBe(404);
    expect(mocks.sendCoachNoticeTest).not.toHaveBeenCalled();
  });

  it("商品モードの環境では、送らない", async () => {
    mocks.standaloneGuard.mockResolvedValue(NextResponse.json({ standaloneBlocked: true }, { status: 403 }));
    expect((await post(TEST)).status).toBe(403);
    expect(mocks.sendCoachNoticeTest).not.toHaveBeenCalled();
  });

  it("続けて送れる回数を超えたら、送らない（管理者ごとに数える）", async () => {
    mocks.rateLimit.mockReturnValue({ success: false, remaining: 0 });
    const res = await post(TEST);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ ok: false, reason: "too_many" });
    expect(mocks.rateLimit.mock.calls[0][0]).toBe("coach-notice-test:m-admin");
    expect(mocks.sendCoachNoticeTest).not.toHaveBeenCalled();
  });

  it("宛先が決まらないときは 409、送れなかったときは 502 で、理由を返す", async () => {
    for (const status of ["not_configured", "invalid_config", "no_recipient"] as const) {
      mocks.sendCoachNoticeTest.mockResolvedValue({ status });
      const res = await post(TEST);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ ok: false, reason: status });
    }
    for (const outcome of [{ status: "send_failed", failed: 1, skipped: 0 }, { status: "unknown" }, { status: "error", detail: "Error: boom" }] as const) {
      mocks.sendCoachNoticeTest.mockResolvedValue(outcome);
      const res = await post(TEST);
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ ok: false, reason: outcome.status });
    }
  });

  it("時間内に終わらないときは、待つのをやめて、送れなかったと返す", async () => {
    mocks.sendCoachNoticeTest.mockReturnValue(new Promise(() => {}));
    const res = await post(TEST);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, reason: "timeout" });
  });

  it("記録に残すのは、環境・押した管理者の ID・件数（アドレスは残さない）", async () => {
    await post(TEST);
    expect(mocks.logger.info).toHaveBeenCalledWith("coach notice test", {
      tenantId: "tenant-a",
      managerId: "m-admin",
      status: "sent",
      sent: 1,
      failed: 0,
      skipped: 0,
    });
  });
});

describe("POST /api/admin/coach-replies：これまでの操作（届ける・取り下げる）は変わらない", () => {
  it("返信の ID が無い・操作の名前が違うときは、これまでどおり 400", async () => {
    expect((await post({ token: "tok-admin", action: "deliver" })).status).toBe(400);
    expect((await post({ token: "tok-admin", replyId: "0f8fad5b-d9cb-469f-a165-70867728950e", action: "test" })).status).toBe(400);
    expect(mocks.sendCoachNoticeTest).not.toHaveBeenCalled();
  });

  it("届ける操作は、これまでどおり、対象の行の環境で更新する", async () => {
    mocks.getCoachReplyTenant.mockResolvedValue({ ok: true, tenantId: "tenant-a", status: "pending_review", hasContent: true });
    mocks.setCoachReplyStatus.mockResolvedValue("ok");
    const res = await post({ token: "tok-admin", replyId: "0f8fad5b-d9cb-469f-a165-70867728950e", action: "deliver" });
    expect(res.status).toBe(200);
    expect(mocks.setCoachReplyStatus).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-a", expectedStatus: "pending_review", status: "delivered", reviewedBy: "m-admin" })
    );
    expect(mocks.sendCoachNoticeTest).not.toHaveBeenCalled();
  });
});
