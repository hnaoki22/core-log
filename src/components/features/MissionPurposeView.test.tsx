import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { MissionPurposeView } from "./MissionPurposeView";
import { composeIssuePurpose, missionTerms } from "@/lib/mission-context";

// テストの文言は合成データ（実在の記入・実在の人物の記述は使わない）。
function render(purpose: string | null | undefined, purposeLabel = missionTerms(false).purposeLabel): string {
  return renderToStaticMarkup(createElement(MissionPurposeView, { purpose, purposeLabel }));
}

describe("MissionPurposeView（描画）", () => {
  it("見出しのない文は、部品に切り出す前の画面と同じ HTML で出す", () => {
    // feature.missionLabelIssue が OFF のテナントの表示を変えないための固定。
    expect(render("従来の背景と目的\n2行目")).toBe(
      '<div class="bg-[#F5F0EB] p-3 rounded-xl border border-[#EFE8DD] mt-3">' +
        '<p class="text-[10px] font-medium text-[#8B8489] tracking-wide uppercase mb-1">背景・目的</p>' +
        '<p class="text-sm text-[#2C2C4A] leading-relaxed whitespace-pre-wrap break-words">従来の背景と目的\n2行目</p>' +
        "</div>"
    );
  });

  it("空・未設定のときは何も出さない", () => {
    expect(render(null)).toBe("");
    expect(render(undefined)).toBe("");
    expect(render("")).toBe("");
  });

  it("仮説つきの文は、仮説と残りを別の枠で出し、保存用の見出しは出さない", () => {
    const html = render(
      composeIssuePurpose("合成の仮説の文", "合成の計画の文\n2行目"),
      missionTerms(true).purposeLabel
    );
    expect(html).toContain(">仮説</p>");
    expect(html).toContain("合成の仮説の文");
    expect(html).toContain(">目指す状態と、これからの行動</p>");
    expect(html).toContain("合成の計画の文\n2行目");
    expect(html).not.toContain("【仮説】");
    expect(html).not.toContain("【目指す状態と、これからの行動】");
    // 枠は 2 つ。上の余白（mt-3）は先頭の枠だけ。
    expect(html.split("<div").length - 1).toBe(2);
    expect(html.split("mt-3").length - 1).toBe(1);
    expect(html.indexOf("合成の仮説の文")).toBeLessThan(html.indexOf("合成の計画の文"));
  });

  it("仮説だけ、残りだけのときは、ある方の枠だけを出す", () => {
    const onlyHypothesis = render(composeIssuePurpose("合成の仮説の文", ""));
    expect(onlyHypothesis).toContain(">仮説</p>");
    expect(onlyHypothesis.split("<div").length - 1).toBe(1);
    expect(onlyHypothesis).toContain("mt-3");

    const onlyPlan = render(composeIssuePurpose("", "合成の計画の文"));
    expect(onlyPlan).not.toContain(">仮説</p>");
    expect(onlyPlan.split("<div").length - 1).toBe(1);
    expect(onlyPlan).toContain("mt-3");
  });

  it("本文の記号はそのまま文字として出す（HTML として解釈しない）", () => {
    const html = render(composeIssuePurpose("a < b & c", "x > y"));
    expect(html).toContain("a &lt; b &amp; c");
    expect(html).toContain("x &gt; y");
  });
});
