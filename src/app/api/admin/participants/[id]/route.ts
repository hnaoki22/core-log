// PUT /api/admin/participants/[id]
// Update participant fields (name, email, department, dojoPhase, managerId, fbPolicy, emailEnabled, startDate, endDate)

import { NextRequest, NextResponse } from "next/server";
import { getManagerByToken } from "@/lib/participant-db";
import { updateParticipantInSupabase } from "@/lib/supabase";
import { resolveManagerTenantStrict } from "@/lib/tenant-context";

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
    const tenantResult = resolveManagerTenantStrict(manager);
    if (!tenantResult.ok) {
      return NextResponse.json(tenantResult.errorBody, { status: tenantResult.status });
    }
    const tenantId = tenantResult.tenantId;

    const participantId = params.id;
    if (!participantId) {
      return NextResponse.json(
        { error: "参加者IDが必要です" },
        { status: 400 }
      );
    }

    // Validate allowed fields
    const allowedFields = [
      "name",
      "email",
      "department",
      "dojoPhase",
      "managerId",
      "fbPolicy",
      "emailEnabled",
      "startDate",
      "endDate",
    ];
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

    const success = await updateParticipantInSupabase(
      participantId,
      updateData as Parameters<typeof updateParticipantInSupabase>[1],
      tenantId
    );

    if (!success) {
      return NextResponse.json(
        { error: "更新に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /api/admin/participants/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
