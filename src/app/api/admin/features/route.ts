// GET  /api/admin/features?token=xxx           → fetch catalog + current flags
// POST /api/admin/features?token=xxx           → save flags { flags: {...} } or { presetId: "..." }

import { NextRequest, NextResponse } from "next/server";
import { isAdminToken } from "@/lib/participant-db";

export const dynamic = "force-dynamic"; // Always fresh reads from Supabase
import {
  FEATURE_CATALOG,
  PRESETS,
  getFlagsForTenant,
  setFlagsForTenant,
} from "@/lib/feature-flags";
import { getManagerByToken } from "@/lib/participant-db";
import { getTenantById } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const authorized = await isAdminToken(token);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  // Resolve which tenant this admin manages — flags are scoped per-tenant.
  const manager = await getManagerByToken(token);
  if (!manager?.tenantId) {
    return NextResponse.json(
      { error: "Manager has no tenant context" },
      { status: 403 }
    );
  }
  const tenant = await getTenantById(manager.tenantId);
  const currentFlags = await getFlagsForTenant(manager.tenantId);

  return NextResponse.json({
    tenantId: manager.tenantId,
    tenantSlug: tenant?.slug ?? null,
    tenantName: tenant?.name ?? null,
    // Legacy field kept for older clients; new clients should read tenantId.
    clientId: manager.tenantId,
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
  if (!manager?.tenantId) {
    return NextResponse.json(
      { error: "Manager has no tenant context" },
      { status: 403 }
    );
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

  const ok = await setFlagsForTenant(manager.tenantId, flagsToSave);
  if (!ok) {
    return NextResponse.json(
      {
        error: "Failed to save feature flags to Supabase.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    tenantId: manager.tenantId,
    flags: flagsToSave,
  });
}
