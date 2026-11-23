import { describe, it, expect } from "vitest";
import {
  COACH_BOARD_TERMS,
  COACH_TERMS,
  coachBoardRole,
  coachBoardState,
  decideCoachAction,
  decideCoachEligibility,
  formatJstDateTime,
  formatReplyDate,
  nextDate,
  normalizeBoardDate,
  parseCoachConfig,
  previousDate,
  sortCoachBoard,
  toParticipantView,
  type CoachBoardState,
  type CoachDayLog,
  type CoachReply,
} from "./coach-reply";
import type { CoachingProfile } from "./coaching-profile";

// テストの文は合成データ（実在の記入・実在の人物の記述は使わない）。
const profile: CoachingProfile = {
  headline: "会議の前に、相手に聞く問いを1つ決める",
  growthTheme: "自分の答えを先に言ってしまう",
  actions: "週次の会議で、最初に相手の見方を聞く",
  expected: "相手から、知らなかった事実が出る",
  stallPoints: "時間が足りないとき",
  eveningQuestion: "今日、相手の見方を先に聞けた場面はどこでしたか。",
  tendencies: [
    { text: "抽象的な言葉で終わる", use: true },
    { text: "行動が遅い", use: false },
    { text: "一般論で終わる", use: null },
  ],
  status: "confirmed",
  confirmedAt: "2026-01-05T00:00:00.000Z",
  updatedAt: "2026-01-05T00:00:00.000Z",
};

const log: CoachDayLog = {
  id: "log-1",
  date: "2026-01-06",
  morningIntent: "Q1: 今日は、どの場面で、何をしますか。\nA1: 週次の会議で、最初に見方を聞く",
  eveningInsight: "Q1: 何をして、何が起きましたか。\nA1: 最初に聞いたら「在庫の数字が合わない」と言われた",
  phaseMode: "dojo",
};

const baseArgs = {
  killSwitch: false,
  flagsOn: true,
  standalone: false,
  profile,
  coachEnabled: true,
  log,
  today: "2026-01-06",
  yesterday: "2026-01-05",
  startDate: null as string | null,
};

describe("parseCoachConfig", () => {
  it("設定が無い・読めないときは null（その環境では、返信を作らない）", () => {
    for (const raw of [undefined, null, "", "   ", "{not json", 3, "[]", [], {}]) {
      expect(parseCoachConfig(raw)).toBeNull();
    }
  });

  it("届け方と開始日を読む（文字列でも、オブジェクトでも）", () => {
    const expected = { deliveryMode: "auto", startDate: "2026-01-06" };
    expect(parseCoachConfig('{"deliveryMode":"auto","startDate":"2026-01-06"}')).toEqual(expected);
    expect(parseCoachConfig({ deliveryMode: "auto", startDate: "2026-01-06" })).toEqual(expected);
    expect(parseCoachConfig('{"deliveryMode":"review"}')).toEqual({ deliveryMode: "review", startDate: null });
    expect(parseCoachConfig({ deliveryMode: "review", startDate: null })).toEqual({
      deliveryMode: "review",
      startDate: null,
    });
  });

  it("形が少しでも違う設定は null にする（近い設定に読み替えて動かさない）", () => {
    // 届け方の綴りの誤り
    expect(parseCoachConfig({ deliveryMode: "AUTO" })).toBeNull();
    expect(parseCoachConfig({ deliveryMode: "atuo", startDate: "2026-01-06" })).toBeNull();
    expect(parseCoachConfig({ startDate: "2026-01-06" })).toBeNull();
    // 開始日の形の誤り（「制限なし」と読むと、意図より前の記入に返してしまう）
    expect(parseCoachConfig({ deliveryMode: "review", startDate: "1/6" })).toBeNull();
    expect(parseCoachConfig({ deliveryMode: "review", startDate: "2026/01/06" })).toBeNull();
    expect(parseCoachConfig({ deliveryMode: "review", startDate: 20260106 })).toBeNull();
    expect(parseCoachConfig({ deliveryMode: "review", startDate: "" })).toBeNull();
  });
});

