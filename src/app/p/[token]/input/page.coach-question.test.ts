import { describe, it, expect, vi, beforeEach } from "vitest";
import { Children, isValidElement, type ReactElement } from "react";

// 入力画面のサーバー側（/p/[token]/input の page.tsx）が、「前回の AIコーチの問い」を、
// 出してよい人のときだけ読み、画面（InputClient）に渡すことを確かめる。
// あわせて、その読み取りを、ミッションの読み取りと並べて進めること（入力画面を開く時間を延ばさない）を確かめる。
// データベースの読み取り・スイッチ・日付は、すべて差し替える（合成データ。実在の環境・人物・返信は使わない）。
// 出してよいかを決める流れ（coach-previous-question.ts）は、差し替えずに、そのまま通す。

const h = vi.hoisted(() => ({
  flags: {} as Record<string, boolean>,
  profileRead: { ok: true, profile: null } as { ok: true; profile: unknown } | { ok: false },
  getParticipantWithLogsByToken: vi.fn(),
  getMissionsByParticipantId: vi.fn(),
  getCoachingProfile: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  deps: {
    killSwitch: vi.fn(),
    isFlagOn: vi.fn(),
    getActivation: vi.fn(),
    getOptIn: vi.fn(),
    getPreviousReply: vi.fn(),
  },
}));

const TENANT = "00000000-0000-4000-8000-0000000000aa";
const ME = "11111111-1111-4111-8111-111111111111";
const TODAY = "2026-01-07";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/supabase", () => ({
  getParticipantWithLogsByToken: h.getParticipantWithLogsByToken,
  getMissionsByParticipantId: h.getMissionsByParticipantId,
  hasRecentInertiaNudge: vi.fn(async () => false),
  insertInertiaNudge: vi.fn(async () => true),
}));
vi.mock("@/lib/date-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/date-utils")>()),
  getTodayJST: () => "2026-01-07",
  getCurrentHourJST: () => 9,
  isGracePeriod: () => false,
}));
vi.mock("@/lib/feature-flags", () => ({ getFlagsForTenant: vi.fn(async () => h.flags) }));
vi.mock("@/lib/kan-no-ki", () => ({ getKanNoKiPhase: vi.fn(async () => null) }));
vi.mock("@/lib/daily-questions", () => ({
  getTodayQuestionsForTenant: vi.fn(async () => ({ morning: ["合成データの朝の問い"], evening: ["合成データの夕方の問い"], axis: "" })),
  getTodayDayKey: () => "wednesday",
  getWeeklyForTenant: vi.fn(async () => null),
}));
vi.mock("@/lib/coaching-profile-store", () => ({ getCoachingProfile: h.getCoachingProfile }));
vi.mock("@/lib/quick-notes", () => ({ getQuickNotesForDate: vi.fn(async () => []) }));
vi.mock("@/lib/logger", () => ({ logger: h.logger }));
// 実際の読み取りをつないだもの（runtime）だけを差し替える。流れ（coach-previous-question.ts）は本物。
vi.mock("@/lib/coach-previous-question-runtime", () => ({ previousQuestionParticipantDeps: h.deps }));
// 画面の部品は、このテストでは描かない（渡す値だけを確かめる）。
vi.mock("./InputClient", () => ({ default: function InputClientStub() { return null; } }));
vi.mock("./StandaloneInputClient", () => ({ default: function StandaloneInputClientStub() { return null; } }));

import InputPageServer from "./page";

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

const QUESTION = { text: "あした、だれに、何を確かめますか。", replyDate: "2026-01-06" };

/** ページが返す要素の中から、画面の部品に渡した initialData を取り出す。 */
function initialDataOf(page: unknown): Record<string, unknown> {
  const root = page as ReactElement<{ children?: unknown }>;
  const found = Children.toArray(root.props.children as never).find(
    (c) => isValidElement(c) && (c.props as { initialData?: unknown }).initialData !== undefined
  ) as ReactElement<{ initialData: Record<string, unknown> }> | undefined;
  if (!found) throw new Error("initialData not found");
  return found.props.initialData;
}

