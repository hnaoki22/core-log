import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CoachNoticePanel, type CoachNoticeMessage, type CoachNoticeStatusView } from "./CoachNoticePanel";
import { COACH_BOARD_TERMS as T, type CoachNoticeState } from "@/lib/coach-reply";

// この環境のテストは DOM なし（Node）なので、最初の描画だけを確かめる（ボタンを押したあとの動きは、
// ここでは確かめられない）。
function render(status: CoachNoticeStatusView, extra: { busy?: boolean; message?: CoachNoticeMessage | null } = {}) {
  return renderToStaticMarkup(
    createElement(CoachNoticePanel, {
      status,
      busy: extra.busy ?? false,
      message: extra.message ?? null,
      onTest: () => {},
    })
  );
}

describe("CoachNoticePanel：宛先があるとき", () => {
  const html = render({ state: "ready", recipients: 2, skipped: 0 });

  it("見出し、送ることの説明、宛先の人数、「試しに送る」を出す", () => {
    expect(html).toContain(T.noticeHeading);
    expect(html).toContain(T.noticeStates.ready);
    expect(html).toContain("宛先：2名");
    expect(html).toContain(`>${T.noticeTest}<`);
    expect(html).toContain('data-state="ready"');
  });

  it("説明は、注意の色にしない。送れない人の注意は出さない", () => {
    expect(html).not.toContain("text-red-700");
    expect(html).not.toContain("text-amber-700");
    expect(html).not.toContain("には送れません");
  });

  it("設定された宛先のうち、送れない人がいるときは、その人数を出す", () => {
    const withSkipped = render({ state: "ready", recipients: 1, skipped: 2 });
    expect(withSkipped).toContain("宛先：1名");
    expect(withSkipped).toContain("設定された宛先のうち、2名には送れません");
    expect(withSkipped).toContain("text-amber-700");
  });

  it("送っているあいだは、ボタンを止めて、送っていることを出す", () => {
    const busy = render({ state: "ready", recipients: 1 }, { busy: true });
    expect(busy).toContain(T.noticeTestSending);
    expect(busy).toContain('disabled=""');
    expect(busy).not.toContain(`>${T.noticeTest}<`);
    // 送っていないあいだは、止めない。
    expect(render({ state: "ready", recipients: 1 })).not.toContain('disabled=""');
  });

  it("試し送りの結果を出す（送れた＝緑、送れなかった＝赤）", () => {
    const ok = render({ state: "ready", recipients: 1 }, { message: { tone: "ok", text: T.noticeTestSent(1) } });
    expect(ok).toContain("試し送りのメールを、1名に送りました。");
    expect(ok).toContain('role="status"');
    expect(ok).toContain("text-emerald-700");
    const failed = render({ state: "ready", recipients: 1 }, { message: { tone: "error", text: T.noticeTestFailed } });
    expect(failed).toContain(T.noticeTestFailed);
    expect(failed).toContain("text-red-700");
  });
});

describe("CoachNoticePanel：メールが送られない状態のとき", () => {
  it("設定が無い・形が正しくない・送れる人がいないときは、「メールは送られません」と分かる文を、赤で出す", () => {
    for (const state of ["not_configured", "invalid_config", "no_recipient"] as const satisfies readonly CoachNoticeState[]) {
      const html = render({ state });
      expect(html).toContain(T.noticeStates[state]);
      expect(T.noticeStates[state]).toContain("メールは送られません");
      expect(html).toContain("text-red-700");
      expect(html).toContain(`data-state="${state}"`);
    }
  });

  it("設定を読めなかったときは、読めなかったと出す（「設定が無い」とは出さない）", () => {
    const html = render({ state: "unknown" });
    expect(html).toContain(T.noticeStates.unknown);
    expect(html).not.toContain(T.noticeStates.not_configured);
    expect(html).toContain("text-amber-700");
  });

  it("宛先が無いときは、「試しに送る」も、人数も出さない", () => {
    for (const state of ["not_configured", "invalid_config", "no_recipient", "unknown"] as const) {
      const html = render({ state, recipients: 3, skipped: 2 });
      expect(html).not.toContain("<button");
      expect(html).not.toContain("宛先：");
      expect(html).not.toContain("には送れません");
    }
  });
});

describe("CoachNoticePanel：出さないもの", () => {
  it("宛先の氏名・メールアドレスを受け取る口が無い（出すのは、状態と人数だけ）", () => {
    const html = render({ state: "ready", recipients: 1, skipped: 0 });
    expect(html).not.toContain("@");
  });
});
