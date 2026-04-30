/**
 * OTP Authentication API
 * POST /api/auth/otp
 *
 * Actions:
 * - "send": Generate and send OTP via email
 * - "verify": Verify OTP code and set session cookie
 */

import { NextRequest, NextResponse } from "next/server";
import { generateOTP, verifyOTP, getRemainingAttempts } from "@/lib/otp";
import { getSessionCookieName, createSignedSessionValue, SESSION_MAX_AGE } from "@/lib/session";
import { storeSession } from "@/lib/session-store";
import { getParticipantByToken, getManagerByToken } from "@/lib/participant-db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_EMAIL = process.env.REMIND_FROM_EMAIL || "CORE Log <noreply@resend.dev>";

interface OTPRequest {
  token: string;
  action: "send" | "verify";
  code?: string;
}

/**
 * Mask email for privacy (e.g., "test@example.com" -> "te***@example.com")
 */
function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!domain || localPart.length < 2) {
    return email;
  }

  const visibleChars = Math.max(2, Math.floor(localPart.length / 3));
  const masked = localPart.substring(0, visibleChars) + "*".repeat(Math.max(1, localPart.length - visibleChars));
  return `${masked}@${domain}`;
}

/**
 * Build OTP email
 */
function buildOTPEmail(name: string, code: string): { subject: string; html: string } {
  return {
    subject: "【CORE Log】メール認証コード",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #1A1A2E, #2C2C4A); border-radius: 12px; padding: 24px; color: white; text-align: center; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 24px;">🔐 メール認証</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">CORE Log</p>
        </div>
        <p>${name}さん</p>
        <p>CORE Logへのアクセスが確認されました。<br>
        以下の認証コードを使用して、メール認証を完了してください。</p>
        <div style="background: #F2F2F7; border: 2px solid #1A1A2E; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
          <div style="font-size: 14px; color: #5B5560; font-weight: 500; letter-spacing: 2px; margin-bottom: 8px;">認証コード</div>
          <div style="font-size: 32px; font-weight: bold; color: #1A1A2E; letter-spacing: 4px; font-family: monospace;">${code}</div>
          <div style="font-size: 12px; color: #8B8489; margin-top: 8px;">有効期限: 10分</div>
        </div>
        <p style="color: #666; font-size: 13px;">このコードは10分間有効です。有効期限を過ぎた場合は、新しいコードをリクエストしてください。</p>
        <p style="color: #666; font-size: 13px;">このメールに心当たりがない場合は、削除してください。</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #999; font-size: 11px;">Project CORE — Powered by Human Mature</p>
      </div>
    `,
  };
}

/**
 * Send OTP via Resend
 */
async function sendOTPEmail(email: string, name: string, code: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    logger.info("OTP send skipped: no RESEND_API_KEY", { email });
    return false;
  }

  const emailContent = buildOTPEmail(name, code);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [email],
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error("OTP email send failed", { email, error: err });
      return false;
    }

    logger.info("OTP email sent", { email });
    return true;
  } catch (error) {
    logger.error("OTP email error", { email, error: String(error) });
    return false;
  }
}

/**
 * Handle "send" action
 */
async function handleSendOTP(token: string): Promise<NextResponse> {
  // Look up participant or manager
  let email: string | null = null;
  let name: string | null = null;

  const participant = await getParticipantByToken(token);
  if (participant) {
    email = participant.email;
    name = participant.name;
  } else {
    const manager = await getManagerByToken(token);
    if (manager) {
      email = manager.email;
      name = manager.name;
    }
  }

  if (!email || !name) {
    return NextResponse.json(
      { success: false, error: "Invalid token" },
      { status: 401 }
    );
  }

  // If OTP is disabled via feature flag, return success with verified flag (bypass)
  let otpEnabled = false;
  try {
    otpEnabled = await isFeatureEnabled("feature.otpAuth");
  } catch {
    otpEnabled = process.env.OTP_ENABLED === "true";
  }
  if (!otpEnabled) {
    logger.info("OTP disabled via feature flag, skipping verification", { email });
    return NextResponse.json(
      { success: true, verified: true, emailHint: maskEmail(email) }
    );
  }

  // Generate OTP
  let code: string;
  try {
    code = await generateOTP(token, email);
  } catch (error) {
    logger.warn("OTP generation failed", { token, error: String(error) });
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 429 }
    );
  }

  // Send email
  const emailSent = await sendOTPEmail(email, name, code);
  if (!emailSent) {
    return NextResponse.json(
      { success: false, error: "Failed to send verification code" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    emailHint: maskEmail(email),
  });
}

/**
 * Handle "verify" action
 */
async function handleVerifyOTP(token: string, code: string): Promise<NextResponse> {
  // Verify the OTP code
  const result = await verifyOTP(token, code);

  if (!result.valid) {
    const remaining = getRemainingAttempts(token, code);
    const remainingAttempts = remaining !== null ? remaining : 0;

    return NextResponse.json(
      {
        success: false,
        error: "無効なコードです",
        remainingAttempts,
      },
      { status: 401 }
    );
  }

  // Create session cookie
  const cookieName = getSessionCookieName(token);
  const signedValue = await createSignedSessionValue(token);
  const response = NextResponse.json({
    success: true,
    verified: true,
  });

  response.cookies.set({
    name: cookieName,
    value: signedValue,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE, // 30 days (sliding — renewed on each visit via middleware)
    path: "/",
  });

  logger.info("OTP verified, session set", { token, email: result.email });

  // Store session in Supabase as fallback for cookie-less scenarios
  // (iOS in-app browsers, cookie clearing, ITP 7-day cookie cap, etc.)
  //
  // CRITICAL: This MUST be awaited. Vercel serverless functions terminate
  // immediately after the response is returned, killing any pending background
  // promises. A fire-and-forget call here means the otp_sessions row may never
  // be written, causing middleware.checkSession() to fail and triggering the
  // OTP re-prompt loop on iOS Safari.
  //
  // Same pattern as the 2026-04-30 fix for sendNotificationEmail (commit 94d04a7).
  try {
    const stored = await storeSession(token);
    if (!stored) {
      logger.warn("Supabase session store returned false — fallback recovery may not work for this token", { token });
    }
  } catch (err) {
    // Network/Supabase failure: log but don't fail the OTP verification —
    // the cookie is already set and that's the primary auth mechanism.
    logger.warn("Failed to store session in Supabase (non-blocking for cookie auth)", { error: String(err), token });
  }

  return response;
}

/**
 * POST /api/auth/otp
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as OTPRequest;
    const { token, action, code } = body;

    if (!token || !action) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (action === "send") {
      return await handleSendOTP(token);
    } else if (action === "verify") {
      if (!code) {
        return NextResponse.json(
          { success: false, error: "Missing code for verification" },
          { status: 400 }
        );
      }
      return await handleVerifyOTP(token, code);
    } else {
      return NextResponse.json(
        { success: false, error: "Invalid action" },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.error("OTP API error", { error: String(error) });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
