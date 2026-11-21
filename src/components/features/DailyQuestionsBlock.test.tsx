import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// マイクの部品は録音 API とルーターに依存するので、置き換える（出る・出ないだけを見る）。
vi.mock("./VoiceInput", () => ({
  VoiceInputButton: () => createElement("button", { "data-testid": "mic" }, "mic"),
}));

import { DailyQuestionsBlock } from "./DailyQuestionsBlock";

// テストの文言は合成データ（実在の記入・実在の人物の記述は使わない）。
const QUESTIONS = ["今日やってみたことは何ですか。", "明日は何を変えますか。"];

function render(props: { answers: string[]; voiceEnabled: boolean }): string {
  return renderToStaticMarkup(
    createElement(DailyQuestionsBlock, {
      questions: QUESTIONS,
      answers: props.answers,
      onAnswersChange: () => {},
      voiceEnabled: props.voiceEnabled,
    })
  );
}

// この環境のテストは DOM なし（Node）なので、入力操作そのものは確かめられない。
// ここでは「描画し直したとき、親が持っている答えがそのまま欄に出ること」を確かめる。
// 気分の画面から「戻る」で戻ると、この部品は作り直される。そのとき欄が空に戻らない
// ことは、答えを親が持ち、この部品が受け取った答えをそのまま出すことで成り立つ。
describe("DailyQuestionsBlock（描画）", () => {
  it("問いの数だけ欄を出し、問いの文を見出しに出す", () => {
    const html = render({ answers: [], voiceEnabled: false });
    expect(html.match(/<textarea/g)?.length).toBe(2);
    expect(html).toContain("今日やってみたことは何ですか。");
    expect(html).toContain("明日は何を変えますか。");
  });

  it("親が持っている答えを、そのまま欄に出す（作り直しても空に戻らない）", () => {
    const html = render({ answers: ["資料を見せた", "順番を変える"], voiceEnabled: false });
    expect(html).toContain(">資料を見せた</textarea>");
    expect(html).toContain(">順番を変える</textarea>");
    expect(html).toContain("6 文字");
  });

  it("答えの配列が短くても、足りない欄は空で出す", () => {
    const html = render({ answers: ["資料を見せた"], voiceEnabled: false });
    expect(html).toContain(">資料を見せた</textarea>");
    expect(html).toContain("0 文字");
  });

  it("音声入力が OFF のときはマイクを出さず、案内文にも音声入力を書かない", () => {
    const html = render({ answers: [], voiceEnabled: false });
    expect(html).not.toContain('data-testid="mic"');
    expect(html).toContain('placeholder="ここに書く"');
    expect(html).not.toContain("音声入力も可");
  });

  it("音声入力が ON のときは、問いごとにマイクを出す", () => {
    const html = render({ answers: [], voiceEnabled: true });
    expect(html.match(/data-testid="mic"/g)?.length).toBe(2);
    expect(html).toContain("ここに書く（音声入力も可）");
  });
});
