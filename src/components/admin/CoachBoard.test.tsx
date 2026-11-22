import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CoachBoardView, type CoachBoardRowView } from "./CoachBoard";
import { COACH_BOARD_TERMS as T, type CoachBoardState, type CoachReplyStatus } from "@/lib/coach-reply";

// この環境のテストは DOM なし（Node）なので、最初の描画だけを確かめる（取り下げの確認の表示は、
// 押したあとの状態なので、ここでは確かめられない）。テストのデータは合成（実在の人物・記入は使わない）。
const REPLY_TEXT = "「在庫の数字が合わない」と言われたのですね。\n\nあした、だれに、何を確かめますか。";

function row(
  name: string,
  state: CoachBoardState,
  reply: { status: CoachReplyStatus; content: string } | null,
  extra: Partial<CoachBoardRowView> = {}
): CoachBoardRowView {
  return {
    participantId: `p-${name}`,
    name,
    department: "見本部",
    profileStatus: "confirmed",
    coachEnabled: true,
    morning: "Q1: 今日は、どの場面で、何をしますか。\nA1: 週次の会議で、最初に見方を聞く",
    evening: "Q1: 何をして、何が起きましたか。\nA1: 最初に聞いたら「在庫の数字が合わない」と言われた",
    state,
    reply: reply
      ? {
          id: `r-${name}`,
          status: reply.status,
          content: reply.content,
          createdAt: "2026-01-06T09:05:00.000Z",
          model: "model-synthetic",
          inputsUsed: ["morning_entry", "evening_entry", "blueprint", "unknown_key"],
          reviewedAt: null,
        }
      : null,
    ...extra,
  };
}

const PENDING = row("確認 待子", "pending", { status: "pending_review", content: REPLY_TEXT });
const DELIVERED = row("届 済男", "delivered", { status: "delivered", content: REPLY_TEXT });
const HOLD = row("保留 一郎", "needs_attention", { status: "pending_review", content: "" });
const WITHDRAWN = row("取下 花子", "withdrawn", { status: "withdrawn", content: REPLY_TEXT });
const NOT_YET = row("未作成 次郎", "not_generated", null);
const NO_EVENING = row("未記入 三郎", "no_evening", null, { evening: "", morning: "" });

function render(rows: CoachBoardRowView[], canAct: boolean): string {
  return renderToStaticMarkup(createElement(CoachBoardView, { rows, canAct, onAction: () => {} }));
}

/** その人のカードの HTML（次の人のカードの手前まで）。 */
function cardOf(html: string, name: string, nextName?: string): string {
  const start = html.indexOf(name);
  const end = nextName ? html.indexOf(nextName) : html.length;
  return html.slice(start, end);
}

