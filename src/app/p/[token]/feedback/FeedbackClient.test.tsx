import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// 下のタブは、ルーターに依存するので置き換える（ページの出し分けだけを見る）。
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

import FeedbackClient, { type FeedbackInitialData } from "./FeedbackClient";

// この環境のテストは DOM なし（Node）なので、最初の描画だけを確かめる。AIコーチの返信の一覧は、
// 通信のあとに出るので、ここでは「ページを出すかどうか」だけを見る（一覧の表示は CoachReply.test.tsx）。
const OFF_SCREEN = "フィードバック機能は現在オフです";
const EMPTY = "フィードバックはまだありません";

function render(feedbacks: FeedbackInitialData["feedbacks"] = []): string {
  const initialData: FeedbackInitialData = { feedbacks, unreadCount: 0, totalCount: feedbacks.length };
  return renderToStaticMarkup(createElement(FeedbackClient, { token: "tok_synthetic", initialData }));
}

describe("FeedbackClient：ページを出すかどうか", () => {
  beforeEach(() => {
    flagState.on = new Set<string>();
  });

  it("フィードバック機能が OFF で、届いたものも無い環境では、「オフです」の画面を出す（これまでどおり）", () => {
    const html = render();
    expect(html).toContain(OFF_SCREEN);
    expect(html).not.toContain(EMPTY);
  });

  it("フィードバック機能が ON の環境では、一覧のページを出す（これまでどおり）", () => {
    flagState.on = new Set(["feature.managerFeedback"]);
    const html = render();
    expect(html).toContain(EMPTY);
    expect(html).not.toContain(OFF_SCREEN);
  });

  it("AIコーチの返信を出している環境では、フィードバック機能が OFF でも、一覧のページを出す", () => {
    flagState.on = new Set(["feature.coachReply", "feature.coachingProfile"]);
    const html = render();
    expect(html).not.toContain(OFF_SCREEN);
    expect(html).toContain(EMPTY);
  });

  it("AIコーチの返信と設計図の、片方だけが ON の環境では、これまでどおり「オフです」の画面を出す", () => {
    flagState.on = new Set(["feature.coachReply"]);
    expect(render()).toContain(OFF_SCREEN);
  });

  it("フィードバック機能が ON の環境では、AIコーチの返信のスイッチが ON でも、最初の描画は変わらない", () => {
    // 一覧は、サーバーが「出してよい」と答えるまで、何も出さない（空の余白も残さない）。
    flagState.on = new Set(["feature.managerFeedback"]);
    const before = render();
    flagState.on = new Set(["feature.managerFeedback", "feature.coachReply", "feature.coachingProfile"]);
    expect(render()).toBe(before);
  });

  it("運営のフィードバックは、これまでどおり出す（AIコーチの返信を出している環境でも）", () => {
    flagState.on = new Set(["feature.managerFeedback", "feature.coachReply", "feature.coachingProfile"]);
    const html = render([
      {
        id: "f-1",
        participantName: "見本 太郎",
        authorName: "運営 花子",
        type: "HMフィードバック",
        content: "今週の記入を読みました。",
        period: "",
        weekNum: 0,
        date: "2026-01-06",
        isRead: true,
      },
    ]);
    expect(html).toContain("今週の記入を読みました。");
    expect(html).toContain("HMフィードバック");
  });
});
