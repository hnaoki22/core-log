/**
 * OTP (One-Time Password) Service
 * - Supabase-backed store (persistent across serverless invocations)
 * - Falls back to in-memory store if Supabase table doesn't exist
 * - Rate limiting: max 3 OTPs per token per hour
 * - Verification: max 5 attempts per OTP
 * - Cryptographically secure code generation
 */

import crypto from "crypto";
import { logger } from "./logger";
import { isProductionMode } from "./env";

// Try to import Supabase client
let supabaseClient: ReturnType<typeof import("@supabase/supabase-js").createClient> | null = null;

async function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      supabaseClient = createClient(url, key);
      return supabaseClient;
    }
  } catch {
    // Fall through to null
  }
  return null;
}

// In-memory fallback store
interface OTPEntry {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}
interface OTPStore { [tokenKey: string]: OTPEntry; }
const memoryStore: OTPStore = {};
// Track recent OTP generation timestamps per token (for rate limiting),
// independent of the currently-valid OTP entry. Older than 1 hour entries
// are filtered out at read time.
const memoryGenerateHistory: Map<string, number[]> = new Map();

const OTP_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const MAX_OTPS_PER_HOUR = 3;
const CLEANUP_INTERVAL = 5 * 60 * 1000;

let cleanupInterval: NodeJS.Timeout | null = null;
let useSupabase: boolean | null = null; // null = not yet determined

/**
 * Check if otp_codes table exists in Supabase
 *
 * Phase 0 #15 — In production, memory fallback is UNSAFE because:
 *   - Serverless invocations have independent memory (generated code on one
 *     lambda won't be visible on the next)
 *   - Codes are lost on redeploy
 *   - No cross-region durability
 * We log a loud WARN (not INFO) in production so the misconfiguration
 * surfaces in Vercel logs and can be fixed before scale-out.
 */
