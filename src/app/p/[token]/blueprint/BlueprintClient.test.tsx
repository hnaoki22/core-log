import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// リンクと下のタブは、ルーターに依存するので置き換える（欄の出る・出ないだけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => createElement("a", { href }, children),
}));
vi.mock("@/components/BottomNav", () => ({
  // どのタブを選んだ表示にしているかを、属性で見られるようにする。
  BottomNav: ({ active }: { active: string }) => createElement("nav", { "data-testid": "bottom-nav", "data-active": active }),
}));

import BlueprintClient, { type BlueprintCoachProps, type BlueprintIssueProps } from "./BlueprintClient";
import { COACHING_TERMS, type CoachingProfile } from "@/lib/coaching-profile";
import { COACH_TERMS } from "@/lib/coach-reply";
import { ISSUE_HYPOTHESIS_LABEL, missionTerms } from "@/lib/mission-context";

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

function render(
  initialProfile: CoachingProfile | null,
  coach?: BlueprintCoachProps,
  issue?: BlueprintIssueProps,
  loadFailed = false
): string {
  return renderToStaticMarkup(
    createElement(BlueprintClient, { token: "tok_synthetic", initialProfile, loadFailed, coach, issue })
  );
}

/** html の中で、needles がこの順に出てくるか。 */
function inOrder(html: string, needles: string[]): boolean {
  let at = -1;
  for (const needle of needles) {
    const next = html.indexOf(needle, at + 1);
    if (next === -1) return false;
    at = next;
  }
  return true;
}

const ISSUE: NonNullable<BlueprintIssueProps> = {
  useIssueLabel: true,
  view: {
    current: { id: "m1", title: "誰の、どの手戻りを減らすのか", hypothesis: "依頼の時点で、完成の形が決まっていない" },
    otherActiveCount: 0,
  },
};

describe("BlueprintClient：いまのイシューと、欄のまとまり", () => {
  it("先頭に、いまのイシューと仮説を出し、そのあとに 2 つのまとまりを出す", () => {
    const html = render(profile, null, ISSUE);
    const t = missionTerms(true);
    expect(
      inOrder(html, [
        t.blueprintHeading,
        "誰の、どの手戻りを減らすのか",
        ISSUE_HYPOTHESIS_LABEL,
        "依頼の時点で、完成の形が決まっていない",
        t.blueprintActionsHeading,
        COACHING_TERMS.actionsLabel,
        COACHING_TERMS.expectedLabel,
        COACHING_TERMS.selfGroupHeading,
        COACHING_TERMS.growthThemeLabel,
        COACHING_TERMS.headlineLabel,
        COACHING_TERMS.stallPointsLabel,
        COACHING_TERMS.eveningQuestionLabel,
      ])
    ).toBe(true);
    expect(html).toContain('href="/p/tok_synthetic/mission"');
  });

  it("6 つの欄は、まとまりを分けても、すべて出す（保存する欄は変えていない）", () => {
    const html = render(profile, null, ISSUE);
    for (const id of ["bp-actions", "bp-expected", "bp-growthTheme", "bp-headline", "bp-stallPoints", "bp-evening-question"]) {
      expect(html.split(`id="${id}"`).length - 1).toBe(1);
    }
    // 欄には、保存済みの文が入っている。
    expect(html).toContain("会議の前に、相手に聞く問いを1つ決める");
    expect(html).toContain("週次の会議で、最初に相手の見方を聞く");
  });

  it("進行中のイシューが無いときは、設定先への案内を出す", () => {
    const html = render(profile, null, { useIssueLabel: true, view: { current: null, otherActiveCount: 0 } });
    const t = missionTerms(true);
    expect(html).toContain(t.inputCardEmpty);
    expect(html).toContain(t.inputCardEmptyLink);
    expect(html).toContain(t.blueprintActionsHeading);
  });

  it("イシューを読めなかったときは、枠を出さない（「まだ設定されていません」とも出さない）", () => {
    const html = render(profile, null, { useIssueLabel: true, view: null });
    const t = missionTerms(true);
    expect(html).not.toContain(t.blueprintHeading);
    expect(html).not.toContain(t.inputCardEmpty);
    // 欄と見出しは、いつもどおり出す。
    expect(html).toContain(t.blueprintActionsHeading);
    expect(html).toContain(COACHING_TERMS.selfGroupHeading);
  });

  it("ミッション機能を出していない環境では、枠を出さず、見出しもイシューを前提にしない", () => {
    for (const html of [render(profile), render(profile, null, null)]) {
      expect(html).not.toContain("イシュー");
      expect(html).not.toContain("ミッション");
      expect(html).toContain(COACHING_TERMS.actionsGroupHeading);
      expect(html).toContain(COACHING_TERMS.selfGroupHeading);
    }
  });

  it("呼び名が「ミッション」の環境では、ミッションの言葉で出す", () => {
    const html = render(profile, null, {
      useIssueLabel: false,
      view: { current: { id: "m1", title: "提案書を自力で仕上げる", hypothesis: null }, otherActiveCount: 0 },
    });
    const t = missionTerms(false);
    expect(html).toContain(t.blueprintHeading);
    expect(html).toContain(t.blueprintActionsHeading);
    expect(html).not.toContain("イシュー");
  });

  it("設計図を読めなかったときは、いまのイシューも欄も出さない", () => {
    const html = render(null, null, ISSUE, true);
    expect(html).toContain("設計図を読み込めませんでした");
    expect(html).not.toContain(missionTerms(true).blueprintHeading);
    expect(html).not.toContain('id="bp-headline"');
  });

  it("下のタブは、「ホーム」を選んだ表示にする（「イシュー」のページの中の扱いにしない）", () => {
    expect(render(profile, null, ISSUE)).toContain('data-active="home"');
  });
});

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

  it("前回の問いを、メールと記入画面に出している環境では、そのことを説明に足す（feature.coachPreviousQuestion）", () => {
    const html = render(profile, { optIn: true, loadFailed: false, previousQuestion: true });
    expect(html).toContain(COACH_TERMS.aboutLinePreviousQuestion);
    // もとの説明文は、そのまま出る。
    for (const line of COACH_TERMS.aboutLines) expect(html).toContain(line);
  });

  it("前回の問いを出していない環境の説明は、これまでと同じ（指定なし・false）", () => {
    const base = render(profile, { optIn: true, loadFailed: false });
    expect(base).not.toContain(COACH_TERMS.aboutLinePreviousQuestion);
    expect(render(profile, { optIn: true, loadFailed: false, previousQuestion: false })).toBe(base);
  });

  it("設計図がまだ無い人・確認前の人にも、説明の 1 行は出す（確定の前に読めるように）", () => {
    const none = render(null, { optIn: null, loadFailed: false, previousQuestion: true });
    expect(none).toContain(COACH_TERMS.aboutLinePreviousQuestion);
    const draft = render(
      { ...profile, status: "draft", confirmedAt: null },
      { optIn: true, loadFailed: false, previousQuestion: true }
    );
    expect(draft).toContain(COACH_TERMS.aboutLinePreviousQuestion);
  });
});
