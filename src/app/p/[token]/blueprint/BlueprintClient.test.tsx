import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// リンクと下のタブは、ルーターに依存するので置き換える（欄の出る・出ないだけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => createElement("a", { href }, children),
}));
vi.mock("@/components/BottomNav", () => ({
  BottomNav: () => createElement("nav", { "data-testid": "bottom-nav" }),
}));

import BlueprintClient, { type BlueprintCoachProps } from "./BlueprintClient";
import { COACHING_TERMS, type CoachingProfile } from "@/lib/coaching-profile";
import { COACH_TERMS } from "@/lib/coach-reply";

// この環境のテストは DOM なし（Node）なので、最初の描画だけを確かめる。テストの文は合成データ。
const profile: CoachingProfile = {
  headline: "会議の前に、相手に聞く問いを1つ決める",
  growthTheme: "自分の答えを先に言ってしまう",
  actions: "週次の会議で、最初に相手の見方を聞く",
  expected: "",
  stallPoints: "",
  eveningQuestion: "",
  tendencies: [{ text: "抽象的な言葉で終わる", use: null }],
  status: "confirmed",
  confirmedAt: "2026-01-05T00:00:00.000Z",
  updatedAt: "2026-01-05T00:00:00.000Z",
};

function render(initialProfile: CoachingProfile | null, coach?: BlueprintCoachProps): string {
  return renderToStaticMarkup(
    createElement(BlueprintClient, { token: "tok_synthetic", initialProfile, loadFailed: false, coach })
  );
}

describe("BlueprintClient：AIコーチの欄（feature.coachReply）", () => {
  it("AIコーチの返信を出していない環境では、AIコーチの欄も、傾向の欄の一文も出さない（元の画面のまま）", () => {
    for (const html of [render(profile), render(profile, null)]) {
      expect(html).toContain(COACHING_TERMS.tendenciesHelp);
      expect(html).not.toContain("AIコーチ");
    }
  });

  it("出している環境では、説明と「受け取る・受け取らない」を出し、傾向の欄に「使う」の意味を足す", () => {
    const html = render(profile, { optIn: true, loadFailed: false });
    expect(html).toContain(COACH_TERMS.aboutHeading);
    expect(html).toContain(COACH_TERMS.optInLabel);
    expect(html).toContain(COACH_TERMS.optInOn);
    expect(html).toContain(COACH_TERMS.optInOff);
    expect(html).toContain(`${COACHING_TERMS.tendenciesHelp}${COACH_TERMS.tendenciesNote}`);
  });

  it("設計図がまだ無い人には、ボタンを出さず、確定すると選べる旨を出す", () => {
    const html = render(null, { optIn: null, loadFailed: false });
    expect(html).toContain(COACH_TERMS.aboutHeading);
    expect(html).toContain(COACH_TERMS.optInNeedsProfile);
    expect(html).not.toContain(COACH_TERMS.optInHelp);
  });

  it("確認前の下書きがある人は、確定の前でも「受け取らない」を選べる", () => {
    const html = render({ ...profile, status: "draft", confirmedAt: null }, { optIn: true, loadFailed: false });
    expect(html).toContain(COACH_TERMS.optInHelp);
    expect(html).not.toContain(COACH_TERMS.optInNeedsProfile);
  });

  it("いまの設定を読めなかったときは、その旨を出す", () => {
    const html = render(profile, { optIn: null, loadFailed: true });
    expect(html).toContain(COACH_TERMS.optInLoadFailed);
    expect(html).not.toContain(COACH_TERMS.optInHelp);
  });
});
