import { describe, it, expect, vi } from "vitest";
import {
  COACH_PREVIOUS_QUESTION_MAX_AGE_DAYS,
  COACH_PREVIOUS_QUESTION_MAX_CHARS,
  COACH_TERMS,
  lastParagraph,
  pickPreviousCoachQuestion,
  previousQuestionMailLabel,
  replyParagraphs,
  type CoachReply,
} from "./coach-reply";
import { lastParagraph as lastParagraphFromPrompt } from "./coach-reply-prompt";
import {
  daysBefore,
  loadPreviousCoachQuestion,
  loadPreviousCoachQuestionsForTenant,
  type PreviousQuestionParticipantDeps,
  type PreviousQuestionTenantDeps,
} from "./coach-previous-question";
import { buildReminderPersonal, type CoachingProfile } from "./coaching-profile";
import { buildQuestionReminderEmail } from "./reminder-mail-question";
import { FEATURE_CATALOG, PRESETS } from "./feature-flags";

// テストの値は合成データ（実在の人物・実在の環境・実在の記入や返信は使わない）。
const TENANT = "00000000-0000-4000-8000-0000000000aa";
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const TODAY = "2026-01-07";

const THREE = "見本の一段落目です。\n\n見本の二段落目です。\n\nあした、だれに、何を確かめますか。";

function reply(over: Partial<CoachReply> = {}): CoachReply {
  return {
    id: "r1",
    replyDate: "2026-01-06",
    kind: "daily",
    content: THREE,
    status: "delivered",
    createdAt: "2026-01-06T09:00:00Z",
    ...over,
  };
}

describe("replyParagraphs / lastParagraph：返信の段落の切り方", () => {
  it("空行で区切り、前後の空白と、空の段落を除く", () => {
    expect(replyParagraphs(" 一つ目。 \n\n\n 二つ目。\n \n三つ目。\n")).toEqual(["一つ目。", "二つ目。", "三つ目。"]);
    expect(replyParagraphs("")).toEqual([]);
    expect(replyParagraphs(" \n\n ")).toEqual([]);
  });

  it("段落の中の改行は、そのまま残す", () => {
    expect(replyParagraphs("一行目。\n二行目。\n\n次の段落。")).toEqual(["一行目。\n二行目。", "次の段落。"]);
  });

  it("AI に渡す「前回の問い」と、同じ切り方を使う（同じ関数）", () => {
    expect(lastParagraphFromPrompt).toBe(lastParagraph);
    expect(lastParagraph(THREE)).toBe("あした、だれに、何を確かめますか。");
    expect(lastParagraph("一段落だけ。")).toBe("一段落だけ。");
    expect(lastParagraph(" \n ")).toBeNull();
  });
});

