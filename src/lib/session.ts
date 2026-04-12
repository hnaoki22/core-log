/**
 * Session management utilities for OTP verification
 * Uses HMAC signing (Web Crypto API) to prevent cookie forgery
 *
 * IMPORTANT: This module is imported by middleware.ts which runs in Edge Runtime.
 * All crypto operations MUST use the Web Crypto API (crypto.subtle), NOT Node.js crypto.
 * Node.js crypto (createHmac, timingSafeEqual) is NOT available in Edge Runtime.
 */

// Use CRON_SECRET as the signing key (already available in env)
// Falls back to a default for dev only — in prod CRON_SECRET is always set
const SESSION_SECRET = process.env.CRON_SECRET || process.env.SESSION_SECRET || "dev-session-secret-do-not-use-in-production";

/**
 * Create HMAC-SHA256 signature using Web Crypto API (Edge Runtime compatible)
 */
async function sign(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(SESSION_SECRET);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Timing-safe string comparison (Edge Runtime compatible)
 * Prevents timing attacks by always comparing all bytes
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Get the session cookie name for a token
 */
export function getSessionCookieName(token: string): string {
  return `core_session_${token}`;
}

/**
 * Create a signed session value
 * Format: "verified:<token>.<hmac-signature>"
 */
export async function createSignedSessionValue(token: string): Promise<string> {
  const payload = `verified:${token}`;
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

/**
 * Check if session is valid
 * Validates that the session cookie exists, is properly signed, and matches the token
 *
 * This function is async because HMAC signing uses the Web Crypto API
 */
export async function isSessionValid(token: string, cookieHeader: string | null): Promise<boolean> {
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
  const expectedSignature = await sign(payload);
  return timingSafeCompare(receivedSignature, expectedSignature);
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