describe("decideCoachEligibility", () => {
  it("条件がそろえば、返してよい（今日の記入、前日の記入）", () => {
    expect(decideCoachEligibility(baseArgs)).toEqual({ ok: true });
    expect(decideCoachEligibility({ ...baseArgs, log: { ...log, date: "2026-01-05" } })).toEqual({ ok: true });
  });

  it("止める設定・スイッチ・商品モードを、先に見る", () => {
    expect(decideCoachEligibility({ ...baseArgs, killSwitch: true })).toEqual({ ok: false, reason: "kill_switch" });
    expect(decideCoachEligibility({ ...baseArgs, flagsOn: false })).toEqual({ ok: false, reason: "flag_off" });
    expect(decideCoachEligibility({ ...baseArgs, standalone: true })).toEqual({ ok: false, reason: "standalone" });
  });

  it("設計図が無い・確認前・毎朝の一文が空の人には、返さない", () => {
    expect(decideCoachEligibility({ ...baseArgs, profile: null })).toEqual({ ok: false, reason: "no_profile" });
    expect(decideCoachEligibility({ ...baseArgs, profile: { ...profile, status: "draft" } })).toEqual({
      ok: false,
      reason: "no_profile",
    });
    expect(decideCoachEligibility({ ...baseArgs, profile: { ...profile, headline: "" } })).toEqual({
      ok: false,
      reason: "no_profile",
    });
  });

  it("本人が受け取りを切っているときは、返さない", () => {
    expect(decideCoachEligibility({ ...baseArgs, coachEnabled: false })).toEqual({ ok: false, reason: "opted_out" });
  });

  it("夕方の文が無い記入には、返さない（記入が無い、朝だけ、文が空白だけ）", () => {
    expect(decideCoachEligibility({ ...baseArgs, log: null })).toEqual({ ok: false, reason: "no_evening_entry" });
    for (const eveningInsight of ["", "  \n "]) {
      expect(decideCoachEligibility({ ...baseArgs, log: { ...log, eveningInsight } })).toEqual({
        ok: false,
        reason: "no_evening_entry",
      });
    }
  });

  it("観の期の記入には、返さない", () => {
    expect(decideCoachEligibility({ ...baseArgs, log: { ...log, phaseMode: "kan-no-ki" } })).toEqual({
      ok: false,
      reason: "kan_no_ki",
    });
  });

  it("今日と前日より前の記入、開始日より前の記入には、返さない", () => {
    expect(decideCoachEligibility({ ...baseArgs, log: { ...log, date: "2026-01-04" } })).toEqual({
      ok: false,
      reason: "too_old",
    });
    expect(
      decideCoachEligibility({ ...baseArgs, log: { ...log, date: "2026-01-05" }, startDate: "2026-01-06" })
    ).toEqual({ ok: false, reason: "before_start" });
    expect(decideCoachEligibility({ ...baseArgs, startDate: "2026-01-06" })).toEqual({ ok: true });
  });
});

describe("previousDate", () => {
  it("前日を返す（月と年の変わり目も）", () => {
    expect(previousDate("2026-01-06")).toBe("2026-01-05");
    expect(previousDate("2026-03-01")).toBe("2026-02-28");
    expect(previousDate("2026-01-01")).toBe("2025-12-31");
  });

  it("形が違うときは空文字", () => {
    expect(previousDate("2026/01/06")).toBe("");
    expect(previousDate("")).toBe("");
  });
});

describe("toParticipantView", () => {
  const base: CoachReply = {
    id: "r-1",
    replyDate: "2026-01-06",
    kind: "daily",
    content: "問いです。",
    status: "delivered",
    createdAt: "2026-01-06T09:00:00.000Z",
  };

  it("届いた返信だけ、文を返す", () => {
    expect(toParticipantView(base)).toEqual({ state: "delivered", replyDate: "2026-01-06", content: "問いです。" });
  });

  it("確認待ちの文は、本人に返さない", () => {
    const view = toParticipantView({ ...base, status: "pending_review" });
    expect(view).toEqual({ state: "pending", replyDate: "2026-01-06" });
    expect(JSON.stringify(view)).not.toContain("問いです。");
    expect(toParticipantView({ ...base, status: "pending_review", content: "" })).toEqual({
      state: "pending",
      replyDate: "2026-01-06",
    });
  });

  it("取り下げた返信、返信が無いときは、何も出さない", () => {
    expect(toParticipantView({ ...base, status: "withdrawn" })).toEqual({ state: "none" });
    expect(toParticipantView({ ...base, content: "  " })).toEqual({ state: "none" });
    expect(toParticipantView(null)).toEqual({ state: "none" });
  });
});

