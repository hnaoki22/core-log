import { describe, it, expect } from "vitest";
import {
  normalizeAnswers,
  hasAnyAnswer,
  combineQuestionAnswers,
} from "./daily-question-answers";

// テストの文言は合成データ（実在の記入・実在の人物の記述は使わない）。
const Q_MORNING = ["今日いちばん大事にしたいことは何ですか。"];
const Q_EVENING = ["今日やってみたことは何ですか。", "明日は何を変えますか。"];

describe("normalizeAnswers", () => {
  it("問いの数に合わせて、足りない分を空文字で埋める", () => {
    expect(normalizeAnswers(Q_EVENING, [])).toEqual(["", ""]);
    expect(normalizeAnswers(Q_EVENING, ["a"])).toEqual(["a", ""]);
  });

  it("問いの数を超える答えは捨てる", () => {
    expect(normalizeAnswers(Q_MORNING, ["a", "b", "c"])).toEqual(["a"]);
  });

  it("null / undefined / 文字列以外は空文字にする", () => {
    expect(normalizeAnswers(Q_EVENING, null)).toEqual(["", ""]);
    expect(normalizeAnswers(Q_EVENING, undefined)).toEqual(["", ""]);
    expect(normalizeAnswers(Q_EVENING, [1, { x: 1 }])).toEqual(["", ""]);
  });

  it("問いが 0 件なら空配列を返す", () => {
    expect(normalizeAnswers([], ["a"])).toEqual([]);
  });

  it("答えの中身（前後の空白・改行）は変えない", () => {
    expect(normalizeAnswers(Q_MORNING, ["  a\nb  "])).toEqual(["  a\nb  "]);
  });
});

describe("hasAnyAnswer", () => {
  it("1 つでも中身があれば true", () => {
    expect(hasAnyAnswer(["", "x"])).toBe(true);
  });

  it("すべて空・空白・改行だけなら false", () => {
    expect(hasAnyAnswer([])).toBe(false);
    expect(hasAnyAnswer(["", ""])).toBe(false);
    expect(hasAnyAnswer(["   ", "\n\n", "\t"])).toBe(false);
    expect(hasAnyAnswer(["　"])).toBe(false); // 全角スペースだけ
  });

  it("null / undefined / 文字列以外は未記入として扱う", () => {
    expect(hasAnyAnswer(null)).toBe(false);
    expect(hasAnyAnswer(undefined)).toBe(false);
    expect(hasAnyAnswer([0, false, null])).toBe(false);
  });
});

describe("combineQuestionAnswers", () => {
  it("問いと答えを Q/A の形でまとめる", () => {
    expect(combineQuestionAnswers(Q_EVENING, ["資料を見せた", "順番を変える"])).toBe(
      "Q1: 今日やってみたことは何ですか。\nA1: 資料を見せた\n\n" +
        "Q2: 明日は何を変えますか。\nA2: 順番を変える"
    );
  });

  it("問いが 1 つのときは区切りの空行を付けない", () => {
    expect(combineQuestionAnswers(Q_MORNING, ["相手の話を先に聞く"])).toBe(
      "Q1: 今日いちばん大事にしたいことは何ですか。\nA1: 相手の話を先に聞く"
    );
  });

  it("どの問いにも答えが無いときは空文字を返す（未記入のまま保存させない）", () => {
    expect(combineQuestionAnswers(Q_EVENING, [])).toBe("");
    expect(combineQuestionAnswers(Q_EVENING, ["", ""])).toBe("");
    expect(combineQuestionAnswers(Q_EVENING, ["  ", "\n"])).toBe("");
    expect(combineQuestionAnswers(Q_EVENING, null)).toBe("");
  });

  it("入力して消した直後（空文字に戻った状態）も空文字を返す", () => {
    const typed = combineQuestionAnswers(Q_MORNING, ["あ"]);
    expect(typed).not.toBe("");
    expect(combineQuestionAnswers(Q_MORNING, [""])).toBe("");
  });

  it("一部の問いだけに答えたときは、答えていない問いも残す", () => {
    expect(combineQuestionAnswers(Q_EVENING, ["資料を見せた", ""])).toBe(
      "Q1: 今日やってみたことは何ですか。\nA1: 資料を見せた\n\n" +
        "Q2: 明日は何を変えますか。\nA2: "
    );
    expect(combineQuestionAnswers(Q_EVENING, ["", "順番を変える"])).toBe(
      "Q1: 今日やってみたことは何ですか。\nA1: \n\n" +
        "Q2: 明日は何を変えますか。\nA2: 順番を変える"
    );
  });

  it("答えの前後の空白は落とし、途中の改行は残す", () => {
    expect(combineQuestionAnswers(Q_MORNING, ["  1行目\n2行目  \n"])).toBe(
      "Q1: 今日いちばん大事にしたいことは何ですか。\nA1: 1行目\n2行目"
    );
  });

  it("問いの数を超える答えは無視する", () => {
    expect(combineQuestionAnswers(Q_MORNING, ["a", "余分"])).toBe(
      "Q1: 今日いちばん大事にしたいことは何ですか。\nA1: a"
    );
  });

  it("余分な答えにしか中身が無いときは、未記入として扱う", () => {
    expect(combineQuestionAnswers(Q_MORNING, ["", "余分"])).toBe("");
  });

  it("問いが 0 件なら空文字を返す", () => {
    expect(combineQuestionAnswers([], ["a"])).toBe("");
  });
});
