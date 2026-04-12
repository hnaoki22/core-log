// PUT /api/admin/managers/[id]
// Update manager fields (name, email, department, isAdmin)

import { NextRequest, NextResponse } from "next/server";
import { getManagerByToken } from "@/lib/participant-db";
import { DEFAULT_TENANT_ID, updateManagerInSupabase } from "@/lib/supabase";

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
    const tenantId = manager.tenantId || DEFAULT_TENANT_ID;

    const managerId = params.id;
    if (!managerId) {
      return NextResponse.json(
        { error: "マネージャーIDが必要です" },
        { status: 400 }
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

    // Admin-only: allow tenant transfer
    const newTenantId = updates.tenantId as string | undefined;
    if (newTenantId && !manager.isAdmin) {
      return NextResponse.json(
        { error: "テナント変更にはadmin権限が必要です" },
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
      tenantId,
      newTenantId
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
