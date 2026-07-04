// Tests for resolveManagerTenantStrict() — Phase 0 #12
//
// Ensures the strict resolver correctly handles:
//  - Non-admin with tenantId → use it
//  - Non-admin without tenantId → 403 (NOT silent DEFAULT_TENANT_ID fallback)
//  - Admin with tenantId → use it
//  - Admin without tenantId → DEFAULT_TENANT_ID (super-admin default)
//
// Related memory: bug_admin_tenant_silent_fallback.md

import { describe, it, expect, vi } from "vitest";
import { resolveManagerTenantStrict, resolveAdminTargetTenant } from "./tenant-context";
import { DEFAULT_TENANT_ID } from "./supabase";

// resolveAdminTargetTenant needs getTenantBySlug; mock only that export and
// keep the rest of ./supabase (DEFAULT_TENANT_ID etc.) real.
vi.mock("./supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./supabase")>();
  return {
    ...actual,
    getTenantBySlug: vi.fn(async (slug: string) =>
      slug === "taiko-yakuhin"
        ? {
            id: "tenant-taiko-uuid",
            name: "大幸薬品",
            slug,
            companyName: "大幸薬品株式会社",
            featureFlags: {},
          }
        : null
    ),
  };
});

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

// Trap 3 (actor's tenant vs target's tenant) — admin WRITE endpoints must
// honor the dashboard-selected ?tenant=slug instead of silently writing to
// the admin's home tenant (bug: /api/admin/import 横展開, 2026-07-04).
describe("resolveAdminTargetTenant", () => {
  it("admin + known slug → the SELECTED tenant, not the admin's home tenant", async () => {
    const result = await resolveAdminTargetTenant(
      { tenantId: "tenant-home-uuid", isAdmin: true },
      "taiko-yakuhin"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe("tenant-taiko-uuid");
      expect(result.source).toBe("query-slug");
    }
  });

  it("admin + unknown slug → 404, never a silent home-tenant fallback", async () => {
    const result = await resolveAdminTargetTenant(
      { tenantId: "tenant-home-uuid", isAdmin: true },
      "daiko" // CLAUDE.md に残っていた誤 slug — フォールバックさせず必ずエラーに
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.errorBody.detail).toContain("daiko");
    }
  });

  it("admin without slug → home tenant (strict rule)", async () => {
    const result = await resolveAdminTargetTenant(
      { tenantId: "tenant-home-uuid", isAdmin: true },
      null
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe("tenant-home-uuid");
      expect(result.source).toBe("manager.tenantId");
    }
  });

  it("tenantless super-admin without slug → DEFAULT_TENANT_ID", async () => {
    const result = await resolveAdminTargetTenant({ tenantId: null, isAdmin: true }, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe(DEFAULT_TENANT_ID);
      expect(result.source).toBe("super-admin-default");
    }
  });

  it("non-admin + slug → slug is ignored, locked to own tenant", async () => {
    const result = await resolveAdminTargetTenant(
      { tenantId: "tenant-own-uuid", isAdmin: false },
      "taiko-yakuhin"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tenantId).toBe("tenant-own-uuid");
      expect(result.source).toBe("manager.tenantId");
    }
  });

  it("non-admin without tenantId → 403 even when a slug is passed", async () => {
    const result = await resolveAdminTargetTenant(
      { tenantId: null, isAdmin: false },
      "taiko-yakuhin"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });
});
