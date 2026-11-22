import { describe, it, expect } from "vitest";
import {
  ADMIN_DAY_LOG_OPEN_MIN_DAYS,
  ADMIN_DAY_LOG_TERMS,
  buildAdminDayLogViews,
  countMonthsOpenByDefault,
  formatDayHeading,
  groupDayLogsByMonth,
  monthKeyOf,
  monthLabel,
  toAdminCoachReplyView,
  toEntryBlock,
  type AdminDayLogSource,
} from "./admin-day-log";
import { combineQuestionAnswers } from "./daily-question-answers";
import { COACH_BOARD_TERMS } from "./coach-reply";

// テストのデータは合成（実在の環境・人物・記入は使わない）。

function day(partial: Partial<AdminDayLogSource> & { id: string; date: string }): AdminDayLogSource {
  return { status: "morning_only", ...partial };
}

describe("toEntryBlock（記入の文を、表示の形にする）", () => {
  it("問いと答えの形で保存された文は、問いと答えの組に分ける", () => {
    const saved = combineQuestionAnswers(["合成の問い1", "合成の問い2"], ["合成の答え1", "合成の答え2"]);
    expect(toEntryBlock(saved)).toEqual({
      kind: "qa",
      pairs: [
        { question: "合成の問い1", answer: "合成の答え1" },
        { question: "合成の問い2", answer: "合成の答え2" },
      ],
    });
  });

  it("答えの無い問いも、組として残す（どの問いに答えていないかが分かる）", () => {
    const saved = combineQuestionAnswers(["合成の問い1", "合成の問い2"], ["合成の答え1", ""]);
    const block = toEntryBlock(saved);
    expect(block?.kind).toBe("qa");
    if (block?.kind !== "qa") return;
    expect(block.pairs).toHaveLength(2);
    expect(block.pairs[1]).toEqual({ question: "合成の問い2", answer: "" });
  });

  it("その形でない文（自由記入）は、保存した文のまま（改行も残す）", () => {
    expect(toEntryBlock("合成の自由記入\n2 行目")).toEqual({ kind: "text", text: "合成の自由記入\n2 行目" });
  });

  it("空・空白だけ・値なしは null", () => {
    expect(toEntryBlock("")).toBeNull();
    expect(toEntryBlock("  \n ")).toBeNull();
    expect(toEntryBlock(null)).toBeNull();
    expect(toEntryBlock(undefined)).toBeNull();
  });
});

describe("toAdminCoachReplyView（運営の画面での、返信の状態）", () => {
  it("届いた返信は delivered", () => {
    expect(toAdminCoachReplyView({ replyDate: "2026-01-15", status: "delivered", content: "合成の返信" })).toEqual({
      state: "delivered",
      content: "合成の返信",
    });
  });

  it("確認待ちで、文があるものは pending", () => {
    expect(toAdminCoachReplyView({ replyDate: "2026-01-15", status: "pending_review", content: "合成の返信" })?.state).toBe(
      "pending"
    );
  });

  it("確認待ちで、文が無いもの（返信を作っていない）は needs_attention", () => {
    expect(toAdminCoachReplyView({ replyDate: "2026-01-15", status: "pending_review", content: "" })).toEqual({
      state: "needs_attention",
      content: "",
    });
    expect(toAdminCoachReplyView({ replyDate: "2026-01-15", status: "pending_review", content: "  " })?.state).toBe(
      "needs_attention"
    );
  });

  it("取り下げ済みは withdrawn", () => {
    expect(toAdminCoachReplyView({ replyDate: "2026-01-15", status: "withdrawn", content: "合成の返信" })?.state).toBe(
      "withdrawn"
    );
  });

  it("知らない状態・値なしは null（出さない）", () => {
    expect(toAdminCoachReplyView({ replyDate: "2026-01-15", status: "something_else", content: "x" })).toBeNull();
    expect(toAdminCoachReplyView(null)).toBeNull();
    expect(toAdminCoachReplyView(undefined)).toBeNull();
  });

  it("状態の呼び名は、「AIコーチの確認」のページと同じ表（COACH_BOARD_TERMS.stateLabels）にある", () => {
    for (const state of ["delivered", "pending", "needs_attention", "withdrawn"] as const) {
      expect(typeof COACH_BOARD_TERMS.stateLabels[state]).toBe("string");
      expect(COACH_BOARD_TERMS.stateLabels[state]).not.toBe("");
    }
  });
});

