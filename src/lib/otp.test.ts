/**
 * Phase 0 #18 — tests for src/lib/otp.ts (memory path)
 *
 * Supabase path is not exercised here — it requires a live connection.
 * These tests cover the memory fallback that activates when Supabase is
 * unavailable (no SUPABASE_URL/KEY at import time).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { generateOTP, verifyOTP, cleanupExpiredOTPs, clearAllOTPs } from "./otp";

describe("OTP memory path", () => {
  beforeEach(() => {
    clearAllOTPs();
  });

  it("generateOTP returns a 6-digit numeric string", async () => {
    // Ensure Supabase path is NOT available for this test process
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const code = await generateOTP("token-1", "u@example.com");
    expect(code).toMatch(/^\d{6}$/);
  });

  it("verifyOTP succeeds with the correct code", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const code = await generateOTP("token-2", "u@example.com");
    const result = await verifyOTP("token-2", code);
    expect(result.valid).toBe(true);
    expect(result.email).toBe("u@example.com");
  });

  it("verifyOTP fails with an incorrect code", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await generateOTP("token-3", "u@example.com");
    const result = await verifyOTP("token-3", "000000");
    expect(result.valid).toBe(false);
  });

  it("verifyOTP consumes the OTP — subsequent verify fails", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const code = await generateOTP("token-4", "u@example.com");
    const first = await verifyOTP("token-4", code);
    expect(first.valid).toBe(true);
    const second = await verifyOTP("token-4", code);
    expect(second.valid).toBe(false);
  });

  it("rate limit: MAX 3 OTPs per hour per token", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await generateOTP("token-5", "u@example.com");
    await generateOTP("token-5", "u@example.com");
    await generateOTP("token-5", "u@example.com");
    await expect(generateOTP("token-5", "u@example.com")).rejects.toThrow(
      /rate limit/i
    );
  });

  it("cleanupExpiredOTPs removes nothing when all entries are fresh", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const code = await generateOTP("token-6", "u@example.com");
    cleanupExpiredOTPs();
    // Fresh entry should still verify
    const result = await verifyOTP("token-6", code);
    expect(result.valid).toBe(true);
  });
});
