import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ルーターと、録音 API に依存するマイクの部品は置き換える（出る・出ないだけを見る）。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));
vi.mock("@/components/features/VoiceInput", () => ({
  VoiceInputButton: () => createElement("button", { "data-testid": "mic" }, "mic"),
}));

import InputClient, { type InputPageInitialData } from "./InputClient";
import { COACH_TERMS, type PreviousCoachQuestion } from "@/lib/coach-reply";

// 入力画面に、前回の AIコーチの問いを出す・出さない（feature.coachPreviousQuestion）。
// この環境のテストは DOM なし（Node）なので、最初の描画だけを確かめる。
// テストの値は合成データ（実在の人物・実在の返信は使わない）。
const QUESTION: PreviousCoachQuestion = { text: "あした、だれに、何を確かめますか。", replyDate: "2026-01-06" };

type Options = {
  isMorning: boolean;
  flagOn: boolean;
  /** undefined = キーごと渡さない（これまでの呼び出しと同じ）。 */
  question?: PreviousCoachQuestion | null;
};

function render(o: Options): string {
  const initialData: InputPageInitialData = {
    participant: { name: "見本 太郎", dojoPhase: "道場1", weekNum: 1 },
    todayLog: o.isMorning ? null : { id: "log-1", morningIntent: "見本の朝の記入", status: "morning_only" },
    initialIsMorning: o.isMorning,
    initialMorningClosed: false,
    initialAlreadyCompleted: false,
    initialFlags: {
      "feature.dailyQuestions": true,
      "feature.coachingProfile": true,
      ...(o.flagOn ? { "feature.coachPreviousQuestion": true } : {}),
    },
    initialKanNoKiPhase: null,
    initialDailyQuestions: {
      enabled: true,
      morning: ["今日は、どの場面で、何をしますか。"],
      evening: ["今日は何をして、何が起きましたか。"],
      axis: "",
      day: "monday",
    },
    initialMissions: null,
    initialEntryQuestionEnv: true,
    initialCoachingProfile: { state: "confirmed", headline: "最初に、相手の困りごとを一つ聞く", growthTheme: "", actions: "" },
    ...(o.question === undefined ? {} : { initialCoachQuestion: o.question }),
  };
  return renderToStaticMarkup(createElement(InputClient, { token: "tok_synthetic", initialData }));
}

describe("InputClient：前回の AIコーチの問い", () => {
  it("朝：スイッチが ON で、サーバーが問いを渡したときに、設計図の枠の下に出す", () => {
    const html = render({ isMorning: true, flagOn: true, question: QUESTION });
    expect(html).toContain(COACH_TERMS.previousQuestionLabel);
    expect(html).toContain("1/6 の記入への返信から");
    expect(html).toContain(QUESTION.text);
    expect(html).toContain('href="/p/tok_synthetic/feedback"');
    // 設計図の枠（毎朝の一文）より後ろ、問いの欄より前。
    expect(html.indexOf("最初に、相手の困りごとを一つ聞く")).toBeLessThan(html.indexOf(COACH_TERMS.previousQuestionLabel));
    expect(html.indexOf(COACH_TERMS.previousQuestionLabel)).toBeLessThan(html.indexOf("今日は、どの場面で、何をしますか。"));
  });

  it("夕方の入力画面にも出す（次の返信が届くまで）", () => {
    const html = render({ isMorning: false, flagOn: true, question: QUESTION });
    expect(html).toContain(COACH_TERMS.previousQuestionLabel);
    expect(html).toContain(QUESTION.text);
  });

  it("サーバーが問いを渡さないとき（null・キーなし）は、出さない。HTML は、これまでと同じ", () => {
    const base = render({ isMorning: true, flagOn: false });
    expect(base).not.toContain(COACH_TERMS.previousQuestionLabel);
    expect(render({ isMorning: true, flagOn: true })).toBe(base);
    expect(render({ isMorning: true, flagOn: true, question: null })).toBe(base);
  });

  it("スイッチが OFF のときは、問いが渡されていても出さない", () => {
    const html = render({ isMorning: true, flagOn: false, question: QUESTION });
    expect(html).not.toContain(COACH_TERMS.previousQuestionLabel);
    expect(html).not.toContain(QUESTION.text);
  });
});
