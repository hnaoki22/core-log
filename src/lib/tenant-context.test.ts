// Tests for resolveManagerTenantStrict() — Phase 0 #12
//
// Ensures the strict resolver correctly handles:
//  - Non-admin with tenantId → use it
//  - Non-admin without tenantId → 403 (NOT silent DEFAULT_TENANT_ID fallback)
//  - Admin with tenantId → use it
//  - Admin without tenantId → DEFAULT_TENANT_ID (super-admin default)
//
// Related memory: bug_admin_tenant_silent_fallback.md

import { describe, it, expect } from "vitest";
import { resolveManagerTenantStrict } from "./tenant-context";
import { DEFAULT_TENANT_ID } from "./supabase";

describe("resolveManagerTenantStrict", () => {
  it("returns manager.tenantId when set (non-admin)", () => {
    const result = resolveManagerTenantStrict({
      tenantId: "tenant-abc-123",
      isAdmin: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe("tenant-abc-123");
      expect(result.source).toBe("manager.tenantId");
    }
  });

  it("returns manager.tenantId when set (admin)", () => {
    const result = resolveManagerTenantStrict({
      tenantId: "tenant-xyz-456",
      isAdmin: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe("tenant-xyz-456");
      expect(result.source).toBe("manager.tenantId");
    }
  });

  it("returns DEFAULT_TENANT_ID for super-admin without tenantId", () => {
    const result = resolveManagerTenantStrict({
      tenantId: null,
      isAdmin: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe(DEFAULT_TENANT_ID);
      expect(result.source).toBe("super-admin-default");
    }
  });

  it("returns DEFAULT_TENANT_ID for super-admin with undefined tenantId", () => {
    const result = resolveManagerTenantStrict({
      isAdmin: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe(DEFAULT_TENANT_ID);
      expect(result.source).toBe("super-admin-default");
    }
  });

  it("returns 403 for non-admin without tenantId (core security guarantee)", () => {
    const result = resolveManagerTenantStrict({
      tenantId: null,
      isAdmin: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.errorBody.error).toContain("Forbidden");
    }
  });

  it("returns 403 for non-admin with undefined tenantId", () => {
    const result = resolveManagerTenantStrict({
      isAdmin: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("returns 403 for manager with no isAdmin flag and no tenantId", () => {
    // Defensive: missing isAdmin treated as false
    const result = resolveManagerTenantStrict({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("treats empty string tenantId as missing (non-admin → 403)", () => {
    const result = resolveManagerTenantStrict({
      tenantId: "",
      isAdmin: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("treats empty string tenantId as missing (admin → DEFAULT_TENANT_ID)", () => {
    const result = resolveManagerTenantStrict({
      tenantId: "",
      isAdmin: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe(DEFAULT_TENANT_ID);
      expect(result.source).toBe("super-admin-default");
    }
  });
});