async function open(): Promise<Record<string, unknown>> {
  return initialDataOf(await InputPageServer({ params: { token: "tok_synthetic" } }));
}

function expectNoCoachReads() {
  expect(h.deps.killSwitch).not.toHaveBeenCalled();
  expect(h.deps.isFlagOn).not.toHaveBeenCalled();
  expect(h.deps.getActivation).not.toHaveBeenCalled();
  expect(h.deps.getOptIn).not.toHaveBeenCalled();
  expect(h.deps.getPreviousReply).not.toHaveBeenCalled();
}

beforeEach(() => {
  h.flags = {
    "feature.dailyQuestions": true,
    "feature.coachingProfile": true,
    "feature.coachReply": true,
    "feature.coachPreviousQuestion": true,
    "feature.mission": true,
    "feature.missionOnInput": true,
  };
  h.profileRead = { ok: true, profile: profile() };
  h.getParticipantWithLogsByToken.mockReset();
  h.getParticipantWithLogsByToken.mockResolvedValue({
    participant: { id: ME, tenantId: TENANT, name: "合成 一郎", dojoPhase: "", startDate: "" },
    logs: [],
  });
  h.getMissionsByParticipantId.mockReset();
  h.getMissionsByParticipantId.mockResolvedValue([]);
  h.getCoachingProfile.mockReset();
  h.getCoachingProfile.mockImplementation(async () => h.profileRead);
  for (const fn of Object.values(h.logger)) fn.mockReset();
  h.deps.killSwitch.mockReset();
  h.deps.killSwitch.mockReturnValue(false);
  h.deps.isFlagOn.mockReset();
  h.deps.isFlagOn.mockResolvedValue(true);
  h.deps.getActivation.mockReset();
  h.deps.getActivation.mockResolvedValue({ ok: true, active: true });
  h.deps.getOptIn.mockReset();
  h.deps.getOptIn.mockResolvedValue({ ok: true, enabled: true });
  h.deps.getPreviousReply.mockReset();
  h.deps.getPreviousReply.mockResolvedValue(reply());
});

