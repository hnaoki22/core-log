/**
 * Session management utilities for OTP verification
 */

/**
 * Get the session cookie name for a token
 */
export function getSessionCookieName(token: string): string {
  return `core_session_${token}`;
}

/**
 * Check if session is valid
 * Validates that the session cookie exists and equals "verified"
 */
export function isSessionValid(token: string, cookieHeader: string | null): boolean {
  if (!cookieHeader) {
    return false;
  }

  const cookieName = getSessionCookieName(token);
  const cookies = parseCookies(cookieHeader);

  return cookies[cookieName] === "verified";
}

/**
 * Parse cookie header string into an object
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  const parts = cookieHeader.split(";");

  for (const part of parts) {
    const [name, value] = part.trim().split("=");
    if (name && value) {
      cookies[name] = decodeURIComponent(value);
    }
  }

  return cookies;
}
