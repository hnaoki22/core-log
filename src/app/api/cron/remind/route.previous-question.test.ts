import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// 朝のリマインド（GET /api/cron/remind）が、「前回の AIコーチの問い」を、載せてよい人のメールにだけ渡し、
// それ以外の人への呼び出しは、これまでと同じ形のままであることを確かめる。
// データベースの読み取り・メールの送信・スイッチ・日付は、すべて差し替える（合成データ。実在の環境・人物・
// 返信は使わない）。出してよいかを決める流れ（coach-previous-question.ts）と、問いの取り出し方
// （coach-reply.ts）は、差し替えずに、そのまま通す。

const h = vi.hoisted(() => {
  process.env.CRON_SECRET = "test-secret";
  return {
    hour: 8,
    flags: {} as Record<string, boolean>,
    questions: ["合成データの問い"] as string[],
    participants: [] as Array<Record<string, unknown>>,
    profiles: null as Map<string, unknown> | null,
    sendReminderEmail: vi.fn(),
    hasLoggedToday: vi.fn(),
    getMissionsByParticipantId: vi.fn(),
    releaseCronLock: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    deps: {
      killSwitch: vi.fn(),
      isFlagOn: vi.fn(),
      getActivation: vi.fn(),
      getOptedOutIds: vi.fn(),
      getLatestReplies: vi.fn(),
    },
  };
});

const TENANT = "00000000-0000-4000-8000-0000000000aa";
const TODAY = "2026-01-07";

vi.mock("@/lib/calendar", () => ({
  isBusinessDay: () => true,
  getJSTDateString: () => "2026-01-07",
  getJSTHour: () => h.hour,
}));
vi.mock("@/lib/email", () => ({ sendReminderEmail: h.sendReminderEmail }));
vi.mock("@/lib/supabase", () => ({
  DEFAULT_TENANT_ID: "default-tenant",
  hasLoggedToday: h.hasLoggedToday,
  getAllTenants: vi.fn(async () => [{ id: "00000000-0000-4000-8000-0000000000aa", name: "合成の環境", slug: "synthetic" }]),
  getMissionsByParticipantId: h.getMissionsByParticipantId,
}));
vi.mock("@/lib/participant-db", () => ({ getAllParticipants: vi.fn(async () => h.participants) }));
vi.mock("@/lib/logger", () => ({ logger: h.logger }));
vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn(async (key: string) => h.flags[key] === true),
}));
vi.mock("@/lib/cron-lock", () => ({
  acquireCronLock: vi.fn(async () => ({ ok: true, lockId: "lock-1", method: "test" })),
  releaseCronLock: h.releaseCronLock,
}));
vi.mock("@/lib/entry-question-env", () => ({
  getReminderQuestionsForTenant: vi.fn(async () => h.questions),
}));
vi.mock("@/lib/coaching-profile-store", () => ({
  getCoachingProfilesForTenant: vi.fn(async () => h.profiles),
}));
// 実際の読み取りをつないだもの（runtime）だけを差し替える。流れ（coach-previous-question.ts）は本物。
vi.mock("@/lib/coach-previous-question-runtime", () => ({ previousQuestionTenantDeps: h.deps }));

import { GET } from "./route";

function profile(over: Record<string, unknown> = {}) {
  return {
    headline: "会議の前に、相手に聞く問いを1つ決める",
    growthTheme: "",
    actions: "",
    expected: "",
    stallPoints: "",
    eveningQuestion: "",
    tendencies: [],
    status: "confirmed",
    confirmedAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    ...over,
  };
}

function reply(over: Record<string, unknown> = {}) {
  return {
    id: "r1",
    replyDate: "2026-01-06",
    kind: "daily",
    content: "見本の一段落目です。\n\nあした、だれに、何を確かめますか。",
    status: "delivered",
    createdAt: "2026-01-06T09:00:00Z",
    ...over,
  };
}

function person(id: string, name: string) {
  return { id, name, email: `${id}@mail.invalid`, token: `tok-${id}`, emailEnabled: true, startDate: "", endDate: "" };
}

const QUESTION = { text: "あした、だれに、何を確かめますか。", replyDate: "2026-01-06" };

function run() {
  return GET(
    new NextRequest("http://localhost/api/cron/remind", { headers: { authorization: "Bearer test-secret" } })
  );
}

/** 送信の呼び出しを、宛先のトークンで引く。 */
function callFor(id: string): Record<string, unknown> {
  const call = h.sendReminderEmail.mock.calls.find((c) => (c[0] as { token: string }).token === `tok-${id}`);
  if (!call) throw new Error(`no reminder call for ${id}`);
  return call[0] as Record<string, unknown>;
}

