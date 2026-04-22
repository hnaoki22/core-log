/**
 * Phase 0 #18 — tests for src/lib/env.ts
 *
 * isProductionMode() is the hinge for #04 (mock fallback gating),
 * #15 (OTP memory-fallback warnings), and #17 (cron-lock memory warnings).
 * If it misfires, security controls are silently bypassed.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isProductionMode, isMockFallbackEnabled } from "./env";

describe("isProductionMode", () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedEnvName = process.env.NEXT_PUBLIC_ENV_NAME;

  afterEach(() => {
    // Restore to avoid cross-test pollution
    if (savedNodeEnv === undefined) delete (process.env as Record<string, unknown>).NODE_ENV;
    else (process.env as Record<string, string>).NODE_ENV = savedNodeEnv;
    if (savedEnvName === undefined) delete process.env.NEXT_PUBLIC_ENV_NAME;
    else process.env.NEXT_PUBLIC_ENV_NAME = savedEnvName;
  });

  it("returns false when NODE_ENV is 'development'", () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(isProductionMode()).toBe(false);
  });

  it("returns false when NODE_ENV is 'test'", () => {
    (process.env as Record<string, string>).NODE_ENV = "test";
    expect(isProductionMode()).toBe(false);
  });

  it("returns true when NODE_ENV=production and no NEXT_PUBLIC_ENV_NAME override", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_ENV_NAME;
    expect(isProductionMode()).toBe(true);
  });

  it("returns false for Vercel preview (NODE_ENV=production + NEXT_PUBLIC_ENV_NAME=preview)", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_ENV_NAME = "preview";
    expect(isProductionMode()).toBe(false);
  });

  it("returns false for explicit development marker on prod build", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_ENV_NAME = "development";
    expect(isProductionMode()).toBe(false);
  });

  it("returns true when NEXT_PUBLIC_ENV_NAME is an unrecognized value (fail-secure)", () => {
    // Unknown markers must be treated as production — don't silently let
    // a typo bypass the production gate.
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_ENV_NAME = "staging-typo";
    expect(isProductionMode()).toBe(true);
  });
});

describe("isMockFallbackEnabled", () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedEnvName = process.env.NEXT_PUBLIC_ENV_NAME;

  afterEach(() => {
    if (savedNodeEnv === undefined) delete (process.env as Record<string, unknown>).NODE_ENV;
    else (process.env as Record<string, string>).NODE_ENV = savedNodeEnv;
    if (savedEnvName === undefined) delete process.env.NEXT_PUBLIC_ENV_NAME;
    else process.env.NEXT_PUBLIC_ENV_NAME = savedEnvName;
  });

  it("is enabled in development", () => {
    (process.env as Record<string, string>).NODE_ENV = "development";
    expect(isMockFallbackEnabled()).toBe(true);
  });

  it("is enabled on Vercel preview", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.NEXT_PUBLIC_ENV_NAME = "preview";
    expect(isMockFallbackEnabled()).toBe(true);
  });

  it("is DISABLED in production (critical — no dev fixtures leaking into prod)", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_ENV_NAME;
    expect(isMockFallbackEnabled()).toBe(false);
  });
});