describe("coachBoardRole（確認ページを読める人）", () => {
  it("管理者（is_admin）は admin。role の文字列には頼らない", () => {
    expect(coachBoardRole({ isAdmin: true, role: "manager" })).toBe("admin");
    expect(coachBoardRole({ isAdmin: true, role: "admin" })).toBe("admin");
  });

  it("閲覧者と、is_admin でない role=admin は viewer（操作はできない）", () => {
    expect(coachBoardRole({ isAdmin: false, role: "observer" })).toBe("viewer");
    expect(coachBoardRole({ isAdmin: false, role: "admin" })).toBe("viewer");
    expect(coachBoardRole({ role: "observer" })).toBe("viewer");
  });

  it("上司の画面のトークンと、知らないトークンは読めない", () => {
    expect(coachBoardRole({ isAdmin: false, role: "manager" })).toBeNull();
    expect(coachBoardRole({ isAdmin: null, role: null })).toBeNull();
    expect(coachBoardRole(null)).toBeNull();
    expect(coachBoardRole(undefined)).toBeNull();
  });
});

describe("decideCoachAction（届ける・取り下げる）", () => {
  it("届けるのは、確認待ちで、返信の文があるものだけ", () => {
    expect(decideCoachAction("deliver", { status: "pending_review", hasContent: true })).toEqual({
      ok: true,
      next: "delivered",
    });
    expect(decideCoachAction("deliver", { status: "pending_review", hasContent: false })).toEqual({
      ok: false,
      reason: "no_content",
    });
    expect(decideCoachAction("deliver", { status: "delivered", hasContent: true })).toEqual({
      ok: false,
      reason: "not_pending",
    });
  });

  it("取り下げた返信は、もう一度届けられない", () => {
    expect(decideCoachAction("deliver", { status: "withdrawn", hasContent: true })).toEqual({
      ok: false,
      reason: "not_pending",
    });
  });

  it("取り下げは、確認待ち（文の有無を問わない）と、届いたものにできる", () => {
    expect(decideCoachAction("withdraw", { status: "pending_review", hasContent: true })).toEqual({
      ok: true,
      next: "withdrawn",
    });
    expect(decideCoachAction("withdraw", { status: "pending_review", hasContent: false })).toEqual({
      ok: true,
      next: "withdrawn",
    });
    expect(decideCoachAction("withdraw", { status: "delivered", hasContent: true })).toEqual({
      ok: true,
      next: "withdrawn",
    });
    expect(decideCoachAction("withdraw", { status: "withdrawn", hasContent: true })).toEqual({
      ok: false,
      reason: "already_withdrawn",
    });
  });
});

describe("coachBoardState（確認ページの 1 行の状態）", () => {
  const row = {
    evening: "最初に聞いたら「在庫の数字が合わない」と言われた",
    profileStatus: "confirmed" as const,
    coachEnabled: true,
    reply: null as { status: CoachReply["status"]; content: string } | null,
  };

  it("返信があるときは、返信の状態で決まる", () => {
    expect(coachBoardState({ ...row, reply: { status: "delivered", content: "問いです。" } })).toBe("delivered");
    expect(coachBoardState({ ...row, reply: { status: "withdrawn", content: "問いです。" } })).toBe("withdrawn");
    expect(coachBoardState({ ...row, reply: { status: "pending_review", content: "問いです。" } })).toBe("pending");
  });

  it("確認待ちで文が無い返信は、確認が必要", () => {
    expect(coachBoardState({ ...row, reply: { status: "pending_review", content: "" } })).toBe("needs_attention");
    expect(coachBoardState({ ...row, reply: { status: "pending_review", content: "  \n" } })).toBe("needs_attention");
  });

  it("返信が無いときは、返していない理由を、記入 → 設計図 → 本人の設定の順に見る", () => {
    expect(coachBoardState({ ...row, evening: "  " })).toBe("no_evening");
    expect(coachBoardState({ ...row, profileStatus: "draft" })).toBe("no_profile");
    expect(coachBoardState({ ...row, profileStatus: "none" })).toBe("no_profile");
    expect(coachBoardState({ ...row, coachEnabled: false })).toBe("opted_out");
    expect(coachBoardState(row)).toBe("not_generated");
    // 夕方の記入が無い人は、設計図や設定がどうであっても「夕方の記入なし」
    expect(coachBoardState({ ...row, evening: "", profileStatus: "none", coachEnabled: false })).toBe("no_evening");
  });

  it("どの状態にも、画面の呼び名がある", () => {
    const states: CoachBoardState[] = [
      "needs_attention",
      "pending",
      "not_generated",
      "delivered",
      "withdrawn",
      "opted_out",
      "no_profile",
      "no_evening",
    ];
    for (const s of states) {
      expect(COACH_BOARD_TERMS.stateLabels[s].length).toBeGreaterThan(0);
    }
  });
});

