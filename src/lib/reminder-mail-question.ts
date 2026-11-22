// 「朝・夕の問い」を出している環境のリマインドメール（件名と本文）。
//
// 従来のリマインドメール（email.ts の buildMorningEmail など）は「今日意識すること」
// 「気づいたこと・学んだこと」を促す。問いを出している環境では、画面の問いと別のことを
// メールで頼まないように、その回の問いをそのまま本文に載せる。
//
// 送信や DB には依存しない（テスト: reminder-mail-question.test.ts）。
// どの環境にこのメールを送るかは、定時処理（api/cron/remind）が entry-question-env.ts で決める。

import { escapeHtml } from "./sanitize";

export type QuestionReminderType = "morning" | "evening" | "evening_no_morning";

export type QuestionReminderInput = {
  type: QuestionReminderType;
  /** 宛名（姓）。 */
  name: string;
  /** 記入画面の URL。 */
  url: string;
  /** その回（朝／夕）の問い。空の行を除いた 1 件以上。 */
  questions: readonly string[];
  /** 朝の記入の締め切りの時刻（date-utils の MORNING_CLOSE_HOUR_JST）。 */
  morningCloseHour: number;
};

export const QUESTION_REMINDER_SUBJECT_MORNING = "【CORE Log】今日の行動の記入をお願いします";
export const QUESTION_REMINDER_SUBJECT_EVENING = "【CORE Log】本日の振り返りの記入をお願いします";

function questionsHtml(questions: readonly string[]): string {
  const numbered = questions.length > 1;
  return questions
    .map((q, i) => {
      const text = escapeHtml(q);
      const body = numbered ? `${i + 1}. ${text}` : text;
      const gap = i === questions.length - 1 ? "0" : "0 0 12px";
      return `<p style="margin: ${gap}; font-weight: bold; line-height: 1.7;">${body}</p>`;
    })
    .join("\n          ");
}

/**
 * 問いを載せたリマインドメールを組み立てる。
 * 朝は濃紺、夕方は橙（従来のリマインドメールと同じ色）。
 */
export function buildQuestionReminderEmail(input: QuestionReminderInput): { subject: string; html: string } {
  const isMorning = input.type === "morning";
  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(input.url);
  const headerBackground = isMorning
    ? "linear-gradient(135deg, #1A1A2E, #2C2C4A)"
    : "linear-gradient(135deg, #C17817, #C17817)";
  const buttonColor = isMorning ? "#1A1A2E" : "#C17817";
  const headerLabel = isMorning ? "Morning Check-in" : "Evening Reflection";
  const greeting = isMorning ? "おはようございます。" : "お疲れさまです。";
  const lead = isMorning ? "今日の問いです。" : "本日の問いです。";
  const closedNote =
    input.type === "evening_no_morning"
      ? `
        <p style="color: #888; font-size: 12px;">朝の記入は${input.morningCloseHour}:00で締め切りました。本日の振り返りは記入できます。</p>`
      : "";

  return {
    subject: isMorning ? QUESTION_REMINDER_SUBJECT_MORNING : QUESTION_REMINDER_SUBJECT_EVENING,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="background: ${headerBackground}; border-radius: 12px; padding: 24px; color: white; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 24px;">📝 CORE Log</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">${headerLabel}</p>
        </div>
        <p>${safeName}さん、${greeting}</p>
        <p>${lead}</p>
        <div style="background: #F5F0EB; border-radius: 8px; padding: 16px 20px; margin: 16px 0;">
          ${questionsHtml(input.questions)}
        </div>${closedNote}
        <div style="text-align: center; margin: 24px 0;">
          <a href="${safeUrl}" style="display: inline-block; background: ${buttonColor}; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">
            記入する →
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #999; font-size: 11px;">Project CORE — Powered by Human Mature</p>
      </div>
    `,
  };
}
