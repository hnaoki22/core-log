import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// リンクは、ルーターに依存するので置き換える（タブの出る・出ないだけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => createElement("a", { href }, children),
}));

// スイッチ（機能フラグ）は、テストごとに ON にするキーを差し替える。
const flagState = vi.hoisted(() => ({ on: new Set<string>(), loaded: true }));
vi.mock("@/lib/use-features", () => ({
  useFeatures: () => ({
    flags: {},
    loaded: flagState.loaded,
    isOn: (key: string) => flagState.on.has(key),
  }),
}));

import { BottomNav } from "./BottomNav";

const FB_HREF = 'href="/p/tok_synthetic/feedback"';

function render(feedbackTotal = 0): string {
  return renderToStaticMarkup(
    createElement(BottomNav, {
      active: "home",
      baseUrl: "/p/tok_synthetic",
      badges: { feedback: 0, feedbackTotal, mission: 0 },
    })
  );
}

describe("BottomNav：「FB」のタブ", () => {
  beforeEach(() => {
    flagState.on = new Set<string>();
    flagState.loaded = true;
  });

  it("フィードバック機能が OFF で、届いたものも無い環境では、出さない（これまでどおり）", () => {
    expect(render()).not.toContain(FB_HREF);
  });

  it("フィードバック機能が ON の環境では、出す（これまでどおり）", () => {
    flagState.on = new Set(["feature.managerFeedback"]);
    expect(render()).toContain(FB_HREF);
  });

  it("フィードバック機能が OFF でも、届いたものが 1 件でもあれば、出す（これまでどおり）", () => {
    expect(render(1)).toContain(FB_HREF);
  });

  it("AIコーチの返信を出している環境では、フィードバック機能が OFF でも、出す（返信の一覧がこのタブにあるため）", () => {
    flagState.on = new Set(["feature.coachReply", "feature.coachingProfile"]);
    expect(render()).toContain(FB_HREF);
  });

  it("AIコーチの返信と設計図の、片方だけが ON の環境では、出さない", () => {
    flagState.on = new Set(["feature.coachReply"]);
    expect(render()).not.toContain(FB_HREF);
    flagState.on = new Set(["feature.coachingProfile"]);
    expect(render()).not.toContain(FB_HREF);
  });

  it("スイッチを読み終えるまでは、これまでどおり出す", () => {
    flagState.loaded = false;
    expect(render()).toContain(FB_HREF);
  });
});
