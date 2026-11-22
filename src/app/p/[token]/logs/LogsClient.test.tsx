import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// リンクと下のタブは、ルーターに依存するので置き換える（文言の出る・出ないだけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/components/BottomNav", () => ({
  BottomNav: () => createElement("nav", { "data-testid": "bottom-nav" }),
}));

import LogsClient, { type LogsInitialData } from "./LogsClient";
import { combineQuestionAnswers } from "@/lib/daily-question-answers";

// この環境のテストは DOM なし（Node）なので、最初の描画（閉じた一覧）だけを確かめる。
// 行を開いたときの見出し（朝の意図／今日の行動）は、文言の表（entry-terms.test.ts）で確かめている。
// テストの記入は合成データ（実在の人物の記入は使わない）。
const STORED = combineQuestionAnswers(["今日は、どの場面で、何をしますか。"], ["会議で最初に発言する"]);

function render(o: { questionEnv?: boolean; morningIntent: string }): string {
  const initialData: LogsInitialData = {
    logs: [
      {
        id: "log-1",
        date: "2026-01-05",
        dayOfWeek: "月",
        dayNum: 1,
        morningIntent: o.morningIntent,
        eveningInsight: null,
        energy: "good",
        status: "morning_only",
        hasFeedback: false,
      },
    ],
    badges: { feedback: 0, feedbackTotal: 0, mission: 0 },
    ...(o.questionEnv === undefined ? {} : { entryQuestionEnv: o.questionEnv }),
  };
  return renderToStaticMarkup(createElement(LogsClient, { token: "tok_synthetic", initialData }));
}

describe("LogsClient：一覧の 1 行（朝の記入）", () => {
  it("問いを出している環境：問いの文ではなく、答えを出す", () => {
    const html = render({ questionEnv: true, morningIntent: STORED });
    expect(html).toContain("会議で最初に発言する");
    expect(html).not.toContain("Q1: 今日は、どの場面で、何をしますか。");
  });

  it("問いを出している環境：自由記入の文は、そのまま出す", () => {
    const html = render({ questionEnv: true, morningIntent: "部下の話を最後まで聞く" });
    expect(html).toContain("部下の話を最後まで聞く");
  });

  it("問いを出している環境：朝が未記入の行は「(未記入)」", () => {
    const html = render({ questionEnv: true, morningIntent: "" });
    expect(html).toContain("(未記入)");
  });

  it("問いを出していない環境：保存された文のまま出す（表示を変えない）", () => {
    for (const html of [render({ morningIntent: STORED }), render({ questionEnv: false, morningIntent: STORED })]) {
      expect(html).toContain("Q1: 今日は、どの場面で、何をしますか。");
      expect(html).not.toContain("whitespace-pre-line");
    }
  });
});
