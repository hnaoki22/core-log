import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/link は Next のルーターに依存するので、素の <a> に置き換える（行き先だけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

import { MissionContextCard } from "./MissionContextCard";
import { missionTerms, type MissionContextItem } from "@/lib/mission-context";

// テストの文言は合成データ（実在の記入・実在の人物の記述は使わない）。
const HREF = "/p/test-token/mission";

function render(missions: MissionContextItem[], useIssueLabel = false): string {
  return renderToStaticMarkup(
    createElement(MissionContextCard, {
      missions,
      terms: missionTerms(useIssueLabel),
      missionPageHref: HREF,
    })
  );
}

// この環境のテストは DOM なし（Node）なので、「続きを見る」を押す操作は確かめられない。
// ここでは最初の描画（閉じた状態）で何が出るかを確かめる。
describe("MissionContextCard（描画）", () => {
  it("1 件も無いときは、設定先への案内とリンクを出す", () => {
    const html = render([]);
    expect(html).toContain("進行中のミッションを設定すると、ここに表示されます。");
    expect(html).toContain(`href="${HREF}"`);
    expect(html).toContain("ミッションを設定する");
  });

  it("ミッション名・期限・背景と目的を出す", () => {
    const html = render([
      { id: "m1", title: "合成のミッション名", purpose: "合成の背景と目的", deadline: "2026-12-17" },
    ]);
    expect(html).toContain("進行中のミッション");
    expect(html).toContain("合成のミッション名");
    expect(html).toContain("期限: 12/17");
    expect(html).toContain("合成の背景と目的");
    // 設定済みのときは、未設定の案内を出さない
    expect(html).not.toContain("ここに表示されます");
  });

  it("期限と背景・目的が無いときは、その行を出さない", () => {
    const html = render([{ id: "m1", title: "名前だけ", purpose: null, deadline: null }]);
    expect(html).toContain("名前だけ");
    expect(html).not.toContain("期限:");
    expect(html).not.toContain("続きを見る");
    expect(html.match(/<p /g)?.length).toBe(2); // 見出しとミッション名だけ
  });

  it("背景・目的が短いときは「続きを見る」を出さず、折りたたまない", () => {
    const html = render([{ id: "m1", title: "T", purpose: "短い文", deadline: null }]);
    expect(html).not.toContain("続きを見る");
    expect(html).not.toContain("line-clamp-3");
  });

  it("背景・目的が長いときは 3 行に折りたたみ、「続きを見る」を出す", () => {
    const html = render([{ id: "m1", title: "T", purpose: "1行目\n2行目\n3行目\n4行目", deadline: null }]);
    expect(html).toContain("line-clamp-3");
    expect(html).toContain("続きを見る");
    expect(html).toContain('aria-expanded="false"');
    // 全文は折りたたんだ状態でも HTML に入っている（開いたときに読み直さない）
    expect(html).toContain("4行目");
  });

  it("複数あるときは、渡された順にすべて出す", () => {
    const html = render([
      { id: "m1", title: "一つ目", purpose: null, deadline: null },
      { id: "m2", title: "二つ目", purpose: null, deadline: null },
    ]);
    expect(html.indexOf("一つ目")).toBeGreaterThan(-1);
    expect(html.indexOf("二つ目")).toBeGreaterThan(html.indexOf("一つ目"));
  });

  it("呼び名を切り替えたテナントでは「イシュー」で出し、「ミッション」の語を出さない", () => {
    const withItem = render([{ id: "m1", title: "合成の問題", purpose: null, deadline: null }], true);
    expect(withItem).toContain("設定したイシュー（解くべき問題）");
    expect(withItem).not.toContain("ミッション");

    const empty = render([], true);
    expect(empty).toContain("イシュー（解くべき問題）を設定すると、ここに表示されます。");
    expect(empty).toContain("イシューを設定する");
    expect(empty).not.toContain("ミッション");
  });

  it("本文の記号はそのまま文字として出す（HTML として解釈しない）", () => {
    const html = render([{ id: "m1", title: "A & B <b>", purpose: "x < y", deadline: null }]);
    expect(html).toContain("A &amp; B &lt;b&gt;");
    expect(html).toContain("x &lt; y");
  });
});
