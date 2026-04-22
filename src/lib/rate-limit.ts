/**
 * In-memory rate limiter with composite-key tracking.
 *
 * History (Phase 0 #16):
 *   Previously keyed purely by IP, which meant all users behind a shared NAT
 *   (e.g. a corporate office) fought for one 60/min bucket. At 200-tenant
 *   scale this produced cross-tenant interference: one tenant's burst could
 *   rate-limit another tenant sharing the same public IP.
 *
 *   We now key by `${tokenPrefix}:${ip}` when the caller is authenticated —
 *   each participant/manager/admin token gets its own bucket per IP, so
 *   tenants never share a counter.
 *
 *   Anonymous requests (no token in URL/query) still fall back to pure IP
 *   so unauthenticated endpoints (`/verify/*`, OTP request) remain bounded.
 *
 * Note: this is still in-memory per-instance. Vercel functions are ephemeral
 * so cold starts reset state — upgrade to Upstash Redis when sustained abuse
 * protection matters. See Phase 0.5 backlog.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory storage: key -> { count, resetTime }
const rateLimitMap = new Map<string, RateLimitEntry>();

// Cleanup interval: remove expired entries every 60 seconds
const CLEANUP_INTERVAL = 60000;

let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Start the cleanup timer to remove expired entries
 */
function startCleanupTimer() {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    const now = Date.now();
    const keysToDelete: string[] = [];

    rateLimitMap.forEach((entry, key) => {
      if (entry.resetTime < now) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((key) => rateLimitMap.delete(key));
  }, CLEANUP_INTERVAL);

  // Prevent timer from keeping process alive
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Rate limit check for a given composite key.
 * @param key - Opaque bucket key (e.g. `${tokenPrefix}:${ip}` or plain IP)
 * @param limit - Max requests per window (default: 60)
 * @param windowMs - Time window in milliseconds (default: 60000 = 60 seconds)
 * @returns { success: boolean, remaining: number }
 */
export function rateLimit(
  key: string,
  limit: number = 60,
  windowMs: number = 60000
): { success: boolean; remaining: number } {
  // Start cleanup timer on first use
  if (!cleanupTimer) {
    startCleanupTimer();
  }

  const now = Date.now();
  const entry = rateLimitMap.get(key);

  // If no entry exists or window expired, create new entry
  if (!entry || entry.resetTime < now) {
    rateLimitMap.set(key, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      success: true,
      remaining: limit - 1,
    };
  }

  // Entry exists and is still within window
  if (entry.count < limit) {
    entry.count++;
    return {
      success: true,
      remaining: limit - entry.count,
    };
  }

  // Rate limit exceeded
  return {
    success: false,
    remaining: 0,
  };
}

/**
 * Extract the user-facing token from a request, if present.
 *
 * Looks for the token in two places in this order:
 *   1. URL path: `/p/[token]`, `/m/[token]`, `/a/[token]`, `/verify/[token]`
 *   2. Query string: `?token=...`
 *
 * Returns the first 12 characters of the token (enough entropy to distinguish
 * users, short enough to keep logs readable), or null when no token is present.
 */
export function extractTokenPrefix(request: { url: string }): string | null {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }

  // URL path pattern: /p/[token], /m/[token], /a/[token], /verify/[token]
  const pathMatch = url.pathname.match(/^\/(?:p|m|a|verify)\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) {
    return pathMatch[1].slice(0, 12);
  }

  // Query param
  const qpToken = url.searchParams.get("token");
  if (qpToken) {
    return qpToken.slice(0, 12);
  }

  return null;
}

/**
 * Build a rate-limit bucket key for a request.
 *
 * Composite `${tokenPrefix}:${ip}` when authenticated so each user/tenant gets
 * an independent bucket; plain `${ip}` for anonymous paths.
 */
export function buildRateLimitKey(request: { url: string }, ip: string): string {
  const tokenPrefix = extractTokenPrefix(request);
  return tokenPrefix ? `${tokenPrefix}:${ip}` : ip;
}

/**
 * Get client IP from request headers
 * On Vercel: x-forwarded-for is set by the platform (trustworthy for last entry)
 * Falls back through headers in order of trust
 */
export function getClientIp(request: Request): string {
  // Vercel sets x-real-ip to the actual client IP
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  // Cloudflare sets cf-connecting-ip
  const cloudflareIp = request.headers.get("cf-connecting-ip");
  if (cloudflareIp) {
    return cloudflareIp.trim();
  }

  // X-Forwarded-For: use the LAST entry (added by the closest trusted proxy)
  // Attackers can prepend fake IPs, but can't control what the proxy appends
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const ips = forwardedFor.split(",").map(ip => ip.trim());
    // Last IP is the one added by the edge proxy (most trustworthy)
    return ips[ips.length - 1];
  }

  return "unknown";
}

/**
 * Test-only: reset the in-memory map between tests.
 */
export function __resetRateLimitMapForTests(): void {
  rateLimitMap.clear();
}
