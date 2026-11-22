import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 夕方の記入（POST /api/entry の type: "evening"）が、行の持ち主を、トークンから引いた値で渡していることを
// 確かめる。データベースの読み書き・メール・スイッチは、すべて差し替える（合成データ）。

const mocks = vi.hoisted(() => ({
  updateEveningEntry: vi.fn(),
  sendNotificationEmail: vi.fn(),
  isFeatureEnabled: vi.fn(),
}));

const PARTICIPANTS: Record<string, { id: string; tenantId: string; name: string; managerId: string }> = {
  "tok-me": { id: "p-me", tenantId: "tenant-a", name: "参加 一郎", managerId: "m-1" },
  "tok-no-manager": { id: "p-solo", tenantId: "tenant-a", name: "参加 二郎", managerId: "" },
};

vi.mock("@/lib/supabase", () => ({
  createMorningEntry: vi.fn(),
  createEveningOnlyEntry: vi.fn(),
  updateEveningEntry: mocks.updateEveningEntry,
  hasLoggedToday: vi.fn(async () => ({ hasMorning: true, hasEvening: false })),
  getLogsByParticipant: vi.fn(async () => []),
  insertSkipReason: vi.fn(),
}));
vi.mock("@/lib/participant-db", () => ({
  getParticipantByToken: vi.fn(async (token: string) => PARTICIPANTS[token] ?? null),
  getManagerById: vi.fn(async (id: string) =>
    id === "m-1" ? { id: "m-1", name: "上司 次郎", email: "manager@mail.invalid", token: "tok-manager" } : null
  ),
}));
vi.mock("@/lib/email", () => ({ sendNotificationEmail: mocks.sendNotificationEmail }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock("@/lib/kan-no-ki", () => ({
  resolvePhaseMode: vi.fn(async () => "dojo-1"),
  triggerBodyPromptIfNeeded: vi.fn(),
}));
vi.mock("@/lib/standalone", () => ({ computeSkipFollowup: vi.fn(() => null) }));
vi.mock("@/lib/entry-question-env", () => ({ resolveEntryQuestionEnv: vi.fn(async () => false) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { POST } from "./route";

function post(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

const EVENING = { type: "evening", token: "tok-me", pageId: "row-1", eveningInsight: "合成データの振り返り", energy: "good" };

beforeEach(() => {
  mocks.updateEveningEntry.mockReset();
  mocks.updateEveningEntry.mockResolvedValue(true);
  mocks.sendNotificationEmail.mockReset();
  mocks.isFeatureEnabled.mockReset();
  mocks.isFeatureEnabled.mockResolvedValue(false);
});

describe("POST /api/entry（夕方の記入）：行の持ち主", () => {
  it("持ち主は、トークンから引いたテナントと参加者を渡す", async () => {
    const res = await post(EVENING);
    expect(res.status).toBe(200);
    expect(mocks.updateEveningEntry).toHaveBeenCalledTimes(1);
    const [owner, pageId, insight, energy] = mocks.updateEveningEntry.mock.calls[0];
    expect(owner).toEqual({ tenantId: "tenant-a", participantId: "p-me" });
    expect(pageId).toBe("row-1");
    expect(insight).toBe("合成データの振り返り");
    expect(energy).toBe("good");
  });

  it("本文に別のテナント・参加者の ID を入れても、持ち主には使わない", async () => {
    await post({ ...EVENING, tenantId: "tenant-b", participantId: "p-colleague", owner: { tenantId: "tenant-b", participantId: "p-colleague" } });
    const [owner] = mocks.updateEveningEntry.mock.calls[0];
    expect(owner).toEqual({ tenantId: "tenant-a", participantId: "p-me" });
  });

  it("更新できなかったとき（行が無い、ほかの人の行）は 500 を返し、上司への通知を送らない", async () => {
    mocks.updateEveningEntry.mockResolvedValue(false);
    const res = await post({ ...EVENING, pageId: "row-of-someone-else" });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to update entry" });
    expect(mocks.sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("更新できたときは、これまでどおり、上司に通知を送る", async () => {
    const res = await post(EVENING);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, durationSec: null });
    expect(mocks.sendNotificationEmail).toHaveBeenCalledTimes(1);
  });

  it("知らないトークンは 401。更新は走らせない", async () => {
    const res = await post({ ...EVENING, token: "tok-unknown" });
    expect(res.status).toBe(401);
    expect(mocks.updateEveningEntry).not.toHaveBeenCalled();
  });

  it("行の ID が無いときは 400。更新は走らせない", async () => {
    const res = await post({ ...EVENING, pageId: "" });
    expect(res.status).toBe(400);
    expect(mocks.updateEveningEntry).not.toHaveBeenCalled();
  });

  it("商品モードの環境でも、持ち主を渡す（気分は、これまでどおり夕方の欄に分けて渡す）", async () => {
    mocks.isFeatureEnabled.mockImplementation(async (key: string) => key === "standalone_mode");
    const res = await post({ ...EVENING, token: "tok-no-manager", eveningCondition: "少し疲れ" });
    expect(res.status).toBe(200);
    const [owner, pageId, , energy, , , extras] = mocks.updateEveningEntry.mock.calls[0];
    expect(owner).toEqual({ tenantId: "tenant-a", participantId: "p-solo" });
    expect(pageId).toBe("row-1");
    expect(energy).toBeNull();
    expect(extras).toMatchObject({ eveningEnergy: "good", eveningCondition: "少し疲れ" });
    // 商品モードでは、上司への通知を送らない（これまでどおり）。
    expect(mocks.sendNotificationEmail).not.toHaveBeenCalled();
  });
});
