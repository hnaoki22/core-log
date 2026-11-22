import { describe, it, expect } from "vitest";
import {
  buildQuestionReminderEmail,
  QUESTION_REMINDER_SUBJECT_MORNING,
  QUESTION_REMINDER_SUBJECT_EVENING,
} from "./reminder-mail-question";

// テストの問い・氏名・URL は合成データ（実在の環境・人物のものは使わない）。
const URL = "https://example.test/p/tok_synthetic/input";
const Q_MORNING = ["今日は、どの場面で、何をしますか。"];
const Q_EVENING = ["今日は何をして、何が起きましたか。", "次に何を変えますか。"];

function build(type: "morning" | "evening" | "evening_no_morning", questions: string[], name = "見本") {
  return buildQuestionReminderEmail({ type, name, url: URL, questions, morningCloseHour: 14 });
}

describe("buildQuestionReminderEmail（朝）", () => {
  const mail = build("morning", Q_MORNING);

  it("件名は「今日の行動の記入」", () => {
    expect(mail.subject).toBe("【CORE Log】今日の行動の記入をお願いします");
    expect(mail.subject).toBe(QUESTION_REMINDER_SUBJECT_MORNING);
  });

  it("宛名・あいさつ・その日の問い・記入のボタンを載せる", () => {
    expect(mail.html).toContain("見本さん、おはようございます。");
    expect(mail.html).toContain("今日の問いです。");
    expect(mail.html).toContain("今日は、どの場面で、何をしますか。");
    expect(mail.html).toContain(`href="${URL}"`);
    expect(mail.html).toContain("記入する →");
    expect(mail.html).toContain("Morning Check-in");
  });

  it("問いが 1 つのときは番号を付けない", () => {
    expect(mail.html).not.toContain("1. 今日は、どの場面で");
  });

  it("従来の促しの文（意識・気づき・成長）と「意図」を載せない", () => {
    expect(mail.subject).not.toMatch(/意図|意識|気づき/);
    expect(mail.html).not.toMatch(/意図|意識|気づ|成長|3分/);
  });
});

describe("buildQuestionReminderEmail（夕方）", () => {
  const mail = build("evening", Q_EVENING);

  it("件名は「本日の振り返りの記入」", () => {
    expect(mail.subject).toBe("【CORE Log】本日の振り返りの記入をお願いします");
    expect(mail.subject).toBe(QUESTION_REMINDER_SUBJECT_EVENING);
  });

  it("問いが複数のときは番号を付けて、すべて載せる", () => {
    expect(mail.html).toContain("見本さん、お疲れさまです。");
    expect(mail.html).toContain("本日の問いです。");
    expect(mail.html).toContain("1. 今日は何をして、何が起きましたか。");
    expect(mail.html).toContain("2. 次に何を変えますか。");
    expect(mail.html).toContain("Evening Reflection");
  });

  it("朝を記入済みの人には、締め切りの注記を載せない", () => {
    expect(mail.html).not.toContain("締め切りました");
  });

  it("従来の促しの文（気づき・学び・感じたこと・成長）を載せない", () => {
    expect(mail.html).not.toMatch(/意図|意識|気づ|学んだ|感じたか|成長|3分/);
  });
});

describe("buildQuestionReminderEmail（夕方・朝が未記入）", () => {
  const mail = build("evening_no_morning", Q_EVENING);

  it("件名と問いは夕方と同じで、朝の締め切りの注記が加わる", () => {
    expect(mail.subject).toBe(QUESTION_REMINDER_SUBJECT_EVENING);
    expect(mail.html).toContain("1. 今日は何をして、何が起きましたか。");
    expect(mail.html).toContain("朝の記入は14:00で締め切りました。本日の振り返りは記入できます。");
  });

  it("締め切りの時刻は、渡された値を使う", () => {
    const m = buildQuestionReminderEmail({
      type: "evening_no_morning", name: "見本", url: URL, questions: Q_EVENING, morningCloseHour: 12,
    });
    expect(m.html).toContain("朝の記入は12:00で締め切りました。");
  });
});

describe("buildQuestionReminderEmail（安全のための変換）", () => {
  it("問い・宛名に含まれる HTML の記号は、文字として出す", () => {
    const mail = build("morning", ['<b>太字</b> & "引用"'], "<i>名</i>");
    expect(mail.html).toContain("&lt;b&gt;太字&lt;/b&gt; &amp; &quot;引用&quot;");
    expect(mail.html).toContain("&lt;i&gt;名&lt;/i&gt;さん");
    expect(mail.html).not.toContain("<b>太字</b>");
    expect(mail.html).not.toContain("<i>名</i>");
  });
});