describe("CoachBoardView（運営の確認ページの一覧）", () => {
  it("記入（朝・夕方）と、返信の文、状態を出す", () => {
    const html = render([PENDING], true);
    expect(html).toContain("確認 待子");
    expect(html).toContain("見本部");
    expect(html).toContain("A1: 週次の会議で、最初に見方を聞く");
    expect(html).toContain("最初に聞いたら「在庫の数字が合わない」と言われた");
    expect(html).toContain(T.replyLabel);
    expect(html).toContain("あした、だれに、何を確かめますか。");
    expect(html).toContain(T.stateLabels.pending);
  });

  it("返信ごとに、作った日時（日本時間）、使った AI、AI に送ったものの種類を出す", () => {
    const html = render([DELIVERED], true);
    expect(html).toContain("作成 1/6 18:05");
    expect(html).toContain("model-synthetic");
    expect(html).toContain("朝の記入、夕方の記入、設計図、unknown_key");
  });

  it("管理者には、確認待ちの返信に「届ける」「取り下げる」を出す", () => {
    const card = render([PENDING], true);
    expect(card).toContain(T.deliver);
    expect(card).toContain(T.withdraw);
  });

  it("届いた返信には「取り下げる」だけ。取り下げ済みの返信には、ボタンを出さない", () => {
    const html = render([DELIVERED, WITHDRAWN], true);
    const delivered = cardOf(html, "届 済男", "取下 花子");
    expect(delivered).toContain(T.withdraw);
    expect(delivered).not.toContain(T.deliver);
    const withdrawn = cardOf(html, "取下 花子");
    expect(withdrawn).not.toContain("<button");
    expect(withdrawn).toContain(T.stateLabels.withdrawn);
  });

  it("返信を作らなかった記入には、理由と「確認済みにする」を出す（届けるものが無いので「届ける」は出さない）", () => {
    const html = render([HOLD], true);
    expect(html).toContain(T.stateLabels.needs_attention);
    expect(html).toContain(T.needsAttentionHelp);
    expect(html).toContain(T.acknowledge);
    expect(html).not.toContain(T.deliver);
    // 返信の文の枠は出さない
    expect(html).not.toContain(T.replyLabel);
  });

  it("返信がまだ無い人には、いつ作られるかを出す。ボタンは出さない", () => {
    const html = render([NOT_YET], true);
    expect(html).toContain(T.stateLabels.not_generated);
    expect(html).toContain(T.notGeneratedHelp);
    expect(html).not.toContain("<button");
  });

  it("記入が無い欄は「（記入なし）」と出す", () => {
    const html = render([NO_EVENING], true);
    expect(html).toContain(T.stateLabels.no_evening);
    expect(html.split(T.noEntry).length - 1).toBe(2);
  });

  it("閲覧者には、ボタンを出さず、閲覧専用の旨を出す（記入と返信は読める）", () => {
    const html = render([PENDING, DELIVERED, HOLD], false);
    expect(html).not.toContain("<button");
    expect(html).toContain(T.viewerNote);
    expect(html).toContain("あした、だれに、何を確かめますか。");
    expect(html).toContain(T.needsAttentionHelp);
  });

  it("管理者の画面には、閲覧専用の旨を出さない", () => {
    expect(render([PENDING], true)).not.toContain(T.viewerNote);
  });

  it("上に、状態ごとの件数を出す（0 件の状態は出さない）", () => {
    const html = render([HOLD, PENDING, DELIVERED, NOT_YET, NO_EVENING], true);
    const summary = html.slice(0, html.indexOf("保留 一郎"));
    expect(summary).toContain(`${T.stateLabels.needs_attention} 1`);
    expect(summary).toContain(`${T.stateLabels.pending} 1`);
    expect(summary).toContain(`${T.stateLabels.delivered} 1`);
    expect(summary).toContain(`${T.stateLabels.not_generated} 1`);
    expect(summary).toContain(`${T.stateLabels.no_evening} 1`);
    expect(summary).not.toContain(T.stateLabels.withdrawn);
  });

  it("並びは、渡された順のまま（順番は API が決める）", () => {
    const html = render([DELIVERED, PENDING], true);
    expect(html.indexOf("届 済男")).toBeLessThan(html.indexOf("確認 待子"));
  });

  it("ほかの操作の途中は、どの行のボタンも押せない", () => {
    const html = renderToStaticMarkup(
      createElement(CoachBoardView, {
        rows: [PENDING, DELIVERED],
        canAct: true,
        busyReplyId: "r-確認 待子",
        onAction: () => {},
      })
    );
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBe(3);
    expect(buttons.every((b) => b.includes('disabled=""'))).toBe(true);
  });

  it("記入や返信に入った記号は、文字として出す（タグとして解釈しない）", () => {
    const html = render(
      [row("記号 太郎", "pending", { status: "pending_review", content: "<b>太字</b>" }, { evening: "<img src=x>" })],
      true
    );
    expect(html).not.toContain("<b>太字</b>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;b&gt;太字&lt;/b&gt;");
  });
});
