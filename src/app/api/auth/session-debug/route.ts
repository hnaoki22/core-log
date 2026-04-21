/**
 * Session Debug API — temporary diagnostic endpoint
 * GET /api/auth/session-debug?token=XXX
 *
 * Returns diagnostic information about session cookie state.
 * This endpoint runs in Serverless Runtime (not Edge), so comparing
 * its key availability with middleware (Edge) diagnostics reveals mismatches.
 *
 * TODO: Remove this endpoint once OTP session persistence is confirmed fixed.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionCookieName, isSessionValid } from "@/lib/session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "token param required" }, { status: 400 });
  }

  const cookieName = getSessionCookieName(token);
  const cookieHeader = request.headers.get("cookie");

  // Check if the specific session cookie exists
  const hasCookieHeader = !!cookieHeader;
  const hasSessionCookie = cookieHeader?.includes(cookieName) ?? false;

  // Extract cookie value for format analysis (not the full value for security)
  let cookieFormat = "absent";
  let cookieValueLength = 0;
  if (cookieHeader) {
    const match = cookieHeader.match(
      new RegExp(`${cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`)
    );
    if (match) {
      const rawValue = match[1];
      cookieValueLength = rawValue.length;
      try {
        const decoded = decodeURIComponent(rawValue);
        if (decoded === "verified") {
          cookieFormat = "legacy_unsigned";
        } else if (decoded.startsWith("verified:") && decoded.includes(".")) {
          cookieFormat = "signed_correct";
        } else {
          cookieFormat = `unknown_prefix:${decoded.substring(0, 15)}...`;
        }
      } catch {
        cookieFormat = "decode_error";
      }
    }
  }

  // Validate session using the same logic as middleware
  const isValid = await isSessionValid(token, cookieHeader);

  // Key availability (boolean only, never expose actual values)
  const hasSessionSecret = !!process.env.SESSION_SECRET;
  const hasCronSecret = !!process.env.CRON_SECRET;
  const primarySource = hasSessionSecret
    ? "SESSION_SECRET"
    : hasCronSecret
      ? "CRON_SECRET"
      : "DEV_FALLBACK";

  // Count total cookies sent by browser
  const totalCookies = cookieHeader
    ? cookieHeader.split(";").filter((c) => c.trim().length > 0).length
    : 0;

  // User-Agent analysis
  const ua = request.headers.get("user-agent") || "";
  const isSafari = ua.includes("Safari") && !ua.includes("Chrome");
  const isIOS = /iPhone|iPad|iPod/.test(ua);

  return NextResponse.json({
    runtime: "serverless",
    timestamp: new Date().toISOString(),
    tokenPrefix: token.substring(0, 6),
    session: {
      isValid,
      cookieName,
      hasCookieHeader,
      hasSessionCookie,
      cookieFormat,
      cookieValueLength,
      totalCookies,
    },
    keys: {
      hasSessionSecret,
      hasCronSecret,
      primarySource,
    },
    browser: {
      isSafari,
      isIOS,
      userAgentLength: ua.length,
    },
  });
}
