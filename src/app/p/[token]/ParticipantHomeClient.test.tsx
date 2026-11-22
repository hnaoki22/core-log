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

import ParticipantHomeClient, { type ParticipantHomeInitialData } from "./ParticipantHomeClient";
import { getTodayJST } from "@/lib/date-utils";
import { combineQuestionAnswers } from "@/lib/daily-question-answers";

// この環境のテストは DOM なし（Node）なので、最初の描画だけを確かめる。
// テストの記入は合成データ（実在の人物の記入は使わない）。
type LogStatus = "complete" | "morning_only" | "empty" | "fb_done";

function render(o: { questionEnv?: boolean; todayStatus?: LogStatus; morningIntent?: string }): string {
  const today = getTodayJST();
  const logs: ParticipantHomeInitialData["logs"] = o.todayStatus
    ? [
        {
          id: "log-1",
          date: today,
          dayOfWeek: "月",
          dayNum: 1,
          morningIntent: o.morningIntent ?? "会議で最初に発言する",
          eveningInsight: o.todayStatus === "complete" ? "発言した" : null,
          energy: "good",
          status: o.todayStatus,
          hasFeedback: false,
        },
      ]
    : [];
  const initialData: ParticipantHomeInitialData = {
    participant: { id: "p-1", name: "見本 太郎", department: "見本部", dojoPhase: "道場1", weekNum: 1 },
    logs,
    badges: { feedback: 0, feedbackTotal: 0, mission: 0 },
    unreadFeedback: 0,
    stats: null,
    standalone: null,
    quickNotes: [],
    ...(o.questionEnv === undefined ? {} : { entryQuestionEnv: o.questionEnv }),
  };
  return renderToStaticMarkup(createElement(ParticipantHomeClient, { token: "tok_synthetic", initialData }));
}

describe("ParticipantHomeClient：「今日の状態」の 2 行目", () => {
  it("問いを出していない環境・未記入：「朝の意図設定からスタート」（元の文言のまま）", () => {
    for (const html of [render({}), render({ questionEnv: false })]) {
      expect(html).toContain("今日の記入を始めましょう");
      expect(html).toContain("朝の意図設定からスタート");
      expect(html).not.toContain("今日の行動");
    }
  });

  it("問いを出していない環境・朝だけ記入：「1日の気づきを記録しましょう」（元の文言のまま）", () => {
    const html = render({ questionEnv: false, todayStatus: "morning_only" });
    expect(html).toContain("本日の振り返りがまだです");
    expect(html).toContain("1日の気づきを記録しましょう");
  });

  it("問いを出している環境・未記入：「今日の行動の記入からスタート」", () => {
    const html = render({ questionEnv: true });
    expect(html).toContain("今日の記入を始めましょう");
    expect(html).toContain("今日の行動の記入からスタート");
    expect(html).not.toContain("朝の意図設定");
  });

  it("問いを出している環境・朝だけ記入：「振り返りの問いに答えましょう」", () => {
    const html = render({ questionEnv: true, todayStatus: "morning_only" });
    expect(html).toContain("本日の振り返りがまだです");
    expect(html).toContain("振り返りの問いに答えましょう");
    expect(html).not.toContain("気づき");
  });

  it("朝・夕とも記入済みの日の表示は、どちらの環境でも同じ", () => {
    for (const questionEnv of [false, true]) {
      const html = render({ questionEnv, todayStatus: "complete" });
      expect(html).toContain("今日の記入が完了しました");
    }
  });
});

describe("ParticipantHomeClient：「最近のログ」の 1 行", () => {
  // 問いへの答えは「Q1: 問い / A1: 答え」の形で保存されている。
  const stored = combineQuestionAnswers(["今日は、どの場面で、何をしますか。"], ["会議で最初に発言する"]);

  it("問いを出している環境：問いの文ではなく、答えを出す", () => {
    const html = render({ questionEnv: true, todayStatus: "morning_only", morningIntent: stored });
    expect(html).toContain(">会議で最初に発言する</p>");
    expect(html).not.toContain("Q1: 今日は、どの場面で、何をしますか。");
  });

  it("問いを出している環境：自由記入の文は、そのまま出す", () => {
    const html = render({ questionEnv: true, todayStatus: "morning_only", morningIntent: "部下の話を最後まで聞く" });
    expect(html).toContain(">部下の話を最後まで聞く</p>");
  });

  it("問いを出していない環境：保存された文のまま出す（表示を変えない）", () => {
    const html = render({ questionEnv: false, todayStatus: "morning_only", morningIntent: stored });
    expect(html).toContain("Q1: 今日は、どの場面で、何をしますか。");
  });
});
