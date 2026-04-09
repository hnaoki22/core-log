// ===== Email Service =====
// Uses Resend for transactional email delivery
// Free tier: 100 emails/day (enough for 9 participants × 2 times/day)

import { getParticipantByEmail } from "./participant-db";
import { logger } from "./logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_EMAIL = process.env.REMIND_FROM_EMAIL || "CORE Log <noreply@resend.dev>";
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://core-log-lilac.vercel.app";

export type ReminderType = "morning" | "evening";

interface SendEmailOptions {
  to: string;
  participantName: string;
  token: string;
  type: ReminderType;
}

function buildMorningEmail(name: string, token: string) {
  const url = `${APP_BASE_URL}/p/${token}/input`;
  return {
    subject: "【CORE Log】おはようございます！今日の意図を記入しましょう",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #1A1A2E, #2C2C4A); border-radius: 12px; padding: 24px; color: white; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 24px;">📝 CORE Log</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">Morning Check-in</p>
        </div>
        <p>${name}さん、おはようございます。</p>
        <p>今日も1日が始まります。<br>
        <strong>今日意識すること</strong>を3分で記入しましょう。</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${url}" style="display: inline-block; background: #1A1A2E; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">
            今日の意図を記入する →
          </a>
        </div>
        <p style="color: #666; font-size: 13px;">小さな気づきの積み重ねが、大きな成長につながります。</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #999; font-size: 11px;">Project CORE — Powered by Human Mature</p>
      </div>
    `,
  };
}

function buildEveningEmail(name: string, token: string) {
  const url = `${APP_BASE_URL}/p/${token}/input`;
  return {
    subject: "【CORE Log】お疲れさまでした！今日の気づきを振り返りましょう",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #C17817, #C17817); border-radius: 12px; padding: 24px; color: white; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 24px;">📝 CORE Log</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">Evening Reflection</p>
        </div>
        <p>${name}さん、お疲れさまでした。</p>
        <p>今日1日を振り返って、<br>
        <strong>気づいたこと・学んだこと</strong>を3分で記録しましょう。</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${url}" style="display: inline-block; background: #C17817; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">
            今日の気づきを記入する →
          </a>
        </div>
        <p style="color: #666; font-size: 13px;">「何を感じたか」を言葉にすることで、成長が加速します。</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #999; font-size: 11px;">Project CORE — Powered by Human Mature</p>
      </div>
    `,
  };
}

// ===== Event Notification Emails =====

export type NotificationType =
  | "mission_comment"      // 上司/部下がミッションにコメント
  | "mission_created"      // 上司がミッションを新規設定
  | "manager_comment"      // 上司が日報にコメントした
  | "hm_feedback"          // HMがフィードバックを送信
  | "daily_log_submitted"; // 部下が日報を投稿した → 上司に通知

interface NotificationOptions {
  to: string;
  recipientName: string;    // 受信者の名前
  senderName: string;       // 送信者の名前
  token: string;            // 受信者のトークン（リンク用）
  type: NotificationType;
  detail?: string;          // コメント内容やミッション名など
}

