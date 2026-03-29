// ===== Email Service =====
// Uses Resend for transactional email delivery
// Free tier: 100 emails/day (enough for 9 participants × 2 times/day)

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
        <div style="background: linear-gradient(135deg, #5B4FD6, #7C6FEA); border-radius: 12px; padding: 24px; color: white; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 24px;">📝 CORE Log</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">Morning Check-in</p>
        </div>
        <p>${name}さん、おはようございます。</p>
        <p>今日も1日が始まります。<br>
        <strong>今日意識すること</strong>を3分で記入しましょう。</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${url}" style="display: inline-block; background: #5B4FD6; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">
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
        <div style="background: linear-gradient(135deg, #E8833A, #F5A623); border-radius: 12px; padding: 24px; color: white; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 24px;">📝 CORE Log</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">Evening Reflection</p>
        </div>
        <p>${name}さん、お疲れさまでした。</p>
        <p>今日1日を振り返って、<br>
        <strong>気づいたこと・学んだこと</strong>を3分で記録しましょう。</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${url}" style="display: inline-block; background: #E8833A; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px;">
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

export async function sendReminderEmail(options: SendEmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log(`[Email SKIP] No RESEND_API_KEY — would send ${options.type} reminder to ${options.to}`);
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
      console.error(`[Email ERROR] Failed to send to ${to}:`, err);
      return false;
    }

    console.log(`[Email OK] Sent ${type} reminder to ${to}`);
    return true;
  } catch (error) {
    console.error(`[Email ERROR] ${error}`);
    return false;
  }
}
