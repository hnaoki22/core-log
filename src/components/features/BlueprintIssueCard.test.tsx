import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/link は Next のルーターに依存するので、素の <a> に置き換える（行き先だけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

import { BlueprintIssueCard } from "./BlueprintIssueCard";
import { ISSUE_HYPOTHESIS_LABEL, missionTerms, type CurrentIssue } from "@/lib/mission-context";

// テストの文は合成データ（実在の記入は使わない）。
const HREF = "/p/test-token/mission";

function render(issue: CurrentIssue, useIssueLabel = true): string {
  return renderToStaticMarkup(
    createElement(BlueprintIssueCard, { issue, terms: missionTerms(useIssueLabel), missionPageHref: HREF })
  );
}

describe("BlueprintIssueCard（描画）", () => {
  it("いまのイシューと仮説を出し、「イシュー」のページへのリンクを置く", () => {
    const html = render({
      current: { id: "m1", title: "誰の、どの手戻りを減らすのか", hypothesis: "依頼の時点で、完成の形が決まっていない" },
      otherActiveCount: 0,
    });
    const t = missionTerms(true);
    expect(html).toContain(t.blueprintHeading);
    expect(html).toContain("誰の、どの手戻りを減らすのか");
    expect(html).toContain(ISSUE_HYPOTHESIS_LABEL);
    expect(html).toContain("依頼の時点で、完成の形が決まっていない");
    expect(html).toContain(`href="${HREF}"`);
    expect(html).toContain(t.blueprintLink);
    // ほかに進行中のものが無いときは、件数の行を出さない。
    expect(html).not.toContain("ほかに進行中");
  });

  it("仮説が無い（見出しのない文で設定された）ときは、仮説の見出しも出さない", () => {
    const html = render({ current: { id: "m1", title: "従来の登録", hypothesis: null }, otherActiveCount: 0 });
    expect(html).toContain("従来の登録");
    expect(html).not.toContain(ISSUE_HYPOTHESIS_LABEL);
  });

  it("ほかにも進行中のものがあるときは、件数を 1 行で出す", () => {
    const html = render({ current: { id: "m2", title: "新しい問い", hypothesis: "新しい仮説" }, otherActiveCount: 2 });
    expect(html).toContain("ほかに進行中のイシューが2件あります。");
  });

  it("進行中のものが無いときは、設定先への案内を出す（入力画面の枠と同じ文）", () => {
    const html = render({ current: null, otherActiveCount: 0 });
    const t = missionTerms(true);
    expect(html).toContain(t.blueprintHeading);
    expect(html).toContain(t.inputCardEmpty);
    expect(html).toContain(t.inputCardEmptyLink);
    expect(html).toContain(`href="${HREF}"`);
    expect(html).not.toContain(t.blueprintLink);
  });

  it("呼び名が「ミッション」の環境では、ミッションの言葉で出す", () => {
    const html = render({ current: { id: "m1", title: "提案書を自力で仕上げる", hypothesis: null }, otherActiveCount: 1 }, false);
    const t = missionTerms(false);
    expect(html).toContain(t.blueprintHeading);
    expect(html).toContain("ほかに進行中のミッションが1件あります。");
    expect(html).toContain(t.blueprintLink);
    expect(html).not.toContain("イシュー");
  });

  it("問いと仮説の中の記号は、文字として出す（HTML として解釈しない）", () => {
    const html = render({ current: { id: "m1", title: "<b>問い</b>", hypothesis: "a & b" }, otherActiveCount: 0 });
    expect(html).toContain("&lt;b&gt;問い&lt;/b&gt;");
    expect(html).toContain("a &amp; b");
  });
});