describe("日付の出し方", () => {
  it("「2026-01-15」と曜日から、「1月15日（木）」", () => {
    expect(formatDayHeading("2026-01-15", "木")).toBe("1月15日（木）");
  });

  it("曜日が渡されないときは、日付から求める（時間帯に左右されない）", () => {
    expect(formatDayHeading("2026-01-15")).toBe("1月15日（木）");
    expect(formatDayHeading("2026-01-18", null)).toBe("1月18日（日）");
    expect(formatDayHeading("2026-03-01", "")).toBe("3月1日（日）");
  });

  it("日付の形でない値は、そのまま返す", () => {
    expect(formatDayHeading("日付なし")).toBe("日付なし");
    expect(formatDayHeading("")).toBe("");
  });

  it("月のキーと、月の呼び名", () => {
    expect(monthKeyOf("2026-01-15")).toBe("2026-01");
    expect(monthKeyOf("x")).toBe("");
    expect(monthLabel("2026-01")).toBe("2026年1月");
    expect(monthLabel("2025-12")).toBe("2025年12月");
    expect(monthLabel("")).toBe("日付なし");
  });
});

describe("buildAdminDayLogViews（記入と返信を、1 日ごとにまとめる）", () => {
  it("並びは、渡された記入の順のまま", () => {
    const views = buildAdminDayLogViews(
      [day({ id: "b", date: "2026-01-16" }), day({ id: "a", date: "2026-01-15" })],
      null
    );
    expect(views.map((v) => v.id)).toEqual(["b", "a"]);
    expect(views[0].heading).toBe("1月16日（金）");
    expect(views[0].monthKey).toBe("2026-01");
  });

  it("朝・夕の記入を表示の形にし、空の欄は null にする", () => {
    const [view] = buildAdminDayLogViews(
      [
        day({
          id: "a",
          date: "2026-01-15",
          status: "complete",
          energy: "good",
          morningIntent: "合成の朝",
          eveningInsight: "",
          morningTime: "2026-01-15T00:10:00Z",
          eveningTime: null,
          managerComment: "  ",
        }),
      ],
      []
    );
    expect(view.status).toBe("complete");
    expect(view.energy).toBe("good");
    expect(view.morning).toEqual({ kind: "text", text: "合成の朝" });
    expect(view.evening).toBeNull();
    expect(view.morningTime).toBe("2026-01-15T00:10:00Z");
    expect(view.eveningTime).toBeNull();
    expect(view.managerComment).toBeNull();
    expect(view.coachReply).toBeNull();
  });

  it("返信は、日付で、その日の記入に結ぶ", () => {
    const views = buildAdminDayLogViews(
      [day({ id: "b", date: "2026-01-16" }), day({ id: "a", date: "2026-01-15" })],
      [{ replyDate: "2026-01-15", kind: "daily", status: "delivered", content: "合成の返信" }]
    );
    expect(views[0].coachReply).toBeNull();
    expect(views[1].coachReply).toEqual({ state: "delivered", content: "合成の返信" });
  });

  it("毎日の返信（daily、または種類の指定なし）だけを結ぶ。ほかの種類（週のまとめ など）は結ばない", () => {
    const logs = [day({ id: "a", date: "2026-01-15" })];
    expect(
      buildAdminDayLogViews(logs, [{ replyDate: "2026-01-15", kind: "weekly", status: "delivered", content: "合成の週のまとめ" }])[0]
        .coachReply
    ).toBeNull();
    expect(
      buildAdminDayLogViews(logs, [{ replyDate: "2026-01-15", status: "delivered", content: "合成の返信" }])[0].coachReply
    ).toEqual({ state: "delivered", content: "合成の返信" });
  });

  it("同じ日の返信が 2 件あっても、先に渡されたもの（新しいもの）だけを使う", () => {
    const [view] = buildAdminDayLogViews(
      [day({ id: "a", date: "2026-01-15" })],
      [
        { replyDate: "2026-01-15", kind: "daily", status: "delivered", content: "合成の新しい返信" },
        { replyDate: "2026-01-15", kind: "daily", status: "withdrawn", content: "合成の古い返信" },
      ]
    );
    expect(view.coachReply).toEqual({ state: "delivered", content: "合成の新しい返信" });
  });

  it("記入の無い日の返信は、どこにも出ない（記入の行に結ぶだけ）", () => {
    const views = buildAdminDayLogViews(
      [day({ id: "a", date: "2026-01-15" })],
      [{ replyDate: "2026-01-14", kind: "daily", status: "delivered", content: "合成の返信" }]
    );
    expect(views).toHaveLength(1);
    expect(views[0].coachReply).toBeNull();
  });

  it("記入が無ければ、空の配列", () => {
    expect(buildAdminDayLogViews([], null)).toEqual([]);
  });
});

