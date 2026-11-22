import { describe, it, expect } from "vitest";
import {
  hasAnyQuestion,
  isEntryQuestionEnv,
  pickSlotQuestions,
  entryTerms,
  entrySubheading,
  morningClosedMessage,
  DEFAULT_MORNING_SUBHEADING,
  DEFAULT_EVENING_SUBHEADING,
} from "./entry-terms";

// テストの問いは合成データ（実在の環境に登録された問いは使わない）。
const DAY = { axis: "", morning: ["今日は何をしますか。"], evening: ["今日は何をしましたか。", "次に何を変えますか。"] };
const EMPTY_DAY = { axis: "", morning: [], evening: [] };

function weeklyOf(day: typeof DAY | typeof EMPTY_DAY) {
  return {
    sunday: day, monday: day, tuesday: day, wednesday: day,
    thursday: day, friday: day, saturday: day,
  };
}

describe("hasAnyQuestion", () => {
  it("どの曜日にも問いが無ければ false", () => {
    expect(hasAnyQuestion(null)).toBe(false);
    expect(hasAnyQuestion(undefined)).toBe(false);
    expect(hasAnyQuestion({})).toBe(false);
    expect(hasAnyQuestion(weeklyOf(EMPTY_DAY))).toBe(false);
  });

  it("空白だけの行・文字列以外は、問いとして数えない", () => {
    expect(hasAnyQuestion({ monday: { morning: ["  ", ""], evening: [1, null] } })).toBe(false);
  });

  it("1 つの曜日の、朝か夕のどちらかに問いがあれば true", () => {
    expect(hasAnyQuestion({ ...weeklyOf(EMPTY_DAY), friday: { morning: [], evening: ["問い"] } })).toBe(true);
    expect(hasAnyQuestion(weeklyOf(DAY))).toBe(true);
  });
});

describe("isEntryQuestionEnv", () => {
  const weekly = weeklyOf(DAY);

  it("スイッチが ON で、問いが登録されていて、商品モードでなければ true", () => {
    expect(isEntryQuestionEnv({ "feature.dailyQuestions": true }, weekly)).toBe(true);
    expect(isEntryQuestionEnv({ "feature.dailyQuestions": true, standalone_mode: false }, weekly)).toBe(true);
  });

  it("スイッチが OFF・未設定なら false（問いが登録されていても）", () => {
    expect(isEntryQuestionEnv({ "feature.dailyQuestions": false }, weekly)).toBe(false);
    expect(isEntryQuestionEnv({}, weekly)).toBe(false);
    expect(isEntryQuestionEnv(null, weekly)).toBe(false);
    expect(isEntryQuestionEnv(undefined, weekly)).toBe(false);
  });

  it("スイッチが ON でも、問いが 1 つも登録されていなければ false", () => {
    expect(isEntryQuestionEnv({ "feature.dailyQuestions": true }, null)).toBe(false);
    expect(isEntryQuestionEnv({ "feature.dailyQuestions": true }, weeklyOf(EMPTY_DAY))).toBe(false);
  });

  it("商品モードの環境は false（スイッチが ON で問いが登録されていても、文言を変えない）", () => {
    expect(
      isEntryQuestionEnv({ "feature.dailyQuestions": true, standalone_mode: true }, weekly)
    ).toBe(false);
  });
});

describe("pickSlotQuestions", () => {
  it("朝・夕の問いを取り出す", () => {
    expect(pickSlotQuestions(DAY, "morning")).toEqual(["今日は何をしますか。"]);
    expect(pickSlotQuestions(DAY, "evening")).toEqual(["今日は何をしましたか。", "次に何を変えますか。"]);
  });

  it("空の行・文字列以外は外し、前後の空白を取る", () => {
    expect(pickSlotQuestions({ morning: [" 問い ", "", "  ", 3, null] }, "morning")).toEqual(["問い"]);
  });

  it("その日の問いが無い・読めなかったときは空の配列", () => {
    expect(pickSlotQuestions(null, "morning")).toEqual([]);
    expect(pickSlotQuestions(undefined, "evening")).toEqual([]);
    expect(pickSlotQuestions({}, "evening")).toEqual([]);
    expect(pickSlotQuestions({ evening: null }, "evening")).toEqual([]);
  });
});

