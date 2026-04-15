// Tenant context resolver for admin APIs
//
// CRITICAL: DO NOT use `manager.tenantId || DEFAULT_TENANT_ID` pattern in admin endpoints.
// That pattern silently hides data from non-default tenants and ignores ?tenant= query param.
//
// Always use resolveAdminTenantContext() in admin-authorized endpoints to correctly handle:
//   1. Specific tenant selection via ?tenant=<slug>
//   2. "全テナント" (all tenants) mode when admin omits ?tenant=
//   3. Non-admin managers (locked to their own tenantId)
//
// Related bug: /api/admin/export returning only default-tenant data (2026-04-16).
// Related memory: project_corelog_codebase_location.md, bug pattern H in bug-hunter skill.
import type { NextRequest } from "next/server";
import { DEFAULT_TENANT_ID, getTenantBySlug } from "./supabase";

export type ManagerLike = {
  tenantId?: string | null;
  isAdmin?: boolean;
  role?: string | null;
};

export type TenantContext = {
  /** tenantId to query. null = cross-tenant (全テナント) mode. */
  tenantId: string | null;
  /** True when admin explicitly chose (or defaulted to) 全テナント. */
  isAllTenants: boolean;
  /** Resolved tenant slug if one was requested (for logging/diagnostics). */
  requestedSlug: string | null;
};

/**
 * Resolve which tenant(s) an admin endpoint should operate on.
 *
 * Rules:
 *  - Non-admins: always locked to their own tenantId (fallback DEFAULT_TENANT_ID for legacy).
 *  - Admins with ?tenant=slug: that specific tenant.
 *  - Admins without ?tenant: all tenants (tenantId = null).
 *  - Admins with ?tenant=unknown-slug: falls through to admin's home tenant (safe default).
 */
export async function resolveAdminTenantContext(
  request: NextRequest,
  manager: ManagerLike
): Promise<TenantContext> {
  const tenantSlug = request.nextUrl.searchParams.get("tenant");

  // Non-admins cannot cross tenants
  if (!manager.isAdmin) {
    return {
      tenantId: manager.tenantId || DEFAULT_TENANT_ID,
      isAllTenants: false,
      requestedSlug: null,
    };
  }

  // Admin: specific tenant requested
  if (tenantSlug) {
    const requestedTenant = await getTenantBySlug(tenantSlug);
    if (requestedTenant) {
      return {
        tenantId: requestedTenant.id,
        isAllTenants: false,
        requestedSlug: tenantSlug,
      };
    }
    // Unknown slug — fall back to admin's home tenant rather than leaking all-tenants
    return {
      tenantId: manager.tenantId || DEFAULT_TENANT_ID,
      isAllTenants: false,
      requestedSlug: tenantSlug,
    };
  }

  // Admin, no slug — all tenants
  return { tenantId: null, isAllTenants: true, requestedSlug: null };
}
