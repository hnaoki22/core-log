import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/link は Next のルーターに依存するので、素の <a> に置き換える（行き先だけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

import { BlueprintReviewNotice } from "./BlueprintReviewNotice";
import { COACHING_TERMS } from "@/lib/coaching-profile";
import { missionTerms } from "@/lib/mission-context";

function render(useIssueLabel: boolean): string {
  return renderToStaticMarkup(
    createElement(BlueprintReviewNotice, {
      text: missionTerms(useIssueLabel).createdNotice,
      href: "/p/test-token/blueprint",
      onDismiss: () => {},
    })
  );
}

describe("BlueprintReviewNotice（描画）", () => {
  it("設計図の見直しの案内と、設計図のページへのリンク、「あとで」を出す", () => {
    const html = render(true);
    expect(html).toContain(missionTerms(true).createdNotice);
    expect(html).toContain('href="/p/test-token/blueprint"');
    expect(html).toContain(COACHING_TERMS.reviewNoticeLink);
    expect(html).toContain(COACHING_TERMS.reviewNoticeDismiss);
  });

  it("消すボタンに、「閉じる」の言葉を使わない（イシューを閉じる操作と取り違えないように）", () => {
    expect(COACHING_TERMS.reviewNoticeDismiss).not.toContain("閉じる");
    expect(render(true)).not.toContain("閉じる");
  });

  it("呼び名が「ミッション」の環境では、ミッションの言葉で案内する", () => {
    const html = render(false);
    expect(html).toContain(missionTerms(false).createdNotice);
    expect(html).not.toContain("イシュー");
  });
});
