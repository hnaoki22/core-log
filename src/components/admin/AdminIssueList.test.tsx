import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/link は Next のルーターに依存するので、素の <a> に置き換える（行き先だけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

import { AdminIssueList, type AdminIssueItem } from "./AdminIssueList";
import {
  ADMIN_ISSUE_VIEW_TERMS,
  ISSUE_HYPOTHESIS_HEADING,
  ISSUE_HYPOTHESIS_LABEL,
  ISSUE_PLAN_HEADING,
  composeIssuePurpose,
  missionTerms,
} from "@/lib/mission-context";
import { managerParticipantPagePath } from "@/lib/staff-page-access";

// 管理画面の、参加者 1 人のページに出す、イシュー（ミッション）の欄（合成データ。実在の人物・文は使わない）。

const ISSUE = missionTerms(true);
const MISSION = missionTerms(false);
const HREF = managerParticipantPagePath("tok-admin", "参加 一郎");

function render(missions: AdminIssueItem[], terms = ISSUE, href = HREF) {
  return renderToStaticMarkup(
    createElement(AdminIssueList, {
      missions,
      heading: terms.pageTitle,
      purposeLabel: terms.purposeLabel,
      commentsHref: href,
    })
  );
}

describe("AdminIssueList（描画）：1 件も無いとき", () => {
  it("何も出さない（これまでと同じ）", () => {
    expect(render([])).toBe("");
  });
});

describe("AdminIssueList（描画）：イシューの呼び名の環境", () => {
  const structured: AdminIssueItem = {
    id: "m-1",
    title: "合成の問い",
    status: "進行中",
    purpose: composeIssuePurpose("合成の仮説", "合成の目指す状態と行動"),
  };

  it("見出しは、その環境の呼び名。題と状態を出す", () => {
    const html = render([structured]);
    expect(html).toContain(ISSUE.pageTitle);
    expect(html).not.toContain(`>${MISSION.pageTitle}<`);
    expect(html).toContain("合成の問い");
    expect(html).toContain("進行中");
  });

  it("仮説と「目指す状態と、これからの行動」を、分けて出す。保存用の見出しは出さない", () => {
    const html = render([structured]);
    expect(html).toContain(`>${ISSUE_HYPOTHESIS_LABEL}<`);
    expect(html).toContain("合成の仮説");
    expect(html).toContain(`>${ISSUE.purposeLabel}<`);
    expect(html).toContain("合成の目指す状態と行動");
    expect(html).not.toContain(ISSUE_HYPOTHESIS_HEADING);
    expect(html).not.toContain(ISSUE_PLAN_HEADING);
    // 仮説が、目指す状態より先に出る
    expect(html.indexOf("合成の仮説")).toBeLessThan(html.indexOf("合成の目指す状態と行動"));
  });

  it("見出しのない文（上司の画面で書いた文など）は、分けずに 1 つの枠で出す", () => {
    const html = render([{ id: "m-2", title: "合成の問い 2", status: "進行中", purpose: "見出しのない、合成の文" }]);
    expect(html).toContain(`>${ISSUE.purposeLabel}<`);
    expect(html).toContain("見出しのない、合成の文");
    expect(html).not.toContain(`>${ISSUE_HYPOTHESIS_LABEL}<`);
  });

  it("文が無いイシューは、題と状態だけを出す", () => {
    const html = render([{ id: "m-3", title: "合成の問い 3", status: "完了", purpose: null }]);
    expect(html).toContain("合成の問い 3");
    expect(html).toContain("完了");
    expect(html).not.toContain(`>${ISSUE.purposeLabel}<`);
  });

  it("題が空のときは、従来と同じ文言を出す。状態が空のときは、状態の札を出さない", () => {
    const html = render([{ id: "m-4", title: "", status: "", purpose: "" }]);
    expect(html).toContain(ADMIN_ISSUE_VIEW_TERMS.untitled);
    expect(html).not.toContain("bg-indigo-50");
  });

  it("複数あるときは、渡した順に、すべて出す", () => {
    const html = render([
      { id: "a", title: "合成の問い A", status: "進行中", purpose: null },
      { id: "b", title: "合成の問い B", status: "完了", purpose: null },
    ]);
    expect(html.indexOf("合成の問い A")).toBeGreaterThan(-1);
    expect(html.indexOf("合成の問い A")).toBeLessThan(html.indexOf("合成の問い B"));
  });
});

describe("AdminIssueList（描画）：コメントを読む・書くページへのリンク", () => {
  it("見出しの横に、上司の側の、参加者 1 人のページへのリンクを 1 つ出す", () => {
    const html = render([{ id: "m-1", title: "合成の問い", status: "進行中", purpose: null }]);
    expect(html).toContain(ADMIN_ISSUE_VIEW_TERMS.commentsLink);
    expect(html).toContain(`href="${HREF}"`);
    expect(html.match(/<a /g)?.length).toBe(1);
  });

  it("氏名は、URL に入れられる形にして渡す（空白・かっこを含む氏名）", () => {
    const href = managerParticipantPagePath("tok-admin", "参加（合成） 一郎");
    expect(href).toBe(`/m/tok-admin/${encodeURIComponent("参加（合成） 一郎")}`);
    expect(href).not.toContain(" ");
    const html = render([{ id: "m-1", title: "合成の問い", status: "進行中", purpose: null }], ISSUE, href);
    expect(html).toContain(`href="${href}"`);
  });
});

describe("AdminIssueList（描画）：ミッションの呼び名の環境", () => {
  it("見出しは「ミッション」、文の見出しは「背景・目的」", () => {
    const html = render(
      [{ id: "m-1", title: "合成のミッション", status: "進行中", purpose: "合成の背景と目的" }],
      MISSION
    );
    expect(html).toContain(`>${MISSION.pageTitle}<`);
    expect(html).toContain(`>${MISSION.purposeLabel}<`);
    expect(html).toContain("合成の背景と目的");
    expect(html).not.toContain(ISSUE.pageTitle);
  });
});

describe("AdminIssueList（描画）：文字の扱い", () => {
  it("題と文に入った記号は、そのまま文字として出す（タグにしない）", () => {
    const html = render([
      { id: "m-1", title: "<b>合成</b>", status: "進行中", purpose: composeIssuePurpose("<script>x</script>", "a & b") },
    ]);
    expect(html).not.toContain("<b>合成</b>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;合成&lt;/b&gt;");
    expect(html).toContain("a &amp; b");
  });
});
