import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CoachOptInCard, CoachOptInView } from "./CoachOptInCard";
import { COACH_TERMS } from "@/lib/coach-reply";

// この環境のテストは DOM なし（Node）なので、最初の描画だけを確かめる（押したあとの表示は、
// 表示だけの部品に値を渡して確かめる）。

/** 選ばれているボタン（aria-pressed="true"）の文字。 */
function pressedLabel(html: string): string | null {
  const m = html.match(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)<\/button>/);
  return m ? m[1] : null;
}

describe("CoachOptInView（設計図のページの、AIコーチの欄）", () => {
  it("説明文を、すべて出す", () => {
    const html = renderToStaticMarkup(createElement(CoachOptInView, { hasProfile: true, optIn: true }));
    expect(html).toContain(COACH_TERMS.aboutHeading);
    for (const line of COACH_TERMS.aboutLines) {
      // 「」などは HTML でもそのまま出る（引用符は &quot; に変わるので、引用符を含まない文で確かめる）
      expect(html).toContain(line);
    }
  });

  it("「受け取る」の人は、「受け取る」が選ばれた表示になる", () => {
    const html = renderToStaticMarkup(createElement(CoachOptInView, { hasProfile: true, optIn: true }));
    expect(html).toContain(COACH_TERMS.optInLabel);
    expect(html).toContain(COACH_TERMS.optInHelp);
    expect(pressedLabel(html)).toBe(COACH_TERMS.optInOn);
  });

  it("「受け取らない」の人は、「受け取らない」が選ばれた表示になる", () => {
    const html = renderToStaticMarkup(createElement(CoachOptInView, { hasProfile: true, optIn: false }));
    expect(pressedLabel(html)).toBe(COACH_TERMS.optInOff);
  });

  it("設計図の行がまだ無い人には、ボタンを出さず、確定すると選べる旨を出す", () => {
    const html = renderToStaticMarkup(createElement(CoachOptInView, { hasProfile: false, optIn: true }));
    expect(html).toContain(COACH_TERMS.optInNeedsProfile);
    expect(html).not.toContain("<button");
    // 説明文は出す
    expect(html).toContain(COACH_TERMS.aboutHeading);
  });

  it("いまの設定を読めなかったときは、ボタンを出さない（違う設定を出さない）", () => {
    const html = renderToStaticMarkup(
      createElement(CoachOptInView, { hasProfile: true, loadFailed: true, optIn: true })
    );
    expect(html).toContain(COACH_TERMS.optInLoadFailed);
    expect(html).not.toContain("<button");
  });

  it("保存しているあいだは、ボタンを押せない", () => {
    const html = renderToStaticMarkup(
      createElement(CoachOptInView, { hasProfile: true, optIn: true, saving: true })
    );
    expect(html.match(/<button[^>]*disabled=""/g)?.length).toBe(2);
  });

  it("切り替えの結果を出す", () => {
    const ok = renderToStaticMarkup(
      createElement(CoachOptInView, {
        hasProfile: true,
        optIn: false,
        message: { kind: "ok", text: COACH_TERMS.optInSaved },
      })
    );
    expect(ok).toContain(COACH_TERMS.optInSaved);
    const ng = renderToStaticMarkup(
      createElement(CoachOptInView, {
        hasProfile: true,
        optIn: true,
        message: { kind: "error", text: COACH_TERMS.optInFailed },
      })
    );
    expect(ng).toContain(COACH_TERMS.optInFailed);
  });
});

describe("CoachOptInCard（最初の描画）", () => {
  it("設計図の行があり、設定が「受け取らない」の人は、その表示で始まる", () => {
    const html = renderToStaticMarkup(
      createElement(CoachOptInCard, { token: "tok_synthetic", hasProfile: true, initialOptIn: false })
    );
    expect(pressedLabel(html)).toBe(COACH_TERMS.optInOff);
  });

  it("設定の値がまだ無い（行ができたばかり）ときは、「受け取る」で始まる（表の初期値と同じ）", () => {
    const html = renderToStaticMarkup(
      createElement(CoachOptInCard, { token: "tok_synthetic", hasProfile: true, initialOptIn: null })
    );
    expect(pressedLabel(html)).toBe(COACH_TERMS.optInOn);
  });
});