describe("pickPreviousCoachQuestion：画面とメールに出す、前回の問い", () => {
  it("届いた毎日の返信の、最後の段落を出す。どの日の記入への返信かも返す", () => {
    expect(pickPreviousCoachQuestion({ reply: reply(), today: TODAY })).toEqual({
      text: "あした、だれに、何を確かめますか。",
      replyDate: "2026-01-06",
    });
  });

  it("返信が無いときは、出さない", () => {
    expect(pickPreviousCoachQuestion({ reply: null, today: TODAY })).toBeNull();
    expect(pickPreviousCoachQuestion({ reply: undefined, today: TODAY })).toBeNull();
  });

  it("確認待ち・取り下げ済みの返信からは、出さない（本人に見せない文）", () => {
    expect(pickPreviousCoachQuestion({ reply: reply({ status: "pending_review" }), today: TODAY })).toBeNull();
    expect(pickPreviousCoachQuestion({ reply: reply({ status: "withdrawn" }), today: TODAY })).toBeNull();
  });

  it("週のまとめなど、毎日の返信でないものからは、出さない", () => {
    expect(pickPreviousCoachQuestion({ reply: reply({ kind: "weekly" }), today: TODAY })).toBeNull();
  });

  it("今日の記入への返信・先の日付の返信からは、出さない（前回＝今日より前）", () => {
    expect(pickPreviousCoachQuestion({ reply: reply({ replyDate: TODAY }), today: TODAY })).toBeNull();
    expect(pickPreviousCoachQuestion({ reply: reply({ replyDate: "2026-01-08" }), today: TODAY })).toBeNull();
  });

  it(`${COACH_PREVIOUS_QUESTION_MAX_AGE_DAYS}日前までの返信は出し、それより前の返信は出さない`, () => {
    expect(COACH_PREVIOUS_QUESTION_MAX_AGE_DAYS).toBe(7);
    // 金曜の記入への返信は、月曜の朝に出る（3 日前）。
    expect(pickPreviousCoachQuestion({ reply: reply({ replyDate: "2026-01-04" }), today: TODAY })).not.toBeNull();
    expect(pickPreviousCoachQuestion({ reply: reply({ replyDate: "2025-12-31" }), today: TODAY })).not.toBeNull();
    expect(pickPreviousCoachQuestion({ reply: reply({ replyDate: "2025-12-30" }), today: TODAY })).toBeNull();
  });

  it("段落が 1 つだけの返信からは、出さない（問いの段落を分けていない）", () => {
    expect(pickPreviousCoachQuestion({ reply: reply({ content: "一段落だけの返信です。" }), today: TODAY })).toBeNull();
    expect(pickPreviousCoachQuestion({ reply: reply({ content: "" }), today: TODAY })).toBeNull();
  });

  it("最後の段落が長すぎる返信からは、出さない（途中で切った問いを見せない）", () => {
    const ok = "あ".repeat(COACH_PREVIOUS_QUESTION_MAX_CHARS);
    const tooLong = "あ".repeat(COACH_PREVIOUS_QUESTION_MAX_CHARS + 1);
    expect(pickPreviousCoachQuestion({ reply: reply({ content: `前の段落。\n\n${ok}` }), today: TODAY })?.text).toBe(ok);
    expect(pickPreviousCoachQuestion({ reply: reply({ content: `前の段落。\n\n${tooLong}` }), today: TODAY })).toBeNull();
  });

  it("日付の形が違うときは、出さない", () => {
    expect(pickPreviousCoachQuestion({ reply: reply({ replyDate: "きのう" }), today: TODAY })).toBeNull();
    expect(pickPreviousCoachQuestion({ reply: reply(), today: "" })).toBeNull();
  });
});

