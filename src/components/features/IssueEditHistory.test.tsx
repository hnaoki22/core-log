import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { IssueEditHistory } from "./IssueEditHistory";
import { missionTerms } from "@/lib/mission-context";
import type { MissionEditView } from "@/lib/mission-edit";

// テストの文言は合成データ（実在の記入・実在の人物の記述は使わない）。
const terms = missionTerms(true);
const edit = terms.edit!;

function render(views: MissionEditView[]): string {
  return renderToStaticMarkup(createElement(IssueEditHistory, { terms, edit, views }));
}

const VIEWS: MissionEditView[] = [
  {
    id: "e2",
    editedAt: "2026-11-23T01:00:00+00:00",
    editedBy: "participant",
    changes: [
      { field: "title", before: "合成の問いの文（直す前）" },
      { field: "deadline", before: "2026-12-17" },
    ],
  },
  {
    id: "e1",
    editedAt: "2026-11-22T08:50:00+00:00",
    editedBy: "manager",
    changes: [
      { field: "hypothesis", before: "合成の仮説の文（直す前）\n2行目" },
      { field: "plan", before: null },
    ],
  },
];

describe("IssueEditHistory（描画）", () => {
  it("履歴が無いときは、何も出さない", () => {
    expect(render([])).toBe("");
  });

  it("1 回の修正ごとに、日本時間の日時と、直す前の文を出す", () => {
    const html = render(VIEWS);
    expect(html).toContain("11/23 10:00 に直す前の文");
    expect(html).toContain("合成の問いの文（直す前）");
    expect(html).toContain("合成の仮説の文（直す前）\n2行目");
  });

  it("運営が直したものは、見出しで分かるようにする", () => {
    const html = render(VIEWS);
    expect(html).toContain("11/22 17:50 に運営が直す前の文");
  });

  it("欄の見出しは、画面の呼び名にそろえる（必須の印と、保存用の見出しは出さない）", () => {
    const html = render(VIEWS);
    expect(html).toContain(">イシュー（解くべき問い）</p>");
    expect(html).toContain(">仮説</p>");
    expect(html).toContain(`>${terms.purposeLabel}</p>`);
    expect(html).toContain(`>${edit.deadlineLabel}</p>`);
    expect(html).not.toContain(" *</p>");
    expect(html).not.toContain("【仮説】");
  });

  it("期限は年月日で、直す前に空だった欄は「（なし）」で出す", () => {
    const html = render(VIEWS);
    expect(html).toContain(">2026/12/17</p>");
    expect(html).toContain(`>${edit.historyEmptyValue}</p>`);
  });

  it("新しい順に並べる（渡された順のまま出す）", () => {
    const html = render(VIEWS);
    expect(html.indexOf("11/23 10:00")).toBeLessThan(html.indexOf("11/22 17:50"));
  });

  it("日時を読めない記録も、落とさずに出す", () => {
    const html = render([{ id: "x", editedAt: "", editedBy: "participant", changes: [{ field: "title", before: "前の題" }] }]);
    expect(html).toContain("前の題");
    expect(html).toContain("— に直す前の文");
  });
});
