import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/link は Next のルーターに依存するので、素の <a> に置き換える（行き先だけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

import { CoachingProfileCard } from "./CoachingProfileCard";
import type { CoachingProfileCardData } from "@/lib/coaching-profile";

// テストの文は合成データ（実在の記入・実在の人物の記述は使わない）。
const HREF = "/p/test-token/blueprint";

function render(data: CoachingProfileCardData): string {
  return renderToStaticMarkup(createElement(CoachingProfileCard, { data, profilePageHref: HREF }));
}

// この環境のテストは DOM なし（Node）なので、「続きを見る」を押す操作は確かめられない。
// ここでは最初の描画（閉じた状態）で何が出るかを確かめる。
describe("CoachingProfileCard（描画）", () => {
  it("確認前・未作成のときは、本人の文を出さず、設計図への案内だけを出す", () => {
    for (const state of ["none", "draft"] as const) {
      const html = render({ state, headline: "", growthTheme: "", actions: "" });
      expect(html).toContain("設計図を確認すると、ここに「毎朝の一文」が表示されます。");
      expect(html).toContain(`href="${HREF}"`);
      expect(html).toContain("設計図を確認する");
    }
  });

  it("確認済みのときは、毎朝の一文を出す。成長課題と行動は、開くまで出さない", () => {
    const html = render({
      state: "confirmed",
      headline: "最初に相手の困りごとを一つ聞く",
      growthTheme: "相手の話を聞く前に、自分の案を話してしまう。",
      actions: "毎週火曜の打合せで、最初の5分は質問だけにする。",
    });
    expect(html).toContain("毎朝の一文");
    expect(html).toContain("最初に相手の困りごとを一つ聞く");
    expect(html).toContain("続きを見る");
    expect(html).toContain("設計図を開く");
    expect(html).not.toContain("相手の話を聞く前に、自分の案を話してしまう。");
    expect(html).not.toContain("毎週火曜の打合せで");
  });

  it("成長課題も行動も空のときは、「続きを見る」を出さない", () => {
    const html = render({ state: "confirmed", headline: "一文", growthTheme: "", actions: "" });
    expect(html).toContain("一文");
    expect(html).not.toContain("続きを見る");
  });
});
