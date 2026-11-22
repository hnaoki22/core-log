import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ルーターと、録音 API に依存するマイクの部品は置き換える（文言の出る・出ないだけを見る）。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));
vi.mock("@/components/features/VoiceInput", () => ({
  VoiceInputButton: () => createElement("button", { "data-testid": "mic" }, "mic"),
}));

import InputClient, { type InputPageInitialData } from "./InputClient";
import { combineQuestionAnswers } from "@/lib/daily-question-answers";

// この環境のテストは DOM なし（Node）なので、最初の描画（サーバーが返す HTML と同じもの）だけを
// 確かめる。記入を完了したあとの表示は、文言の表（entry-terms.test.ts）で確かめている。
// テストの問い・記入は合成データ（実在の環境の問い・実在の人物の記入は使わない）。
const Q_MORNING = ["今日は、どの場面で、何をしますか。"];
const Q_EVENING = ["今日は何をして、何が起きましたか。", "次に何を変えますか。"];

type Options = {
  questionEnv: boolean;
  isMorning: boolean;
  /** その日の問い。未指定なら、問いを出さない（スイッチ OFF と同じ）。 */
  questions?: { morning: string[]; evening: string[] };
  morningIntent?: string;
  alreadyCompleted?: boolean;
};

function render(o: Options): string {
  const questions = o.questions ?? { morning: [], evening: [] };
  const enabled = questions.morning.length > 0 || questions.evening.length > 0;
  const initialData: InputPageInitialData = {
    participant: { name: "見本 太郎", dojoPhase: "道場1", weekNum: 1 },
    todayLog: o.morningIntent
      ? { id: "log-1", morningIntent: o.morningIntent, status: o.alreadyCompleted ? "complete" : "morning_only" }
      : null,
    initialIsMorning: o.isMorning,
    initialMorningClosed: false,
    initialAlreadyCompleted: o.alreadyCompleted === true,
    initialFlags: enabled ? { "feature.dailyQuestions": true } : {},
    initialKanNoKiPhase: null,
    initialDailyQuestions: { enabled, morning: questions.morning, evening: questions.evening, axis: "", day: "monday" },
    initialMissions: null,
    initialEntryQuestionEnv: o.questionEnv,
  };
  return renderToStaticMarkup(createElement(InputClient, { token: "tok_synthetic", initialData }));
}

describe("InputClient：問いを出していない環境（元の文言のまま）", () => {
  it("朝：見出し「朝の意図設定」と、小見出し「今日、ひとつだけ意識するとしたら？」を出す", () => {
    const html = render({ questionEnv: false, isMorning: true });
    expect(html).toContain("朝の意図設定");
    expect(html).toContain("今日、ひとつだけ意識するとしたら？");
    expect(html).not.toContain("今日の行動");
  });

  it("夕方：見出し「本日の振り返り」、小見出し「今日やってみてどうでしたか？」、再掲の見出し「今朝の意図」を出す", () => {
    const html = render({ questionEnv: false, isMorning: false, morningIntent: "会議で最初に発言する" });
    expect(html).toContain("本日の振り返り");
    expect(html).toContain("今日やってみてどうでしたか？");
    expect(html).toContain("今朝の意図");
    expect(html).toContain("会議で最初に発言する");
    expect(html).not.toContain("今日の行動");
  });

  it("朝の記入が「Q1: … A1: …」の形でも、再掲は元の文のまま出す（表示を変えない）", () => {
    const stored = combineQuestionAnswers(Q_MORNING, ["会議で最初に発言する"]);
    const html = render({ questionEnv: false, isMorning: false, morningIntent: stored });
    expect(html).toContain("Q1: 今日は、どの場面で、何をしますか。");
    expect(html).not.toContain("whitespace-pre-line");
  });

  it("記入済みの日：「朝の意図と本日の振り返りが記入されています」", () => {
    const html = render({ questionEnv: false, isMorning: false, morningIntent: "x", alreadyCompleted: true });
    expect(html).toContain("朝の意図と本日の振り返りが記入されています");
  });
});

describe("InputClient：「朝・夕の問い」を出している環境", () => {
  const questions = { morning: Q_MORNING, evening: Q_EVENING };

  it("朝：見出しは「今日の行動」。小見出しは出さず、問いを出す", () => {
    const html = render({ questionEnv: true, isMorning: true, questions });
    expect(html).toContain("今日の行動");
    expect(html).toContain("今日は、どの場面で、何をしますか。");
    expect(html).not.toContain("朝の意図設定");
    expect(html).not.toContain("今日、ひとつだけ意識するとしたら？");
  });

  it("夕方：見出しは「本日の振り返り」のまま。小見出しは出さず、問いを 2 つ出す", () => {
    const stored = combineQuestionAnswers(Q_MORNING, ["会議で最初に発言する"]);
    const html = render({ questionEnv: true, isMorning: false, questions, morningIntent: stored });
    expect(html).toContain("本日の振り返り");
    expect(html).toContain("今日は何をして、何が起きましたか。");
    expect(html).toContain("次に何を変えますか。");
    expect(html).not.toContain("今日やってみてどうでしたか？");
  });

  it("夕方：朝の記入の再掲は、見出しを「今日の行動（今朝の記入）」にして、答えだけを出す", () => {
    const stored = combineQuestionAnswers(Q_MORNING, ["会議で最初に発言する"]);
    const html = render({ questionEnv: true, isMorning: false, questions, morningIntent: stored });
    expect(html).toContain("今日の行動（今朝の記入）");
    expect(html).toContain("会議で最初に発言する");
    expect(html).not.toContain("今朝の意図");
    expect(html).not.toContain("Q1: 今日は、どの場面で、何をしますか。");
    expect(html).not.toContain("A1:");
  });

  it("夕方：朝の記入が自由記入の文なら、再掲はその文のまま出す", () => {
    const html = render({ questionEnv: true, isMorning: false, questions, morningIntent: "部下の話を最後まで聞く" });
    expect(html).toContain("今日の行動（今朝の記入）");
    expect(html).toContain("部下の話を最後まで聞く");
  });

  it("その回の問いが無い日は、小見出しを出す（ただ 1 つの促しなので残す）", () => {
    const html = render({ questionEnv: true, isMorning: true, questions: { morning: [], evening: Q_EVENING } });
    expect(html).toContain("今日の行動");
    expect(html).toContain("今日、ひとつだけ意識するとしたら？");
  });

  it("記入済みの日：「今日の行動と本日の振り返りが記入されています」", () => {
    const html = render({ questionEnv: true, isMorning: false, questions, morningIntent: "x", alreadyCompleted: true });
    expect(html).toContain("今日の行動と本日の振り返りが記入されています");
    expect(html).not.toContain("朝の意図");
  });
});
