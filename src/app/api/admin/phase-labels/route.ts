// GET/POST /api/admin/phase-labels
// Manage per-tenant phase labels (e.g. "覚悟", "武装", "実践"...)
// Replaces hardcoded dojo phase lists.
//
// Tenant resolution: a super-admin (manager row with isAdmin=true and no
// tenantId) MUST be able to write to a specific tenant via ?tenant=slug,
// otherwise the save silently goes to DEFAULT_TENANT_ID and the dashboard
// re-read shows the unchanged labels — user sees "save failed" with no
// error. Mirrors the pattern in /api/admin/ai-settings.

import { NextRequest, NextResponse } from "next/server";
import { getManagerByToken } from "@/lib/participant-db";
import { getTenantBySlug } from "@/lib/supabase";
import { resolveManagerTenantStrict } from "@/lib/tenant-context";
import { getPhaseLabels, savePhaseLabels } from "@/lib/phase-labels";

export const dynamic = "force-dynamic";

async function resolveTargetTenantId(
  request: NextRequest,
  manager: { tenantId?: string | null; isAdmin?: boolean },
): Promise<{ ok: true; tenantId: string } | { ok: false; status: number; body: { error: string; detail?: string } }> {
  const slug = request.nextUrl.searchParams.get("tenant");
  if (manager.isAdmin && slug) {
    const t = await getTenantBySlug(slug);
    if (t) return { ok: true, tenantId: t.id };
  }
  const strict = resolveManagerTenantStrict(manager);
  if (!strict.ok) {
    return { ok: false, status: strict.status, body: strict.errorBody };
  }
  return { ok: true, tenantId: strict.tenantId };
}

// ---------- GET: Retrieve phase labels for a tenant ----------
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const tenantResult = await resolveTargetTenantId(request, manager);
    if (!tenantResult.ok) {
      return NextResponse.json(tenantResult.body, { status: tenantResult.status });
    }

    const labels = await getPhaseLabels(tenantResult.tenantId);
    return NextResponse.json({ success: true, labels });
  } catch (err) {
    console.error("GET /api/admin/phase-labels error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------- POST: Save phase labels for a tenant ----------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, labels } = body;

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    if (!Array.isArray(labels)) {
      return NextResponse.json({ error: "labels must be an array of strings" }, { status: 400 });
    }
    // Validate: all items must be non-empty strings
    const cleaned = labels
      .map((l: unknown) => (typeof l === "string" ? l.trim() : ""))
      .filter((l: string) => l.length > 0);

    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const tenantResult = await resolveTargetTenantId(request, manager);
    if (!tenantResult.ok) {
      return NextResponse.json(tenantResult.body, { status: tenantResult.status });
    }

    const ok = await savePhaseLabels(tenantResult.tenantId, cleaned);
    if (!ok) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
    return NextResponse.json({ success: true, labels: cleaned });
  } catch (err) {
    console.error("POST /api/admin/phase-labels error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