async function checkSupabaseOTP(): Promise<boolean> {
  if (useSupabase !== null) return useSupabase;
  try {
    const client = await getSupabaseClient();
    if (!client) {
      useSupabase = false;
      warnMemoryFallbackIfProd("supabase client unavailable");
      return false;
    }
    // Try a simple query to check if table exists
    const { error } = await client.from("otp_codes").select("id").limit(1);
    if (error && error.message.includes("does not exist")) {
      useSupabase = false;
      warnMemoryFallbackIfProd("otp_codes table not found");
      if (!isProductionMode()) {
        logger.info("OTP: otp_codes table not found, using in-memory fallback (dev)");
      }
      return false;
    }
    useSupabase = !error;
    if (useSupabase) {
      logger.info("OTP: Using Supabase-backed store");
    } else {
      warnMemoryFallbackIfProd(`supabase probe failed: ${error?.message ?? "unknown"}`);
    }
    return useSupabase;
  } catch (e) {
    useSupabase = false;
    warnMemoryFallbackIfProd(`supabase probe threw: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/**
 * Emit a single boot-time WARN to Vercel logs when OTP is running on the
 * in-memory fallback in production. This is a one-time signal; per-call
 * warnings are emitted separately by memoryGenerateOTP / memoryVerifyOTP.
 */
let memoryFallbackWarnedOnce = false;
function warnMemoryFallbackIfProd(reason: string): void {
  if (!isProductionMode()) return;
  if (memoryFallbackWarnedOnce) return;
  memoryFallbackWarnedOnce = true;
  logger.warn(
    "OTP: memory fallback active in production — codes will NOT survive serverless invocations. " +
    "Configure the `otp_codes` Supabase table to restore durable OTP storage.",
    { reason }
  );
}

/**
 * Generate a 6-digit OTP code using cryptographically secure random
 */
function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// === Supabase-backed operations ===

async function supabaseCountOTPsInLastHour(token: string): Promise<number> {
  const client = await getSupabaseClient();
  if (!client) return 0;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await client
    .from("otp_codes")
    .select("id", { count: "exact", head: true })
    .eq("token", token)
    .gte("created_at", oneHourAgo);
  if (error) { logger.error("OTP count failed", { error: error.message }); return 0; }
  return count ?? 0;
}

async function supabaseGenerateOTP(token: string, email: string): Promise<string> {
  const count = await supabaseCountOTPsInLastHour(token);
  if (count >= MAX_OTPS_PER_HOUR) {
    throw new Error("OTP request rate limit exceeded. Please try again in 1 hour.");
  }
  const code = generateCode();
  const client = await getSupabaseClient();
  if (!client) throw new Error("Supabase unavailable");
  const otpData: Record<string, string | number> = {
    token,
    code,
    email,
    attempts: 0,
    expires_at: new Date(Date.now() + OTP_TTL).toISOString(),
  };
  const { error } = await client.from("otp_codes").insert(otpData as never);
  if (error) {
    logger.error("OTP insert failed", { error: error.message });
    throw new Error("Failed to generate OTP");
  }
  return code;
}

interface OTPRecord {
  id: string;
  code: string;
  attempts: number;
  email: string;
}

/**
 * Constant-time string compare. Returns false for unequal-length inputs but
 * still loops over the longer string to avoid leaking length information.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0;
    const cb = i < b.length ? b.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

async function supabaseVerifyOTP(token: string, code: string): Promise<{ valid: boolean; email?: string }> {
  const client = await getSupabaseClient();
  if (!client) return { valid: false };

  // Look up by TOKEN ONLY. The previous code also filtered by `code`, which
  // meant wrong guesses never matched the row and the attempts counter never
  // incremented — making MAX_ATTEMPTS unenforceable and the entire OTP code
  // space brute-forceable. Fetch by token, then count attempts and compare
  // in constant time.
  const { data, error } = await client
    .from("otp_codes")
    .select("id, code, attempts, email")
    .eq("token", token)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as unknown as { data: OTPRecord | null; error: { message: string } | null };

  if (error || !data) return { valid: false };

  // Exceeded attempts → invalidate and deny regardless of whether this guess matches
  if (data.attempts >= MAX_ATTEMPTS) {
    await client.from("otp_codes").delete().eq("id", data.id);
    return { valid: false };
  }

  // Always increment the attempts counter BEFORE checking equality, so every
  // wrong guess counts toward the cap. Use the optimistic CAS pattern to make
  // increments race-safe under concurrent requests.
  const { data: updatedRows, error: updateError } = await client
    .from("otp_codes")
    .update({ attempts: data.attempts + 1 } as never)
    .eq("id", data.id)
    .eq("attempts", data.attempts)
    .select("id");

  if (updateError) {
    logger.error("OTP attempt update failed", { error: updateError.message });
    return { valid: false };
  }
  if (!updatedRows || updatedRows.length === 0) {
    // Lost the race against another verify request. Treat as invalid; the
    // other request bears responsibility for outcome.
    return { valid: false };
  }

  const isMatch = timingSafeEqual(code, data.code);
  if (!isMatch) {
    // Wrong code: leave the row in place (with incremented attempts) so the
    // user can retry up to MAX_ATTEMPTS total.
    return { valid: false };
  }

  // Correct code: consume the OTP so it cannot be replayed.
  await client.from("otp_codes").delete().eq("id", data.id);
  return { valid: true, email: data.email };
}

// === In-memory fallback operations ===

// Memory store keys are now the bare `token` (not `${token}:${code}`) so a
// wrong guess looks up the same entry as a correct one and increments its
// attempts counter — without this, MAX_ATTEMPTS was unenforceable.

function memoryCountOTPsInLastHour(token: string): number {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const history = memoryGenerateHistory.get(token) || [];
  return history.filter((ts) => ts > oneHourAgo).length;
}

function memoryGenerateOTP(token: string, email: string): string {
  if (isProductionMode()) {
    logger.warn("OTP: memory path used for generate() in production", {
      tokenPrefix: token.slice(0, 8),
    });
  }
  if (memoryCountOTPsInLastHour(token) >= MAX_OTPS_PER_HOUR) {
    throw new Error("OTP request rate limit exceeded. Please try again in 1 hour.");
  }
  const code = generateCode();
  const now = Date.now();
  memoryStore[token] = { code, email, expiresAt: now + OTP_TTL, attempts: 0, createdAt: now };
  // Append to history and prune to the last hour to bound memory growth.
  const oneHourAgo = now - 60 * 60 * 1000;
  const history = (memoryGenerateHistory.get(token) || []).filter((ts) => ts > oneHourAgo);
  history.push(now);
  memoryGenerateHistory.set(token, history);
  return code;
}

function memoryVerifyOTP(token: string, code: string): { valid: boolean; email?: string } {
  if (isProductionMode()) {
    logger.warn("OTP: memory path used for verify() in production", {
      tokenPrefix: token.slice(0, 8),
    });
  }
  const entry = memoryStore[token];
  if (!entry) return { valid: false };
  if (Date.now() > entry.expiresAt) { delete memoryStore[token]; return { valid: false }; }

  // Always count the attempt, even when the code is wrong, so MAX_ATTEMPTS
  // bounds the brute-force search space.
  entry.attempts++;
  if (entry.attempts > MAX_ATTEMPTS) { delete memoryStore[token]; return { valid: false }; }

  const isMatch = timingSafeEqual(code, entry.code);
  if (!isMatch) return { valid: false };
  const email = entry.email;
  delete memoryStore[token];
  return { valid: true, email };
}

// === Cleanup ===

function initCleanup(): void {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => { cleanupExpiredOTPs(); }, CLEANUP_INTERVAL);
  if (typeof process !== "undefined") {
    process.on("exit", () => { if (cleanupInterval) clearInterval(cleanupInterval); });
  }
}

// === Public API ===

export async function generateOTP(token: string, email: string): Promise<string> {
  if (await checkSupabaseOTP()) {
    return supabaseGenerateOTP(token, email);
  }
  initCleanup();
  return memoryGenerateOTP(token, email);
}

export async function verifyOTP(token: string, code: string): Promise<{ valid: boolean; email?: string }> {
  if (await checkSupabaseOTP()) {
    return supabaseVerifyOTP(token, code);
  }
  return memoryVerifyOTP(token, code);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function getRemainingAttempts(token: string, _code?: string): number | null {
  // Memory-store only: Supabase path doesn't expose remaining attempts to
  // avoid an extra round-trip. Callers should treat null as "unknown".
  const entry = memoryStore[token];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { delete memoryStore[token]; return null; }
  return Math.max(0, MAX_ATTEMPTS - entry.attempts);
}

export function cleanupExpiredOTPs(): void {
  const now = Date.now();
  for (const [key, entry] of Object.entries(memoryStore)) {
    if (now > entry.expiresAt) delete memoryStore[key];
  }
}

export function clearAllOTPs(): void {
  Object.keys(memoryStore).forEach((key) => delete memoryStore[key]);
  memoryGenerateHistory.clear();
}
