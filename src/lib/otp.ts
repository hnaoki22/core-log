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

const OTP_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;
const MAX_OTPS_PER_HOUR = 3;
const CLEANUP_INTERVAL = 5 * 60 * 1000;

let cleanupInterval: NodeJS.Timeout | null = null;
let useSupabase: boolean | null = null; // null = not yet determined

/**
 * Check if otp_codes table exists in Supabase
 */
async function checkSupabaseOTP(): Promise<boolean> {
  if (useSupabase !== null) return useSupabase;
  try {
    const client = await getSupabaseClient();
    if (!client) { useSupabase = false; return false; }
    // Try a simple query to check if table exists
    const { error } = await client.from("otp_codes").select("id").limit(1);
    if (error && error.message.includes("does not exist")) {
      logger.info("OTP: otp_codes table not found, using in-memory fallback");
      useSupabase = false;
      return false;
    }
    useSupabase = !error;
    if (useSupabase) logger.info("OTP: Using Supabase-backed store");
    return useSupabase;
  } catch {
    useSupabase = false;
    return false;
  }
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
  attempts: number;
  email: string;
}

async function supabaseVerifyOTP(token: string, code: string): Promise<{ valid: boolean; email?: string }> {
  const client = await getSupabaseClient();
  if (!client) return { valid: false };

  const { data, error } = await client
    .from("otp_codes")
    .select("*")
    .eq("token", token)
    .eq("code", code)
    .gte("expires_at", new Date().toISOString())
    .single() as unknown as { data: OTPRecord | null; error: { message: string } | null };

  if (error || !data) return { valid: false };

  // Check attempts
  if (data.attempts >= MAX_ATTEMPTS) {
    await client.from("otp_codes").delete().eq("id", data.id);
    return { valid: false };
  }

  // Increment attempts atomically
  const updatePayload: Record<string, number> = { attempts: data.attempts + 1 };
  const { error: updateError } = await client
    .from("otp_codes")
    .update(updatePayload as never)
    .eq("id", data.id);

  if (updateError) {
    logger.error("OTP attempt update failed", { error: updateError.message });
  }

  // Valid — delete the OTP
  await client.from("otp_codes").delete().eq("id", data.id);
  return { valid: true, email: data.email };
}

// === In-memory fallback operations ===

function memoryCountOTPsInLastHour(token: string): number {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  return Object.entries(memoryStore)
    .filter(([key]) => {
      const parts = key.split(":");
      return parts.length === 2 && parts[0] === token;
    })
    .filter(([, entry]) => entry.createdAt > oneHourAgo)
    .length;
}

function memoryGenerateOTP(token: string, email: string): string {
  const count = memoryCountOTPsInLastHour(token);
  if (count >= MAX_OTPS_PER_HOUR) {
    throw new Error("OTP request rate limit exceeded. Please try again in 1 hour.");
  }
  const code = generateCode();
  const key = `${token}:${code}`;
  const now = Date.now();
  memoryStore[key] = { code, email, expiresAt: now + OTP_TTL, attempts: 0, createdAt: now };
  return code;
}

function memoryVerifyOTP(token: string, code: string): { valid: boolean; email?: string } {
  const key = `${token}:${code}`;
  const entry = memoryStore[key];
  if (!entry) return { valid: false };
  if (Date.now() > entry.expiresAt) { delete memoryStore[key]; return { valid: false }; }
  entry.attempts++;
  if (entry.attempts > MAX_ATTEMPTS) { delete memoryStore[key]; return { valid: false }; }
  const email = entry.email;
  delete memoryStore[key];
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

export function getRemainingAttempts(token: string, code: string): number | null {
  const key = `${token}:${code}`;
  const entry = memoryStore[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { delete memoryStore[key]; return null; }
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
}
