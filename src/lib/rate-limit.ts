/**
 * In-memory rate limiter with IP-based tracking
 * Tracks requests per IP and enforces rate limits
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// In-memory storage: ip -> { count, resetTime }
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
    const ipsToDelete: string[] = [];

    rateLimitMap.forEach((entry, ip) => {
      if (entry.resetTime < now) {
        ipsToDelete.push(ip);
      }
    });

    ipsToDelete.forEach((ip) => rateLimitMap.delete(ip));
  }, CLEANUP_INTERVAL);

  // Prevent timer from keeping process alive
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Rate limit check for a given IP
 * @param ip - Client IP address
 * @param limit - Max requests per window (default: 60)
 * @param windowMs - Time window in milliseconds (default: 60000 = 60 seconds)
 * @returns { success: boolean, remaining: number }
 */
export function rateLimit(
  ip: string,
  limit: number = 60,
  windowMs: number = 60000
): { success: boolean; remaining: number } {
  // Start cleanup timer on first use
  if (!cleanupTimer) {
    startCleanupTimer();
  }

  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  // If no entry exists or window expired, create new entry
  if (!entry || entry.resetTime < now) {
    rateLimitMap.set(ip, {
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
 * Get client IP from request headers
 * Handles various proxy scenarios (X-Forwarded-For, CF-Connecting-IP, etc.)
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Take the first IP if multiple are present
    return forwardedFor.split(",")[0].trim();
  }

  const cloudflareIp = request.headers.get("cf-connecting-ip");
  if (cloudflareIp) {
    return cloudflareIp;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "unknown";
}
