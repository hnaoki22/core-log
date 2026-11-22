import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CoachReplyCard,
  CoachReplyFailed,
  CoachReplyList,
  CoachReplyListView,
  CoachReplyPanel,
  CoachReplyReading,
} from "./CoachReply";
import { COACH_TERMS } from "@/lib/coach-reply";

// この環境のテストは DOM なし（Node）なので、最初の描画だけを確かめる（通信のあとの表示は、
// 表示だけの部品に値を渡して確かめる）。テストの文は合成データ。
const REPLY = "「在庫の数字が合わない」と言われたのですね。\n\nその場で、次に何を聞きましたか。\n\nあした、だれに、何を確かめますか。";

describe("CoachReplyCard", () => {
  it("届いた返信は、文と、どの日の記入への返信かを出す", () => {
    const html = renderToStaticMarkup(
      createElement(CoachReplyCard, { view: { state: "delivered", replyDate: "2026-01-06", content: REPLY } })
    );
    expect(html).toContain(COACH_TERMS.name);
    expect(html).toContain(`1/6${COACH_TERMS.replyDateSuffix}`);
    expect(html).toContain("その場で、次に何を聞きましたか。");
    // 段落の改行を保つ
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).not.toContain(COACH_TERMS.pending);
  });

  it("確認待ちは、案内だけを出す（返信の文を持たない）", () => {
    const html = renderToStaticMarkup(
      createElement(CoachReplyCard, { view: { state: "pending", replyDate: "2026-01-06" } })
    );
    expect(html).toContain(COACH_TERMS.pending);
    expect(html).toContain(`1/6${COACH_TERMS.replyDateSuffix}`);
  });

  it("返信の文に入った記号は、文字として出す（タグとして解釈しない）", () => {
    const html = renderToStaticMarkup(
      createElement(CoachReplyCard, {
        view: { state: "delivered", replyDate: "2026-01-06", content: '<script>alert("x")</script>' },
      })
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("読んでいるあいだ・作れなかったとき", () => {
  it("読んでいるあいだの表示", () => {
    expect(renderToStaticMarkup(createElement(CoachReplyReading))).toContain(COACH_TERMS.reading);
  });

  it("作れなかったときは、その旨と、もう一度頼むボタンを出す", () => {
    const html = renderToStaticMarkup(createElement(CoachReplyFailed, { onRetry: () => {} }));
    expect(html).toContain(COACH_TERMS.failed);
    expect(html).toContain(COACH_TERMS.retry);
  });

  it("もう一度頼む先が無いときは、ボタンを出さない", () => {
    const html = renderToStaticMarkup(createElement(CoachReplyFailed));
    expect(html).toContain(COACH_TERMS.failed);
    expect(html).not.toContain(COACH_TERMS.retry);
  });
});

describe("CoachReplyListView（「FB」のタブの一覧）", () => {
  it("返信が無く、作ってもいないときは、まだ無い旨を出す", () => {
    const html = renderToStaticMarkup(createElement(CoachReplyListView, { items: [], reading: false }));
    expect(html).toContain(COACH_TERMS.listHeading);
    expect(html).toContain(COACH_TERMS.listEmpty);
  });

  it("作ってもらっているあいだは、読んでいる表示を出す（「まだ無い」とは出さない）", () => {
    const html = renderToStaticMarkup(createElement(CoachReplyListView, { items: [], reading: true }));
    expect(html).toContain(COACH_TERMS.reading);
    expect(html).not.toContain(COACH_TERMS.listEmpty);
  });

  it("届いた返信と確認待ちを、渡された順に出す", () => {
    const html = renderToStaticMarkup(
      createElement(CoachReplyListView, {
        reading: false,
        items: [
          { state: "pending", replyDate: "2026-01-07" },
          { state: "delivered", replyDate: "2026-01-06", content: REPLY },
        ],
      })
    );
    expect(html.indexOf("1/7")).toBeGreaterThan(-1);
    expect(html.indexOf("1/7")).toBeLessThan(html.indexOf("1/6"));
    expect(html).toContain(COACH_TERMS.pending);
    expect(html).toContain("あした、だれに、何を確かめますか。");
    expect(html).not.toContain(COACH_TERMS.listEmpty);
  });
});

describe("CoachReplyListView：一覧が空のときの案内", () => {
  it("設計図が確認前の人には、確定すると届く旨を出す（「届きます」とだけは出さない）", () => {
    const html = renderToStaticMarkup(
      createElement(CoachReplyListView, { items: [], reading: false, emptyReason: "no_profile" })
    );
    expect(html).toContain(COACH_TERMS.listEmptyNoProfile);
    expect(html).not.toContain(COACH_TERMS.listEmpty);
  });

  it("受け取らない設定の人には、その設定であることと、切り替える場所を出す", () => {
    const html = renderToStaticMarkup(
      createElement(CoachReplyListView, { items: [], reading: false, emptyReason: "opted_out" })
    );
    expect(html).toContain(COACH_TERMS.listEmptyOptedOut);
    expect(html).not.toContain(COACH_TERMS.listEmpty);
    expect(html).not.toContain(COACH_TERMS.reading);
  });

  it("これまでの返信がある人には、案内を出さずに、返信を出す（受け取らない設定に変えたあとも、届いた返信は読める）", () => {
    const html = renderToStaticMarkup(
      createElement(CoachReplyListView, {
        reading: false,
        emptyReason: "opted_out",
        items: [{ state: "delivered", replyDate: "2026-01-06", content: REPLY }],
      })
    );
    expect(html).toContain("あした、だれに、何を確かめますか。");
    expect(html).not.toContain(COACH_TERMS.listEmptyOptedOut);
  });

  it("作ってもらっているあいだは、これまでの返信の上に「読んでいます」を出す", () => {
    const html = renderToStaticMarkup(
      createElement(CoachReplyListView, {
        reading: true,
        items: [{ state: "delivered", replyDate: "2026-01-05", content: REPLY }],
      })
    );
    expect(html.indexOf(COACH_TERMS.reading)).toBeGreaterThan(-1);
    expect(html.indexOf(COACH_TERMS.reading)).toBeLessThan(html.indexOf("1/5"));
  });
});

describe("通信をする部品の、最初の描画", () => {
  it("完了の画面の部品は、返してよい人かを確かめ終えるまで、何も出さない（「読んでいます」も出さない）", () => {
    expect(renderToStaticMarkup(createElement(CoachReplyPanel, { token: "tok_synthetic" }))).toBe("");
  });

  it("一覧の部品は、出してよいと分かるまで、何も出さない", () => {
    expect(renderToStaticMarkup(createElement(CoachReplyList, { token: "tok_synthetic" }))).toBe("");
  });
});
