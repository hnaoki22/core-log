import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// リンクと下のタブは、ルーターに依存するので置き換える（入口の出る・出ないだけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/components/BottomNav", () => ({
  BottomNav: () => createElement("nav", { "data-testid": "bottom-nav" }),
}));

// スイッチ（機能フラグ）は、テストごとに ON にするキーを差し替える。
const flagState = vi.hoisted(() => ({ on: new Set<string>() }));
vi.mock("@/lib/use-features", () => ({
  useFeatures: () => ({
    flags: {},
    loaded: true,
    isOn: (key: string) => flagState.on.has(key),
  }),
}));

import ParticipantHomeClient, { type ParticipantHomeInitialData } from "./ParticipantHomeClient";
import { COACHING_TERMS } from "@/lib/coaching-profile";

// この環境のテストは DOM なし（Node）なので、最初の描画だけを確かめる。合成データのみ。
const BLUEPRINT_HREF = 'href="/p/tok_synthetic/blueprint"';

function render(standalone: ParticipantHomeInitialData["standalone"]): string {
  const initialData: ParticipantHomeInitialData = {
    participant: { id: "p-1", name: "見本 太郎", department: "見本部", dojoPhase: "道場1", weekNum: 1 },
    logs: [],
    badges: { feedback: 0, feedbackTotal: 0, mission: 0 },
    unreadFeedback: 0,
    stats: null,
    standalone,
    quickNotes: [],
  };
  return renderToStaticMarkup(createElement(ParticipantHomeClient, { token: "tok_synthetic", initialData }));
}

describe("ParticipantHomeClient：設計図への入口（feature.coachingProfile）", () => {
  beforeEach(() => {
    flagState.on = new Set<string>();
  });

  it("スイッチが OFF の環境では、入口を出さない（元の画面のまま）", () => {
    const html = render(null);
    expect(html).not.toContain(BLUEPRINT_HREF);
    expect(html).not.toContain(COACHING_TERMS.entryLead);
  });

  it("スイッチが ON の従来型の環境では、設計図のページへの入口を出す", () => {
    flagState.on = new Set(["feature.coachingProfile"]);
    const html = render(null);
    expect(html).toContain(BLUEPRINT_HREF);
    expect(html).toContain(COACHING_TERMS.entryLead);
  });

  it("商品モードの環境では、スイッチが ON でも入口を出さない", () => {
    flagState.on = new Set(["feature.coachingProfile"]);
    const html = render({ unlocked: false, daysElapsed: 1, entryDays: 0 });
    expect(html).not.toContain(BLUEPRINT_HREF);
    expect(html).not.toContain(COACHING_TERMS.entryLead);
  });
});
