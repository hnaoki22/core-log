import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/link は Next のルーターに依存するので、素の <a> に置き換える（行き先だけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

import { BlueprintEntryLink } from "./BlueprintEntryLink";
import { COACHING_TERMS } from "@/lib/coaching-profile";

describe("BlueprintEntryLink（描画）", () => {
  it("設計図のページへのリンクと、入口の文言を出す", () => {
    const html = renderToStaticMarkup(createElement(BlueprintEntryLink, { href: "/p/test-token/blueprint" }));
    expect(html).toContain('href="/p/test-token/blueprint"');
    expect(html).toContain(COACHING_TERMS.entryTitle);
    expect(html).toContain(COACHING_TERMS.entryLead);
  });

  it("入口の文言は、設計図のページの名前と同じ「設計図」", () => {
    expect(COACHING_TERMS.entryTitle).toBe(COACHING_TERMS.pageTitle);
  });
});
