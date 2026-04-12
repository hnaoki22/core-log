// PUT /api/admin/managers/[id]
// Update manager fields (name, email, department, isAdmin)

import { NextRequest, NextResponse } from "next/server";
import { isAdminToken } from "@/lib/participant-db";
import { updateManagerInSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const DEFAULT_TENANT_ID = "81f91c26-214e-4da2-9893-6ac6c8984062";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { token, ...updates } = body;

    // Auth check
    if (!token || !(await isAdminToken(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

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

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "更新するフィールドが指定されていません" },
        { status: 400 }
      );
    }

    const success = await updateManagerInSupabase(
      managerId,
      updateData as Parameters<typeof updateManagerInSupabase>[1],
      DEFAULT_TENANT_ID
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