describe("entryTerms", () => {
  // 問いを出していない環境の文言は、入力画面・ホーム・ログに元から書かれていた文言と
  // 一字一句同じでなければならない（表示を変えないため）。ここを変えるときは、
  // 「問いを出していない環境の表示が変わる」ことを意味する。
  it("問いを出していない環境の文言は、元からの文言と一字一句同じ", () => {
    expect(entryTerms(false)).toEqual({
      morningHeading: "朝の意図設定",
      eveningHeading: "本日の振り返り",
      morningRecapLabel: "今朝の意図",
      morningDone: "今日の意図が設定されました",
      eveningDone: "今日の振り返りが記録されました",
      morningEntryName: "朝の意図",
      eveningEntryName: "本日の振り返り",
      alreadyCompleted: "朝の意図と本日の振り返りが記入されています",
      homeStartSub: "朝の意図設定からスタート",
      homeEveningPendingSub: "1日の気づきを記録しましょう",
      logMorningLabel: "朝の意図",
    });
  });

  it("問いを出している環境では、朝の記入を「今日の行動」と呼ぶ", () => {
    expect(entryTerms(true)).toEqual({
      morningHeading: "今日の行動",
      eveningHeading: "本日の振り返り",
      morningRecapLabel: "今日の行動（今朝の記入）",
      morningDone: "今日の行動を記入しました",
      eveningDone: "今日の振り返りが記録されました",
      morningEntryName: "今日の行動",
      eveningEntryName: "本日の振り返り",
      alreadyCompleted: "今日の行動と本日の振り返りが記入されています",
      homeStartSub: "今日の行動の記入からスタート",
      homeEveningPendingSub: "振り返りの問いに答えましょう",
      logMorningLabel: "今日の行動",
    });
  });

  it("問いを出している環境の文言に「意図」「意識」「気づき」を残さない", () => {
    for (const value of Object.values(entryTerms(true))) {
      expect(value).not.toMatch(/意図|意識|気づき/);
    }
  });

  it("夕方の呼び名（本日の振り返り）と、夕方の完了の表示は、どちらの環境でも同じ", () => {
    const a = entryTerms(false);
    const b = entryTerms(true);
    expect(b.eveningHeading).toBe(a.eveningHeading);
    expect(b.eveningEntryName).toBe(a.eveningEntryName);
    expect(b.eveningDone).toBe(a.eveningDone);
  });

  it("true 以外の値は、問いを出していない環境として扱う", () => {
    expect(entryTerms(undefined as unknown as boolean)).toEqual(entryTerms(false));
    expect(entryTerms("true" as unknown as boolean)).toEqual(entryTerms(false));
  });
});

describe("entrySubheading", () => {
  it("問いを出していない回は、元からの小見出しを出す（一字一句同じ）", () => {
    expect(entrySubheading(true, false)).toBe("今日、ひとつだけ意識するとしたら？");
    expect(entrySubheading(false, false)).toBe("今日やってみてどうでしたか？");
    expect(DEFAULT_MORNING_SUBHEADING).toBe("今日、ひとつだけ意識するとしたら？");
    expect(DEFAULT_EVENING_SUBHEADING).toBe("今日やってみてどうでしたか？");
  });

  it("問いを出している回は、小見出しを出さない", () => {
    expect(entrySubheading(true, true)).toBeNull();
    expect(entrySubheading(false, true)).toBeNull();
  });
});

describe("morningClosedMessage", () => {
  it("問いを出していない環境は、元からの文と一字一句同じ", () => {
    expect(morningClosedMessage(false, 14)).toBe(
      "朝の意図設定は14:00までです。本日の振り返りをご記入ください。"
    );
  });

  it("問いを出している環境は「朝の記入」と呼ぶ", () => {
    expect(morningClosedMessage(true, 14)).toBe(
      "朝の記入は14:00までです。本日の振り返りをご記入ください。"
    );
  });
});
