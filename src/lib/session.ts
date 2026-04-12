/**
 * Session management utilities for OTP verification
 * Uses HMAC signing to prevent cookie forgery
 * This module is server-only (used in API routes only)
 */
import { createHmac, timingSafeEqual } from "crypto";

// Use CRON_SECRET as the signing key (already available in env)
// Falls back to a default for dev only — in prod CRON_SECRET is always set
const SESSION_SECRET = process.env.CRON_SECRET || process.env.SESSION_SECRET || "dev-session-secret-do-not-use-in-production";

/**
 * Create HMAC signature for a value
 */
function sign(value: string): string {
  return createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("hex");
}

/**
 * Get the session cookie name for a token
 */
export function getSessionCookieName(token: string): string {
  return `core_session_${token}`;
}

/**
 * Create a signed session value
 * Format: "verified.<hmac-signature>"
 */
export function createSignedSessionValue(token: string): string {
  const payload = `verified:${token}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

/**
 * Check if session is valid
 * Validates that the session cookie exists, is properly signed, and matches the token
 */
export function isSessionValid(token: string, cookieHeader: string | null): boolean {
  if (!cookieHeader) {
    return false;
  }

  const cookieName = getSessionCookieName(token);
  const cookies = parseCookies(cookieHeader);
  const cookieValue = cookies[cookieName];

  if (!cookieValue) {
    return false;
  }

  // Support legacy unsigned "verified" cookies during migration
  if (cookieValue === "verified") {
    return true;
  }

  // Validate signed cookie: "verified:<token>.<signature>"
  const lastDotIndex = cookieValue.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return false;
  }

  const payload = cookieValue.substring(0, lastDotIndex);
  const receivedSignature = cookieValue.substring(lastDotIndex + 1);

  // Verify the payload matches expected format
  if (payload !== `verified:${token}`) {
    return false;
  }

  // Verify the HMAC signature using timing-safe comparison
  const expectedSignature = sign(payload);
  try {
    return timingSafeEqual(
      Buffer.from(receivedSignature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Parse cookie header string into an object
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  const parts = cookieHeader.split(";");

  for (const part of parts) {
    const [name, ...rest] = part.trim().split("=");
    const value = rest.join("="); // Handle values containing "="
    if (name && value) {
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    }
  }

  return cookies;
}
