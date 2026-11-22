import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// next/link は Next のルーターに依存するので、素の <a> に置き換える（行き先だけを見る）。
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) =>
    createElement("a", { href, className }, children),
}));

import { AdminDayLogList } from "./AdminDayLogList";
import { ADMIN_DAY_LOG_TERMS, buildAdminDayLogViews, type AdminDayLogSource } from "@/lib/admin-day-log";
import { COACH_BOARD_TERMS } from "@/lib/coach-reply";
import { combineQuestionAnswers } from "@/lib/daily-question-answers";

// テストのデータは合成（実在の環境・人物・記入は使わない）。
// この環境のテストは DOM なし（Node）なので、月の開閉は確かめられない。最初の描画で何が出るかを確かめる。

const MORNING = "合成の朝の呼び名";
const EVENING = "合成の夕の呼び名";

function day(partial: Partial<AdminDayLogSource> & { id: string; date: string }): AdminDayLogSource {
  return { status: "morning_only", ...partial };
}

function render(
  logs: AdminDayLogSource[],
  extra?: {
    replies?: Parameters<typeof buildAdminDayLogViews>[1];
    coachBoardHref?: ((date: string) => string) | null;
    coachLoadFailed?: boolean;
  }
): string {
  return renderToStaticMarkup(
    createElement(AdminDayLogList, {
      days: buildAdminDayLogViews(logs, extra?.replies ?? null),
      morningLabel: MORNING,
      eveningLabel: EVENING,
      formatTime: (iso) => (iso ? `時刻(${iso})` : ""),
      coachBoardHref: extra?.coachBoardHref,
      coachLoadFailed: extra?.coachLoadFailed,
    })
  );
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("AdminDayLogList（描画）", () => {
  it("記入が無いときは、見出しと、その旨を出す", () => {
    const html = render([]);
    expect(html).toContain(ADMIN_DAY_LOG_TERMS.heading);
    expect(html).toContain(ADMIN_DAY_LOG_TERMS.empty);
    expect(html).not.toContain('data-testid="admin-day-log"');
  });

  it("1 日＝1 枚。日付（曜日つき）を見出しにする", () => {
    const html = render([
      day({ id: "b", date: "2026-01-16", dayOfWeek: "金", morningIntent: "合成の朝2" }),
      day({ id: "a", date: "2026-01-15", dayOfWeek: "木", morningIntent: "合成の朝1" }),
    ]);
    expect(count(html, 'data-testid="admin-day-log"')).toBe(2);
    expect(html).toContain("1月16日（金）");
    expect(html).toContain("1月15日（木）");
    expect(html.indexOf("1月16日（金）")).toBeLessThan(html.indexOf("1月15日（木）"));
  });

  it("朝・夕の呼び名は、親が渡したものを使う。記入の無い側は、枠ごと出さない", () => {
    const html = render([day({ id: "a", date: "2026-01-15", morningIntent: "合成の朝" })]);
    expect(html).toContain(`>${MORNING}<`);
    expect(html).not.toContain(`>${EVENING}<`);
  });

  it("問いと答えの組で保存された記入は、問いごとに、問いと答えを分けて出す（保存用の見出しは出さない）", () => {
    const html = render([
      day({
        id: "a",
        date: "2026-01-15",
        status: "complete",
        morningIntent: combineQuestionAnswers(["合成の朝の問い"], ["合成の朝の答え"]),
        eveningInsight: combineQuestionAnswers(["合成の夕の問い1", "合成の夕の問い2"], ["合成の夕の答え1", ""]),
      }),
    ]);
    expect(html).toContain("合成の朝の問い");
    expect(html).toContain("合成の朝の答え");
    expect(html).toContain("合成の夕の問い2");
    // 答えの無い問いは、その旨を出す
    expect(html).toContain(ADMIN_DAY_LOG_TERMS.noAnswer);
    expect(html).not.toContain("A1:");
    expect(html).not.toContain("Q1:");
  });

  it("自由記入の文は、保存した文のまま、改行を保って出す", () => {
    const html = render([day({ id: "a", date: "2026-01-15", morningIntent: "合成の 1 行目\n合成の 2 行目" })]);
    expect(html).toContain("合成の 1 行目\n合成の 2 行目");
    expect(html).toContain("whitespace-pre-wrap");
  });

  it("記入の時刻は、親が渡した出し方で出す。時刻が無ければ出さない", () => {
    const html = render([
      day({ id: "a", date: "2026-01-15", morningIntent: "合成の朝", morningTime: "2026-01-15T00:10:00Z" }),
      day({ id: "b", date: "2026-01-14", morningIntent: "合成の朝" }),
    ]);
    expect(count(html, "時刻(")).toBe(1);
    expect(html).toContain("時刻(2026-01-15T00:10:00Z)");
  });

  it("気分は、値があるときだけ出す", () => {
    expect(render([day({ id: "a", date: "2026-01-15", morningIntent: "x", energy: "good" })])).toContain("良い");
    expect(render([day({ id: "a", date: "2026-01-15", morningIntent: "x" })])).not.toContain("良い");
  });

  it("その日の記入に付いた上司コメントを、その日の下に出す", () => {
    const html = render([day({ id: "a", date: "2026-01-15", morningIntent: "x", managerComment: "合成の上司コメント" })]);
    expect(html).toContain(ADMIN_DAY_LOG_TERMS.managerCommentLabel);
    expect(html).toContain("合成の上司コメント");
  });

  it("HM フィードバックの欄は無い。読む場所の案内を、見出しの下に 1 行だけ出す（記入が無いときも）", () => {
    const html = render([day({ id: "a", date: "2026-01-15", morningIntent: "x" })]);
    expect(html).toContain(ADMIN_DAY_LOG_TERMS.feedbackNote);
    expect(count(html, "HMフィードバック")).toBe(1);
    expect(render([])).toContain(ADMIN_DAY_LOG_TERMS.feedbackNote);
  });

  it("月ごとにまとめ、月の名前と日数を出す", () => {
    const html = render([
      day({ id: "c", date: "2026-02-02", morningIntent: "x" }),
      day({ id: "b", date: "2026-01-16", morningIntent: "x" }),
      day({ id: "a", date: "2026-01-15", morningIntent: "x" }),
    ]);
    expect(html).toContain("2026年2月");
    expect(html).toContain("2026年1月");
    expect(html).toContain(ADMIN_DAY_LOG_TERMS.monthCount(1));
    expect(html).toContain(ADMIN_DAY_LOG_TERMS.monthCount(2));
    expect(count(html, "<details")).toBe(2);
    expect(html.indexOf("2026年2月")).toBeLessThan(html.indexOf("2026年1月"));
    // 月の見出しには、開閉できることが分かる印を付ける（月の数だけ）
    expect(count(html, "▶")).toBe(2);
  });

  it("いちばん新しい月の記入が 7 日分以上あれば、その月だけを開いておく", () => {
    const january = Array.from({ length: 7 }, (_, i) =>
      day({ id: `jan-${i}`, date: `2026-01-${String(20 - i).padStart(2, "0")}`, morningIntent: "x" })
    );
    const html = render([...january, day({ id: "dec", date: "2025-12-25", morningIntent: "x" })]);
    expect(count(html, "<details")).toBe(2);
    expect(count(html, '<details open=""')).toBe(1);
    // 開いているのは、先頭（1 月）
    expect(html.indexOf('<details open=""')).toBeLessThan(html.indexOf("2026年1月"));
    expect(html.indexOf("2026年1月")).toBeLessThan(html.indexOf("<details", html.indexOf('<details open=""') + 1));
  });

  it("いちばん新しい月の記入が少ないときは、その前の月も開いておく。それより前の月は閉じておく", () => {
    const html = render([
      day({ id: "c", date: "2026-03-02", morningIntent: "x" }),
      day({ id: "b", date: "2026-02-16", morningIntent: "x" }),
      day({ id: "a", date: "2026-01-15", morningIntent: "x" }),
    ]);
    expect(count(html, "<details")).toBe(3);
    expect(count(html, '<details open=""')).toBe(2);
    // 閉じているのは、最後（1 月）
    const lastDetails = html.lastIndexOf("<details");
    expect(html.startsWith('<details open=""', lastDetails)).toBe(false);
    expect(html.indexOf("2026年1月")).toBeGreaterThan(lastDetails);
  });
});

describe("AdminDayLogList：AIコーチの返信", () => {
  const LOGS = [day({ id: "a", date: "2026-01-15", status: "complete", morningIntent: "合成の朝", eveningInsight: "合成の夕" })];
  const LABEL = `>${ADMIN_DAY_LOG_TERMS.coachLabel}<`;

  it("返信が無い日は、返信の枠を出さない", () => {
    expect(render(LOGS)).not.toContain(LABEL);
    expect(render(LOGS, { replies: [] })).not.toContain(LABEL);
  });

  it("その日の返信を、その日の記入の下に、状態の呼び名と文で出す", () => {
    const html = render(LOGS, {
      replies: [{ replyDate: "2026-01-15", kind: "daily", status: "delivered", content: "合成の返信の文" }],
    });
    expect(html).toContain(LABEL);
    expect(html).toContain(COACH_BOARD_TERMS.stateLabels.delivered);
    expect(html).toContain("合成の返信の文");
    expect(html.indexOf("合成の夕")).toBeLessThan(html.indexOf("合成の返信の文"));
  });

  it("確認待ち・取り下げ済みも、その状態が分かる形で出す（運営の画面なので、文も出す）", () => {
    const pending = render(LOGS, {
      replies: [{ replyDate: "2026-01-15", kind: "daily", status: "pending_review", content: "合成の確認待ちの文" }],
    });
    expect(pending).toContain(COACH_BOARD_TERMS.stateLabels.pending);
    expect(pending).toContain("合成の確認待ちの文");

    const withdrawn = render(LOGS, {
      replies: [{ replyDate: "2026-01-15", kind: "daily", status: "withdrawn", content: "合成の取り下げた文" }],
    });
    expect(withdrawn).toContain(COACH_BOARD_TERMS.stateLabels.withdrawn);
  });

  it("返信を作らなかった記入（確認待ち・文なし）は、「確認が必要」と出し、文の段落は出さない", () => {
    const html = render(LOGS, {
      replies: [{ replyDate: "2026-01-15", kind: "daily", status: "pending_review", content: "" }],
    });
    expect(html).toContain(LABEL);
    expect(html).toContain(COACH_BOARD_TERMS.stateLabels.needs_attention);
    // 返信の枠の中に、文の段落（改行を保つ段落）は無い
    const block = html.slice(html.indexOf('data-testid="admin-day-coach-reply"'));
    expect(block.slice(0, block.indexOf("</article>"))).not.toContain("whitespace-pre-wrap");
  });

  it("状態の札は、状態ごとに色を変える（「確認が必要」は赤、「届いた」は緑。確認のページと同じ色）", () => {
    const tone = (status: string, content: string) => {
      const html = render(LOGS, { replies: [{ replyDate: "2026-01-15", kind: "daily", status, content }] });
      const block = html.slice(html.indexOf('data-testid="admin-day-coach-reply"'));
      return block.slice(0, block.indexOf("</article>"));
    };
    expect(tone("pending_review", "")).toContain("text-red-700");
    expect(tone("pending_review", "合成の文")).toContain("text-amber-700");
    expect(tone("delivered", "合成の文")).toContain("text-emerald-700");
    expect(tone("delivered", "合成の文")).not.toContain("text-red-700");
  });

  it("「AIコーチの確認」のページへのリンクは、行き先を作れるときだけ出す（その日の日付を渡す）", () => {
    const replies = [{ replyDate: "2026-01-15", kind: "daily", status: "delivered", content: "合成の返信の文" }];
    const without = render(LOGS, { replies });
    expect(without).not.toContain(ADMIN_DAY_LOG_TERMS.coachBoardLink);

    const withLink = render(LOGS, { replies, coachBoardHref: (date) => `/a/tok-x/coach?date=${date}` });
    expect(withLink).toContain(ADMIN_DAY_LOG_TERMS.coachBoardLink);
    expect(withLink).toContain('href="/a/tok-x/coach?date=2026-01-15"');
  });

  it("返信を読めなかったときは、その旨を 1 行出す（「返信が無い」と見せない）。読めたときは出さない", () => {
    expect(render(LOGS, { coachLoadFailed: true })).toContain(ADMIN_DAY_LOG_TERMS.coachLoadFailed);
    expect(render(LOGS)).not.toContain(ADMIN_DAY_LOG_TERMS.coachLoadFailed);
    // 記入が無いときも、読めなかったことは出す
    expect(render([], { coachLoadFailed: true })).toContain(ADMIN_DAY_LOG_TERMS.coachLoadFailed);
  });
});
