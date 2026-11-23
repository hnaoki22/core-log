import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CoachPreviousQuestionCard } from "./CoachReply";
import { CoachOptInView } from "./CoachOptInCard";
import { COACH_TERMS } from "@/lib/coach-reply";

// この環境のテストは DOM なし（Node）なので、最初の描画だけを確かめる。
// テストの値は合成データ（実在の人物・実在の返信は使わない）。
const QUESTION = { text: "あした、だれに、何を確かめますか。", replyDate: "2026-01-06" };
const FB = "/p/tok_synthetic/feedback";

describe("CoachPreviousQuestionCard（入力画面の、前回の問い）", () => {
  it("見出し、どの日の記入への返信か、問いの文を出す", () => {
    const html = renderToStaticMarkup(
      createElement(CoachPreviousQuestionCard, { question: QUESTION, feedbackPageHref: FB })
    );
    expect(html).toContain(COACH_TERMS.previousQuestionLabel);
    expect(html).toContain("1/6 の記入への返信から");
    expect(html).toContain("あした、だれに、何を確かめますか。");
  });

  it("返信の全文を読む先（「FB」のタブ）へのリンクを出す", () => {
    const html = renderToStaticMarkup(
      createElement(CoachPreviousQuestionCard, { question: QUESTION, feedbackPageHref: FB })
    );
    expect(html).toContain(`href="${FB}"`);
    expect(html).toContain(COACH_TERMS.previousQuestionLink);
  });

  it("問いの文は、文字として出す（HTML として解釈しない）。改行は保つ", () => {
    const html = renderToStaticMarkup(
      createElement(CoachPreviousQuestionCard, {
        question: { text: "一行目<b>太字</b>\n二行目", replyDate: "2026-01-06" },
        feedbackPageHref: FB,
      })
    );
    expect(html).not.toContain("<b>太字</b>");
    expect(html).toContain("一行目&lt;b&gt;太字&lt;/b&gt;\n二行目");
    expect(html).toContain("whitespace-pre-wrap");
  });
});

describe("CoachOptInView：前回の問いを出している環境の、説明の 1 行", () => {
  it("出している環境では、説明に 1 行足す", () => {
    const html = renderToStaticMarkup(
      createElement(CoachOptInView, { hasProfile: true, optIn: true, previousQuestionOn: true })
    );
    expect(html).toContain("届いた返信の最後の問いは、朝のリマインドメールと記入画面にも出ます。");
    expect(html).toContain("「受け取らない」にしているあいだは、出ません。");
    // もとの説明文は、そのまま出る。
    for (const line of COACH_TERMS.aboutLines) expect(html).toContain(line);
  });

  it("出していない環境（指定なし・false）の説明は、これまでと同じ", () => {
    const base = renderToStaticMarkup(createElement(CoachOptInView, { hasProfile: true, optIn: true }));
    const off = renderToStaticMarkup(
      createElement(CoachOptInView, { hasProfile: true, optIn: true, previousQuestionOn: false })
    );
    expect(base).not.toContain("朝のリマインドメール");
    expect(base).not.toContain(COACH_TERMS.aboutLinePreviousQuestion);
    expect(off).toBe(base);
  });
});
