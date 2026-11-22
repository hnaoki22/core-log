import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { IssueEditForm, type IssueEditValues } from "./IssueEditForm";
import { missionTerms } from "@/lib/mission-context";

// テストの文言は合成データ（実在の記入・実在の人物の記述は使わない）。
const terms = missionTerms(true);
const edit = terms.edit!;

const VALUES: IssueEditValues = {
  title: "合成の問いの文",
  hypothesis: "合成の仮説の文",
  plan: "合成の計画の文\n2行目",
  deadline: "2026-12-17",
};

function render(over: Partial<Parameters<typeof IssueEditForm>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(IssueEditForm, {
      terms,
      edit,
      values: VALUES,
      onChange: () => {},
      canSave: true,
      saving: false,
      error: null,
      onSave: () => {},
      onCancel: () => {},
      ...over,
    })
  );
}

describe("IssueEditForm（描画）", () => {
  it("見出しと説明、4 つの欄を、設定フォームと同じ見出しで出す", () => {
    const html = render();
    expect(html).toContain(edit.formHeading);
    expect(html).toContain(edit.note);
    expect(html).toContain(`>${terms.titleLabel}</label>`);
    expect(html).toContain(`>${terms.hypothesisLabel}</label>`);
    expect(html).toContain(`>${terms.purposeLabel}</label>`);
    expect(html).toContain(`>${edit.deadlineLabel}</label>`);
  });

  it("いまの文を、欄に分けて入れる。保存用の見出しは出さない", () => {
    const html = render();
    expect(html).toContain('value="合成の問いの文"');
    expect(html).toContain("合成の仮説の文</textarea>");
    expect(html).toContain("合成の計画の文\n2行目</textarea>");
    expect(html).toContain('value="2026-12-17"');
    expect(html).not.toContain("【仮説】");
    expect(html).not.toContain("【目指す状態と、これからの行動】");
  });

  it("保存できないあいだは、保存のボタンを押せなくする", () => {
    const disabled = render({ canSave: false });
    expect(disabled).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${edit.save}</button>`));
    const enabled = render({ canSave: true });
    expect(enabled).not.toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${edit.save}</button>`));
    expect(enabled).toContain(`>${edit.save}</button>`);
  });

  it("保存しているあいだは、表示を変えて、どちらのボタンも押せなくする", () => {
    const html = render({ saving: true });
    expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${edit.saving.replace(/\./g, "\\.")}</button>`));
    expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${edit.cancel}</button>`));
  });

  it("保存に失敗したときだけ、失敗の表示を出す", () => {
    expect(render()).not.toContain('role="alert"');
    const html = render({ error: edit.saveError });
    expect(html).toContain('role="alert"');
    expect(html).toContain(edit.saveError);
  });

  it("仮説の欄がない呼び名（従来のフォーム）では、仮説の欄を出さない", () => {
    const html = render({ terms: missionTerms(false) });
    expect(html).not.toContain(`>${terms.hypothesisLabel}</label>`);
    expect(html.match(/<textarea/g)).toHaveLength(1);
    expect(html).toContain(`>${missionTerms(false).purposeLabel}</label>`);
    // 仮説の欄がある呼び名では、欄は 2 つ。
    expect(render().match(/<textarea/g)).toHaveLength(2);
  });
});