describe("daysBefore", () => {
  it("n 日前の日付を返す（月・年をまたぐ）", () => {
    expect(daysBefore("2026-01-07", 7)).toBe("2025-12-31");
    expect(daysBefore("2026-03-01", 1)).toBe("2026-02-28");
    expect(daysBefore("2026-01-07", 0)).toBe("2026-01-07");
  });

  it("形が違うときは空文字", () => {
    expect(daysBefore("2026/01/07", 1)).toBe("");
    expect(daysBefore("", 1)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 1 人分（入力画面）
// ---------------------------------------------------------------------------

function participantDeps(over: Partial<PreviousQuestionParticipantDeps> = {}) {
  const deps: PreviousQuestionParticipantDeps = {
    killSwitch: vi.fn(() => false),
    isFlagOn: vi.fn(async () => true),
    getActivation: vi.fn(async () => ({ ok: true as const, active: true })),
    getOptIn: vi.fn(async () => ({ ok: true as const, enabled: true as boolean | null })),
    getPreviousReply: vi.fn(async () => reply()),
    ...over,
  };
  return deps;
}

const ARGS = { participantId: P1, tenantId: TENANT, today: TODAY, profileUsable: true };

describe("loadPreviousCoachQuestion：入力画面に出す 1 人分", () => {
  it("すべての条件がそろうと、前回の問いを返す。前回の返信は、今日より前で引く", async () => {
    const deps = participantDeps();
    const q = await loadPreviousCoachQuestion(deps, ARGS);
    expect(q).toEqual({ text: "あした、だれに、何を確かめますか。", replyDate: "2026-01-06" });
    expect(deps.getPreviousReply).toHaveBeenCalledWith(P1, TENANT, TODAY);
  });

  it("設計図が確認済みでない人は、何も読まずに、出さない", async () => {
    const deps = participantDeps();
    expect(await loadPreviousCoachQuestion(deps, { ...ARGS, profileUsable: false })).toBeNull();
    expect(deps.isFlagOn).not.toHaveBeenCalled();
    expect(deps.getActivation).not.toHaveBeenCalled();
    expect(deps.getOptIn).not.toHaveBeenCalled();
    expect(deps.getPreviousReply).not.toHaveBeenCalled();
  });

  it("アプリ全体で止めているあいだは、何も読まずに、出さない", async () => {
    const deps = participantDeps({ killSwitch: vi.fn(() => true) });
    expect(await loadPreviousCoachQuestion(deps, ARGS)).toBeNull();
    expect(deps.isFlagOn).not.toHaveBeenCalled();
    expect(deps.getActivation).not.toHaveBeenCalled();
    expect(deps.getOptIn).not.toHaveBeenCalled();
    expect(deps.getPreviousReply).not.toHaveBeenCalled();
  });

  it("スイッチが OFF の環境では、出さない（環境の設定・受け取りの設定・返信を読まない）", async () => {
    const deps = participantDeps({ isFlagOn: vi.fn(async () => false) });
    expect(await loadPreviousCoachQuestion(deps, ARGS)).toBeNull();
    expect(deps.getActivation).not.toHaveBeenCalled();
    expect(deps.getOptIn).not.toHaveBeenCalled();
    expect(deps.getPreviousReply).not.toHaveBeenCalled();
  });

  // ここから下の 3 つの条件は、並べて読んでから確かめる。出せる形の返信が読めていても、
  // 条件に合わなければ返さないことを確かめる（participantDeps の既定は、出せる形の返信）。
  it("AIコーチの返信が動いていない環境・動いているかを読めなかった環境では、出さない（返信が読めていても）", async () => {
    const off = participantDeps({ getActivation: vi.fn(async () => ({ ok: true as const, active: false })) });
    expect(await loadPreviousCoachQuestion(off, ARGS)).toBeNull();

    const unknown = participantDeps({ getActivation: vi.fn(async () => ({ ok: false as const })) });
    expect(await loadPreviousCoachQuestion(unknown, ARGS)).toBeNull();
  });

  it("「受け取らない」にしている人・設定を読めなかった人・設計図の行が無い人には、出さない（返信が読めていても）", async () => {
    for (const optIn of [
      { ok: true as const, enabled: false as boolean | null },
      { ok: true as const, enabled: null as boolean | null },
      { ok: false as const },
    ]) {
      const deps = participantDeps({ getOptIn: vi.fn(async () => optIn) });
      expect(await loadPreviousCoachQuestion(deps, ARGS)).toBeNull();
    }
  });

  it("スイッチのあとの 3 つの読み取りは、並べて始める（1 つを待ってから次を始めない＝入力画面の待ち時間を足さない）", async () => {
    // 「AIコーチの返信が動いているか」の読み取りを、手で終わらせるまで終わらないようにする。
    let finishActivation: (v: { ok: true; active: boolean }) => void = () => {};
    const activationPending = new Promise<{ ok: true; active: boolean }>((resolve) => {
      finishActivation = resolve;
    });
    const deps = participantDeps({ getActivation: vi.fn(() => activationPending) });

    const pending = loadPreviousCoachQuestion(deps, ARGS);
    // スイッチの確認（非同期）が済むのを待つ。
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // 1 つ目が終わっていなくても、残りの 2 つは、すでに始まっている。
    expect(deps.getActivation).toHaveBeenCalledTimes(1);
    expect(deps.getOptIn).toHaveBeenCalledTimes(1);
    expect(deps.getPreviousReply).toHaveBeenCalledTimes(1);

    finishActivation({ ok: true, active: true });
    expect(await pending).toEqual({ text: "あした、だれに、何を確かめますか。", replyDate: "2026-01-06" });
  });

  it("前回の返信が無い・出せない形のときは、出さない", async () => {
    expect(await loadPreviousCoachQuestion(participantDeps({ getPreviousReply: vi.fn(async () => null) }), ARGS)).toBeNull();
    const old = participantDeps({ getPreviousReply: vi.fn(async () => reply({ replyDate: "2025-12-01" })) });
    expect(await loadPreviousCoachQuestion(old, ARGS)).toBeNull();
  });

  it("環境の ID・参加者の ID が空のときは、出さない", async () => {
    const deps = participantDeps();
    expect(await loadPreviousCoachQuestion(deps, { ...ARGS, tenantId: "" })).toBeNull();
    expect(await loadPreviousCoachQuestion(deps, { ...ARGS, participantId: "" })).toBeNull();
    expect(deps.getPreviousReply).not.toHaveBeenCalled();
  });

  it("読み取りで例外が出ても、外に出さない（入力画面を止めない）。例外の文は、呼び出し側に渡す", async () => {
    const deps = participantDeps({
      getPreviousReply: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const onError = vi.fn();
    expect(await loadPreviousCoachQuestion(deps, ARGS, onError)).toBeNull();
    expect(onError).toHaveBeenCalledWith("boom");
  });

  it("並べて読む 3 つの、どれで例外が出ても、外に出さない", async () => {
    const boom = async () => {
      throw new Error("boom");
    };
    for (const over of [
      { isFlagOn: vi.fn(boom) },
      { getActivation: vi.fn(boom) },
      { getOptIn: vi.fn(boom) },
      { getPreviousReply: vi.fn(boom) },
    ] as Array<Partial<PreviousQuestionParticipantDeps>>) {
      const onError = vi.fn();
      expect(await loadPreviousCoachQuestion(participantDeps(over), ARGS, onError)).toBeNull();
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith("boom");
    }
  });
});

// ---------------------------------------------------------------------------
// 環境の全員分（朝のリマインドメール）
// ---------------------------------------------------------------------------

function tenantDeps(over: Partial<PreviousQuestionTenantDeps> = {}) {
  const deps: PreviousQuestionTenantDeps = {
    killSwitch: vi.fn(() => false),
    isFlagOn: vi.fn(async () => true),
    getActivation: vi.fn(async () => ({ ok: true as const, active: true })),
    getOptedOutIds: vi.fn(async () => new Set<string>([P2])),
    getLatestReplies: vi.fn(
      async () =>
        new Map<string, CoachReply>([
          [P1, reply()],
          [P2, reply({ id: "r2" })],
          [P3, reply({ id: "r3", content: "一段落だけの返信です。" })],
        ])
    ),
    ...over,
  };
  return deps;
}

describe("loadPreviousCoachQuestionsForTenant：朝のメールに載せる、環境の全員分", () => {
  it("出せる人の分だけを返す。「受け取らない」の人と、出せない形の返信の人は入れない", async () => {
    const deps = tenantDeps();
    const map = await loadPreviousCoachQuestionsForTenant(deps, { tenantId: TENANT, today: TODAY });
    expect(Array.from(map.keys())).toEqual([P1]);
    expect(map.get(P1)).toEqual({ text: "あした、だれに、何を確かめますか。", replyDate: "2026-01-06" });
  });

  it("返信は、7 日前から、今日より前までの範囲で読む", async () => {
    const deps = tenantDeps();
    await loadPreviousCoachQuestionsForTenant(deps, { tenantId: TENANT, today: TODAY });
    expect(deps.getLatestReplies).toHaveBeenCalledWith(TENANT, "2025-12-31", TODAY);
  });

  it("アプリ全体の停止・スイッチ OFF・AIコーチの返信が動いていない環境では、何も読まずに、空を返す", async () => {
    for (const over of [
      { killSwitch: vi.fn(() => true) },
      { isFlagOn: vi.fn(async () => false) },
      { getActivation: vi.fn(async () => ({ ok: true as const, active: false })) },
      { getActivation: vi.fn(async () => ({ ok: false as const })) },
    ]) {
      const deps = tenantDeps(over);
      const map = await loadPreviousCoachQuestionsForTenant(deps, { tenantId: TENANT, today: TODAY });
      expect(map.size).toBe(0);
      expect(deps.getOptedOutIds).not.toHaveBeenCalled();
      expect(deps.getLatestReplies).not.toHaveBeenCalled();
    }
  });

  it("受け取らない人の一覧を読めなかったときは、だれの分も返さない（受け取らない人に、誤って載せない）", async () => {
    const deps = tenantDeps({ getOptedOutIds: vi.fn(async () => null) });
    const onError = vi.fn();
    expect((await loadPreviousCoachQuestionsForTenant(deps, { tenantId: TENANT, today: TODAY }, onError)).size).toBe(0);
    // 例外に頼らず、読めなかったことを見て、止めている。
    expect(onError).not.toHaveBeenCalled();
  });

  it("返信を読めなかったときは、空を返す", async () => {
    const deps = tenantDeps({ getLatestReplies: vi.fn(async () => null) });
    expect((await loadPreviousCoachQuestionsForTenant(deps, { tenantId: TENANT, today: TODAY })).size).toBe(0);
  });

  it("読み取りで例外が出ても、外に出さない（朝のメールを止めない）", async () => {
    const deps = tenantDeps({
      getLatestReplies: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    const onError = vi.fn();
    const map = await loadPreviousCoachQuestionsForTenant(deps, { tenantId: TENANT, today: TODAY }, onError);
    expect(map.size).toBe(0);
    expect(onError).toHaveBeenCalledWith("boom");
  });

  it("今日の日付の形が違うときは、空を返す", async () => {
    const deps = tenantDeps();
    expect((await loadPreviousCoachQuestionsForTenant(deps, { tenantId: TENANT, today: "today" })).size).toBe(0);
    expect(deps.getLatestReplies).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 朝のメール
// ---------------------------------------------------------------------------

const PROFILE: CoachingProfile = {
  headline: "最初に、相手の困りごとを一つ聞く",
  growthTheme: "",
  actions: "",
  expected: "",
  stallPoints: "",
  eveningQuestion: "",
  tendencies: [],
  status: "confirmed",
  confirmedAt: "2026-01-05T00:00:00Z",
  history: [],
} as unknown as CoachingProfile;

const DRAFT = { ...PROFILE, status: "draft", confirmedAt: null } as unknown as CoachingProfile;
const PROFILE_URL = "https://example.test/p/tok_synthetic/blueprint";
const COACH_Q = { label: previousQuestionMailLabel("2026-01-06"), text: "あした、だれに、何を確かめますか。" };

describe("previousQuestionMailLabel：メールの見出し", () => {
  it("どの日の記入への返信かを添える", () => {
    expect(previousQuestionMailLabel("2026-01-06")).toBe("前回のAIコーチの問い（1/6 の記入への返信から）");
    expect(COACH_TERMS.previousQuestionLabel).toBe("前回のAIコーチの問い");
  });
});

describe("buildReminderPersonal：前回の問いを載せる条件", () => {
  const base = { profile: PROFILE, issue: null, profileUrl: PROFILE_URL };

  it("朝・確認済みの人には、前回の問いを載せる", () => {
    const p = buildReminderPersonal({ ...base, type: "morning", coachQuestion: COACH_Q });
    expect(p.coachQuestion).toEqual(COACH_Q);
  });

  it("前回の問いが無い・空のときは、キーごと無い（これまでと同じ値）", () => {
    const without = buildReminderPersonal({ ...base, type: "morning" });
    expect("coachQuestion" in without).toBe(false);
    expect(buildReminderPersonal({ ...base, type: "morning", coachQuestion: null })).toEqual(without);
    expect(buildReminderPersonal({ ...base, type: "morning", coachQuestion: { ...COACH_Q, text: "  " } })).toEqual(
      without
    );
  });

  it("設計図が確認前の人には、載せない（確認のお願いだけ）", () => {
    const p = buildReminderPersonal({ ...base, profile: DRAFT, type: "morning", coachQuestion: COACH_Q });
    expect("coachQuestion" in p).toBe(false);
    expect(p.confirmPrompt).toBe(true);
  });

  it("夕方のメールには、載せない", () => {
    for (const type of ["evening", "evening_no_morning"] as const) {
      const p = buildReminderPersonal({ ...base, type, coachQuestion: COACH_Q });
      expect("coachQuestion" in p).toBe(false);
    }
  });
});

describe("buildQuestionReminderEmail：前回の問いの枠", () => {
  const Q = ["今日は、どの場面で、何をしますか。"];
  const mail = (personal: Parameters<typeof buildQuestionReminderEmail>[0]["personal"]) =>
    buildQuestionReminderEmail({
      type: "morning",
      name: "見本",
      url: "https://example.test/p/tok_synthetic/input",
      questions: Q,
      morningCloseHour: 14,
      personal,
    });
  const lines = [{ label: "毎朝の一文", value: "最初に、相手の困りごとを一つ聞く" }];
  const basePersonal = { lines, personalQuestion: null, confirmPrompt: false, profileUrl: PROFILE_URL };

  it("前回の問いがあるときは、「あなたの設計図から」の枠の下に、見出しと問いを載せる", () => {
    const html = mail({ ...basePersonal, coachQuestion: COACH_Q }).html;
    expect(html).toContain("前回のAIコーチの問い（1/6 の記入への返信から）");
    expect(html).toContain("あした、だれに、何を確かめますか。");
    expect(html.indexOf("あなたの設計図から")).toBeLessThan(html.indexOf("前回のAIコーチの問い"));
  });

  it("前回の問いが無いときの HTML は、これまでと同じ", () => {
    const before = mail(basePersonal).html;
    expect(before).not.toContain("前回のAIコーチの問い");
    expect(mail({ ...basePersonal, coachQuestion: { label: "見出し", text: "   " } }).html).toBe(before);
  });

  it("問いの文は無害化し、改行は改行として出す。リンクは足さない", () => {
    const html = mail({
      ...basePersonal,
      coachQuestion: { label: "見出し<b>", text: "一行目<script>alert(1)</script>\n二行目" },
    }).html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("一行目&lt;script&gt;alert(1)&lt;/script&gt;<br>二行目");
    expect(html).toContain("見出し&lt;b&gt;");
    const withQ = mail({ ...basePersonal, coachQuestion: COACH_Q }).html;
    expect((withQ.match(/href=/g) || []).length).toBe((mail(basePersonal).html.match(/href=/g) || []).length);
  });

  it("その人の行が無いメール（確認前の人）には、枠を出さない", () => {
    const html = mail({ lines: [], personalQuestion: null, confirmPrompt: true, profileUrl: PROFILE_URL, coachQuestion: COACH_Q }).html;
    expect(html).not.toContain("前回のAIコーチの問い");
  });
});

// ---------------------------------------------------------------------------
// スイッチ
// ---------------------------------------------------------------------------

describe("feature.coachPreviousQuestion：スイッチ", () => {
  const flag = FEATURE_CATALOG.find((f) => f.key === "feature.coachPreviousQuestion");

  it("一覧にあり、既定は OFF。AIコーチの返信のスイッチに付く", () => {
    expect(flag).toBeDefined();
    expect(flag!.defaultEnabled).toBe(false);
    expect(flag!.phase1Enabled).toBe(false);
    expect(flag!.implemented).toBe(true);
    expect(flag!.category).toBe("existing");
    expect(flag!.dependencies).toEqual(["feature.coachReply"]);
  });

  it("「全機能ON」のプリセットを当てただけでは、ON にならない", () => {
    const full = PRESETS.find((p) => p.id === "full");
    expect(full).toBeDefined();
    expect(full!.getFlags()["feature.coachPreviousQuestion"]).toBe(false);
  });

  it("説明に、新しく AI に送るものは無いことを書いている", () => {
    expect(flag!.description).toContain("新しくAIに送るものは無い");
  });

  it("出す期間と長さの上限の値。機能の説明に書いた日数と、決まりの値が合っている", () => {
    // 値を変えるときは、機能の説明（feature-flags.ts）と、CLAUDE.md §5 も同じ変更で直す。
    expect(COACH_PREVIOUS_QUESTION_MAX_AGE_DAYS).toBe(7);
    expect(COACH_PREVIOUS_QUESTION_MAX_CHARS).toBe(200);
    expect(flag!.description).toContain(`${COACH_PREVIOUS_QUESTION_MAX_AGE_DAYS}日より前の返信の問いは出さない`);
  });

  it("参加者に見せる説明の 1 行は、行っていることだけを書く（何行で・いつまで、は書かない）", () => {
    const line = COACH_TERMS.aboutLinePreviousQuestion;
    expect(line).toContain("朝のリマインドメール");
    expect(line).toContain("記入画面");
    expect(line).toContain("「受け取らない」にしているあいだは、出ません。");
    // 問いは 200 字までで、1 行とは限らない。次の返信が届くか、7 日たつまで出る。
    expect(line).not.toMatch(/[0-9０-９一二三四五六七八九十]+\s*行/);
    expect(line).not.toContain("次の朝");
  });
});
