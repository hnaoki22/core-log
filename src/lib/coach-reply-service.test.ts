import { describe, it, expect, vi } from "vitest";
import { ensureCoachReply, type CoachDeps } from "./coach-reply-service";
import type { CoachDayLog, CoachReply } from "./coach-reply";
import { COACH_HOLD_MARKER } from "./coach-reply-prompt";
import type { CoachingProfile } from "./coaching-profile";

// テストの文は合成データ（実在の記入・実在の人物の記述は使わない）。
const TODAY = "2026-01-06";
const YESTERDAY = "2026-01-05";

const profile: CoachingProfile = {
  headline: "会議の前に、相手に聞く問いを1つ決める",
  growthTheme: "自分の答えを先に言ってしまう",
  actions: "",
  expected: "",
  stallPoints: "",
  eveningQuestion: "",
  tendencies: [],
  status: "confirmed",
  confirmedAt: "2026-01-05T00:00:00.000Z",
  updatedAt: "2026-01-05T00:00:00.000Z",
};

function log(date: string, evening = "最初に聞いたら「在庫の数字が合わない」と言われた"): CoachDayLog {
  return { id: `log-${date}`, date, morningIntent: "週次の会議で、最初に見方を聞く", eveningInsight: evening, phaseMode: "dojo" };
}

function reply(date: string, status: CoachReply["status"], content = "保存されていた問いです。"): CoachReply {
  return { id: `r-${date}`, replyDate: date, kind: "daily", content, status, createdAt: null };
}

const REPLY_TEXT = "「在庫の数字が合わない」という言葉が出ました。\n\nその言葉は、仮説のどこに当たりますか。\n\nあした、誰に、何を確かめますか。";

function makeDeps(over: Partial<CoachDeps> = {}) {
  const deps: CoachDeps = {
    killSwitch: () => false,
    flagsOn: vi.fn(async () => true),
    isStandalone: vi.fn(async () => false),
    getProfile: vi.fn(async () => ({ ok: true as const, profile })),
    getOptIn: vi.fn(async () => ({ ok: true as const, enabled: true })),
    getDayLogs: vi.fn(async () => ({ ok: true as const, logs: [log(TODAY)] })),
    getReply: vi.fn(async () => ({ ok: true as const, reply: null })),
    getConfig: vi.fn(async () => ({ ok: true as const, config: { deliveryMode: "auto" as const, startDate: null } })),
    getSystemPrompt: vi.fn(async () => "指示文"),
    getIssue: vi.fn(async () => null),
    getPreviousQuestion: vi.fn(async () => null),
    callModel: vi.fn(async () => ({ ok: true as const, text: REPLY_TEXT, model: "model-x" })),
    insertReply: vi.fn(async (a: Parameters<CoachDeps["insertReply"]>[0]) => ({
      ok: true as const,
      reply: { id: "r-new", replyDate: a.replyDate, kind: "daily" as const, content: a.content, status: a.status, createdAt: null },
    })),
    ...over,
  };
  return deps;
}

const ARGS = { participantId: "p-1", tenantId: "t-1", today: TODAY };

