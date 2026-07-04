// PUT /api/admin/managers/[id]
// Update manager fields (name, email, department, isAdmin)
//
// Tenant resolution: looks up the manager's ACTUAL tenant first, then
// validates the caller's access. Previously this forced the WHERE clause to
// `tenant_id = admin.homeTenant`, which 0-row updated when super-admins (or
// admins on a non-home tenant via ?tenant=slug) edited a manager outside
// their home tenant.

import { NextRequest, NextResponse } from "next/server";
import { getManagerByToken } from "@/lib/participant-db";
import { getClient, updateManagerInSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { token, ...updates } = body;

    // Auth check
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const manager = await getManagerByToken(token);
    if (!manager || !manager.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const managerId = params.id;
    if (!managerId) {
      return NextResponse.json(
        { error: "マネージャーIDが必要です" },
        { status: 400 }
      );
    }

    // Discover the target manager's actual tenant.
    const { data: existing, error: lookupErr } = await getClient()
      .from("managers")
      .select("tenant_id")
      .eq("id", managerId)
      .maybeSingle();
    if (lookupErr) {
      console.error("Manager lookup failed:", lookupErr.message);
      return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Manager not found" }, { status: 404 });
    }
    const targetTenantId = existing.tenant_id as string;

    // Access check: admins (is_admin=true) can edit managers on any tenant,
    // matching the resolveAdminTenantContext convention. The old rule
    // (`!manager.tenantId` = super-admin) matched zero rows in production —
    // every admin row has a tenant_id — so cross-tenant edits always 403'd.
    const isSuperAdmin = !!manager.isAdmin;
    const allowed = isSuperAdmin || manager.tenantId === targetTenantId;
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden: cross-tenant edit not allowed" },
        { status: 403 }
      );
    }

    // Validate allowed fields
    const allowedFields = ["name", "email", "department", "isAdmin", "role"];
    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }

    // Admin-only: allow tenant transfer (super-admin only since tenant-admin
    // is bounded to their own tenant by the access check above).
    const newTenantId = updates.tenantId as string | undefined;
    if (newTenantId && !isSuperAdmin) {
      return NextResponse.json(
        { error: "テナント変更にはsuper-admin権限が必要です" },
        { status: 403 }
      );
    }

    if (Object.keys(updateData).length === 0 && !newTenantId) {
      return NextResponse.json(
        { error: "更新するフィールドが指定されていません" },
        { status: 400 }
      );
    }

    const success = await updateManagerInSupabase(
      managerId,
      updateData as Parameters<typeof updateManagerInSupabase>[1],
      targetTenantId,
      newTenantId,
    );

    if (!success) {
      return NextResponse.json(
        { error: "更新に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /api/admin/managers/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
