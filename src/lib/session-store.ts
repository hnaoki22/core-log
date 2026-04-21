/**
 * Supabase-backed session store for OTP verification persistence.
 *
 * WHY THIS EXISTS:
 * Cookie-based sessions are unreliable on iOS because:
 *  - In-app browsers (LINE, Mail, Slack) have separate cookie stores from Safari
 *  - Users switch between these contexts daily, losing cookies each time
 *  - Safari ITP may cap cookie lifetimes in certain scenarios
 *
 * This module stores OTP session state in Supabase as a fallback.
 * When the cookie is missing, middleware checks Supabase and re-issues the cookie.
 *
 * EDGE RUNTIME COMPATIBLE: Uses only fetch() for Supabase REST API calls.
 * Does NOT import @supabase/supabase-js (too heavy for middleware bundle).
 */

const SESSION_DURATION_DAYS = 30;

/**
 * Get Supabase REST API credentials from env vars.
 * Returns null if not configured (graceful degradation).
 */
function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

/**
 * Store a verified OTP session in Supabase.
 * Called after successful OTP verification.
 * Uses UPSERT so repeated verifications just refresh the expiry.
 */
export async function storeSession(token: string): Promise<boolean> {
  const config = getSupabaseConfig();
  if (!config) return false;

  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  try {
    // First, try to upsert into otp_sessions
    const res = await fetch(
      `${config.url}/rest/v1/otp_sessions`,
      {
        method: "POST",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          token,
          verified_at: new Date().toISOString(),
          expires_at: expiresAt,
        }),
      }
    );

    if (res.ok || res.status === 201) {
      return true;
    }

    // If table doesn't exist (404 or 400 with specific error), try to create it
    const text = await res.text();
    if (text.includes("does not exist") || text.includes("relation")) {
      console.warn("[SessionStore] otp_sessions table not found, attempting to create...");
      const created = await createTable(config);
      if (created) {
        // Retry the upsert
        const retry = await fetch(
          `${config.url}/rest/v1/otp_sessions`,
          {
            method: "POST",
            headers: {
              apikey: config.key,
              Authorization: `Bearer ${config.key}`,
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates",
            },
            body: JSON.stringify({
              token,
              verified_at: new Date().toISOString(),
              expires_at: expiresAt,
            }),
          }
        );
        return retry.ok || retry.status === 201;
      }
    }

    console.error("[SessionStore] Failed to store session", { status: res.status, body: text.substring(0, 200) });
    return false;
  } catch (error) {
    console.error("[SessionStore] Error storing session", { error: String(error) });
    return false;
  }
}

/**
 * Check if a token has an active (non-expired) session in Supabase.
 * Called by middleware as fallback when cookie is absent.
 */
export async function checkSession(token: string): Promise<boolean> {
  const config = getSupabaseConfig();
  if (!config) return false;

  try {
    const now = new Date().toISOString();
    const res = await fetch(
      `${config.url}/rest/v1/otp_sessions?token=eq.${encodeURIComponent(token)}&expires_at=gt.${encodeURIComponent(now)}&select=token&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!res.ok) {
      // Table might not exist — silently fail
      return false;
    }

    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    // Network error or timeout — don't block the user
    return false;
  }
}

/**
 * Create the otp_sessions table via Supabase RPC (SQL).
 * This is a one-time operation.
 */
async function createTable(config: { url: string; key: string }): Promise<boolean> {
  try {
    const sql = `
      CREATE TABLE IF NOT EXISTS otp_sessions (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        verified_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_otp_sessions_token ON otp_sessions (token);
      CREATE INDEX IF NOT EXISTS idx_otp_sessions_expires ON otp_sessions (expires_at);
    `;

    const res = await fetch(`${config.url}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql }),
    });

    if (res.ok) {
      console.log("[SessionStore] otp_sessions table created successfully");
      return true;
    }

    // exec_sql RPC might not exist. Try raw SQL via PostgREST RPC
    // If this also fails, table must be created manually
    console.warn(
      "[SessionStore] Could not auto-create table. Please run the following SQL in Supabase SQL Editor:\n" +
      "CREATE TABLE IF NOT EXISTS otp_sessions (\n" +
      "  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n" +
      "  token TEXT NOT NULL UNIQUE,\n" +
      "  verified_at TIMESTAMPTZ DEFAULT NOW(),\n" +
      "  expires_at TIMESTAMPTZ NOT NULL\n" +
      ");\n" +
      "CREATE INDEX IF NOT EXISTS idx_otp_sessions_token ON otp_sessions (token);\n" +
      "CREATE INDEX IF NOT EXISTS idx_otp_sessions_expires ON otp_sessions (expires_at);"
    );
    return false;
  } catch (error) {
    console.error("[SessionStore] Table creation error", { error: String(error) });
    return false;
  }
}