describe("sortCoachBoard", () => {
  it("先に見てほしい状態が上。同じ状態の中は、渡された順のまま", () => {
    const rows: Array<{ name: string; state: CoachBoardState }> = [
      { name: "a", state: "no_evening" },
      { name: "b", state: "delivered" },
      { name: "c", state: "pending" },
      { name: "d", state: "needs_attention" },
      { name: "e", state: "pending" },
      { name: "f", state: "not_generated" },
    ];
    expect(sortCoachBoard(rows, (r) => r.state).map((r) => r.name)).toEqual(["d", "c", "e", "f", "b", "a"]);
    // 元の配列は変えない
    expect(rows[0].name).toBe("a");
  });
});

describe("normalizeBoardDate / nextDate", () => {
  const today = "2026-01-06";

  it("形が正しく、今日以前の日付は、そのまま使う", () => {
    expect(normalizeBoardDate("2026-01-05", today)).toBe("2026-01-05");
    expect(normalizeBoardDate("2026-01-06", today)).toBe(today);
    expect(normalizeBoardDate("2025-12-31", today)).toBe("2025-12-31");
  });

  it("今日より先の日付、形が違う値、暦に無い日付は、今日にする", () => {
    expect(normalizeBoardDate("2026-01-07", today)).toBe(today);
    expect(normalizeBoardDate("2026-1-5", today)).toBe(today);
    expect(normalizeBoardDate("2025-02-31", today)).toBe(today);
    expect(normalizeBoardDate("2025-13-01", today)).toBe(today);
    expect(normalizeBoardDate("", today)).toBe(today);
    expect(normalizeBoardDate(null, today)).toBe(today);
    expect(normalizeBoardDate("2026-01-05' or '1'='1", today)).toBe(today);
  });

  it("翌日は、月と年をまたいで数える", () => {
    expect(nextDate("2026-01-06")).toBe("2026-01-07");
    expect(nextDate("2026-01-31")).toBe("2026-02-01");
    expect(nextDate("2025-12-31")).toBe("2026-01-01");
    expect(nextDate("2028-02-28")).toBe("2028-02-29");
    expect(nextDate("x")).toBe("");
    // 前日と翌日は、たがいに戻る
    expect(previousDate(nextDate("2026-03-01"))).toBe("2026-03-01");
  });
});

describe("formatReplyDate / formatJstDateTime", () => {
  it("日付は「月/日」で出す。読めない値はそのまま", () => {
    expect(formatReplyDate("2026-01-06")).toBe("1/6");
    expect(formatReplyDate("2026-11-22")).toBe("11/22");
    expect(formatReplyDate("きのう")).toBe("きのう");
  });

  it("日時は、日本時間の「月/日 時:分」で出す（日付の変わり目をまたぐ）", () => {
    expect(formatJstDateTime("2026-01-06T09:05:00.000Z")).toBe("1/6 18:05");
    expect(formatJstDateTime("2026-01-06T15:00:00.000Z")).toBe("1/7 00:00");
    expect(formatJstDateTime("2025-12-31T16:30:00.000Z")).toBe("1/1 01:30");
  });

  it("読めない値は空文字", () => {
    expect(formatJstDateTime(null)).toBe("");
    expect(formatJstDateTime("")).toBe("");
    expect(formatJstDateTime("not a date")).toBe("");
  });
});

describe("COACH_TERMS（参加者に見える文）", () => {
  const all = [
    // 文字列、文字列の並び（説明文）、日付を受け取って文を返すもの（"11/24" を入れて確かめる）。
    ...Object.values(COACH_TERMS).flatMap((v) =>
      typeof v === "string" ? [v] : typeof v === "function" ? [v("11/24")] : [...v]
    ),
    ...Object.values(COACH_BOARD_TERMS).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v))),
  ];

  it("使わないと決めている言葉が入っていない", () => {
    for (const text of all) {
      expect(text).not.toMatch(/育てる|育成|実験/);
    }
  });

  it("説明文は、決まっていないこと（評価への利用、消し方、保存の期間）を約束しない", () => {
    for (const line of [...COACH_TERMS.aboutLines, COACH_TERMS.aboutLinePreviousQuestion]) {
      expect(line).not.toMatch(/評価に(は)?使いません|削除|消去|消せます|保存期間|学習に(は)?使われません/);
    }
  });

  it("説明文は、AI に送るものと、送らないものを書いている", () => {
    const about = COACH_TERMS.aboutLines.join("\n");
    for (const word of ["朝と夕方の記入", "設計図", "仮説", "前回のAIコーチの問い", "氏名とメールアドレス"]) {
      expect(about).toContain(word);
    }
  });
});
