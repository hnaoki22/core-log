import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { IssueBodyView, IssueEditableBody, issueEditValuesOf, type EditableMission } from "./IssueEditableBody";
import { MissionPurposeView } from "./MissionPurposeView";
import { composeIssuePurpose, missionTerms } from "@/lib/mission-context";
import type { MissionEditView } from "@/lib/mission-edit";

// テストの文言は合成データ（実在の記入・実在の人物の記述は使わない）。
// この環境のテストは DOM なし。確かめられるのは、最初の描画（履歴を読む前、フォームを開く前）まで。
// 「直す」を押したあとのフォームと、履歴の表示は、IssueEditForm / IssueEditHistory の描画テストで確かめる。

const STRUCTURED = composeIssuePurpose("合成の仮説の文", "合成の計画の文\n2行目");

function mission(over: Partial<EditableMission> = {}): EditableMission {
  return {
    id: "00000000-0000-4000-8000-0000000000aa",
    title: "合成の問いの文",
    purpose: STRUCTURED,
    deadline: "2026-12-17",
    status: "進行中",
    ...over,
  };
}

function render(useIssueLabel: boolean, m: EditableMission): string {
  return renderToStaticMarkup(
    createElement(IssueEditableBody, {
      token: "test-token",
      mission: m,
      terms: missionTerms(useIssueLabel),
      onSaved: () => {},
      onDirtyChange: () => {},
    })
  );
}

function plain(useIssueLabel: boolean, purpose: string | null): string {
  return renderToStaticMarkup(
    createElement(MissionPurposeView, { purpose, purposeLabel: missionTerms(useIssueLabel).purposeLabel })
  );
}

describe("IssueEditableBody（描画）", () => {
  it("直す操作を出さない環境では、これまでと同じ HTML（背景・目的の表示だけ）を出す", () => {
    // feature.missionLabelIssue が OFF のテナントの表示を変えないための固定。
    for (const purpose of ["従来の背景と目的\n2行目", STRUCTURED, null, ""]) {
      expect(render(false, mission({ purpose }))).toBe(plain(false, purpose));
    }
    // 閉じたものでも同じ。
    expect(render(false, mission({ status: "完了" }))).toBe(plain(false, STRUCTURED));
    expect(render(false, mission())).not.toContain("直す");
  });

  it("直す操作を出す環境では、表示の下に「直す」を出す（フォームと履歴は、まだ出さない）", () => {
    const html = render(true, mission());
    expect(html.startsWith(plain(true, STRUCTURED))).toBe(true);
    expect(html).toContain(">直す</button>");
    expect(html).not.toContain('data-testid="issue-edit-form"');
    expect(html).not.toContain('data-testid="issue-edit-history"');
    // 履歴を読み終える前は、件数も、読めなかった旨も出さない。
    expect(html).not.toContain("直した履歴");
    expect(html).not.toContain(missionTerms(true).edit!.historyLoadError);
  });

  it("閉じたイシューには、「直す」を出さない", () => {
    for (const status of ["完了", "completed"]) {
      const html = render(true, mission({ status }));
      expect(html).toBe(plain(true, STRUCTURED));
    }
  });

  it("着手前のものにも、「直す」を出す", () => {
    expect(render(true, mission({ status: "未着手" }))).toContain(">直す</button>");
  });

  it("背景・目的が空のときは、「直す」の行が先頭になるので、上の余白を付ける", () => {
    const html = render(true, mission({ purpose: null }));
    expect(html).toMatch(/^<div class="[^"]*\bmt-3\b[^"]*">/);
    expect(html).toContain(">直す</button>");
    // 表示の枠があるときは、余白を重ねない（枠の側に付いている）。
    const withBox = render(true, mission());
    const row = withBox.slice(plain(true, STRUCTURED).length);
    expect(row).not.toMatch(/^<div class="[^"]*\bmt-3\b/);
  });
});

// 履歴を読んだあとの表示（状態を持たない部品で確かめる）。
describe("IssueBodyView（描画）", () => {
  const terms = missionTerms(true);
  const edit = terms.edit!;
  const VIEWS: MissionEditView[] = [
    {
      id: "e2",
      editedAt: "2026-11-23T01:00:00+00:00",
      editedBy: "participant",
      changes: [{ field: "title", before: "合成の問いの文（直す前）" }],
    },
    {
      id: "e1",
      editedAt: "2026-11-22T08:50:00+00:00",
      editedBy: "participant",
      changes: [{ field: "hypothesis", before: "合成の仮説の文（直す前）" }],
    },
  ];

  function view(over: Partial<Parameters<typeof IssueBodyView>[0]> = {}): string {
    return renderToStaticMarkup(
      createElement(IssueBodyView, {
        mission: { purpose: STRUCTURED },
        terms,
        edit,
        canEdit: true,
        views: [],
        historyOpen: false,
        historyFailed: false,
        onStartEdit: () => {},
        onToggleHistory: () => {},
        ...over,
      })
    );
  }

  it("履歴があるときは、件数つきのボタンを出す。閉じているあいだは、中身を出さない", () => {
    const html = view({ views: VIEWS });
    expect(html).toContain(">直した履歴（2件）</button>");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="issue-edit-history"');
    expect(html).not.toContain("合成の問いの文（直す前）");
  });

  it("履歴を開くと、直す前の文を出す", () => {
    const html = view({ views: VIEWS, historyOpen: true });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('data-testid="issue-edit-history"');
    expect(html).toContain("合成の問いの文（直す前）");
    expect(html).toContain("合成の仮説の文（直す前）");
  });

  it("履歴が無いときは、履歴のボタンを出さない", () => {
    const html = view();
    expect(html).toContain(">直す</button>");
    expect(html).not.toContain("直した履歴");
  });

  it("履歴を読めなかったときは、その旨を出す（履歴なしの見え方にしない）", () => {
    const html = view({ historyFailed: true });
    expect(html).toContain(edit.historyLoadError);
    expect(html).not.toContain("直した履歴（");
  });

  it("閉じたイシューでも、履歴は読める（「直す」は出さない）", () => {
    const html = view({ canEdit: false, views: VIEWS });
    expect(html).not.toContain(">直す</button>");
    expect(html).toContain(">直した履歴（2件）</button>");
  });

  it("「直す」も履歴も無いときは、行そのものを出さない", () => {
    expect(view({ canEdit: false })).toBe(plain(true, STRUCTURED));
  });
});

describe("issueEditValuesOf", () => {
  it("見出しつきの文を、仮説と、目指す状態・行動の欄に分ける", () => {
    expect(issueEditValuesOf(mission())).toEqual({
      title: "合成の問いの文",
      hypothesis: "合成の仮説の文",
      plan: "合成の計画の文\n2行目",
      deadline: "2026-12-17",
    });
  });

  it("見出しのない文は、全文を、目指す状態・行動の欄に入れる（仮説は空）", () => {
    expect(issueEditValuesOf(mission({ purpose: "従来の背景と目的", deadline: "" }))).toEqual({
      title: "合成の問いの文",
      hypothesis: "",
      plan: "従来の背景と目的",
      deadline: "",
    });
  });

  it("背景・目的が空でも、空の欄で始められる", () => {
    expect(issueEditValuesOf(mission({ purpose: null }))).toMatchObject({ hypothesis: "", plan: "" });
  });

  it("分けた欄をまとめ直すと、元の文に戻る", () => {
    const v = issueEditValuesOf(mission());
    expect(composeIssuePurpose(v.hypothesis, v.plan)).toBe(STRUCTURED);
  });
});
