import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/link は Next のルーターに依存するので、素の <a> に置き換える（行き先だけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

import { MissionContextCard } from "./MissionContextCard";
import { composeIssuePurpose, missionTerms, type MissionContextItem } from "@/lib/mission-context";

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
    const withItem = render([{ id: "m1", title: "合成の問い", purpose: null, deadline: null }], true);
    expect(withItem).toContain("設定したイシュー（解くべき問い）");
    expect(withItem).not.toContain("ミッション");

    const empty = render([], true);
    expect(empty).toContain("イシュー（解くべき問い）と仮説を設定すると、ここに表示されます。");
    expect(empty).toContain("イシューを設定する");
    expect(empty).not.toContain("ミッション");
  });

  it("仮説つきで設定された文は、仮説を折りたたまずに出し、見出しの記号は出さない", () => {
    const purpose = composeIssuePurpose("合成の仮説の文", "合成の計画の文");
    const html = render([{ id: "m1", title: "合成の問い", purpose, deadline: "2026-12-17" }], true);
    expect(html).toContain(">仮説</p>");
    expect(html).toContain("合成の仮説の文");
    expect(html).toContain("合成の計画の文");
    expect(html).toContain("期限: 12/17");
    // 保存用の見出し（【仮説】など）は画面に出さない。
    expect(html).not.toContain("【仮説】");
    expect(html).not.toContain("【目指す状態と、これからの行動】");
    // 問い → 仮説 → 期限 → 目指す状態・行動 の順。
    const order = ["合成の問い", "合成の仮説の文", "期限: 12/17", "合成の計画の文"].map((s) => html.indexOf(s));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });

  it("仮説が長くても折りたたまず、残りの部分だけを 3 行に折りたたむ", () => {
    const longHypothesis = "あ".repeat(120);
    const longPlan = ["1行目", "2行目", "3行目", "4行目", "5行目"].join("\n");
    const html = render(
      [{ id: "m1", title: "合成の問い", purpose: composeIssuePurpose(longHypothesis, longPlan), deadline: null }],
      true
    );
    expect(html).toContain(longHypothesis);
    expect(html).toContain("続きを見る");
    // 折りたたみの指定は 1 か所（残りの部分）だけ。
    expect(html.split("line-clamp-3").length - 1).toBe(1);
    const clampAt = html.indexOf("line-clamp-3");
    expect(clampAt).toBeGreaterThan(html.indexOf(longHypothesis));
  });

  it("仮説だけが設定されているときは、仮説を出し、「続きを見る」は出さない", () => {
    const html = render(
      [{ id: "m1", title: "合成の問い", purpose: composeIssuePurpose("あ".repeat(120), ""), deadline: null }],
      true
    );
    expect(html).toContain(">仮説</p>");
    expect(html).not.toContain("続きを見る");
    expect(html).not.toContain("line-clamp-3");
  });

  it("見出しのない文（従来の登録）は、仮説の欄を出さず、これまでどおり全体を出す", () => {
    const html = render([{ id: "m1", title: "合成のミッション", purpose: "従来の背景と目的", deadline: null }]);
    expect(html).not.toContain(">仮説</p>");
    expect(html).toContain("従来の背景と目的");
  });

  it("本文の記号はそのまま文字として出す（HTML として解釈しない）", () => {
    const html = render([{ id: "m1", title: "A & B <b>", purpose: "x < y", deadline: null }]);
    expect(html).toContain("A &amp; B &lt;b&gt;");
    expect(html).toContain("x &lt; y");
  });
});