describe("ensureCoachReply：作らない場合", () => {
  it("止める設定・スイッチ OFF・商品モードでは、何も読まず、AI も呼ばない", async () => {
    for (const [over, reason] of [
      [{ killSwitch: () => true }, "kill_switch"],
      [{ flagsOn: vi.fn(async () => false) }, "flag_off"],
      [{ isStandalone: vi.fn(async () => true) }, "standalone"],
    ] as const) {
      const deps = makeDeps(over);
      const result = await ensureCoachReply(deps, ARGS);
      expect(result).toEqual({ kind: "view", view: { state: "none" }, generated: false, reason });
      expect(deps.getDayLogs).not.toHaveBeenCalled();
      expect(deps.callModel).not.toHaveBeenCalled();
    }
  });

  it("スイッチが ON でも、環境の設定（届け方と開始日）が無ければ、記入を読まず、AI も呼ばない", async () => {
    const deps = makeDeps({ getConfig: vi.fn(async () => ({ ok: true as const, config: null })) });
    const result = await ensureCoachReply(deps, ARGS);
    expect(result).toEqual({ kind: "view", view: { state: "none" }, generated: false, reason: "not_configured" });
    expect(deps.getProfile).not.toHaveBeenCalled();
    expect(deps.getDayLogs).not.toHaveBeenCalled();
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(deps.insertReply).not.toHaveBeenCalled();
  });

  it("環境の設定を読めなかったときは、「無い」とも「ある」とも扱わず、失敗を返す（AI を呼ばない）", async () => {
    const deps = makeDeps({ getConfig: vi.fn(async () => ({ ok: false as const })) });
    expect(await ensureCoachReply(deps, ARGS)).toEqual({ kind: "error", error: "read_failed" });
    expect(deps.getDayLogs).not.toHaveBeenCalled();
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it("設計図が確認前の人、受け取りを切っている人には、AI を呼ばない", async () => {
    const draft = makeDeps({ getProfile: vi.fn(async () => ({ ok: true as const, profile: { ...profile, status: "draft" as const } })) });
    expect(await ensureCoachReply(draft, ARGS)).toMatchObject({ view: { state: "none" }, reason: "no_profile" });
    expect(draft.callModel).not.toHaveBeenCalled();

    const off = makeDeps({ getOptIn: vi.fn(async () => ({ ok: true as const, enabled: false })) });
    expect(await ensureCoachReply(off, ARGS)).toMatchObject({ view: { state: "none" }, reason: "opted_out" });
    expect(off.callModel).not.toHaveBeenCalled();
  });

  it("今日も前日も、夕方の文が無ければ、作らない", async () => {
    const deps = makeDeps({ getDayLogs: vi.fn(async () => ({ ok: true as const, logs: [log(TODAY, "")] })) });
    expect(await ensureCoachReply(deps, ARGS)).toMatchObject({ view: { state: "none" }, reason: "no_evening_entry" });
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it("読めなかったときは、「無い」と扱わず、失敗を返す（AI を呼ばない）", async () => {
    for (const over of [
      { getProfile: vi.fn(async () => ({ ok: false as const })) },
      { getOptIn: vi.fn(async () => ({ ok: false as const })) },
      { getDayLogs: vi.fn(async () => ({ ok: false as const })) },
      { getReply: vi.fn(async () => ({ ok: false as const })) },
      { getSystemPrompt: vi.fn(async () => null) },
    ]) {
      const deps = makeDeps(over);
      expect(await ensureCoachReply(deps, ARGS)).toEqual({ kind: "error", error: "read_failed" });
      expect(deps.callModel).not.toHaveBeenCalled();
      expect(deps.insertReply).not.toHaveBeenCalled();
    }
  });
});

describe("ensureCoachReply：すでに返信がある場合", () => {
  it("保存されている返信を返し、AI を呼ばない", async () => {
    const deps = makeDeps({ getReply: vi.fn(async () => ({ ok: true as const, reply: reply(TODAY, "delivered") })) });
    expect(await ensureCoachReply(deps, ARGS)).toEqual({
      kind: "view",
      view: { state: "delivered", replyDate: TODAY, content: "保存されていた問いです。" },
      generated: false,
    });
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it("確認待ちの返信は、文を返さない。取り下げた返信は、何も出さない（作り直さない）", async () => {
    const pending = makeDeps({ getReply: vi.fn(async () => ({ ok: true as const, reply: reply(TODAY, "pending_review") })) });
    expect(await ensureCoachReply(pending, ARGS)).toMatchObject({ view: { state: "pending", replyDate: TODAY } });

    const withdrawn = makeDeps({ getReply: vi.fn(async () => ({ ok: true as const, reply: reply(TODAY, "withdrawn") })) });
    expect(await ensureCoachReply(withdrawn, ARGS)).toMatchObject({ view: { state: "none" }, generated: false });
    expect(withdrawn.callModel).not.toHaveBeenCalled();
  });
});

describe("ensureCoachReply：作る場合", () => {
  it("今日の記入に返信を作り、設定が auto なら届いた状態で保存する", async () => {
    const deps = makeDeps();
    const result = await ensureCoachReply(deps, ARGS);
    expect(result).toEqual({ kind: "view", view: { state: "delivered", replyDate: TODAY, content: REPLY_TEXT }, generated: true });
    expect(deps.callModel).toHaveBeenCalledTimes(1);
    expect(deps.insertReply).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t-1",
        participantId: "p-1",
        logId: `log-${TODAY}`,
        replyDate: TODAY,
        kind: "daily",
        status: "delivered",
        model: "model-x",
        inputsUsed: ["morning_entry", "evening_entry", "blueprint"],
      })
    );
  });

  it("AI に渡す文に、その日の記入と設計図が入り、参加者の ID は入らない", async () => {
    const deps = makeDeps();
    await ensureCoachReply(deps, ARGS);
    const call = vi.mocked(deps.callModel).mock.calls[0][0];
    expect(call.systemPrompt).toBe("指示文");
    expect(call.userPrompt).toContain("在庫の数字が合わない");
    expect(call.userPrompt).toContain("会議の前に、相手に聞く問いを1つ決める");
    expect(call.userPrompt).not.toContain("p-1");
  });

  it("設定が review（既定）なら、確認待ちで保存し、本人には文を返さない", async () => {
    const deps = makeDeps({ getConfig: vi.fn(async () => ({ ok: true as const, config: { deliveryMode: "review" as const, startDate: null } })) });
    const result = await ensureCoachReply(deps, ARGS);
    expect(result).toEqual({ kind: "view", view: { state: "pending", replyDate: TODAY }, generated: true });
    expect(deps.insertReply).toHaveBeenCalledWith(expect.objectContaining({ status: "pending_review", content: REPLY_TEXT }));
  });

  it("今日の夕方の文がまだ無いときは、前日の記入に返信を作る", async () => {
    const deps = makeDeps({
      getDayLogs: vi.fn(async () => ({ ok: true as const, logs: [log(TODAY, ""), log(YESTERDAY)] })),
    });
    const result = await ensureCoachReply(deps, ARGS);
    expect(result).toMatchObject({ view: { state: "delivered", replyDate: YESTERDAY }, generated: true });
    expect(deps.getReply).toHaveBeenCalledWith("p-1", "t-1", YESTERDAY);
  });

  it("開始日より前の記入には、作らない", async () => {
    const deps = makeDeps({
      getDayLogs: vi.fn(async () => ({ ok: true as const, logs: [log(YESTERDAY)] })),
      getConfig: vi.fn(async () => ({ ok: true as const, config: { deliveryMode: "auto" as const, startDate: TODAY } })),
    });
    expect(await ensureCoachReply(deps, ARGS)).toMatchObject({ view: { state: "none" } });
    expect(deps.callModel).not.toHaveBeenCalled();
  });

  it("強い不調などの語がある記入は、AI に送らず、確認待ち（文なし）で保存する", async () => {
    const deps = makeDeps({
      getDayLogs: vi.fn(async () => ({ ok: true as const, logs: [log(TODAY, "もう消えたいと思った")] })),
    });
    const result = await ensureCoachReply(deps, ARGS);
    expect(result).toEqual({ kind: "view", view: { state: "pending", replyDate: TODAY }, generated: true });
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(deps.insertReply).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending_review", content: "", model: null, inputsUsed: [] })
    );
  });

  it("AI が「返信を作らない」と返したときは、設定が auto でも確認待ち（文なし）にする", async () => {
    const deps = makeDeps({ callModel: vi.fn(async () => ({ ok: true as const, text: COACH_HOLD_MARKER, model: "model-x" })) });
    const result = await ensureCoachReply(deps, ARGS);
    expect(result).toMatchObject({ view: { state: "pending", replyDate: TODAY }, generated: true });
    expect(deps.insertReply).toHaveBeenCalledWith(expect.objectContaining({ status: "pending_review", content: "" }));
  });

  it("AI が応答を断った記入は、失敗にせず、確認待ち（文なし）で保存する（同じ記入で AI を呼び直さない）", async () => {
    const deps = makeDeps({
      callModel: vi.fn(async () => ({ ok: false as const, reason: "refusal", model: "model-x" })),
    });
    const result = await ensureCoachReply(deps, ARGS);
    expect(result).toEqual({ kind: "view", view: { state: "pending", replyDate: TODAY }, generated: true });
    // AI に送ったことは、記録に残す（強い不調などの語で止めたときは、送っていないので残らない）
    expect(deps.insertReply).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending_review",
        content: "",
        model: "model-x",
        inputsUsed: expect.arrayContaining(["evening_entry", "blueprint"]),
      })
    );
  });

  it("AI の呼び出しに失敗したとき、出力が使えないときは、保存せずに失敗を返す", async () => {
    const failed = makeDeps({ callModel: vi.fn(async () => ({ ok: false as const, reason: "timeout", model: "model-x" })) });
    expect(await ensureCoachReply(failed, ARGS)).toEqual({ kind: "error", error: "ai_failed", detail: "timeout" });
    expect(failed.insertReply).not.toHaveBeenCalled();

    const tooLong = makeDeps({ callModel: vi.fn(async () => ({ ok: true as const, text: "あ".repeat(2000), model: "model-x" })) });
    expect(await ensureCoachReply(tooLong, ARGS)).toEqual({ kind: "error", error: "ai_failed", detail: "too_long" });
    expect(tooLong.insertReply).not.toHaveBeenCalled();
  });

  it("ほぼ同時の 2 回目で保存がぶつかったら、先に保存されたほうを返す", async () => {
    const getReply = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, reply: null })
      .mockResolvedValueOnce({ ok: true, reply: reply(TODAY, "delivered", "先に保存された問いです。") });
    const deps = makeDeps({ getReply, insertReply: vi.fn(async () => ({ ok: false as const, reason: "conflict" as const })) });
    expect(await ensureCoachReply(deps, ARGS)).toEqual({
      kind: "view",
      view: { state: "delivered", replyDate: TODAY, content: "先に保存された問いです。" },
      generated: false,
    });
  });

  it("保存に失敗したときは、失敗を返す", async () => {
    const deps = makeDeps({ insertReply: vi.fn(async () => ({ ok: false as const, reason: "error" as const })) });
    expect(await ensureCoachReply(deps, ARGS)).toEqual({ kind: "error", error: "save_failed" });
  });
});

