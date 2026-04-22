// Tests for rate-limit.ts — especially the Phase 0 #16 tenant-scoped key logic
//
// Invariants we want to lock in:
//  - Each unique key gets its own independent bucket
//  - Rate limit hits exactly at `limit + 1`, not `limit`
//  - Token extraction works for /p, /m, /a, /verify path routes
//  - Token extraction works for `?token=...` query param
//  - Composite key is `${tokenPrefix}:${ip}` when token present, plain `${ip}` otherwise
//  - Token prefix is bounded to 12 chars (logs stay readable)

import { afterEach, describe, expect, it } from "vitest";
import {
  rateLimit,
  extractTokenPrefix,
  buildRateLimitKey,
  __resetRateLimitMapForTests,
} from "./rate-limit";

afterEach(() => {
  __resetRateLimitMapForTests();
});

describe("rateLimit()", () => {
  it("allows requests up to the limit and denies the next one", () => {
    const r1 = rateLimit("k1", 3, 60000);
    const r2 = rateLimit("k1", 3, 60000);
    const r3 = rateLimit("k1", 3, 60000);
    const r4 = rateLimit("k1", 3, 60000);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r3.success).toBe(true);
    expect(r4.success).toBe(false);
  });

  it("isolates buckets per key — different keys do not share counters", () => {
    rateLimit("tenant-a:1.1.1.1", 2, 60000);
    rateLimit("tenant-a:1.1.1.1", 2, 60000);
    // tenant-b should still have full quota on the same IP
    const b1 = rateLimit("tenant-b:1.1.1.1", 2, 60000);
    expect(b1.success).toBe(true);
    expect(b1.remaining).toBe(1);
  });

  it("reports correct `remaining` counts as requests accumulate", () => {
    const r1 = rateLimit("k2", 5, 60000);
    expect(r1.remaining).toBe(4);
    const r2 = rateLimit("k2", 5, 60000);
    expect(r2.remaining).toBe(3);
  });
});

describe("extractTokenPrefix()", () => {
  it("extracts token from /p/[token]", () => {
    const got = extractTokenPrefix({ url: "https://example.com/p/abcdef123456789" });
    expect(got).toBe("abcdef123456");
  });

  it("extracts token from /m/[token]", () => {
    const got = extractTokenPrefix({ url: "https://example.com/m/mgr-token-xyz-123456" });
    expect(got).toBe("mgr-token-xy");
  });

  it("extracts token from /a/[token]", () => {
    const got = extractTokenPrefix({ url: "https://example.com/a/admin-a-1234567890" });
    expect(got).toBe("admin-a-1234");
  });

  it("extracts token from /verify/[token]", () => {
    const got = extractTokenPrefix({ url: "https://example.com/verify/verify-tkn-a1b2c3" });
    expect(got).toBe("verify-tkn-a");
  });

  it("extracts token from ?token= query param on API routes", () => {
    const got = extractTokenPrefix({ url: "https://example.com/api/logs?token=api-tkn-abcdef-12345" });
    expect(got).toBe("api-tkn-abcd");
  });

  it("returns null when no token is present", () => {
    expect(extractTokenPrefix({ url: "https://example.com/api/health" })).toBeNull();
    expect(extractTokenPrefix({ url: "https://example.com/" })).toBeNull();
  });

  it("returns null for malformed URLs", () => {
    expect(extractTokenPrefix({ url: "not a url" })).toBeNull();
  });
});

describe("buildRateLimitKey()", () => {
  it("combines token prefix and IP when token is present", () => {
    const got = buildRateLimitKey({ url: "https://example.com/p/user-token-abcdefg" }, "203.0.113.5");
    expect(got).toBe("user-token-a:203.0.113.5");
  });

  it("falls back to plain IP when no token is present", () => {
    const got = buildRateLimitKey({ url: "https://example.com/api/health" }, "203.0.113.5");
    expect(got).toBe("203.0.113.5");
  });

  it("produces different keys for different tokens on the same IP (tenant isolation)", () => {
    const keyA = buildRateLimitKey({ url: "https://example.com/p/token-a1b2c3d4e5" }, "198.51.100.1");
    const keyB = buildRateLimitKey({ url: "https://example.com/p/token-z9y8x7w6v5" }, "198.51.100.1");
    expect(keyA).not.toBe(keyB);
  });
});