beforeEach(() => {
  h.hour = 8;
  h.flags = { "feature.reminderMail": true, "feature.coachingProfile": true };
  h.questions = ["合成データの問い"];
  // a: 確認済み・前回の返信あり／b: 確認前（返信の一覧に、誤って入っている）／c: 確認済み・受け取らない
  // d: 確認済み・返信なし／e: 設計図なし
  h.participants = [
    person("a", "合成 一郎"),
    person("b", "合成 二郎"),
    person("c", "合成 三郎"),
    person("d", "合成 四郎"),
    person("e", "合成 五郎"),
  ];
  h.profiles = new Map<string, unknown>([
    ["a", profile()],
    ["b", profile({ status: "draft", confirmedAt: null })],
    ["c", profile()],
    ["d", profile()],
  ]);
  h.sendReminderEmail.mockReset();
  h.sendReminderEmail.mockResolvedValue(true);
  h.hasLoggedToday.mockReset();
  h.hasLoggedToday.mockResolvedValue({ hasMorning: false, hasEvening: false });
  h.getMissionsByParticipantId.mockReset();
  h.getMissionsByParticipantId.mockResolvedValue([]);
  h.releaseCronLock.mockReset();
  for (const fn of Object.values(h.logger)) fn.mockReset();
  h.deps.killSwitch.mockReset();
  h.deps.killSwitch.mockReturnValue(false);
  h.deps.isFlagOn.mockReset();
  h.deps.isFlagOn.mockResolvedValue(true);
  h.deps.getActivation.mockReset();
  h.deps.getActivation.mockResolvedValue({ ok: true, active: true });
  h.deps.getOptedOutIds.mockReset();
  h.deps.getOptedOutIds.mockResolvedValue(new Set<string>(["c"]));
  h.deps.getLatestReplies.mockReset();
  h.deps.getLatestReplies.mockResolvedValue(
    new Map<string, unknown>([
      ["a", reply()],
      ["b", reply({ id: "r-b" })],
      ["c", reply({ id: "r-c" })],
    ])
  );
});