describe("ensureCoachReply：確かめるだけの呼び出し（checkOnly）", () => {
  const CHECK = { ...ARGS, checkOnly: true };

  it("返してよい記入があり、返信がまだ無いときは、作らずに「このあと作る」と返す（AI を呼ばない・保存しない）", async () => {
    const deps = makeDeps();
    expect(await ensureCoachReply(deps, CHECK)).toEqual({
      kind: "view",
      view: { state: "none" },
      generated: false,
      willGenerate: true,
    });
    expect(deps.callModel).not.toHaveBeenCalled();
    expect(deps.insertReply).not.toHaveBeenCalled();
    expect(deps.getSystemPrompt).not.toHaveBeenCalled();
  });

  it("すでに返信があるときは、その返信を返す（このあと作る、とは返さない）", async () => {
    const deps = makeDeps({
      getReply: vi.fn(async () => ({ ok: true as const, reply: reply(TODAY, "delivered", "保存されていた問いです。") })),
    });
    expect(await ensureCoachReply(deps, CHECK)).toEqual({
      kind: "view",
      view: { state: "delivered", replyDate: TODAY, content: "保存されていた問いです。" },
      generated: false,
    });
  });

  it("受け取らない設定の人、設計図が確認前の人には、「このあと作る」と返さない（画面に「読んでいます」を出させない）", async () => {
    const off = makeDeps({ getOptIn: vi.fn(async () => ({ ok: true as const, enabled: false })) });
    const offResult = await ensureCoachReply(off, CHECK);
    expect(offResult).toEqual({ kind: "view", view: { state: "none" }, generated: false, reason: "opted_out" });

    const draft = makeDeps({
      getProfile: vi.fn(async () => ({ ok: true as const, profile: { ...profile, status: "draft" as const } })),
    });
    const draftResult = await ensureCoachReply(draft, CHECK);
    expect(draftResult).toEqual({ kind: "view", view: { state: "none" }, generated: false, reason: "no_profile" });
  });

  it("動いていない環境、夕方の記入が無い日も、「このあと作る」と返さない", async () => {
    for (const over of [
      { killSwitch: () => true },
      { flagsOn: vi.fn(async () => false) },
      { isStandalone: vi.fn(async () => true) },
      { getConfig: vi.fn(async () => ({ ok: true as const, config: null })) },
      { getDayLogs: vi.fn(async () => ({ ok: true as const, logs: [log(TODAY, "")] })) },
      { getDayLogs: vi.fn(async () => ({ ok: true as const, logs: [{ ...log(TODAY), phaseMode: "kan-no-ki" }] })) },
    ]) {
      const result = await ensureCoachReply(makeDeps(over), CHECK);
      expect(result).toMatchObject({ kind: "view", view: { state: "none" }, generated: false });
      expect((result as { willGenerate?: boolean }).willGenerate).toBeUndefined();
    }
  });

  it("確かめたあとの、作る呼び出しは、これまでどおり作る", async () => {
    const deps = makeDeps();
    await ensureCoachReply(deps, CHECK);
    const made = await ensureCoachReply(deps, ARGS);
    expect(made).toMatchObject({ kind: "view", view: { state: "delivered", replyDate: TODAY }, generated: true });
    expect(deps.callModel).toHaveBeenCalledTimes(1);
  });
});
