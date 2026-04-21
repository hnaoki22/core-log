/**
 * Next.js Middleware
 * - Adds security headers to all responses
 * - Logs API requests with structured JSON
 * - Applies rate limiting to /api/* routes
 * - OTP session verification for protected routes
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { isSessionValid, getSessionCookieName, SESSION_MAX_AGE } from "@/lib/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { validateEnv } from "@/lib/env";

// Validate environment variables on cold start
validateEnv();

// Security headers to add to all responses
const securityHeaders = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "1; mode=block",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=()",
};

/**
 * Log API request in structured JSON format
 */
function logApiRequest(
  method: string,
  path: string,
  ip: string,
  rateLimitStatus?: { success: boolean; remaining: number }
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: "api_request",
    method,
    path,
    ip,
    rateLimit: rateLimitStatus,
  };

  console.log(JSON.stringify(logEntry));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

    // ===== Domain Redirect =====
    // vercel.appドメインからカスタムドメインへ308永久リダイレクト
    // ただしVercel Cronからのリクエスト（/api/cron/*）はリダイレクトしない
    const host = request.headers.get("host") || "";
    const customDomain = process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
          : null;

    if (
          customDomain &&
          host.includes("vercel.app") &&
          !pathname.startsWith("/api/cron/")
        ) {
          const redirectUrl = new URL(request.url);
          redirectUrl.host = customDomain;
          redirectUrl.protocol = "https:";
          redirectUrl.port = "";
          return NextResponse.redirect(redirectUrl, 308);
    }

  // OTP session verification for protected routes
  // Check feature flag from admin dashboard (Supabase ai_settings)
  // Falls back to OTP_ENABLED env var if feature flag check fails
  let otpEnabled = false;
  try {
    otpEnabled = await isFeatureEnabled("feature.otpAuth");
  } catch {
    // Fallback to env var if Supabase is unreachable
    otpEnabled = process.env.OTP_ENABLED === "true";
  }

  if (otpEnabled) {
    // Match patterns: /p/[token], /m/[token], /a/[token]
    const tokenMatch = pathname.match(/^\/([pma])\/([a-zA-Z0-9_-]+)(\/.*)?$/);

    if (tokenMatch && !pathname.startsWith("/api/") && !pathname.startsWith("/verify/")) {
      const [, , token] = tokenMatch;
      const cookieHeader = request.headers.get("cookie");

      // Check if session is valid (async — uses Web Crypto API for HMAC, multi-key validation)
      const sessionValid = await isSessionValid(token, cookieHeader);
      if (!sessionValid) {
        // Enhanced diagnostic logging for session issues
        const cookieName = getSessionCookieName(token);
        const hasCookie = cookieHeader?.includes(cookieName) ?? false;
        const userAgent = request.headers.get("user-agent") || "none";
        const isSafari = userAgent.includes("Safari") && !userAgent.includes("Chrome");
        console.warn(
          `[OTP] Session invalid: token=${token.slice(0, 6)}... hasCookie=${hasCookie} ` +
          `safari=${isSafari} path=${pathname} ` +
          `referer=${request.headers.get("referer") || "none"}`
        );
        // Redirect to verification page
        const verifyUrl = new URL(`/verify/${token}`, request.url);
        return NextResponse.redirect(verifyUrl);
      }

      // Sliding session: renew cookie expiry on every valid page visit
      // This means users who access CORE Log at least once every 30 days
      // will never be asked to re-authenticate.
      const cookieName = getSessionCookieName(token);
      const existingCookie = cookieHeader?.split(";").find((c) => c.trim().startsWith(`${cookieName}=`));
      if (existingCookie) {
        const rawCookieValue = existingCookie.split("=").slice(1).join("=").trim();
        // IMPORTANT: Decode the cookie value before re-setting it.
        // The browser stores URL-encoded values (e.g., "verified%3A...").
        // Next.js cookies.set() re-encodes the value, so passing the raw
        // encoded value would cause double-encoding ("%253A" instead of "%3A"),
        // corrupting the cookie on subsequent requests.
        let cookieValue: string;
        try {
          cookieValue = decodeURIComponent(rawCookieValue);
        } catch {
          cookieValue = rawCookieValue;
        }
        const res = NextResponse.next();
        // Re-set the same cookie with a fresh 30-day expiry
        res.cookies.set({
          name: cookieName,
          value: cookieValue,
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: SESSION_MAX_AGE,
          path: "/",
        });
        // Add security headers to this response too
        Object.entries(securityHeaders).forEach(([key, value]) => {
          res.headers.set(key, value);
        });
        return res;
      }
    }
  }

  const response = NextResponse.next();

  // Add security headers to all responses
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // API request logging and rate limiting
  // Exempt cron endpoints (Vercel Cron invocations should never be rate limited)
  const isApiRoute = pathname.startsWith("/api/");
  const isCronRoute = pathname.startsWith("/api/cron/");

  if (isApiRoute && !isCronRoute) {
    const method = request.method;
    const clientIp = getClientIp(request);

    // Only apply rate limiting if we have a valid IP
    // Skip for "unknown" IPs to avoid incorrectly rate-limiting them together
    if (clientIp !== "unknown") {
      // Apply rate limiting to API routes
      const rateLimitResult = rateLimit(clientIp, 60, 60000);

      // Log the request
      logApiRequest(method, pathname, clientIp, rateLimitResult);

      // If rate limited, return 429
      if (!rateLimitResult.success) {
        return NextResponse.json(
          {
            error: "Too Many Requests",
            message: "Rate limit exceeded. Maximum 60 requests per 60 seconds.",
          },
          {
            status: 429,
            headers: {
              "Retry-After": "60",
              ...securityHeaders,
            },
          }
        );
      }

      // Add rate limit info headers to response
      response.headers.set(
        "X-RateLimit-Limit",
        "60"
      );
      response.headers.set(
        "X-RateLimit-Remaining",
        rateLimitResult.remaining.toString()
      );
      response.headers.set(
        "X-RateLimit-Reset",
        Math.ceil((Date.now() + 60000) / 1000).toString()
      );
    } else {
      // Log requests with unknown IP
      logApiRequest(method, pathname, clientIp);
    }
  }

  return response;
}

// Match middleware on all routes
export const config = {
  matcher: [
    // Match all API routes
    "/api/:path*",
    // Match page routes (excluding static files and images)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.gif|.*\\.svg).*)",
  ],
};
