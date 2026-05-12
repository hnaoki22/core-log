/**
 * Session management utilities for OTP verification
 * Uses HMAC signing (Web Crypto API) to prevent cookie forgery
 *
 * IMPORTANT: This module is imported by middleware.ts which runs in Edge Runtime.
 * All crypto operations MUST use the Web Crypto API (crypto.subtle), NOT Node.js crypto.
 * Node.js crypto (createHmac, timingSafeEqual) is NOT available in Edge Runtime.
 *
 * KEY ROTATION SAFETY:
 * This module uses multi-key validation to prevent session invalidation when
 * the signing key changes (e.g., env var not set in one runtime, key rotation).
 * - SIGNING always uses the primary (highest priority) key
 * - VALIDATION tries ALL candidate keys — if any key matches, session is valid
 * This ensures sessions survive across deployments even if keys change.
 */

const DEV_FALLBACK_KEY = "dev-session-secret-do-not-use-in-production";

function isProd(): boolean {
  return process.env.NODE_ENV === "production"
    && process.env.NEXT_PUBLIC_ENV_NAME !== "preview"
    && process.env.NEXT_PUBLIC_ENV_NAME !== "development";
}

/**
 * Collect all candidate signing keys in priority order.
 * The first key is used for signing new cookies.
 * All keys are tried when validating existing cookies.
 *
 * Production: only SESSION_SECRET (or SESSION_SECRET_PREV for rotation).
 * The CRON_SECRET and DEV_FALLBACK_KEY were previously fallbacks but are
 * security hazards: CRON_SECRET mixed signing roles, and DEV_FALLBACK_KEY
 * is a well-known constant in this public repo that would allow session
 * forgery if it ever validated in production.
 */
function getAllSigningKeys(): string[] {
  const keys: string[] = [];
  if (process.env.SESSION_SECRET) keys.push(process.env.SESSION_SECRET);
  if (process.env.SESSION_SECRET_PREV) keys.push(process.env.SESSION_SECRET_PREV);
  if (!isProd()) {
    // Non-prod only: tolerate CRON_SECRET-signed cookies and the dev fallback,
    // so local development keeps working without configuring SESSION_SECRET.
    if (process.env.CRON_SECRET) keys.push(process.env.CRON_SECRET);
    keys.push(DEV_FALLBACK_KEY);
  }
  // Deduplicate
  return keys.filter((k, i) => keys.indexOf(k) === i);
}

/**
 * Get the primary signing key (used for new cookie signatures).
 * In production, SESSION_SECRET MUST be configured or signing fails.
 */
function getPrimaryKey(): string {
  const keys = getAllSigningKeys();
  if (keys.length === 0) {
    throw new Error(
      "SESSION_SECRET is not configured. Set the SESSION_SECRET environment variable " +
      "to a high-entropy random string before serving traffic in production."
    );
  }
  return keys[0];
}

/**
 * Log diagnostic info about key availability (called once per cold start).
 * Only logs boolean presence, never the actual key values.
 */
let _keyDiagLogged = false;
function logKeyDiagnostics(): void {
  if (_keyDiagLogged) return;
  _keyDiagLogged = true;
  const hasSessionSecret = !!process.env.SESSION_SECRET;
  const hasCronSecret = !!process.env.CRON_SECRET;
  const primarySource = hasSessionSecret
    ? "SESSION_SECRET"
    : hasCronSecret
      ? "CRON_SECRET"
      : "DEV_FALLBACK";
  console.log(
    `[Session] Key diagnostics: SESSION_SECRET=${hasSessionSecret}, CRON_SECRET=${hasCronSecret}, primarySource=${primarySource}, totalKeys=${getAllSigningKeys().length}`
  );
}

/** Session cookie duration: 30 days in seconds */
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

/**
 * Create HMAC-SHA256 signature using Web Crypto API (Edge Runtime compatible)
 */
async function signWithKey(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
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
 * Sign a value with the primary key (for creating new cookies)
 */
async function sign(value: string): Promise<string> {
  logKeyDiagnostics();
  return signWithKey(value, getPrimaryKey());
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
 * Validates that the session cookie exists, is properly signed, and matches the token.
 *
 * MULTI-KEY VALIDATION: Tries all candidate signing keys. This ensures sessions
 * remain valid even if the key changes between deployments or differs between
 * Edge Runtime (middleware) and Serverless Runtime (API routes).
 *
 * This function is async because HMAC signing uses the Web Crypto API
 */
export async function isSessionValid(token: string, cookieHeader: string | null): Promise<boolean> {
  logKeyDiagnostics();

  if (!cookieHeader) {
    return false;
  }

  const cookieName = getSessionCookieName(token);
  const cookies = parseCookies(cookieHeader);
  const cookieValue = cookies[cookieName];

  if (!cookieValue) {
    return false;
  }

  // Validate signed cookie: "verified:<token>.<signature>"
  // Legacy unsigned "verified" cookies are NO LONGER accepted — any client
  // still holding one will be redirected through OTP and reissued a signed
  // cookie. Accepting the bare "verified" string allowed full session
  // forgery for anyone who knew (or could guess) a token.
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

  // Try ALL candidate signing keys — if any matches, session is valid.
  // This handles:
  //   - SESSION_SECRET not set in one runtime (Edge vs Serverless)
  //   - Key rotation between deployments
  //   - CRON_SECRET availability differences
  const keys = getAllSigningKeys();
  for (let i = 0; i < keys.length; i++) {
    const expectedSignature = await signWithKey(payload, keys[i]);
    if (timingSafeCompare(receivedSignature, expectedSignature)) {
      // Log if validated with a non-primary key (indicates key mismatch issue)
      if (i > 0) {
        console.warn(
          `[Session] Cookie validated with key[${i}], not primary key[0]. ` +
          `This indicates a signing key mismatch between runtimes. token=${token.slice(0, 6)}...`
        );
      }
      return true;
    }
  }

  // All keys failed — log diagnostic info
  console.warn(
    `[Session] HMAC validation failed for ALL ${keys.length} keys. ` +
    `token=${token.slice(0, 6)}... sigLength=${receivedSignature.length} ` +
    `cookieFormat=${cookieValue.startsWith("verified:") ? "signed" : "unknown"}`
  );
  return false;
}

/**
 * Parse cookie header string into an object.
 *
 * If the same cookie name appears twice (e.g., an attacker on a sibling
 * subdomain set a wider-Path duplicate), the FIRST occurrence wins — that's
 * the one the user's browser stored first, and the duplicate is unsafe to
 * trust. Browsers typically send the more specific Path first, so this
 * preserves the most-scoped cookie. Defence-in-depth alongside SameSite=Lax.
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  const parts = cookieHeader.split(";");

  for (const part of parts) {
    const [name, ...rest] = part.trim().split("=");
    const value = rest.join("="); // Handle values containing "="
    if (name && value && !(name in cookies)) {
      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }
    }
  }

  return cookies;
}