function buildNotificationEmail(options: NotificationOptions) {
  const { recipientName, senderName, token, type, detail } = options;
  const baseUrl = APP_BASE_URL;

  switch (type) {
    case "mission_comment": {
      const url = `${baseUrl}/p/${token}/mission`;
      return {
        subject: `【CORE Log】${senderName}さんからミッションにコメントがありました`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <div style="background: linear-gradient(135deg, #C17817, #C17817); border-radius: 12px; padding: 20px; color: white; text-align: center; margin-bottom: 24px;">
              <h1 style="margin: 0; font-size: 20px;">💬 ミッションに新しいコメント</h1>
            </div>
            <p>${recipientName}さん</p>
            <p><strong>${senderName}</strong>さんがミッションにコメントしました。</p>
            ${detail ? `<div style="background: #F5E5BF; border-left: 4px solid #C17817; padding: 12px 16px; margin: 16px 0; border-radius: 4px;"><p style="margin: 0; color: #9A3412; font-size: 14px;">${detail}</p></div>` : ""}
            <div style="text-align: center; margin: 24px 0;">
              <a href="${url}" style="display: inline-block; background: #C17817; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 15px;">
                ミッションを確認する →
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 11px;">Project CORE — Powered by Human Mature</p>
          </div>
        `,
      };
    }
    case "mission_created": {
      const url = `${baseUrl}/p/${token}/mission`;
      return {
        subject: `【CORE Log】${senderName}さんから新しいミッションが設定されました`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <div style="background: linear-gradient(135deg, #1A1A2E, #2C2C4A); border-radius: 12px; padding: 20px; color: white; text-align: center; margin-bottom: 24px;">
              <h1 style="margin: 0; font-size: 20px;">🎯 新しいミッション</h1>
            </div>
            <p>${recipientName}さん</p>
            <p><strong>${senderName}</strong>さんが新しいミッションを設定しました。</p>
            ${detail ? `<div style="background: #F2F2F7; border-left: 4px solid #1A1A2E; padding: 12px 16px; margin: 16px 0; border-radius: 4px;"><p style="margin: 0; color: #141423; font-size: 14px; font-weight: bold;">${detail}</p></div>` : ""}
            <div style="text-align: center; margin: 24px 0;">
              <a href="${url}" style="display: inline-block; background: #1A1A2E; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 15px;">
                ミッションを確認する →
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 11px;">Project CORE — Powered by Human Mature</p>
          </div>
        `,
      };
    }
    case "manager_comment": {
      const url = `${baseUrl}/p/${token}/logs`;
      return {
        subject: `【CORE Log】${senderName}さんから日報にコメントがありました`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <div style="background: linear-gradient(135deg, #1A1A2E, #3B82F6); border-radius: 12px; padding: 20px; color: white; text-align: center; margin-bottom: 24px;">
              <h1 style="margin: 0; font-size: 20px;">💬 日報にコメント</h1>
            </div>
            <p>${recipientName}さん</p>
            <p><strong>${senderName}</strong>さんがあなたの日報にコメントしました。</p>
            ${detail ? `<div style="background: #EFF6FF; border-left: 4px solid #1A1A2E; padding: 12px 16px; margin: 16px 0; border-radius: 4px;"><p style="margin: 0; color: #1E40AF; font-size: 14px;">${detail}</p></div>` : ""}
            <div style="text-align: center; margin: 24px 0;">
              <a href="${url}" style="display: inline-block; background: #1A1A2E; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 15px;">
                日報を確認する →
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 11px;">Project CORE — Powered by Human Mature</p>
          </div>
        `,
      };
    }
    case "hm_feedback": {
      const url = `${baseUrl}/p/${token}/feedback`;
      return {
        subject: "【CORE Log】Human Matureから週次フィードバックが届きました",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <div style="background: linear-gradient(135deg, #7C3AED, #9333EA); border-radius: 12px; padding: 20px; color: white; text-align: center; margin-bottom: 24px;">
              <h1 style="margin: 0; font-size: 20px;">📋 週次フィードバック</h1>
            </div>
            <p>${recipientName}さん</p>
            <p>Human Matureから今週のフィードバックが届いています。<br>振り返りを確認し、来週に活かしましょう。</p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${url}" style="display: inline-block; background: #7C3AED; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 15px;">
                フィードバックを確認する →
              </a>
            </div>
            <p style="color: #666; font-size: 13px;">フィードバックを読んだら、次の一歩を日報に記入しましょう。</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 11px;">Project CORE — Powered by Human Mature</p>
          </div>
        `,
      };
    }
    case "daily_log_submitted": {
      const url = `${baseUrl}/m/${token}`;
      const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const timeStr = `${nowJST.getUTCHours().toString().padStart(2, "0")}:${nowJST.getUTCMinutes().toString().padStart(2, "0")}`;
      return {
        subject: `【CORE Log】${senderName}さんが日報を投稿しました`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
            <div style="background: linear-gradient(135deg, #22C55E, #16A34A); border-radius: 12px; padding: 20px; color: white; text-align: center; margin-bottom: 24px;">
              <h1 style="margin: 0; font-size: 20px;">📝 日報投稿通知</h1>
              <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">${timeStr} 投稿</p>
            </div>
            <p>${recipientName}さん</p>
            <p><strong>${senderName}</strong>さんが日報を投稿しました。</p>
            ${detail ? `<div style="background: #F0FDF4; border-left: 4px solid #22C55E; padding: 12px 16px; margin: 16px 0; border-radius: 4px;"><p style="margin: 0; color: #166534; font-size: 14px;">${detail}</p></div>` : ""}
            <div style="text-align: center; margin: 24px 0;">
              <a href="${url}" style="display: inline-block; background: #22C55E; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: bold; font-size: 15px;">
                ダッシュボードを確認する →
              </a>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
            <p style="color: #999; font-size: 11px;">Project CORE — Powered by Human Mature</p>
          </div>
        `,
      };
    }
  }
}

export async function sendNotificationEmail(options: NotificationOptions): Promise<boolean> {
  // emailEnabled チェック（参加者DBのフラグで制御）
  const participant = await getParticipantByEmail(options.to);
  if (participant && !participant.emailEnabled) {
    logger.info("Notification skipped: emailEnabled false", { email: options.to, type: options.type });
    return false;
  }

  if (!RESEND_API_KEY) {
    logger.info("Notification skipped: no API key", { email: options.to, type: options.type });
    return false;
  }

  const emailContent = buildNotificationEmail(options);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [options.to],
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error("Notification send failed", { type: options.type, email: options.to, error: err });
      return false;
    }

    logger.info("Notification sent", { type: options.type, email: options.to, senderName: options.senderName });
    return true;
  } catch (error) {
    logger.error("Notification error", { type: options.type, email: options.to, error: String(error) });
    return false;
  }
}

// ===== Daily Reminder Emails =====

export async function sendReminderEmail(options: SendEmailOptions): Promise<boolean> {
  // emailEnabled チェック（参加者DBのフラグで制御）
  const participant = await getParticipantByEmail(options.to);
  if (participant && !participant.emailEnabled) {
    logger.info("Reminder skipped: emailEnabled false", { email: options.to, type: options.type });
    return false;
  }

  if (!RESEND_API_KEY) {
    logger.info("Reminder skipped: no API key", { email: options.to, type: options.type });
    return false;
  }

  const { to, participantName, token, type } = options;
  const emailContent = type === "morning"
    ? buildMorningEmail(participantName, token)
    : buildEveningEmail(participantName, token);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error("Reminder send failed", { type, email: to, error: err });
      return false;
    }

    logger.info("Reminder sent", { type, email: to, participantName });
    return true;
  } catch (error) {
    logger.error("Reminder error", { type, email: to, error: String(error) });
    return false;
  }
}