describe("groupDayLogsByMonth（月ごとにまとめる）", () => {
  it("月ごとにまとめ、月の並びも、月の中の日の並びも、渡された順のまま", () => {
    const views = buildAdminDayLogViews(
      [
        day({ id: "c", date: "2026-02-02" }),
        day({ id: "b", date: "2026-01-16" }),
        day({ id: "a", date: "2026-01-15" }),
      ],
      null
    );
    const months = groupDayLogsByMonth(views);
    expect(months.map((m) => m.label)).toEqual(["2026年2月", "2026年1月"]);
    expect(months[1].days.map((d) => d.id)).toEqual(["b", "a"]);
  });

  it("日付の形でない記入は、「日付なし」にまとめる", () => {
    const months = groupDayLogsByMonth(buildAdminDayLogViews([day({ id: "x", date: "" })], null));
    expect(months).toHaveLength(1);
    expect(months[0].label).toBe("日付なし");
  });

  it("記入が無ければ、空の配列", () => {
    expect(groupDayLogsByMonth([])).toEqual([]);
  });
});

describe("countMonthsOpenByDefault（最初から開いておく月の数）", () => {
  const monthsOf = (counts: Array<[string, number]>) =>
    groupDayLogsByMonth(
      buildAdminDayLogViews(
        counts.flatMap(([month, n]) =>
          Array.from({ length: n }, (_, i) => day({ id: `${month}-${i}`, date: `${month}-${String(28 - i).padStart(2, "0")}` }))
        ),
        null
      )
    );

  it("記入が無ければ 0。月が 1 つなら 1", () => {
    expect(countMonthsOpenByDefault([])).toBe(0);
    expect(countMonthsOpenByDefault(monthsOf([["2026-01", 1]]))).toBe(1);
    expect(countMonthsOpenByDefault(monthsOf([["2026-01", 20]]))).toBe(1);
  });

  it("いちばん新しい月が、決めた日数以上あれば、その月だけ", () => {
    expect(countMonthsOpenByDefault(monthsOf([["2026-02", ADMIN_DAY_LOG_OPEN_MIN_DAYS], ["2026-01", 3]]))).toBe(1);
    expect(countMonthsOpenByDefault(monthsOf([["2026-02", 20], ["2026-01", 20]]))).toBe(1);
  });

  it("いちばん新しい月が、決めた日数に満たなければ、その前の月も（2 つまで）", () => {
    expect(countMonthsOpenByDefault(monthsOf([["2026-02", ADMIN_DAY_LOG_OPEN_MIN_DAYS - 1], ["2026-01", 3]]))).toBe(2);
    expect(countMonthsOpenByDefault(monthsOf([["2026-03", 1], ["2026-02", 1], ["2026-01", 1]]))).toBe(2);
  });
});

describe("ADMIN_DAY_LOG_TERMS（画面の言葉）", () => {
  it("月の見出しに添える日数", () => {
    expect(ADMIN_DAY_LOG_TERMS.monthCount(3)).toBe("3日分");
  });

  it("読めなかったときの文は、「無い」とは書かない", () => {
    expect(ADMIN_DAY_LOG_TERMS.coachLoadFailed).toContain("読めませんでした");
    expect(ADMIN_DAY_LOG_TERMS.pageLoadFailed).toContain("読み込めませんでした");
    expect(ADMIN_DAY_LOG_TERMS.empty).not.toContain("読め");
  });

  it("HM フィードバックは、読む場所の案内だけを持つ（欄の見出しは持たない。このページには出さない）", () => {
    expect(ADMIN_DAY_LOG_TERMS.feedbackNote).toContain("FB履歴");
    expect(ADMIN_DAY_LOG_TERMS.feedbackNote).toContain("出していません");
    expect("hmFeedbackLabel" in ADMIN_DAY_LOG_TERMS).toBe(false);
  });
});