describe("GET /api/cron/remind（朝）：前回の AIコーチの問い", () => {
  it("載せてよい人（確認済み・受け取る・前回の返信あり）の呼び出しにだけ、問いを渡す", async () => {
    const res = await run();
    expect(res.status).toBe(200);
    expect(h.sendReminderEmail).toHaveBeenCalledTimes(5);

    expect((callFor("a").personal as Record<string, unknown>).coachQuestion).toEqual(QUESTION);
    // 確認前の人・受け取らない人・返信の無い人には、キーごと無い（これまでの呼び出しと同じ形）。
    for (const id of ["b", "c", "d"]) {
      const personal = callFor(id).personal as Record<string, unknown>;
      expect(personal).toBeDefined();
      expect("coachQuestion" in personal).toBe(false);
      expect(Object.keys(personal).sort()).toEqual(["issue", "profile"]);
    }
    // 設計図の無い人は、設計図なしの形のまま。
    expect(callFor("e").personal).toEqual({ profile: null, issue: null });
  });

  it("返信は、その環境の、7 日前から今日より前までを読む", async () => {
    await run();
    expect(h.deps.getLatestReplies).toHaveBeenCalledTimes(1);
    expect(h.deps.getLatestReplies).toHaveBeenCalledWith(TENANT, "2025-12-31", TODAY);
    expect(h.deps.getOptedOutIds).toHaveBeenCalledWith(TENANT);
  });

  it("スイッチが OFF の環境では、返信を読まず、だれの呼び出しにも問いを渡さない（これまでと同じ形）", async () => {
    h.deps.isFlagOn.mockResolvedValue(false);
    const res = await run();
    expect(res.status).toBe(200);
    expect(h.sendReminderEmail).toHaveBeenCalledTimes(5);
    expect(h.deps.getLatestReplies).not.toHaveBeenCalled();
    expect(h.deps.getOptedOutIds).not.toHaveBeenCalled();
    for (const id of ["a", "b", "c", "d", "e"]) {
      expect("coachQuestion" in (callFor(id).personal as Record<string, unknown>)).toBe(false);
    }
    expect(callFor("a").personal).toEqual({ profile: h.profiles!.get("a"), issue: null });
  });

  it("アプリ全体で止めているあいだ・AIコーチの返信が動いていない環境では、渡さない", async () => {
    h.deps.killSwitch.mockReturnValue(true);
    await run();
    expect("coachQuestion" in (callFor("a").personal as Record<string, unknown>)).toBe(false);
    expect(h.deps.getLatestReplies).not.toHaveBeenCalled();

    h.sendReminderEmail.mockClear();
    h.deps.killSwitch.mockReturnValue(false);
    h.deps.getActivation.mockResolvedValue({ ok: true, active: false });
    await run();
    expect(h.sendReminderEmail).toHaveBeenCalledTimes(5);
    expect("coachQuestion" in (callFor("a").personal as Record<string, unknown>)).toBe(false);
  });

  it("受け取らない人の一覧を読めなかったときは、だれにも渡さない。メールは、全員に送る", async () => {
    h.deps.getOptedOutIds.mockResolvedValue(null);
    const res = await run();
    expect(res.status).toBe(200);
    expect(h.sendReminderEmail).toHaveBeenCalledTimes(5);
    for (const id of ["a", "b", "c", "d"]) {
      expect("coachQuestion" in (callFor(id).personal as Record<string, unknown>)).toBe(false);
    }
  });

  it("返信の読み取りで例外が出ても、メールは全員に送る（問いは渡さない）。失敗は記録する", async () => {
    h.deps.getLatestReplies.mockRejectedValue(new Error("boom"));
    const res = await run();
    expect(res.status).toBe(200);
    expect(h.sendReminderEmail).toHaveBeenCalledTimes(5);
    expect("coachQuestion" in (callFor("a").personal as Record<string, unknown>)).toBe(false);
    expect(h.logger.error).toHaveBeenCalledWith(
      "Reminder: previous coach question read failed",
      expect.objectContaining({ tenantId: TENANT, error: "boom" })
    );
    // 定時処理は、成功で終える。
    expect(h.releaseCronLock).toHaveBeenCalledWith("lock-1", "success", expect.anything());
  });

  it("設計図を読めなかった環境・問いを載せないメールの環境では、前回の問いを読みにいかない", async () => {
    h.profiles = null;
    await run();
    expect(h.deps.killSwitch).not.toHaveBeenCalled();
    expect(h.deps.isFlagOn).not.toHaveBeenCalled();
    expect(h.deps.getLatestReplies).not.toHaveBeenCalled();
    expect(callFor("a").personal).toBeUndefined();

    h.sendReminderEmail.mockClear();
    h.profiles = new Map<string, unknown>([["a", profile()]]);
    h.questions = [];
    await run();
    expect(h.sendReminderEmail).toHaveBeenCalledTimes(5);
    expect(h.deps.isFlagOn).not.toHaveBeenCalled();
    expect(h.deps.getLatestReplies).not.toHaveBeenCalled();
    expect(callFor("a").personal).toBeUndefined();
  });

  it("朝の記入を済ませた人には、メールを送らない（問いも渡らない）", async () => {
    h.hasLoggedToday.mockImplementation(async (name: string) => ({
      hasMorning: name === "合成 一郎",
      hasEvening: false,
    }));
    await run();
    expect(h.sendReminderEmail).toHaveBeenCalledTimes(4);
    expect(h.sendReminderEmail.mock.calls.some((c) => (c[0] as { token: string }).token === "tok-a")).toBe(false);
  });

  it("実行の記録に、問いを載せて送れたメールの数を残す（出せる人の数とは分けて数える）", async () => {
    await run();
    // 出せる問いがある人は 2 人（a と、確認前の b）。実際に載せて送ったのは、a の 1 通。
    expect(h.logger.info).toHaveBeenCalledWith(
      "Reminder: previous coach questions available for this tenant",
      { tenantId: TENANT, available: 2 }
    );
    expect(h.releaseCronLock).toHaveBeenCalledWith(
      "lock-1",
      "success",
      expect.objectContaining({
        emailsSent: 5,
        detail: expect.objectContaining({ questionMailTenants: 1, previousQuestionMails: 1 }),
      })
    );
  });

  it("送れなかったメールは、数えない。載せた人がいない実行では 0", async () => {
    h.sendReminderEmail.mockImplementation(async (o: { token: string }) => o.token !== "tok-a");
    await run();
    expect(h.releaseCronLock).toHaveBeenCalledWith(
      "lock-1",
      "success",
      expect.objectContaining({ emailsSent: 4, detail: expect.objectContaining({ previousQuestionMails: 0 }) })
    );

    h.releaseCronLock.mockClear();
    h.sendReminderEmail.mockReset();
    h.sendReminderEmail.mockResolvedValue(true);
    h.deps.isFlagOn.mockResolvedValue(false);
    await run();
    expect(h.releaseCronLock).toHaveBeenCalledWith(
      "lock-1",
      "success",
      expect.objectContaining({ emailsSent: 5, detail: expect.objectContaining({ previousQuestionMails: 0 }) })
    );
  });

  it("記録に、問いの文・だれに載せたかを残さない（件数だけ）", async () => {
    await run();
    const logged = JSON.stringify([
      ...h.logger.info.mock.calls,
      ...h.logger.warn.mock.calls,
      ...h.logger.error.mock.calls,
      ...h.releaseCronLock.mock.calls,
    ]);
    expect(logged).not.toContain("あした、だれに、何を確かめますか");
    expect(logged).not.toContain("tok-a");
  });
});

describe("GET /api/cron/remind（夕方）：前回の AIコーチの問い", () => {
  it("夕方のメールでは、前回の問いを読まず、渡さない", async () => {
    h.hour = 17;
    const res = await run();
    expect(res.status).toBe(200);
    expect(h.sendReminderEmail).toHaveBeenCalledTimes(5);
    expect(h.deps.killSwitch).not.toHaveBeenCalled();
    expect(h.deps.isFlagOn).not.toHaveBeenCalled();
    expect(h.deps.getLatestReplies).not.toHaveBeenCalled();
    for (const id of ["a", "b", "c", "d", "e"]) {
      expect("coachQuestion" in (callFor(id).personal as Record<string, unknown>)).toBe(false);
    }
  });
});
