/**
 * Next.js Middleware
 * - Adds security headers to all responses
 * - Logs API requests with structured JSON
 * - Applies rate limiting to /api/* routes
 */

import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

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

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Add security headers to all responses
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  // API request logging and rate limiting
  const pathname = request.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api/");

  if (isApiRoute) {
    const method = request.method;
    const clientIp = getClientIp(request);

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