describe("/p/[token]/input（サーバー側）：前回の AIコーチの問い", () => {
  it("スイッチが ON で、設計図が確認済みの人には、前回の問いを読んで、画面に渡す", async () => {
    const data = await open();
    expect(data.initialCoachQuestion).toEqual(QUESTION);
    // 本人の分は、トークンから引いた参加者とテナントで読む。前回＝今日より前。
    expect(h.deps.getOptIn).toHaveBeenCalledWith(ME, TENANT);
    expect(h.deps.getPreviousReply).toHaveBeenCalledWith(ME, TENANT, TODAY);
  });

  it("スイッチが OFF の環境では、何も読まず、渡さない", async () => {
    h.flags["feature.coachPreviousQuestion"] = false;
    const data = await open();
    expect(data.initialCoachQuestion).toBeNull();
    expectNoCoachReads();
  });

  it("設計図が確認前・未作成の人には、何も読まず、渡さない", async () => {
    h.profileRead = { ok: true, profile: profile({ status: "draft", confirmedAt: null }) };
    expect((await open()).initialCoachQuestion).toBeNull();
    expectNoCoachReads();

    h.profileRead = { ok: true, profile: null };
    expect((await open()).initialCoachQuestion).toBeNull();
    expectNoCoachReads();
  });

  it("設計図を読めなかったとき・設計図の機能を出していない環境では、何も読まず、渡さない", async () => {
    h.profileRead = { ok: false };
    const unread = await open();
    expect(unread.initialCoachQuestion).toBeNull();
    expect(unread.initialCoachingProfile).toBeNull();
    expectNoCoachReads();

    h.profileRead = { ok: true, profile: profile() };
    h.flags["feature.coachingProfile"] = false;
    expect((await open()).initialCoachQuestion).toBeNull();
    expect(h.getCoachingProfile).toHaveBeenCalledTimes(1); // 1 回目の分だけ（2 回目は読んでいない）
    expectNoCoachReads();
  });

  it("受け取らない人・AIコーチの返信が動いていない環境・出せる返信が無いときは、渡さない", async () => {
    h.deps.getOptIn.mockResolvedValue({ ok: true, enabled: false });
    expect((await open()).initialCoachQuestion).toBeNull();

    h.deps.getOptIn.mockResolvedValue({ ok: true, enabled: true });
    h.deps.getActivation.mockResolvedValue({ ok: true, active: false });
    expect((await open()).initialCoachQuestion).toBeNull();

    h.deps.getActivation.mockResolvedValue({ ok: true, active: true });
    h.deps.getPreviousReply.mockResolvedValue(null);
    expect((await open()).initialCoachQuestion).toBeNull();

    h.deps.getPreviousReply.mockResolvedValue(reply({ status: "pending_review", content: "" }));
    expect((await open()).initialCoachQuestion).toBeNull();
  });

  it("読み取りで例外が出ても、入力画面は開く（問いは渡さない）。失敗は記録する", async () => {
    h.deps.getPreviousReply.mockRejectedValue(new Error("boom"));
    const data = await open();
    expect(data.initialCoachQuestion).toBeNull();
    // ほかの値は、そのまま渡っている。
    expect((data.initialCoachingProfile as { state: string }).state).toBe("confirmed");
    expect(data.initialMissions).toEqual([]);
    expect(h.logger.error).toHaveBeenCalledWith(
      "input page: previous coach question read failed",
      expect.objectContaining({ participantId: ME, tenantId: TENANT, error: "boom" })
    );
  });

  it("前回の問いの読み取りを待たずに、ミッションの読み取りを始める（並べて進める）", async () => {
    // 前回の返信の読み取りは、ミッションの読み取りが始まったあとでしか、終わらないようにする。
    // ページが、前回の問いを待ってからミッションを読む作りだと、どちらも進めなくなる（下の時間切れで落ちる）。
    let finishReply: (v: unknown) => void = () => {};
    let replyFinished = false;
    h.deps.getPreviousReply.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishReply = (v) => {
            replyFinished = true;
            resolve(v);
          };
        })
    );
    let replyPendingWhenMissionsStarted = false;
    h.getMissionsByParticipantId.mockImplementation(async () => {
      replyPendingWhenMissionsStarted = !replyFinished;
      // タイマーは、いま並んでいる処理（前回の返信の読み取りを始めるところまで）が済んでから動く。
      setTimeout(() => finishReply(reply()), 0);
      return [];
    });

    const data = await Promise.race([
      open(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("ページが、前回の問いの読み取りを待ってから、ミッションを読んでいる")), 1000)
      ),
    ]);
    expect(h.getMissionsByParticipantId).toHaveBeenCalledTimes(1);
    expect(h.deps.getPreviousReply).toHaveBeenCalledTimes(1);
    expect(replyPendingWhenMissionsStarted).toBe(true);
    // 最後に待って、読めた問いを渡している。
    expect(data.initialCoachQuestion).toEqual(QUESTION);
    expect(data.initialMissions).toEqual([]);
  });

  it("商品モードの環境では、読まない", async () => {
    h.flags["standalone_mode"] = true;
    await InputPageServer({ params: { token: "tok_synthetic" } });
    expectNoCoachReads();
  });

  it("記録に、問いの文を残さない", async () => {
    await open();
    const logged = JSON.stringify([
      ...h.logger.info.mock.calls,
      ...h.logger.warn.mock.calls,
      ...h.logger.error.mock.calls,
    ]);
    expect(logged).not.toContain("あした、だれに、何を確かめますか");
  });
});
