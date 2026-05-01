// GET  /api/admin/features?token=xxx[&tenant=<slug>]  → fetch catalog + flags
// POST /api/admin/features?token=xxx[&tenant=<slug>]  → save flags { flags: {...} } or { presetId: "..." }
//
// Tenant resolution:
//   - Manager has isAdmin=true (super-admin) → can target any tenant via ?tenant=<slug>
//   - Manager has isAdmin=false              → locked to their own tenant
//   - No ?tenant= query param                → defaults to manager's home tenant
//   - Unknown slug                           → falls through to manager's home tenant
//
// Super-admins also receive `allTenants` in the response so the UI can render
// a tenant switcher dropdown.

import { NextRequest, NextResponse } from "next/server";
import { isAdminToken, getManagerByToken } from "@/lib/participant-db";

export const dynamic = "force-dynamic"; // Always fresh reads from Supabase
import {
  FEATURE_CATALOG,
  PRESETS,
  getFlagsForTenant,
  setFlagsForTenant,
} from "@/lib/feature-flags";
import {
  getTenantById,
  getTenantBySlug,
  getAllTenants,
} from "@/lib/supabase";

type ResolvedTenant = {
  tenantId: string;
  tenantSlug: string | null;
  tenantName: string | null;
  isSuperAdmin: boolean;
  /** Slug requested by client but not granted (e.g., not super-admin). null if none. */
  declinedSlug: string | null;
};

/**
 * Resolve which tenant the admin endpoint should operate on.
 * Mirrors the pattern in lib/tenant-context.ts:resolveAdminTenantContext but
 * returns a guaranteed tenantId (no all-tenants/null mode for feature flags —
 * flags must always be scoped to a single tenant).
 */
async function resolveFeatureFlagTenant(
  request: NextRequest,
  manager: { tenantId?: string | null; isAdmin?: boolean }
): Promise<ResolvedTenant | { error: string; status: number }> {
  if (!manager.tenantId) {
    return { error: "Manager has no tenant context", status: 403 };
  }

  const requestedSlug = request.nextUrl.searchParams.get("tenant");
  const isSuperAdmin = !!manager.isAdmin;

  // Default: manager's own tenant
  let tenantId = manager.tenantId;
  let declinedSlug: string | null = null;

  if (requestedSlug) {
    if (!isSuperAdmin) {
      // Non-super-admin asked for another tenant — silently ignore (defense
      // in depth: don't leak that other tenants exist) and stay on home.
      declinedSlug = requestedSlug;
    } else {
      const requested = await getTenantBySlug(requestedSlug);
      if (requested) {
        tenantId = requested.id;
      } else {
        // Unknown slug — fall through to home tenant.
        declinedSlug = requestedSlug;
      }
    }
  }

  const tenant = await getTenantById(tenantId);
  return {
    tenantId,
    tenantSlug: tenant?.slug ?? null,
    tenantName: tenant?.name ?? null,
    isSuperAdmin,
    declinedSlug,
  };
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const authorized = await isAdminToken(token);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const manager = await getManagerByToken(token);
  if (!manager) {
    return NextResponse.json({ error: "Manager not found" }, { status: 403 });
  }

  const resolved = await resolveFeatureFlagTenant(request, manager);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const currentFlags = await getFlagsForTenant(resolved.tenantId);

  // Super-admins get the full tenant list for the UI switcher.
  const allTenants = resolved.isSuperAdmin
    ? (await getAllTenants()).map((t) => ({
        id: t.id,
        slug: t.slug,
        name: t.name,
        companyName: t.companyName,
      }))
    : [];

  return NextResponse.json({
    tenantId: resolved.tenantId,
    tenantSlug: resolved.tenantSlug,
    tenantName: resolved.tenantName,
    isSuperAdmin: resolved.isSuperAdmin,
    allTenants,
    declinedSlug: resolved.declinedSlug,
    // Legacy field for older clients.
    clientId: resolved.tenantId,
    catalog: FEATURE_CATALOG,
    presets: PRESETS.map((p) => ({ id: p.id, label: p.label, description: p.description })),
    flags: currentFlags,
    storageConfigured: !!(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
  });
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const authorized = await isAdminToken(token);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const manager = await getManagerByToken(token);
  if (!manager) {
    return NextResponse.json({ error: "Manager not found" }, { status: 403 });
  }

  const resolved = await resolveFeatureFlagTenant(request, manager);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const body = await request.json();

  let flagsToSave: Record<string, boolean> | null = null;

  if (body.presetId) {
    const preset = PRESETS.find((p) => p.id === body.presetId);
    if (!preset) {
      return NextResponse.json({ error: "Unknown preset" }, { status: 400 });
    }
    flagsToSave = preset.getFlags();
  } else if (body.flags && typeof body.flags === "object") {
    flagsToSave = body.flags as Record<string, boolean>;
  } else {
    return NextResponse.json({ error: "Missing flags or presetId" }, { status: 400 });
  }

  const ok = await setFlagsForTenant(resolved.tenantId, flagsToSave);
  if (!ok) {
    return NextResponse.json(
      { error: "Failed to save feature flags to Supabase." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    tenantId: resolved.tenantId,
    tenantSlug: resolved.tenantSlug,
    flags: flagsToSave,
  });
}
