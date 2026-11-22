import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminBlueprintCard } from "./AdminBlueprintCard";
import { ADMIN_BLUEPRINT_TERMS, COACHING_TERMS, type CoachingProfile } from "@/lib/coaching-profile";

// テストのデータは合成（実在の環境・人物・設計図は使わない）。
// この環境のテストは DOM なし（Node）なので、開閉は確かめられない。最初の描画で何が出るかを確かめる。

const CONFIRMED: CoachingProfile = {
  headline: "合成の毎朝の一文",
  growthTheme: "合成の成長課題",
  actions: "合成の行動\n2 行目",
  expected: "合成の期待する結果",
  stallPoints: "合成の止まりそうな場面",
  eveningQuestion: "合成の夕方の問い",
  tendencies: [
    { text: "合成の傾向（使う）", use: true },
    { text: "合成の傾向（使わない）", use: false },
    { text: "合成の傾向（未選択）", use: null },
  ],
  status: "confirmed",
  // 日本時間では 1/11
  confirmedAt: "2026-01-10T16:00:00Z",
  updatedAt: "2026-01-12T03:00:00Z",
};

const DRAFT: CoachingProfile = {
  ...CONFIRMED,
  expected: "",
  stallPoints: "  ",
  tendencies: [],
  status: "draft",
  confirmedAt: null,
  updatedAt: "2026-01-09T03:00:00Z",
};

function render(props: { profile: CoachingProfile | null; loadFailed?: boolean }): string {
  return renderToStaticMarkup(createElement(AdminBlueprintCard, props));
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("AdminBlueprintCard（描画）", () => {
  it("確認済みの設計図：状態と、確定した日（日本時間）、6 つの欄と傾向を出す", () => {
    const html = render({ profile: CONFIRMED });
    expect(html).toContain(`>${COACHING_TERMS.pageTitle}<`);
    expect(html).toContain(`>${COACHING_TERMS.statusConfirmed}<`);
    expect(html).toContain(ADMIN_BLUEPRINT_TERMS.confirmedOn("1/11"));
    expect(html).not.toContain(ADMIN_BLUEPRINT_TERMS.draftNote);
    for (const label of [
      COACHING_TERMS.headlineLabel,
      COACHING_TERMS.growthThemeLabel,
      COACHING_TERMS.actionsLabel,
      COACHING_TERMS.expectedLabel,
      COACHING_TERMS.stallPointsLabel,
      COACHING_TERMS.eveningQuestionLabel,
      COACHING_TERMS.tendenciesLabel,
    ]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain("合成の毎朝の一文");
    expect(html).toContain("合成の行動\n2 行目");
    expect(html).toContain("合成の夕方の問い");
  });

  it("毎朝の一文は、開かずに読める。ほかの欄は、開いて読む枠の中に置く", () => {
    const html = render({ profile: CONFIRMED });
    const details = html.indexOf("<details");
    expect(details).toBeGreaterThan(-1);
    expect(html.indexOf("合成の毎朝の一文")).toBeLessThan(details);
    expect(html.indexOf("合成の成長課題")).toBeGreaterThan(details);
    expect(html).toContain(ADMIN_BLUEPRINT_TERMS.detailsSummary);
    // 最初は閉じておく
    expect(html).not.toContain('<details open=""');
  });

  it("傾向は、本人の選択（使う／使わない／未選択）と一緒に出す", () => {
    const html = render({ profile: CONFIRMED });
    expect(html).toContain("合成の傾向（使う）");
    expect(html).toContain(`>${COACHING_TERMS.tendencyUse}<`);
    expect(html).toContain(`>${COACHING_TERMS.tendencyNotUse}<`);
    expect(html).toContain(`>${ADMIN_BLUEPRINT_TERMS.tendencyUnset}<`);
  });

  it("確認前の設計図：確認前と分かる状態と説明、最後に変わった日を出す。確定の日は出さない", () => {
    const html = render({ profile: DRAFT });
    expect(html).toContain(`>${COACHING_TERMS.statusDraft}<`);
    expect(html).not.toContain(`>${COACHING_TERMS.statusConfirmed}<`);
    expect(html).toContain(ADMIN_BLUEPRINT_TERMS.draftNote);
    expect(html).toContain(ADMIN_BLUEPRINT_TERMS.updatedOn("1/9"));
    expect(html).not.toContain("確定 ");
    expect(html).toContain("合成の毎朝の一文");
  });

  it("空の欄は「（空欄）」と出す。傾向が無いときは、傾向の枠を出さない", () => {
    const html = render({ profile: DRAFT });
    // expected（空）と stallPoints（空白だけ）
    expect(count(html, ADMIN_BLUEPRINT_TERMS.emptyField)).toBe(2);
    expect(html).not.toContain(COACHING_TERMS.tendenciesLabel);
  });

  it("まだ無いとき：その旨と状態を出す。欄は出さない", () => {
    const html = render({ profile: null });
    expect(html).toContain(`>${ADMIN_BLUEPRINT_TERMS.noneStatus}<`);
    expect(html).toContain(ADMIN_BLUEPRINT_TERMS.none);
    expect(html).not.toContain(COACHING_TERMS.headlineLabel);
    expect(html).not.toContain(ADMIN_BLUEPRINT_TERMS.loadFailed);
  });

  it("読めなかったとき：「まだ無い」とは出さず、読めなかった旨を出す（設計図を渡されていても、中身は出さない）", () => {
    const html = render({ profile: CONFIRMED, loadFailed: true });
    expect(html).toContain(ADMIN_BLUEPRINT_TERMS.loadFailed);
    expect(html).not.toContain(ADMIN_BLUEPRINT_TERMS.none);
    expect(html).not.toContain(ADMIN_BLUEPRINT_TERMS.noneStatus);
    expect(html).not.toContain("合成の毎朝の一文");
  });

  it("直す操作（入力欄・ボタン）は無い（読むだけ）", () => {
    const html = render({ profile: CONFIRMED });
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
  });

  it("運営の側の説明は、確認前の内容が何に使われないかを書く", () => {
    expect(ADMIN_BLUEPRINT_TERMS.draftNote).toContain("メール");
    expect(ADMIN_BLUEPRINT_TERMS.draftNote).toContain("AIコーチ");
    expect(ADMIN_BLUEPRINT_TERMS.draftNote).toContain("使われません");
  });
});
