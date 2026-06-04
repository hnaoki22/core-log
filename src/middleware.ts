/**
 * Next.js Middleware
 * - Adds security headers to all responses
 * - Logs API requests with structured JSON
 * - Applies rate limiting to /api/* routes
 * - OTP session verification for protected routes
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp, buildRateLimitKey } from "@/lib/rate-limit";
import { isSessionValid, getSessionCookieName, createSignedSessionValue, SESSION_MAX_AGE } from "@/lib/session";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { DEFAULT_TENANT_ID } from "@/lib/supabase";
import { resolveTenantFromToken } from "@/lib/tenant-from-token";
import { checkSession } from "@/lib/session-store";
import { validateEnv } from "@/lib/env";

// Validate environment variables on cold start
validateEnv();

/**
 * Decide whether to set the `Secure` cookie attribute.
 *
 * Previously this was gated on `NODE_ENV === "production"`, which means
 * preview and other non-prod-but-HTTPS deployments served session cookies
 * without the Secure flag. Use the request scheme instead — browsers
 * silently accept `Secure` on https://localhost too, so this is safe in
 * dev as well.
 */
function isSecureRequest(request: NextRequest): boolean {
  return (
    request.nextUrl.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  );
}

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
  rateLimitStatus?: { success: boolean; remaining: number },
  rateLimitKey?: string
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type: "api_request",
    method,
    path,
    ip,
    rateLimitKey,
    rateLimit: rateLimitStatus,
  };

  console.log(JSON.stringify(logEntry));
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ===== Skip prefetch =====
  // Next.js fires GET requests with `Next-Router-Prefetch: 1` (or the older
  // `purpose: prefetch`) when a <Link> enters the viewport. We don't need
  // to do session validation, redirect logic, or rate-limit accounting for
  // these — they're speculative loads, not real navigation, and forcing
  // them through the full auth path causes prefetch failures that defeat
  // the point of Link prefetching.
  const isPrefetch =
    request.headers.get("next-router-prefetch") === "1" ||
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose")?.includes("prefetch");
  if (isPrefetch) {
    const res = NextResponse.next();
    Object.entries(securityHeaders).forEach(([key, value]) => res.headers.set(key, value));
    return res;
  }

    // ===== Domain Redirect =====
    // vercel.appドメインからカスタムドメインへ308永久リダイレクト
    // ただしVercel Cronからのリクエスト（/api/cron/*）はリダイレクトしない
    const host = request.headers.get("host") || "";
    const customDomain = process.env.NEXT_PUBLIC_APP_URL
      ? new URL(process.env.NEXT_PUBLIC_APP_URL).host
          : null;

    // Use endsWith — `includes` matched user-controllable hosts like
    // "attacker-vercel.app.com" too. Vercel preview hosts always end in
    // ".vercel.app" so a suffix check is both accurate and tight.
    if (
          customDomain &&
          host.endsWith(".vercel.app") &&
          !pathname.startsWith("/api/cron/")
        ) {
          const redirectUrl = new URL(request.url);
          redirectUrl.host = customDomain;
          redirectUrl.protocol = "https:";
          redirectUrl.port = "";
          return NextResponse.redirect(redirectUrl, 308);
    }

  // ===== Fast path for authenticated requests =====
  //
  // For protected routes (/p, /m, /a, /api) check the session cookie FIRST.
  // If the cookie's HMAC signature validates, the user is authenticated and
  // we can skip the Supabase round-trip for the OTP feature flag entirely.
  //
  // Previously the order was: feature-flag check (Supabase RT) → session
  // check (HMAC). On the happy path (logged-in user) the flag check was
  // pure overhead, paid on every page navigation and every fetch from the
  // page. With the cache miss probability ≈ 1/(uptime_seconds/5), on a
  // low-traffic deploy almost every request was a cache miss.
  const tokenMatch = pathname.match(/^\/([pma])\/([a-zA-Z0-9_-]+)(\/.*)?$/);
  const isProtectedPage = tokenMatch && !pathname.startsWith("/api/") && !pathname.startsWith("/verify/");

  if (isProtectedPage) {
    const [, , token] = tokenMatch!;
    const cookieHeader = request.headers.get("cookie");
    // HMAC validation is pure Web Crypto, no I/O — fast.
    const sessionValid = await isSessionValid(token, cookieHeader);
    if (sessionValid) {
      // Sliding session: renew cookie expiry on every valid visit.
      const cookieName = getSessionCookieName(token);
      const existingCookie = cookieHeader?.split(";").find((c) => c.trim().startsWith(`${cookieName}=`));
      const res = NextResponse.next();
      if (existingCookie) {
        const rawCookieValue = existingCookie.split("=").slice(1).join("=").trim();
        let cookieValue: string;
        try {
          cookieValue = decodeURIComponent(rawCookieValue);
        } catch {
          cookieValue = rawCookieValue;
        }
        res.cookies.set({
          name: cookieName,
          value: cookieValue,
          httpOnly: true,
          secure: isSecureRequest(request),
          sameSite: "lax",
          maxAge: SESSION_MAX_AGE,
          path: "/",
        });
      }
      Object.entries(securityHeaders).forEach(([key, value]) => res.headers.set(key, value));
      return res;
    }
  }

  // Slow path: no valid session, OR not a protected page. Now check the OTP
  // feature flag to decide whether to enforce auth or pass through.
  //
  // Per-tenant: resolve the token's OWN tenant and read THAT tenant's otpAuth
  // flag, so one tenant's setting can't govern another tenant's auth (tenant
  // isolation). Only protected pages (/p /m /a) carry a token, so we resolve
  // only there. Falls back to DEFAULT_TENANT_ID when the token can't be
  // resolved (unknown token / Supabase error) so behavior never regresses and
  // unknown tokens still hit the (currently ON) default gate.
  let otpEnabled = false;
  if (isProtectedPage) {
    const [, , otpToken] = tokenMatch!;
    try {
      const otpTenantId = (await resolveTenantFromToken(otpToken)) ?? DEFAULT_TENANT_ID;
      otpEnabled = await isFeatureEnabled("feature.otpAuth", otpTenantId);
    } catch {
      // Fallback to env var if Supabase is unreachable
      otpEnabled = process.env.OTP_ENABLED === "true";
    }
  }

  if (otpEnabled && isProtectedPage) {
    const [, , token] = tokenMatch!;
    const cookieHeader = request.headers.get("cookie");
    // Session HMAC already failed in the fast-path branch (we wouldn't be
    // here otherwise). Try the Supabase-backed session as fallback —
    // handles iOS in-app browser cookie isolation, cookie clearing, etc.
    const supabaseSessionValid = await checkSession(token);

    if (supabaseSessionValid) {
      console.log(
        `[OTP] Session recovered from Supabase: token=${token.slice(0, 6)}... ` +
        `Reissuing cookie. path=${pathname}`
      );
      const cookieName = getSessionCookieName(token);
      const signedValue = await createSignedSessionValue(token);
      const res = NextResponse.next();
      res.cookies.set({
        name: cookieName,
        value: signedValue,
        httpOnly: true,
        secure: isSecureRequest(request),
        sameSite: "lax",
        maxAge: SESSION_MAX_AGE,
        path: "/",
      });
      Object.entries(securityHeaders).forEach(([key, value]) => res.headers.set(key, value));
      return res;
    }

    // Both cookie and Supabase validation failed — redirect to OTP verification
    const cookieName = getSessionCookieName(token);
    const hasCookie = cookieHeader?.includes(cookieName) ?? false;
    const userAgent = request.headers.get("user-agent") || "none";
    const isSafari = userAgent.includes("Safari") && !userAgent.includes("Chrome");
    console.warn(
      `[OTP] Session invalid (cookie+supabase): token=${token.slice(0, 6)}... hasCookie=${hasCookie} ` +
      `safari=${isSafari} path=${pathname} ` +
      `referer=${request.headers.get("referer") || "none"}`
    );
    const verifyUrl = new URL(`/verify/${token}`, request.url);
    return NextResponse.redirect(verifyUrl);
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
      // Check a global per-IP cap FIRST so an attacker rotating tokens cannot
      // create unlimited composite buckets. The composite token+IP bucket
      // (below) keeps legitimate tenants behind a shared NAT from interfering
      // with each other, but on its own it could be bypassed by varying the
      // token prefix per request.
      const ipBucketKey = `ip:${clientIp}`;
      const ipBucketResult = rateLimit(ipBucketKey, 240, 60000);
      if (!ipBucketResult.success) {
        logApiRequest(method, pathname, clientIp, ipBucketResult, ipBucketKey);
        return new NextResponse("Too Many Requests", {
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Remaining": "0",
            ...securityHeaders,
          },
        });
      }

      // Composite key: `${tokenPrefix}:${ip}` when a token appears, else `${ip}`.
      // Keeps tenants sharing a NAT from draining each other's bucket.
      const rateLimitKey = buildRateLimitKey(request, clientIp);
      const rateLimitResult = rateLimit(rateLimitKey, 60, 60000);

      // Log the request
      logApiRequest(method, pathname, clientIp, rateLimitResult, rateLimitKey);

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