// 設計図（feature.coachingProfile）の、その人の分。合成データ。
describe("buildQuestionReminderEmail（その人の分）", () => {
  const PROFILE_URL = "https://example.test/p/tok_synthetic/blueprint";

  it("その人の分が無いとき・中身が空のときは、従来と同じ HTML", () => {
    const base = build("evening", Q_EVENING);
    const withNull = buildQuestionReminderEmail({
      type: "evening",
      name: "見本",
      url: URL,
      questions: Q_EVENING,
      morningCloseHour: 14,
      personal: null,
    });
    const withEmpty = buildQuestionReminderEmail({
      type: "evening",
      name: "見本",
      url: URL,
      questions: Q_EVENING,
      morningCloseHour: 14,
      personal: { lines: [], personalQuestion: null, confirmPrompt: false, profileUrl: PROFILE_URL },
    });
    expect(withNull.html).toBe(base.html);
    expect(withEmpty.html).toBe(base.html);
  });

  it("朝・確認済み：問いの下に「あなたの設計図から」の行を載せる（HTML は無害化）", () => {
    const mail = buildQuestionReminderEmail({
      type: "morning",
      name: "見本",
      url: URL,
      questions: Q_MORNING,
      morningCloseHour: 14,
      personal: {
        lines: [
          { label: "イシュー", value: "なぜ<b>打合せ</b>が長引くのか" },
          { label: "毎朝の一文", value: "最初に相手の困りごとを一つ聞く" },
        ],
        personalQuestion: null,
        confirmPrompt: false,
        profileUrl: PROFILE_URL,
      },
    });
    expect(mail.html).toContain("あなたの設計図から");
    expect(mail.html).toContain("最初に相手の困りごとを一つ聞く");
    expect(mail.html).toContain("なぜ&lt;b&gt;打合せ&lt;/b&gt;が長引くのか");
    expect(mail.html).not.toContain("<b>打合せ</b>");
    expect(mail.html).not.toContain("設計図を確認する");
    // 全員共通の問いは 1 つのままなので、番号はつかない
    expect(mail.html).not.toContain("1. 今日は、どの場面で");
  });

  it("朝・確認前：本人の文は載せず、確認のお願いと設計図へのリンクを載せる", () => {
    const mail = buildQuestionReminderEmail({
      type: "morning",
      name: "見本",
      url: URL,
      questions: Q_MORNING,
      morningCloseHour: 14,
      personal: { lines: [], personalQuestion: null, confirmPrompt: true, profileUrl: PROFILE_URL },
    });
    expect(mail.html).toContain("設計図を確認すると、ここにあなたの「毎朝の一文」が載ります。");
    expect(mail.html).toContain(`href="${PROFILE_URL}"`);
    expect(mail.html).not.toContain("あなたの設計図から");
  });

  it("夕方・確認済み：全員共通の問いの続きの番号で「あなたの問い」を載せる", () => {
    const mail = buildQuestionReminderEmail({
      type: "evening",
      name: "見本",
      url: URL,
      questions: Q_EVENING,
      morningCloseHour: 14,
      personal: {
        lines: [],
        personalQuestion: "今日、最初に質問しましたか。",
        confirmPrompt: false,
        profileUrl: PROFILE_URL,
      },
    });
    expect(mail.html).toContain("1. 今日は何をして、何が起きましたか。");
    expect(mail.html).toContain("2. 次に何を変えますか。");
    expect(mail.html).toContain("あなたの問い");
    expect(mail.html).toContain("3. 今日、最初に質問しましたか。");
  });

  it("全員共通の問いが 1 つでも、「あなたの問い」があれば番号をつける", () => {
    const mail = buildQuestionReminderEmail({
      type: "evening",
      name: "見本",
      url: URL,
      questions: ["今日は何をしましたか。"],
      morningCloseHour: 14,
      personal: { lines: [], personalQuestion: "最初に質問しましたか。", confirmPrompt: false, profileUrl: PROFILE_URL },
    });
    expect(mail.html).toContain("1. 今日は何をしましたか。");
    expect(mail.html).toContain("2. 最初に質問しましたか。");
  });
});
